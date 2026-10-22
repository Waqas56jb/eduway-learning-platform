/** Marketers (ADM-MKT-*) + milestone sets (ADM-MIL-*). */
import { T } from '../../config/constants.js';
import { db, tx, type Executor } from '../../config/db.js';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../common/errors/index.js';
import { storage } from '../../common/services/storage.js';
import type { AdminPrincipal } from '../../common/types/index.js';
import { randomCode } from '../../common/utils/crypto.js';
import { BUSINESS_TZ, dayjs } from '../../common/utils/dates.js';
import { governorateUuid, iso, L, pageOf, parseSort, sortRows, type Row } from '../commerce/lib.js';
import { calcIncentive, periodFor, parsePeriodKey, progressPct } from '../incentives/calculator.js';
import { incentiveRules } from '../incentives/service.js';
import { schoolsService } from '../schools/service.js';
import { awardAllMilestones } from './milestones.js';

type Ref = { id: string; name: { en: string; ar: string }; avatarUrl: string | null };
export interface MarketerDto {
  id: string;
  name: { en: string; ar: string };
  mobile: string;
  email: string;
  avatarUrl: string | null;
  code: string | null;
  governorateId: string;
  governorate: { id: string; name: { en: string; ar: string } };
  schoolIds: string[];
  schoolsCount: number;
  paidStudents: number;
  milestonesHit: number;
  pendingReward: number;
  status: 'active' | 'inactive';
  joinedAt: string;
}
export interface MilestoneItem {
  id: string;
  threshold: number;
  reward: number;
  label: { en: string; ar: string };
}
export interface MilestoneSetDto {
  id: string;
  version: number;
  status: 'active' | 'draft' | 'superseded';
  effectiveFrom: string;
  items: MilestoneItem[];
  reachedBy: Record<string, Ref[]>;
  createdBy: Ref;
  createdAt: string;
}

export interface MarketerWrite {
  name: { en: string; ar: string };
  mobile: string;
  email: string;
  governorateId: string;
  status: 'active' | 'inactive';
  code?: string | null;
  avatarFileKey?: string | null;
}

const SELECT = `
  SELECT m.*, g.code AS g_code, g.name_en AS g_name_en, g.name_ar AS g_name_ar,
         COALESCE((SELECT array_agg(ms.school_id) FROM ${T.marketer_schools} ms JOIN ${T.schools} s ON s.id = ms.school_id
                    WHERE ms.marketer_id = m.id AND ms.unassigned_at IS NULL AND s.deleted_at IS NULL), '{}') AS school_ids,
         (SELECT count(DISTINCT p.user_id)::int FROM ${T.payments} p WHERE p.marketer_id = m.id AND p.status IN ('paid', 'partially_refunded') AND p.paid_at IS NOT NULL) AS paid_students,
         (SELECT COALESCE(sum(st.amount), 0)::bigint FROM ${T.settlements} st WHERE st.marketer_id = m.id AND st.status IN ('pending', 'approved'))
           + (SELECT COALESCE(sum(a.reward), 0)::bigint FROM ${T.marketer_milestone_awards} a WHERE a.marketer_id = m.id AND a.settlement_id IS NULL) AS pending_reward
    FROM ${T.marketers} m
    LEFT JOIN ${T.governorates} g ON g.id = m.governorate_id
   WHERE m.deleted_at IS NULL`;

async function activeSetItems(ex?: Executor): Promise<{ set: Row | null; items: MilestoneItem[] }> {
  const set = await db.maybeOne<Row>(`SELECT * FROM ${T.milestone_sets} WHERE status = 'active' LIMIT 1`, [], ex);
  if (!set) return { set: null, items: [] };
  const items = await db.many<Row>(`SELECT * FROM ${T.milestone_items} WHERE set_id = $1 ORDER BY threshold`, [set.id], ex);
  return { set, items: items.map((i) => ({ id: String(i.id), threshold: Number(i.threshold), reward: Number(i.reward), label: L(i, 'label') })) };
}

