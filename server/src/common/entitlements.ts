/**
 * ENTITLEMENT ENGINE — server-side access control for paid content (subject-based + time-based).
 *
 * Every paid surface (lesson stream URL, quizzes, question bank, exams, AI tutor) must call:
 *
 *   await entitlements.assertAccess(userId, subjectId, { feature: 'lesson' });
 *   // or as middleware:
 *   route({ ..., middleware: [requireEntitlement((req) => lookupSubjectIdOfLesson(req.params.id), 'lesson')] })
 *
 * Failure semantics (docs/ENGINEERING.md §2):
 *   - never subscribed / subscription expired → 402 SUBSCRIPTION_REQUIRED, details.locked = { reason, subjectId, packageIds }
 *   - subscribed, but subject not in package  → 403 NOT_ENTITLED,          details.locked = { reason: 'SUBJECT_NOT_IN_PACKAGE', … }
 *
 * Entitlements are rows in eduway_platform_entitlements (one per user × subject × source) written by:
 *   - subscriptions (payment / upgrade / manual package grant) → `grantForSubscription()`
 *   - admin manual access grant (reason + duration)            → `grant({ source: 'manual' })`
 * Every change is logged in eduway_platform_entitlement_logs.
 *
 * The pure functions (`evaluateSubjectAccess`, `summarize`) hold the rules and are unit-tested.
 */
import type { NextFunction, Request, Response } from 'express';
import { T } from '../config/constants.js';
import { db, tx, type Executor } from '../config/db.js';
import { NotEntitledError, PaymentRequiredError, UnauthorizedError, type LockedPayload, type LockedReason } from './errors/index.js';
import { TtlCache } from './utils/cache.js';
import { addDays } from './utils/dates.js';

export type AccessFeature = 'lesson' | 'resource' | 'quiz' | 'question_bank' | 'practice' | 'exam' | 'ai_tutor' | 'mistakes';
export type EntitlementSource = 'package' | 'manual';

export interface EntitlementRecord {
  id: string;
  subjectId: string;
  source: EntitlementSource;
  subscriptionId: string | null;
  startsAt: Date;
  endsAt: Date;
  revokedAt: Date | null;
}

export interface AccessDecision {
  allowed: boolean;
  reason?: LockedReason;
  /** When access ends (allowed) */
  expiresAt?: Date | null;
  /** When access ended (EXPIRED) */
  expiredAt?: Date | null;
  source?: EntitlementSource;
}

const isLive = (r: EntitlementRecord, now: Date) => !r.revokedAt && r.startsAt.getTime() <= now.getTime() && r.endsAt.getTime() > now.getTime();

/** Pure rule evaluation for one subject. */
export function evaluateSubjectAccess(records: readonly EntitlementRecord[], subjectId: string, now: Date = new Date()): AccessDecision {
  const valid = records.filter((r) => !r.revokedAt);
  const forSubject = valid.filter((r) => r.subjectId === subjectId);
  const live = forSubject.filter((r) => isLive(r, now));
  if (live.length) {
    const best = live.reduce((a, b) => (b.endsAt > a.endsAt ? b : a));
    return { allowed: true, expiresAt: best.endsAt, source: best.source };
  }
  const anyLiveElsewhere = valid.some((r) => isLive(r, now));
  if (anyLiveElsewhere) return { allowed: false, reason: 'SUBJECT_NOT_IN_PACKAGE' };
  const past = forSubject.length ? forSubject : valid;
  const ended = past.filter((r) => r.endsAt.getTime() <= now.getTime());
  if (ended.length) {
    const last = ended.reduce((a, b) => (b.endsAt > a.endsAt ? b : a));
    return { allowed: false, reason: 'EXPIRED', expiredAt: last.endsAt };
  }
  return { allowed: false, reason: 'NO_SUBSCRIPTION' };
}

export interface SubjectAccessSummary {
  subjectId: string;
  active: boolean;
  expiresAt: string | null;
  source: EntitlementSource | null;
}

