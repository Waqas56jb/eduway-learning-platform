/**
 * Admin-portal demo population: 120 students (profiles, subscriptions, entitlements, sessions, notes),
 * 80 payments with timelines/webhooks/receipts, refunds, settlements, audit log, admin sessions,
 * security alerts, support tickets, AI flags, campaigns. All ids deterministic → idempotent.
 */
import { T } from '../../config/constants.js';
import type { TxClient } from '../../config/db.js';
import { hashToken } from '../../common/utils/crypto.js';
import { normalizePhone } from '../../common/utils/phone.js';
import { PACKAGE_BY_ADMIN, packageId, SUBJECT_BY_ADMIN, subjectId } from './catalog.js';
import { daysAgo, e164, insertMany, rebase, rng, sid } from './helpers.js';
import { govFromAdmin, marketerId, schoolId } from './partners.js';
import type { AdminMock } from './types.js';

export const studentId = (mockId: string) => sid('student', mockId);
const subscriptionId = (mockId: string) => sid('subscription', mockId);

const PLATFORMS = ['web', 'ios', 'android'] as const;

export async function seedStudents(c: TxClient, mock: AdminMock, adminIdByName: Map<string, string>, adminIdByMock: Map<string, string>): Promise<void> {
  const r = rng(2026);
  const students = mock.students.filter((s) => normalizePhone(s.mobile) && e164(s.mobile) !== '+9647701234567');

  await insertMany(
    c,
    T.users,
    ['id', 'kind', 'phone', 'email', 'name_en', 'name_ar', 'avatar_url', 'locale', 'status', 'locked_at', 'locked_reason', 'last_active_at', 'created_at'],
    students.map((s) => [studentId(s.id), 'student', normalizePhone(s.mobile), s.email, s.name_en, s.name_ar, s.avatar, r.next() < 0.75 ? 'ar' : 'en', s.locked ? 'locked' : 'active', s.locked ? rebase(s.lastActive) : null, s.locked ? 'Account sharing detected' : null, rebase(s.lastActive), rebase(s.createdAt)]),
    '(id) DO NOTHING',
  );
  await insertMany(
    c,
    T.student_profiles,
    ['user_id', 'first_name_en', 'first_name_ar', 'gender', 'governorate_id', 'school_id', 'source', 'referral_code', 'marketer_id', 'registered_platform', 'profile_completed', 'ai_disabled', 'created_at'],
    students.map((s) => [
      studentId(s.id),
      s.name_en.split(' ')[0],
      s.name_ar.split(' ')[0],
      s.gender,
      govFromAdmin(s.governorateId),
      s.schoolId ? schoolId(s.schoolId) : null,
      s.source,
      s.referralCode,
      s.marketerId ? marketerId(s.marketerId) : null,
      s.sessions[0]?.platform ?? 'web',
      true,
      mock.aiSettings.disabledUserIds.includes(s.id),
      rebase(s.createdAt),
    ]),
    '(user_id) DO NOTHING',
  );
  await insertMany(
    c,
    T.school_students,
    ['id', 'school_id', 'user_id', 'marketer_id', 'source', 'referral_code_used', 'attributed_at'],
    students.filter((s) => s.schoolId).map((s) => [sid('school-student', s.id), schoolId(s.schoolId as string), studentId(s.id), s.marketerId ? marketerId(s.marketerId) : null, s.referralCode ? 'code' : 'picker', s.referralCode, rebase(s.createdAt)]),
    '(user_id) DO NOTHING',
  );
  await insertMany(c, T.streaks, ['user_id', 'current_streak', 'longest_streak', 'last_active_date'], students.map((s) => [studentId(s.id), r.int(0, 14), r.int(5, 40), rebase(s.lastActive)?.toISOString().slice(0, 10)]), '(user_id) DO NOTHING');

  // ── subscriptions + entitlements ──
  const subRows: unknown[][] = [];
  const entRows: unknown[][] = [];
  for (const s of students) {
    const pkg = s.packageId ? PACKAGE_BY_ADMIN[s.packageId] : null;
    if (pkg && s.subscriptionStatus !== 'none') {
      const ends = rebase(s.subscriptionExpiresAt) ?? daysAgo(5);
      const starts = new Date(ends.getTime() - (s.subscriptionStatus === 'trial' ? 7 : 30) * 86_400_000);
      const status = s.subscriptionStatus === 'expired' ? 'expired' : s.subscriptionStatus;
      subRows.push([subscriptionId(s.id), studentId(s.id), packageId(pkg), 'monthly', status, s.subscriptionStatus === 'trial' ? 'trial' : 'payment', starts, ends, pkg === 'single' ? 30 : pkg === 'science' ? 60 : 100, status === 'cancelled' ? ends : null]);
    }
    for (const [i, e] of (s as unknown as { entitlements: { subjectId: string; expiresAt: string; source: 'package' | 'manual' }[] }).entitlements.entries()) {
      const subj = SUBJECT_BY_ADMIN[e.subjectId];
      if (!subj) continue;
      const ends = rebase(e.expiresAt) as Date;
      const linked = e.source === 'package' && pkg && s.subscriptionStatus !== 'none';
      entRows.push([sid('entitlement', `${s.id}:${i}`), studentId(s.id), subjectId(subj), linked ? 'package' : 'manual', linked ? subscriptionId(s.id) : null, new Date(ends.getTime() - 30 * 86_400_000), ends, linked ? null : 'Compensation for service outage']);
    }
  }
  await insertMany(c, T.subscriptions, ['id', 'user_id', 'package_id', 'billing_cycle', 'status', 'source', 'starts_at', 'ends_at', 'ai_quota', 'cancelled_at'], subRows, '(id) DO NOTHING');
  await insertMany(c, T.entitlements, ['id', 'user_id', 'subject_id', 'source', 'subscription_id', 'starts_at', 'ends_at', 'reason'], entRows, '(id) DO NOTHING');

  // ── sessions (student devices) + notes + AI usage ──
  const sessRows: unknown[][] = [];
  const devRows: unknown[][] = [];
  for (const s of students) {
    for (const ss of s.sessions) {
      const seen = rebase(ss.lastSeen) as Date;
      sessRows.push([sid('session', `${s.id}:${ss.id}`), studentId(s.id), 'student', hashToken(`seed-${s.id}-${ss.id}`, 'refresh'), `${s.id}-${ss.id}`, ss.device, ss.platform, ss.ip, ss.location, ss.location.endsWith('IQ') ? 'IQ' : null, ss.platform === 'web' ? 'desktop' : 'mobile', new Date(seen.getTime() - 3 * 86_400_000), seen, new Date(seen.getTime() + 30 * 86_400_000)]);
      devRows.push([sid('device', `${s.id}:${ss.id}`), studentId(s.id), `${s.id}-${ss.id}`, ss.platform, ss.device, seen]);
    }
  }
  await insertMany(c, T.sessions, ['id', 'user_id', 'audience', 'refresh_token_hash', 'device_id', 'device_name', 'platform', 'ip', 'location', 'country_code', 'device_type', 'created_at', 'last_seen_at', 'expires_at'], sessRows, '(id) DO NOTHING');
  await insertMany(c, T.devices, ['id', 'user_id', 'device_id', 'platform', 'name', 'last_seen_at'], devRows, '(user_id, device_id) DO NOTHING');
  await insertMany(
    c,
    T.entity_notes,
    ['id', 'entity_type', 'entity_id', 'author_id', 'author_name', 'body', 'created_at'],
    students.flatMap((s) => s.notes.map((n) => [sid('note', n.id), 'student', studentId(s.id), adminIdByName.get(n.author) ?? null, n.author, n.body, rebase(n.createdAt)])),
    '(id) DO NOTHING',
  );
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1) - 3 * 3_600_000); // Asia/Baghdad month start
  await insertMany(
    c,
    T.ai_usage,
    ['id', 'user_id', 'period_start', 'period_end', 'allowance', 'questions_used'],
    students.filter((s) => s.aiQuestionsUsed > 0).map((s) => [sid('ai-usage', `${s.id}:${monthStart.toISOString()}`), studentId(s.id), monthStart, new Date(monthStart.getTime() + 31 * 86_400_000), 100, Math.min(100, s.aiQuestionsUsed)]),
    '(user_id, period_start) DO NOTHING',
  );

  // ── payments + timeline + webhooks + receipts ──
  const known = new Set(students.map((s) => s.id));
  const txs = mock.transactions.filter((t) => known.has(t.studentId) && PACKAGE_BY_ADMIN[t.packageId]);
  const promoIds = new Map(mock.promotions.map((p) => [p.code.toUpperCase(), sid('promotion', p.id)]));
  await insertMany(
    c,
    T.payments,
    ['id', 'ref', 'user_id', 'package_id', 'billing_cycle', 'amount', 'discount', 'total', 'currency', 'provider', 'provider_ref', 'status', 'refunded_amount', 'promotion_id', 'promo_code', 'school_id', 'marketer_id', 'platform', 'paid_at', 'created_at'],
    txs.map((t) => {
      const paidEv = t.timeline.find((e) => e.status === 'paid');
      return [
        sid('payment', t.id),
        t.ref,
        studentId(t.studentId),
        packageId(PACKAGE_BY_ADMIN[t.packageId] as string),
        'monthly',
        t.amount + t.discount,
        t.discount,
        t.amount,
        t.currency,
        t.gateway,
        `gw_${t.ref}`,
        t.status,
        Math.min(t.refundedAmount, t.amount),
        t.promoCode ? (promoIds.get(t.promoCode.toUpperCase()) ?? null) : null,
        t.promoCode,
        t.schoolId ? schoolId(t.schoolId) : null,
        t.marketerId ? marketerId(t.marketerId) : null,
        r.pick(PLATFORMS),
        paidEv ? rebase(paidEv.at) : null,
        rebase(t.createdAt),
      ];
    }),
    '(id) DO NOTHING',
  );
  const evRows: unknown[][] = [];
  for (const t of txs) {
    for (const e of t.timeline) {
      const kind = e.status === 'webhook' ? 'webhook' : e.status === 'refund_requested' ? 'refund_requested' : 'status';
      evRows.push([sid('payment-event', `${t.id}:${e.id}`), sid('payment', t.id), kind, kind === 'status' ? e.status : null, null, null, null, {}, e.note, rebase(e.at)]);
    }
    for (const w of t.webhooks) evRows.push([sid('payment-event', `${t.id}:wh:${w.id}`), sid('payment', t.id), 'webhook', null, t.gateway, w.id, w.verified, { type: w.type, idempotencyKey: w.idempotencyKey, ...w.payload }, w.type, rebase(w.receivedAt)]);
  }
  await insertMany(c, T.payment_events, ['id', 'payment_id', 'kind', 'status', 'provider', 'provider_event_id', 'verified', 'payload', 'note', 'created_at'], evRows, 'DO NOTHING');
  await insertMany(
    c,
    T.receipts,
    ['id', 'payment_id', 'number', 'issued_at', 'data'],
    txs.filter((t) => ['paid', 'partially_refunded', 'refunded'].includes(t.status)).map((t) => [sid('receipt', t.id), sid('payment', t.id), `R-${t.ref.replace(/^EDW-/, '').replace(/[^A-Z0-9]/g, '').padEnd(8, '0').slice(0, 4)}-${t.ref.replace(/[^A-Z0-9]/g, '').slice(-4)}`, rebase(t.createdAt), { ref: t.ref, amount: t.amount }]),
    'DO NOTHING',
  );
  await insertMany(
    c,
    T.refunds,
    ['id', 'payment_id', 'user_id', 'amount', 'kind', 'reason', 'status', 'requested_by', 'requested_at', 'decided_by', 'decided_at'],
    mock.refunds
      .filter((f) => txs.some((t) => t.id === f.transactionId))
      .map((f) => [sid('refund', f.id), sid('payment', f.transactionId), studentId(f.studentId), f.amount, f.kind, f.reason, f.status, adminIdByName.get(f.requestedBy) ?? null, rebase(f.requestedAt), f.decidedBy ? (adminIdByName.get(f.decidedBy) ?? null) : null, rebase(f.decidedAt)]),
    '(id) DO NOTHING',
  );

  // ── settlements ──
  await insertMany(
    c,
    T.settlements,
    ['id', 'partner_type', 'school_id', 'marketer_id', 'period', 'period_start', 'period_end', 'qualified_students', 'amount', 'currency', 'status', 'approved_by', 'approved_at', 'paid_at'],
    mock.settlements.map((s) => {
      const [y, m] = s.period.split('-').map(Number) as [number, number];
      const start = `${y}-${String(m).padStart(2, '0')}-01`;
      const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
      return [sid('settlement', s.id), s.partnerType, s.partnerType === 'school' ? schoolId(s.partnerId) : null, s.partnerType === 'marketer' ? marketerId(s.partnerId) : null, s.period, start, end, s.qualifiedStudents, s.amount, 'IQD', s.status, s.approvedBy ? (adminIdByName.get(s.approvedBy) ?? null) : null, s.approvedBy ? rebase(s.paidAt) ?? daysAgo(10) : null, rebase(s.paidAt)];
    }),
    '(id) DO NOTHING',
  );

  // ── audit log, admin sessions, alerts, tickets ──
  await insertMany(
    c,
    T.audit_logs,
    ['id', 'actor_id', 'actor_name', 'actor_role', 'action', 'entity', 'entity_id', 'summary', 'before', 'after', 'ip', 'device', 'created_at'],
    mock.auditLogs.map((a) => [sid('audit', a.id), adminIdByName.get(a.actor) ?? null, a.actor, a.actorRole, a.action, a.entity, a.entityId, a.summary, a.before, a.after, a.ip, a.device, rebase(a.at)]),
    '(id) DO NOTHING',
  );
  await insertMany(
    c,
    T.sessions,
    ['id', 'user_id', 'audience', 'refresh_token_hash', 'device_id', 'device_name', 'platform', 'browser', 'device_type', 'ip', 'location', 'country_code', 'created_at', 'last_seen_at', 'expires_at'],
    mock.adminSessions.map((s) => {
      const adminUser = adminIdByMock.get(s.adminId) ?? sid('admin', s.adminId);
      const cc = /, ([A-Z]{2})$/.exec(s.location)?.[1] ?? null;
      const seen = rebase(s.lastActive) as Date;
      return [sid('admin-session', s.id), adminUser, 'admin', hashToken(`seed-admin-${s.id}`, 'refresh'), `admin-${s.id}`, s.device, 'admin', s.browser, /iPhone|Galaxy|Redmi|Tab/.test(s.device) ? (/Tab/.test(s.device) ? 'tablet' : 'mobile') : 'desktop', s.ip, s.location, cc, rebase(s.startedAt), seen, new Date(seen.getTime() + 7 * 86_400_000)];
    }),
    '(id) DO NOTHING',
  );
  await insertMany(
    c,
    T.suspicious_events,
    ['id', 'kind', 'severity', 'subject_label', 'subject_type', 'user_id', 'detail', 'status', 'created_at'],
    mock.securityAlerts.map((a) => {
      const isAdmin = a.subjectId?.startsWith('adm_');
      const userId = a.subjectId ? (isAdmin ? (adminIdByMock.get(a.subjectId) ?? null) : known.has(a.subjectId) ? studentId(a.subjectId) : null) : null;
      return [sid('alert', a.id), a.kind, a.severity, a.subject, a.subjectId ? (isAdmin ? 'admin' : 'student') : null, userId, a.detail, a.status, rebase(a.createdAt)];
    }),
    '(id) DO NOTHING',
  );
  await insertMany(
    c,
    T.support_tickets,
    ['id', 'number', 'user_id', 'subject_en', 'subject_ar', 'message', 'category', 'priority', 'status', 'assignee_id', 'assignee_name', 'source', 'created_at'],
    mock.supportTickets.map((t) => [sid('ticket', t.id), `EW-T-${t.id.replace(/\D/g, '').padStart(5, '0')}`, known.has(t.studentId) ? studentId(t.studentId) : null, t.subject_en, t.subject_ar, t.subject_en, t.category, t.priority, t.status, adminIdByName.get(t.assignee) ?? null, t.assignee, 'app', rebase(t.createdAt)]),
    '(id) DO NOTHING',
  );

  // ── AI abuse flags (each with its conversation + offending message) ──
  for (const f of mock.flaggedConversations.filter((x) => known.has(x.studentId))) {
    const subj = SUBJECT_BY_ADMIN[f.subjectId];
    const conv = sid('ai-conv', f.id);
    const msg = sid('ai-msg', f.id);
    await c.query(
      `INSERT INTO ${T.ai_conversations} (id, user_id, subject_id, title, flagged, message_count, last_message_at, created_at) VALUES ($1,$2,$3,$4,true,1,$5,$5) ON CONFLICT (id) DO NOTHING`,
      [conv, studentId(f.studentId), subj ? subjectId(subj) : null, f.excerpt.slice(0, 60), rebase(f.createdAt)],
    );
    await c.query(`INSERT INTO ${T.ai_messages} (id, conversation_id, role, content, counted, created_at) VALUES ($1,$2,'user',$3,true,$4) ON CONFLICT (id) DO NOTHING`, [msg, conv, f.excerpt, rebase(f.createdAt)]);
    await c.query(
      `INSERT INTO ${T.ai_flags} (id, conversation_id, message_id, user_id, subject_id, reason, severity, status, excerpt, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (id) DO NOTHING`,
      [sid('ai-flag', f.id), conv, msg, studentId(f.studentId), subj ? subjectId(subj) : null, f.reason, f.severity, f.status, f.excerpt, rebase(f.createdAt)],
    );
  }

  // ── campaigns ──
  await insertMany(
    c,
    T.campaigns,
    ['id', 'name', 'channel', 'template_id', 'audience_filters', 'audience_count', 'status', 'scheduled_at', 'sent_at', 'created_by', 'created_by_name'],
    mock.campaigns.map((cm) => [sid('campaign', cm.id), cm.name, cm.channel, cm.templateId ? sid('template', cm.templateId) : null, cm.filters, cm.audienceCount, cm.status, rebase(cm.scheduledAt), rebase(cm.sentAt), adminIdByName.get(cm.createdBy) ?? null, cm.createdBy]),
    '(id) DO NOTHING',
  );
}