async function hydrate(rows: Row[], ex?: Executor): Promise<MarketerDto[]> {
  const { items } = await activeSetItems(ex);
  const avatars = await storage.resolveMany(rows.map((r) => r.avatar_url as string | null));
  return rows.map((r, i) => {
    const paid = Number(r.paid_students ?? 0);
    const schoolIds = (r.school_ids as string[]) ?? [];
    return {
      id: String(r.id),
      name: L(r, 'name'),
      mobile: String(r.mobile ?? ''),
      email: String(r.email ?? ''),
      avatarUrl: avatars[i] ?? null,
      code: (r.code as string | null) ?? null,
      governorateId: String(r.g_code ?? ''),
      governorate: { id: String(r.g_code ?? ''), name: L(r, 'g_name') },
      schoolIds,
      schoolsCount: schoolIds.length,
      paidStudents: paid,
      milestonesHit: items.filter((it) => it.threshold <= paid).length,
      pendingReward: Number(r.pending_reward ?? 0),
      status: r.status as MarketerDto['status'],
      joinedAt: iso(r.joined_at),
    };
  });
}

async function codeTaken(code: string, excludeId: string | null, ex: Executor): Promise<boolean> {
  return !!(await db.scalar<boolean>(
    `SELECT true FROM ${T.marketers} WHERE (upper(code) = $1 OR upper(referral_code) = $1) AND ($2::uuid IS NULL OR id <> $2::uuid)
     UNION ALL SELECT true FROM ${T.schools} WHERE upper(code) = $1 OR upper(referral_code) = $1 LIMIT 1`,
    [code.toUpperCase(), excludeId],
    ex,
  ));
}

export interface MarketerFilter {
  q?: string;
  status?: string;
  governorateId?: string;
  ids?: string[];
  sort?: string;
}

const SET_SELECT = `
  SELECT ms.*, u.id AS u_id, u.name_en AS u_name_en, u.name_ar AS u_name_ar, u.avatar_url AS u_avatar_url
    FROM ${T.milestone_sets} ms LEFT JOIN ${T.users} u ON u.id = ms.created_by`;