/** Per-subject summary (for /auth/me, admin student detail). Includes only subjects with any non-revoked record. */
export function summarize(records: readonly EntitlementRecord[], now: Date = new Date()): SubjectAccessSummary[] {
  const bySubject = new Map<string, EntitlementRecord[]>();
  for (const r of records) {
    if (r.revokedAt) continue;
    bySubject.set(r.subjectId, [...(bySubject.get(r.subjectId) ?? []), r]);
  }
  return [...bySubject.entries()].map(([subjectId, rs]) => {
    const live = rs.filter((r) => isLive(r, now));
    const pick = (live.length ? live : rs).reduce((a, b) => (b.endsAt > a.endsAt ? b : a));
    return { subjectId, active: live.length > 0, expiresAt: pick.endsAt.toISOString(), source: pick.source };
  });
}

/** 402 vs 403 mapping for a denied decision. */
export function lockedError(decision: AccessDecision, ctx: { subjectId: string; subjectSlug?: string; feature?: AccessFeature; packageIds?: string[] }) {
  const locked: LockedPayload = {
    reason: decision.reason ?? 'NO_SUBSCRIPTION',
    subjectId: ctx.subjectId,
    ...(ctx.subjectSlug ? { subjectSlug: ctx.subjectSlug } : {}),
    packageIds: ctx.packageIds ?? [],
  };
  if (locked.reason === 'SUBJECT_NOT_IN_PACKAGE') return new NotEntitledError(locked);
  return new PaymentRequiredError(locked);
}

// ── DB-backed service ───────────────────────────────────────────────────────────────────────────────

interface EntRow {
  id: string;
  subject_id: string;
  source: EntitlementSource;
  subscription_id: string | null;
  starts_at: Date;
  ends_at: Date;
  revoked_at: Date | null;
}

const toRecord = (r: EntRow): EntitlementRecord => ({
  id: r.id,
  subjectId: r.subject_id,
  source: r.source,
  subscriptionId: r.subscription_id,
  startsAt: r.starts_at,
  endsAt: r.ends_at,
  revokedAt: r.revoked_at,
});

const cache = new TtlCache<EntitlementRecord[]>(10_000);

/** Contract DTO (API_CONTRACT §1.4). */
export interface EntitlementDto {
  id: string;
  subjectId: string;
  subjectSlug: string;
  source: EntitlementSource;
  startsAt: string;
  expiresAt: string;
  packageId: string | null;
  grantedBy: { id: string; name: { en: string; ar: string }; avatarUrl: string | null } | null;
  reason: string | null;
}

interface EntDtoRow {
  id: string;
  subject_id: string;
  subject_slug: string;
  source: EntitlementSource;
  starts_at: Date;
  ends_at: Date;
  reason: string | null;
  package_id: string | null;
  granted_by_id: string | null;
  granted_by_name_en: string | null;
  granted_by_name_ar: string | null;
  granted_by_avatar: string | null;
}

export interface GrantInput {
  userId: string;
  subjectIds: string[];
  source: EntitlementSource;
  startsAt?: Date;
  endsAt?: Date;
  /** Alternative to endsAt: duration in days from startsAt. */
  days?: number;
  subscriptionId?: string | null;
  actorId?: string | null;
  actorName?: string;
  reason?: string;
}

