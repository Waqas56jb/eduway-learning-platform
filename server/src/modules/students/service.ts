import { T } from '../../config/constants.js';
import { db, tx } from '../../config/db.js';
import { entitlements } from '../../common/entitlements.js';
import { adminRef, governorateRef, marketerRef, packageRef, schoolRef, studentRef, subjectRef } from '../../common/dto/refs.js';
import { baseValidityDays } from '../../common/dto/package.js';
import { BusinessRuleError, NotFoundError } from '../../common/errors/index.js';
import { resolveReferralCode } from '../../common/services/referrals.js';
import { storage } from '../../common/services/storage.js';
import { aiAllowance } from '../../common/services/student-summary.js';
import type { AdminPrincipal } from '../../common/types/index.js';
import { sessions, toSessionDto } from '../auth/sessions.js';
import { studentsRepo, type StudentFilter, type StudentListRow } from './repository.js';
import type { AdminStudentDetail, AdminStudentRow, EntitlementLogDto, NoteDto, SubscriptionStatus, TransactionRow } from './types.js';
import { onStudentEmailChanged } from '../users/email-verification.js';

export async function toRows(rows: StudentListRow[]): Promise<AdminStudentRow[]> {
  const avatars = await storage.resolveMany(rows.map((r) => r.avatar_url));
  return rows.map((r, i) => ({
    id: r.id,
    name: { en: r.name_en, ar: r.name_ar || r.name_en },
    mobile: r.phone,
    email: r.email,
    avatarUrl: avatars[i] ?? null,
    gender: r.gender,
    governorateId: r.gov_code ?? '',
    governorate: governorateRef(r as unknown as Record<string, unknown>, 'gov_') ?? { id: '', name: { en: '', ar: '' } },
    schoolId: r.sch_id,
    school: schoolRef(r as unknown as Record<string, unknown>, 'sch_'),
    schoolName: r.school_name,
    packageId: r.pkg_id,
    package: packageRef(r as unknown as Record<string, unknown>, 'pkg_'),
    subscriptionStatus: r.sub_status as SubscriptionStatus,
    subscriptionExpiresAt: r.sub_ends_at?.toISOString() ?? null,
    source: (r.source ?? 'organic') as AdminStudentRow['source'],
    referralCode: r.referral_code,
    marketerId: r.mkt_id,
    marketer: marketerRef(r as unknown as Record<string, unknown>, 'mkt_'),
    locked: r.status === 'locked',
    lockedReason: r.locked_reason,
    platforms: r.platforms as AdminStudentRow['platforms'],
    lastActive: r.last_active_at?.toISOString() ?? null,
    createdAt: r.created_at.toISOString(),
  }));
}

async function getRow(id: string): Promise<StudentListRow> {
  const r = await studentsRepo.get(id);
  if (!r) throw new NotFoundError('student');
  return r;
}