export const marketersService = {
  async all(f: MarketerFilter = {}, ex?: Executor): Promise<MarketerDto[]> {
    let list = await hydrate(await db.many<Row>(`${SELECT} ORDER BY m.name_en`, [], ex), ex);
    if (f.status) list = list.filter((m) => m.status === f.status);
    if (f.governorateId) list = list.filter((m) => m.governorateId === f.governorateId);
    if (f.ids?.length) list = list.filter((m) => f.ids?.includes(m.id));
    if (f.q) {
      const words = f.q.toLowerCase().split(/\s+/).filter(Boolean);
      list = list.filter((m) => words.every((w) => `${m.name.en} ${m.name.ar} ${m.mobile} ${m.email} ${m.code ?? ''}`.toLowerCase().includes(w)));
    }
    const sort = parseSort(f.sort, ['name', 'paidStudents', 'milestonesHit', 'pendingReward', 'joinedAt', 'schoolsCount', 'status'], '-paidStudents');
    return sortRows(list, sort, (m, k) => (k === 'name' ? m.name.en : (m as unknown as Record<string, unknown>)[k]));
  },

  async page(f: MarketerFilter & { page: number; pageSize: number }) {
    return pageOf(await this.all(f), f.page, f.pageSize);
  },

  async stats() {
    const list = await this.all();
    return {
      total: list.length,
      active: list.filter((m) => m.status === 'active').length,
      schoolsAssigned: list.reduce((a, m) => a + m.schoolsCount, 0),
      paidStudents: list.reduce((a, m) => a + m.paidStudents, 0),
      pendingRewards: list.reduce((a, m) => a + m.pendingReward, 0),
    };
  },

  async get(id: string, ex?: Executor): Promise<MarketerDto> {
    const r = await db.maybeOne<Row>(`${SELECT} AND m.id = $1`, [id], ex);
    if (!r) throw new NotFoundError('marketer');
    return (await hydrate([r], ex))[0] as MarketerDto;
  },

  async detail(id: string) {
    const m = await this.get(id);
    const schools = await schoolsService.all({ marketerId: id });
    const active = await this.activeSet();
    const items = active?.items ?? [];
    const next = items.find((i) => i.threshold > m.paidStudents) ?? null;
    const prevThreshold = [...items].reverse().find((i) => i.threshold <= m.paidStudents)?.threshold ?? 0;
    const span = next ? next.threshold - prevThreshold : 0;
    return {
      ...m,
      schools,
      milestones: {
        set: active,
        next,
        prevThreshold,
        progressPct: next ? (span > 0 ? Math.round(((m.paidStudents - prevThreshold) / span) * 1000) / 10 : 0) : items.length ? 100 : 0,
        toNext: next ? next.threshold - m.paidStudents : null,
      },
    };
  },

  async performance(id: string, months: number) {
    await this.get(id);
    const start = dayjs().tz(BUSINESS_TZ).startOf('month').subtract(months - 1, 'month');
    const rows = await db.many<{ month: string; students: number }>(
      `SELECT to_char(p.paid_at AT TIME ZONE $3, 'YYYY-MM') AS month, count(DISTINCT p.user_id)::int AS students
         FROM ${T.payments} p WHERE p.marketer_id = $1 AND p.status IN ('paid', 'partially_refunded') AND p.paid_at >= $2 GROUP BY 1`,
      [id, start.toDate(), BUSINESS_TZ],
    );
    return Array.from({ length: months }, (_, i) => {
      const month = start.add(i, 'month').format('YYYY-MM');
      return { month, students: rows.find((r) => r.month === month)?.students ?? 0 };
    });
  },

  async incentiveProgress(id: string, periodKey?: string) {
    await this.get(id);
    const rule = await incentiveRules.active('marketer');
    const range = periodKey ? parsePeriodKey(periodKey) : periodFor(rule?.period ?? 'monthly');
    if (!range) throw new BusinessRuleError('PERIOD_INVALID', { period: periodKey });
    const effective = periodKey ? ((await incentiveRules.forPeriod('marketer', range)) ?? rule) : rule;
    const paid =
      (await db.scalar<number>(
        `SELECT count(DISTINCT user_id)::int FROM ${T.payments} WHERE marketer_id = $1 AND status IN ('paid', 'partially_refunded') AND paid_at >= $2 AND paid_at < $3`,
        [id, range.from, range.to],
      )) ?? 0;
    const result = effective ? calcIncentive(effective, paid) : { qualified: false, tier: null, amount: 0, nextTier: null, studentsToNext: null, breakdown: 'not_qualified' as const };
    return { rule: effective, period: { key: range.key, from: range.from.toISOString(), to: range.to.toISOString() }, paid, result, progressPct: effective ? progressPct(paid, result, effective.qualificationThreshold) : 0 };
  },

  async create(body: MarketerWrite, admin: AdminPrincipal): Promise<MarketerDto> {
    return tx(async (c) => {
      const code = (body.code ?? `MKT-${randomCode(6)}`).toUpperCase();
      if (await codeTaken(code, null, c)) throw new ConflictError('ALREADY_EXISTS', { field: 'code' });
      let ref = `REF-${randomCode(6)}`;
      while (await codeTaken(ref, null, c)) ref = `REF-${randomCode(6)}`;
      const gov = await governorateUuid(body.governorateId, c);
      const id = (await db.scalar<string>(
        `INSERT INTO ${T.marketers} (code, referral_code, name_en, name_ar, mobile, email, governorate_id, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [code, ref, body.name.en, body.name.ar, body.mobile, body.email.toLowerCase(), gov, body.status],
        c,
      )) as string;
      if (body.avatarFileKey) {
        const up = await storage.attachUpload(body.avatarFileKey, { purpose: ['admin_avatar', 'teacher_avatar'], entityType: 'marketer', entityId: id, ownerId: admin.userId }, c);
        await db.query(`UPDATE ${T.marketers} SET avatar_url = $2 WHERE id = $1`, [id, storage.ref(up.bucket, up.path)], c);
      }
      return this.get(id, c);
    });
  },

  async update(id: string, body: Partial<MarketerWrite>, admin: AdminPrincipal): Promise<MarketerDto> {
    return tx(async (c) => {
      await this.get(id, c);
      const sets: string[] = [];
      const params: unknown[] = [id];
      const set = (col: string, v: unknown) => {
        if (v === undefined) return;
        params.push(v);
        sets.push(`${col} = $${params.length}`);
      };
      if (body.code) {
        if (await codeTaken(body.code, id, c)) throw new ConflictError('ALREADY_EXISTS', { field: 'code' });
        set('code', body.code.toUpperCase());
      }
      set('name_en', body.name?.en);
      set('name_ar', body.name?.ar);
      set('mobile', body.mobile);
      set('email', body.email?.toLowerCase());
      set('status', body.status);
      if (body.governorateId) set('governorate_id', await governorateUuid(body.governorateId, c));
      if (body.avatarFileKey === null) set('avatar_url', null);
      else if (body.avatarFileKey) {
        const up = await storage.attachUpload(body.avatarFileKey, { purpose: ['admin_avatar', 'teacher_avatar'], entityType: 'marketer', entityId: id, ownerId: admin.userId }, c);
        set('avatar_url', storage.ref(up.bucket, up.path));
      }
      if (sets.length) await db.query(`UPDATE ${T.marketers} SET ${sets.join(', ')} WHERE id = $1`, params, c);
      return this.get(id, c);
    });
  },

  /** Unassigns schools (future attribution), keeps paid settlements. */
  async remove(id: string): Promise<MarketerDto> {
    return tx(async (c) => {
      const before = await this.get(id, c);
      await db.query(`UPDATE ${T.marketer_schools} SET unassigned_at = now(), override_reason = COALESCE(override_reason, 'marketer deleted') WHERE marketer_id = $1 AND unassigned_at IS NULL`, [id], c);
      await db.query(
        `UPDATE ${T.marketers} SET deleted_at = now(), status = 'inactive', code = code || '-DEL-' || substr(md5(random()::text), 1, 6), referral_code = referral_code || '-DEL-' || substr(md5(random()::text), 1, 6) WHERE id = $1`,
        [id],
        c,
      );
      return before;
    });
  },

  async bulkStatus(ids: string[], status: 'active' | 'inactive') {
    const succeeded: string[] = [];
    const failed: { id: string; code: string; message: string }[] = [];
    for (const id of ids) {
      const n = await db.exec(`UPDATE ${T.marketers} SET status = $2 WHERE id = $1 AND deleted_at IS NULL`, [id, status]);
      if (n) succeeded.push(id);
      else failed.push({ id, code: 'NOT_FOUND', message: 'marketer not found' });
    }
    return { succeeded, failed };
  },

  // ── milestone sets ──
  async sets(status?: string): Promise<MilestoneSetDto[]> {
    const rows = await db.many<Row>(`${SET_SELECT} WHERE ($1::text IS NULL OR ms.status = $1) ORDER BY ms.version DESC`, [status ?? null]);
    return this.hydrateSets(rows);
  },

  async hydrateSets(rows: Row[], ex?: Executor): Promise<MilestoneSetDto[]> {
    if (!rows.length) return [];
    const items = await db.many<Row>(`SELECT * FROM ${T.milestone_items} WHERE set_id = ANY($1::uuid[]) ORDER BY threshold`, [rows.map((r) => r.id)], ex);
    const needReach = rows.some((r) => r.status === 'active');
    const marketers = needReach ? await this.all({}, ex) : [];
    return rows.map((r) => {
      const its = items.filter((i) => i.set_id === r.id).map((i) => ({ id: String(i.id), threshold: Number(i.threshold), reward: Number(i.reward), label: L(i, 'label') }));
      const reachedBy: Record<string, Ref[]> = {};
      if (r.status === 'active') for (const it of its) reachedBy[it.id] = marketers.filter((m) => m.paidStudents >= it.threshold).map((m) => ({ id: m.id, name: m.name, avatarUrl: m.avatarUrl }));
      return {
        id: String(r.id),
        version: Number(r.version),
        status: r.status as MilestoneSetDto['status'],
        effectiveFrom: iso(r.effective_from),
        items: its,
        reachedBy,
        createdBy: r.u_id ? { id: String(r.u_id), name: L(r, 'u_name'), avatarUrl: (r.u_avatar_url as string | null) ?? null } : { id: '', name: { en: String(r.created_by_name ?? ''), ar: String(r.created_by_name ?? '') }, avatarUrl: null },
        createdAt: iso(r.created_at),
      };
    });
  },

  async getSet(id: string, ex?: Executor): Promise<MilestoneSetDto> {
    const r = await db.maybeOne<Row>(`${SET_SELECT} WHERE ms.id = $1`, [id], ex);
    if (!r) throw new NotFoundError('milestoneSet');
    return (await this.hydrateSets([r], ex))[0] as MilestoneSetDto;
  },

  async activeSet(ex?: Executor): Promise<MilestoneSetDto | null> {
    const r = await db.maybeOne<Row>(`${SET_SELECT} WHERE ms.status = 'active' LIMIT 1`, [], ex);
    return r ? ((await this.hydrateSets([r], ex))[0] ?? null) : null;
  },

  async createSet(cloneFromId: string | undefined, admin: AdminPrincipal): Promise<MilestoneSetDto> {
    return tx(async (c) => {
      const draft = await db.scalar<string>(`SELECT id FROM ${T.milestone_sets} WHERE status = 'draft' LIMIT 1`, [], c);
      if (draft) throw new ConflictError('DRAFT_EXISTS', { draftId: draft });
      const srcId = cloneFromId ?? (await db.scalar<string>(`SELECT id FROM ${T.milestone_sets} WHERE status = 'active' LIMIT 1`, [], c));
      const srcItems = srcId ? await db.many<Row>(`SELECT * FROM ${T.milestone_items} WHERE set_id = $1 ORDER BY threshold`, [srcId], c) : [];
      const version = ((await db.scalar<number>(`SELECT max(version) FROM ${T.milestone_sets}`, [], c)) ?? 0) + 1;
      const id = (await db.scalar<string>(`INSERT INTO ${T.milestone_sets} (version, status, effective_from, created_by, created_by_name) VALUES ($1, 'draft', now(), $2, $3) RETURNING id`, [version, admin.userId, admin.name], c)) as string;
      const items = srcItems.length ? srcItems.map((i) => ({ threshold: Number(i.threshold), reward: Number(i.reward), en: String(i.label_en), ar: String(i.label_ar) })) : [{ threshold: 5, reward: 50_000, en: 'First Five', ar: 'أول خمسة' }];
      for (const [k, it] of items.entries()) {
        await db.query(`INSERT INTO ${T.milestone_items} (set_id, threshold, reward, label_en, label_ar, sort_order) VALUES ($1,$2,$3,$4,$5,$6)`, [id, it.threshold, it.reward, it.en, it.ar, k + 1], c);
      }
      return this.getSet(id, c);
    });
  },

  async updateSet(id: string, body: { items: { threshold: number; reward: number; label: { en: string; ar: string } }[]; effectiveFrom?: string }): Promise<MilestoneSetDto> {
    const issues: string[] = [];
    const seen = new Set<number>();
    body.items.forEach((it, i) => {
      if (seen.has(it.threshold)) issues.push(`Item ${i + 1}: threshold ${it.threshold} is duplicated`);
      seen.add(it.threshold);
      if (!(it.reward > 0)) issues.push(`Item ${i + 1}: reward must be > 0`);
      if (!it.label.en.trim() || !it.label.ar.trim()) issues.push(`Item ${i + 1}: label is required in both languages`);
    });
    if (!body.items.length) issues.push('At least one milestone is required');
    if (issues.length) throw new BusinessRuleError('MILESTONES_INVALID', { issues });
    return tx(async (c) => {
      const cur = await this.getSet(id, c);
      if (cur.status !== 'draft') throw new BusinessRuleError('NOT_DRAFT', { status: cur.status });
      await db.query(`DELETE FROM ${T.milestone_items} WHERE set_id = $1`, [id], c);
      for (const [k, it] of [...body.items].sort((a, b) => a.threshold - b.threshold).entries()) {
        await db.query(`INSERT INTO ${T.milestone_items} (set_id, threshold, reward, label_en, label_ar, sort_order) VALUES ($1,$2,$3,$4,$5,$6)`, [id, it.threshold, it.reward, it.label.en, it.label.ar, k + 1], c);
      }
      if (body.effectiveFrom) await db.query(`UPDATE ${T.milestone_sets} SET effective_from = $2 WHERE id = $1`, [id, body.effectiveFrom], c);
      return this.getSet(id, c);
    });
  },

  async deleteSet(id: string): Promise<MilestoneSetDto> {
    const cur = await this.getSet(id);
    if (cur.status !== 'draft') throw new BusinessRuleError('NOT_DRAFT', { status: cur.status });
    await db.query(`DELETE FROM ${T.milestone_sets} WHERE id = $1`, [id]);
    return cur;
  },

  async activateSet(id: string): Promise<{ activated: MilestoneSetDto; superseded: MilestoneSetDto | null }> {
    const res = await tx(async (c) => {
      const cur = await this.getSet(id, c);
      if (cur.status !== 'draft') throw new BusinessRuleError('NOT_DRAFT', { status: cur.status });
      if (!cur.items.length) throw new BusinessRuleError('MILESTONES_INVALID', { issues: ['At least one milestone is required'] });
      const prev = await db.maybeOne<{ id: string }>(`SELECT id FROM ${T.milestone_sets} WHERE status = 'active' FOR UPDATE`, [], c);
      if (prev) await db.query(`UPDATE ${T.milestone_sets} SET status = 'superseded', effective_to = now() WHERE id = $1`, [prev.id], c);
      await db.query(`UPDATE ${T.milestone_sets} SET status = 'active', effective_from = GREATEST(now(), effective_from) WHERE id = $1`, [id], c);
      await awardAllMilestones(c);
      return { prevId: prev?.id ?? null };
    });
    return { activated: await this.getSet(id), superseded: res.prevId ? await this.getSet(res.prevId) : null };
  },
};