export const entitlements = {
  async list(userId: string, ex?: Executor): Promise<EntitlementRecord[]> {
    if (ex) {
      const rows = await db.many<EntRow>(`SELECT id, subject_id, source, subscription_id, starts_at, ends_at, revoked_at FROM ${T.entitlements} WHERE user_id = $1`, [userId], ex);
      return rows.map(toRecord);
    }
    return cache.getOrLoad(userId, async () => {
      const rows = await db.many<EntRow>(
        `SELECT id, subject_id, source, subscription_id, starts_at, ends_at, revoked_at FROM ${T.entitlements} WHERE user_id = $1`,
        [userId],
      );
      return rows.map(toRecord);
    });
  },

  invalidate(userId: string): void {
    cache.delete(userId);
  },

  /** Active packages that include the subject (offered in the paywall). */
  async packagesForSubject(subjectId: string): Promise<string[]> {
    const rows = await db.many<{ id: string }>(
      `SELECT p.id FROM ${T.packages} p JOIN ${T.package_subjects} ps ON ps.package_id = p.id
        WHERE ps.subject_id = $1 AND p.status = 'active' AND p.deleted_at IS NULL ORDER BY p.sort_order`,
      [subjectId],
    );
    return rows.map((r) => r.id);
  },

  async check(userId: string, subjectId: string, now = new Date()): Promise<AccessDecision> {
    return evaluateSubjectAccess(await this.list(userId), subjectId, now);
  },

  /** Throws 402/403 with the locked payload when the student cannot access the subject. */
  async assertAccess(userId: string, subjectId: string, opts: { feature?: AccessFeature; freePreview?: boolean } = {}): Promise<AccessDecision> {
    if (opts.freePreview) return { allowed: true, expiresAt: null };
    const decision = await this.check(userId, subjectId);
    if (decision.allowed) return decision;
    const packageIds = await this.packagesForSubject(subjectId);
    throw lockedError(decision, { subjectId, feature: opts.feature, packageIds });
  },

  /** True when the user has at least one live entitlement (any subject) — e.g. AI tutor general access. */
  async hasAnyActive(userId: string, now = new Date()): Promise<boolean> {
    return (await this.list(userId)).some((r) => isLive(r, now));
  },

  async summary(userId: string): Promise<SubjectAccessSummary[]> {
    return summarize(await this.list(userId));
  },

  /**
   * Contract `Entitlement[]` DTOs (§1.4). Default: active + future (not revoked, not expired).
   * `includeExpired` returns history too.
   */
  async dtos(userId: string, opts: { includeExpired?: boolean } = {}, ex?: Executor): Promise<EntitlementDto[]> {
    const rows = await db.many<EntDtoRow>(
      `SELECT e.id, e.subject_id, s.slug AS subject_slug, e.source, e.starts_at, e.ends_at, e.reason,
              sub.package_id, g.id AS granted_by_id, g.name_en AS granted_by_name_en, g.name_ar AS granted_by_name_ar,
              g.avatar_url AS granted_by_avatar
         FROM ${T.entitlements} e
         JOIN ${T.subjects} s ON s.id = e.subject_id
         LEFT JOIN ${T.subscriptions} sub ON sub.id = e.subscription_id
         LEFT JOIN ${T.users} g ON g.id = e.granted_by AND e.source = 'manual'
        WHERE e.user_id = $1 AND e.revoked_at IS NULL ${opts.includeExpired ? '' : 'AND e.ends_at > now()'}
        ORDER BY s.sort_order, e.ends_at DESC`,
      [userId],
      ex,
    );
    return rows.map((r) => ({
      id: r.id,
      subjectId: r.subject_id,
      subjectSlug: r.subject_slug,
      source: r.source,
      startsAt: r.starts_at.toISOString(),
      expiresAt: r.ends_at.toISOString(),
      packageId: r.source === 'package' ? r.package_id : null,
      grantedBy: r.granted_by_id ? { id: r.granted_by_id, name: { en: r.granted_by_name_en ?? '', ar: r.granted_by_name_ar ?? '' }, avatarUrl: r.granted_by_avatar } : null,
      reason: r.source === 'manual' ? r.reason : null,
    }));
  },

  /** Grant (or extend) access to subjects. Writes entitlement + log rows. Pass `ex` to join a transaction. */
  async grant(input: GrantInput, ex?: Executor): Promise<string[]> {
    const run = async (c: Executor) => {
      const startsAt = input.startsAt ?? new Date();
      const endsAt = input.endsAt ?? addDays(startsAt, input.days ?? 30);
      const ids: string[] = [];
      for (const subjectId of input.subjectIds) {
        const row = input.subscriptionId
          ? await db.one<{ id: string }>(
              `INSERT INTO ${T.entitlements} (user_id, subject_id, source, subscription_id, starts_at, ends_at, granted_by, reason)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
               ON CONFLICT (subscription_id, subject_id) WHERE subscription_id IS NOT NULL
               DO UPDATE SET starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at, revoked_at = NULL, revoked_reason = NULL
               RETURNING id`,
              [input.userId, subjectId, input.source, input.subscriptionId, startsAt, endsAt, input.actorId ?? null, input.reason ?? null],
              c,
            )
          : await db.one<{ id: string }>(
              `INSERT INTO ${T.entitlements} (user_id, subject_id, source, starts_at, ends_at, granted_by, reason)
               VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
              [input.userId, subjectId, input.source, startsAt, endsAt, input.actorId ?? null, input.reason ?? null],
              c,
            );
        ids.push(row.id);
        await db.query(
          `INSERT INTO ${T.entitlement_logs} (user_id, entitlement_id, subject_id, action, source, days, starts_at, ends_at, reason, actor_id, actor_name)
           VALUES ($1,$2,$3,'grant',$4,$5,$6,$7,$8,$9,$10)`,
          [
            input.userId,
            row.id,
            subjectId,
            input.source,
            Math.round((endsAt.getTime() - startsAt.getTime()) / 86_400_000),
            startsAt,
            endsAt,
            input.reason ?? '',
            input.actorId ?? null,
            input.actorName ?? '',
          ],
          c,
        );
      }
      return ids;
    };
    const ids = ex ? await run(ex) : await tx((c) => run(c));
    this.invalidate(input.userId);
    return ids;
  },

  /** Create entitlements for every subject of a subscription's package (payment success, manual package grant). */
  async grantForSubscription(subscriptionId: string, ex?: Executor): Promise<string[]> {
    const sub = await db.maybeOne<{ user_id: string; package_id: string; starts_at: Date; ends_at: Date; source: string; granted_by: string | null }>(
      `SELECT user_id, package_id, starts_at, ends_at, source, granted_by FROM ${T.subscriptions} WHERE id = $1`,
      [subscriptionId],
      ex,
    );
    if (!sub) return [];
    const subjects = await db.many<{ subject_id: string }>(`SELECT subject_id FROM ${T.package_subjects} WHERE package_id = $1`, [sub.package_id], ex);
    return this.grant(
      {
        userId: sub.user_id,
        subjectIds: subjects.map((s) => s.subject_id),
        source: 'package',
        subscriptionId,
        startsAt: sub.starts_at,
        endsAt: sub.ends_at,
        actorId: sub.granted_by,
        reason: `subscription:${sub.source}`,
      },
      ex,
    );
  },

  /** Revoke entitlements (refund, cancellation, admin). */
  async revoke(where: { userId: string; subscriptionId?: string; entitlementId?: string; subjectId?: string }, reason: string, actor?: { id?: string | null; name?: string }, ex?: Executor): Promise<number> {
    const run = async (c: Executor) => {
      const conds = ['user_id = $1', 'revoked_at IS NULL'];
      const params: unknown[] = [where.userId];
      if (where.subscriptionId) {
        params.push(where.subscriptionId);
        conds.push(`subscription_id = $${params.length}`);
      }
      if (where.entitlementId) {
        params.push(where.entitlementId);
        conds.push(`id = $${params.length}`);
      }
      if (where.subjectId) {
        params.push(where.subjectId);
        conds.push(`subject_id = $${params.length}`);
      }
      params.push(reason);
      const rows = await db.many<{ id: string; subject_id: string }>(
        `UPDATE ${T.entitlements} SET revoked_at = now(), revoked_reason = $${params.length}
          WHERE ${conds.join(' AND ')} RETURNING id, subject_id`,
        params,
        c,
      );
      for (const r of rows) {
        await db.query(
          `INSERT INTO ${T.entitlement_logs} (user_id, entitlement_id, subject_id, action, reason, actor_id, actor_name)
           VALUES ($1,$2,$3,'revoke',$4,$5,$6)`,
          [where.userId, r.id, r.subject_id, reason, actor?.id ?? null, actor?.name ?? ''],
          c,
        );
      }
      return rows.length;
    };
    const n = ex ? await run(ex) : await tx((c) => run(c));
    this.invalidate(where.userId);
    return n;
  },
};

/**
 * Middleware factory. `resolveSubjectId` returns the subject uuid of the requested resource (or null → 404 is
 * the handler's job). Free-preview content can bypass via `isFree`.
 */
export function requireEntitlement(
  resolveSubjectId: (req: Request) => Promise<string | null> | string | null,
  feature: AccessFeature,
  isFree?: (req: Request) => Promise<boolean> | boolean,
) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (!req.student) throw new UnauthorizedError();
    const subjectId = await resolveSubjectId(req);
    if (subjectId) {
      const free = isFree ? await isFree(req) : false;
      await entitlements.assertAccess(req.student.userId, subjectId, { feature, freePreview: free });
    }
    next();
  };
}