export const studentsService = {
  async list(f: StudentFilter, order: string, limit: number, offset: number) {
    const { rows, total } = await studentsRepo.list(f, order, limit, offset);
    return { items: await toRows(rows), total };
  },

  async stats() {
    const s = await studentsRepo.stats();
    return { total: s.total, active: s.active, trial: s.trial, expired: s.expired, cancelled: s.cancelled, none: s.none, locked: s.locked, byPlatform: { web: s.web, ios: s.ios, android: s.android } };
  },

  async detail(id: string): Promise<AdminStudentDetail> {
    const row = await getRow(id);
    const [base] = await toRows([row]);
    const [m, ai, ents, otp, active, pkg] = await Promise.all([
      studentsRepo.metrics(id),
      aiAllowance(id),
      entitlements.dtos(id),
      studentsRepo.otpState(row.phone),
      sessions.listActive(id),
      row.pkg_id ? studentsRepo.packageDetail(row.pkg_id) : Promise.resolve(null),
    ]);
    const lockedUntil = otp?.locked_until && otp.locked_until.getTime() > Date.now() ? otp.locked_until : null;
    return {
      ...(base as AdminStudentRow),
      progress: m.progress,
      avgScore: m.avg_score,
      aiQuestionsUsed: ai.used,
      aiAllowance: ai,
      aiDisabled: row.ai_disabled === true,
      lifetimeValue: m.ltv,
      packageDetail: pkg
        ? { id: pkg.id, name: { en: pkg.name_en, ar: pkg.name_ar }, subjectIds: pkg.subject_ids, validityType: pkg.validity_type, validityValue: pkg.validity_value, validityDays: baseValidityDays(pkg) }
        : null,
      entitlements: ents,
      otp: { failures: otp?.failed_count ?? 0, locked: !!lockedUntil, lockedUntil: lockedUntil?.toISOString() ?? null },
      counts: { transactions: m.tx_count, sessions: active.length, notes: m.notes },
      memberSince: row.created_at.toISOString(),
    };
  },

  async setLocked(ids: string[], locked: boolean, reason: string | null, by: AdminPrincipal) {
    const succeeded: string[] = [];
    const failed: { id: string; code: string; message: string }[] = [];
    for (const id of ids) {
      const n = await studentsRepo.setLocked(id, locked, reason);
      if (!n) {
        failed.push({ id, code: 'NOT_FOUND', message: 'Student not found' });
        continue;
      }
      if (locked) await sessions.revokeAll(id, 'account_locked', { by: by.userId });
      succeeded.push(id);
    }
    return { succeeded, failed };
  },

  async sessions(id: string) {
    await getRow(id);
    return (await sessions.listActive(id)).map((s) => toSessionDto(s));
  },

  async revokeSession(id: string, sessionId: string, by: AdminPrincipal) {
    const s = await sessions.get(sessionId);
    if (!s || s.user_id !== id || s.revoked_at) throw new NotFoundError('session');
    await sessions.revoke(sessionId, 'admin_force_logout', by.userId);
  },

  async revokeAll(id: string, by: AdminPrincipal) {
    await getRow(id);
    return { revoked: await sessions.revokeAll(id, 'admin_force_logout', { by: by.userId }) };
  },

  async notes(id: string): Promise<NoteDto[]> {
    await getRow(id);
    const rows = await studentsRepo.notes(id);
    return rows.map((n) => ({
      id: n.id,
      author: adminRef(n, 'a_') ?? { id: '', name: { en: n.author_name, ar: n.author_name }, avatarUrl: null },
      body: n.body,
      createdAt: n.created_at.toISOString(),
    }));
  },

  async addNote(id: string, body: string, by: AdminPrincipal): Promise<NoteDto> {
    await getRow(id);
    const { id: noteId } = await studentsRepo.addNote(id, by.userId, by.name, body);
    return (await this.notes(id)).find((n) => n.id === noteId) as NoteDto;
  },

  /** ADM-STU-14: replaces the manual entitlement for the subject. */
  async grantAccess(id: string, input: { subjectId: string; days: number; reason: string }, by: AdminPrincipal) {
    await getRow(id);
    const subject = await db.maybeOne<{ id: string }>(`SELECT id FROM ${T.subjects} WHERE id = $1 AND deleted_at IS NULL`, [input.subjectId]);
    if (!subject) throw new NotFoundError('subject');
    await tx(async (c) => {
      const existing = await db.many<{ id: string }>(
        `SELECT id FROM ${T.entitlements} WHERE user_id = $1 AND subject_id = $2 AND source = 'manual' AND revoked_at IS NULL`,
        [id, input.subjectId],
        c,
      );
      for (const e of existing) await entitlements.revoke({ userId: id, entitlementId: e.id }, `replaced: ${input.reason}`, { id: by.userId, name: by.name }, c);
      await entitlements.grant({ userId: id, subjectIds: [input.subjectId], source: 'manual', days: input.days, actorId: by.userId, actorName: by.name, reason: input.reason }, c);
    });
    entitlements.invalidate(id);
    return entitlements.dtos(id);
  },

  async revokeAccess(id: string, entitlementId: string, reason: string | undefined, by: AdminPrincipal) {
    const e = await db.maybeOne<{ source: string }>(`SELECT source FROM ${T.entitlements} WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`, [entitlementId, id]);
    if (!e) throw new NotFoundError('entitlement');
    if (e.source !== 'manual') throw new BusinessRuleError('INVALID_TRANSITION', { from: e.source, to: 'revoked' });
    await entitlements.revoke({ userId: id, entitlementId }, reason ?? 'admin_revoke', { id: by.userId, name: by.name });
    return entitlements.dtos(id);
  },

  async entitlementLogs(id: string): Promise<EntitlementLogDto[]> {
    await getRow(id);
    const rows = await studentsRepo.entitlementLogs(id);
    return rows.map((r) => ({
      id: r.id,
      action: r.action as EntitlementLogDto['action'],
      subject: subjectRef(r, 's_'),
      source: (r.source === 'manual' ? 'manual' : r.action === 'revoke' && /refund/i.test(r.reason) ? 'refund' : 'package') as EntitlementLogDto['source'],
      days: r.days,
      reason: r.reason || null,
      actor: adminRef(r, 'a_'),
      at: r.created_at.toISOString(),
    }));
  },

  /** ADM-STU-17 — affects future attribution only. */
  async changeAttribution(id: string, input: { schoolId: string | null; referralCode: string | null }) {
    const row = await getRow(id);
    let source = row.source ?? 'organic';
    let marketerId = row.mkt_id;
    let referral: string | null = null;
    if (input.referralCode) {
      const ref = await resolveReferralCode(input.referralCode);
      if (!ref) throw new BusinessRuleError('REFERRAL_CODE_INVALID');
      referral = ref.code;
      source = ref.kind;
      if (ref.marketerId) marketerId = ref.marketerId;
    }
    if (input.schoolId) {
      const school = await db.maybeOne<{ marketer_id: string | null }>(
        `SELECT ms.marketer_id FROM ${T.schools} s LEFT JOIN ${T.marketer_schools} ms ON ms.school_id = s.id AND ms.unassigned_at IS NULL WHERE s.id = $1 AND s.deleted_at IS NULL`,
        [input.schoolId],
      );
      if (!school) throw new NotFoundError('school');
      source = 'school';
      if (school.marketer_id) marketerId = school.marketer_id;
    }
    await tx(async (c) => {
      await studentsRepo.updateProfile(id, { school_id: input.schoolId, referral_code: referral, source, marketer_id: marketerId, ...(input.schoolId ? { school_name: null } : {}) }, c);
      if (input.schoolId) {
        await db.query(
          `INSERT INTO ${T.school_students} (school_id, user_id, marketer_id, source, referral_code_used) VALUES ($1,$2,$3,'admin',$4)
           ON CONFLICT (user_id) DO UPDATE SET school_id = EXCLUDED.school_id, marketer_id = EXCLUDED.marketer_id, source = 'admin', attributed_at = now()`,
          [input.schoolId, id, marketerId, referral],
          c,
        );
      } else {
        await db.query(`DELETE FROM ${T.school_students} WHERE user_id = $1`, [id], c);
      }
    });
    return this.detail(id);
  },

  async resetOtp(id: string) {
    const row = await getRow(id);
    await studentsRepo.resetOtp(row.phone);
    return { failures: 0 as const, locked: false as const };
  },

  async update(id: string, input: { name?: { en: string; ar: string }; email?: string | null; gender?: 'male' | 'female' | null; governorateId?: string; schoolName?: string | null }) {
    const current = await getRow(id);
    const userPatch: Record<string, unknown> = {};
    const profilePatch: Record<string, unknown> = {};
    if (input.name) {
      userPatch.name_en = input.name.en;
      userPatch.name_ar = input.name.ar;
    }
    if (input.email !== undefined) userPatch.email = input.email?.toLowerCase() ?? null;
    if (input.gender !== undefined) profilePatch.gender = input.gender;
    if (input.schoolName !== undefined) profilePatch.school_name = input.schoolName;
    if (input.governorateId) {
      const gid = await db.scalar<string>(`SELECT id FROM ${T.governorates} WHERE code = $1`, [input.governorateId]);
      if (!gid) throw new BusinessRuleError('GOVERNORATE_INVALID');
      profilePatch.governorate_id = gid;
    }
    await studentsRepo.updateUser(id, userPatch);
    await studentsRepo.updateProfile(id, profilePatch);
    // A new address must be confirmed by the student before it receives receipts / support replies.
    if (input.email !== undefined && (current.email ?? null) !== (userPatch.email ?? null)) await onStudentEmailChanged(id);
    return this.detail(id);
  },

  async activity(id: string, limit: number, days: number) {
    await getRow(id);
    const [watch, quizzes, exams, aiDaily, aiRecent] = await Promise.all([
      studentsRepo.watch(id, limit),
      studentsRepo.quizzes(id, limit),
      studentsRepo.exams(id, limit),
      studentsRepo.aiDaily(id, days),
      studentsRepo.aiRecent(id, limit),
    ]);
    const L = (r: Record<string, unknown>, f: string) => ({ en: String(r[`${f}_en`] ?? ''), ar: String(r[`${f}_ar`] ?? '') });
    return {
      watch: watch.map((w) => ({ id: w.id, lessonId: w.lesson_id, lessonTitle: L(w, 'title'), subject: subjectRef(w, 's_'), watchedSec: w.watched_sec, durationSec: w.duration_sec, completed: w.completed, at: (w.updated_at as Date).toISOString() })),
      quizzes: quizzes.map((q) => ({ id: q.id, lessonId: q.lesson_id, lessonTitle: L(q, 'title'), correct: q.correct_count, total: q.total_count, score: Number(q.score ?? 0), passed: q.status === 'passed', at: (q.at as Date).toISOString() })),
      exams: exams.map((e) => ({
        id: e.id,
        title: L(e, 'title'),
        score: Number(e.score ?? 0),
        durationMin: e.duration_min,
        status: e.status === 'in_progress' ? 'in_progress' : e.status === 'abandoned' ? 'abandoned' : e.passed ? 'passed' : 'failed',
        at: (e.started_at as Date).toISOString(),
      })),
      aiDaily,
      aiRecent: aiRecent.map((a) => ({ id: a.id, subject: subjectRef(a, 's_'), text: { en: String(a.content), ar: String(a.content) }, at: (a.created_at as Date).toISOString() })),
    };
  },

  async transactions(id: string, order: string, limit: number, offset: number) {
    const [total, rows] = await studentsRepo.transactions(id, order, limit, offset);
    return { total: total ?? 0, items: rows.map(toTransactionRow) };
  },
};

export function toTransactionRow(r: Record<string, unknown>): TransactionRow {
  const total = Number(r.total ?? 0);
  const refunded = Number(r.refunded_amount ?? 0);
  return {
    id: String(r.id),
    ref: String(r.ref),
    receiptNumber: (r.receipt_number as string | null) ?? null,
    student: studentRef(r, 'u_') as TransactionRow['student'],
    package: packageRef(r, 'p_') as TransactionRow['package'],
    cycle: r.billing_cycle as TransactionRow['cycle'],
    amount: total,
    currency: r.currency as TransactionRow['currency'],
    discount: Number(r.discount ?? 0),
    refundedAmount: refunded,
    refundable: r.status === 'paid' || r.status === 'partially_refunded' ? Math.max(0, total - refunded) : 0,
    gateway: String(r.provider),
    status: String(r.status),
    promoCode: (r.promo_code as string | null) ?? null,
    school: schoolRef(r, 'sc_'),
    marketer: marketerRef(r, 'm_'),
    source: r.school_id ? 'school' : r.promo_code ? 'promo' : 'direct',
    platform: (r.platform as TransactionRow['platform']) ?? null,
    createdAt: (r.created_at as Date).toISOString(),
    paidAt: r.paid_at ? (r.paid_at as Date).toISOString() : null,
  };
}
