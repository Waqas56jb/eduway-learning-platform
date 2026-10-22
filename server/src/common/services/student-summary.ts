/**
 * Shared student read-models used by /auth/me, /me, admin student detail and other modules:
 *   aiAllowance(userId)     → AiAllowance (§1.5)       (AI tutor module reuses it for quota checks)
 *   mySubscription(userId)  → MySubscription | null (§14)
 *   unreadNotifications(userId)
 */
import { T } from '../../config/constants.js';
import { db } from '../../config/db.js';
import { loadPackageExtras, toPackagePublic, type PackagePublic, type PackageRow } from '../dto/package.js';
import type { SubjectRef } from '../dto/refs.js';
import { daysRemaining, dayjs, BUSINESS_TZ } from '../utils/dates.js';
import { loadAiSettings } from '../../modules/ai-tutor/settings.js';
import { settingsStore } from './settings-store.js';

export interface AiAllowance {
  enabled: boolean;
  disabledReason: 'GLOBAL' | 'USER' | 'NOT_INCLUDED' | null;
  used: number;
  quota: number;
  remaining: number;
  cycle: 'calendar' | 'billing';
  resetsAt: string;
}

export interface MySubscription {
  id: string;
  status: 'active' | 'trial' | 'expired' | 'cancelled';
  package: PackagePublic;
  cycle: 'monthly' | 'yearly';
  startedAt: string;
  endsAt: string;
  daysRemaining: number;
  totalDays: number;
  remainingPct: number;
  subjects: SubjectRef[];
  aiAllowance: AiAllowance;
  renewal: 'manual' | 'auto' | 'none';
  source: 'payment' | 'manual' | 'trial';
  lastPaymentId: string | null;
}

interface SubRow {
  id: string;
  status: string;
  billing_cycle: 'monthly' | 'yearly';
  source: string;
  starts_at: Date;
  ends_at: Date;
  ai_quota: number;
  payment_id: string | null;
  package_id: string;
}

/** Most relevant subscription: active (latest end) first, else the most recent one. */
export async function currentSubscriptionRow(userId: string): Promise<SubRow | null> {
  return db.maybeOne<SubRow>(
    `SELECT id, CASE WHEN status = 'active' AND ends_at <= now() THEN 'expired' ELSE status END AS status,
            billing_cycle, source, starts_at, ends_at, ai_quota, payment_id, package_id
       FROM ${T.subscriptions}
      WHERE user_id = $1 AND status <> 'pending'
      ORDER BY (status IN ('active', 'trial') AND ends_at > now()) DESC, ends_at DESC
      LIMIT 1`,
    [userId],
  );
}

interface AiSettingsRow {
  enabled: boolean;
  monthly_allowance: number;
  reset_cycle: 'calendar' | 'billing';
}

/** Global AI settings through the ai-tutor cache (10 s TTL, invalidated on every admin write) — previously a
 *  query per call, issued 3–4× per /auth/me and /progress/dashboard (docs/PERFORMANCE.md). */
async function aiSettings(): Promise<AiSettingsRow> {
  return (await loadAiSettings().catch(() => null)) ?? { enabled: true, monthly_allowance: 100, reset_cycle: 'calendar' };
}

/** Current allowance period [start, end) for a user. */
export function allowancePeriod(cycle: 'calendar' | 'billing', subStart: Date | null, now = new Date()): { start: Date; end: Date } {
  if (cycle === 'billing' && subStart) {
    let start = dayjs(subStart);
    while (start.add(1, 'month').isBefore(now) || start.add(1, 'month').isSame(now)) start = start.add(1, 'month');
    return { start: start.toDate(), end: start.add(1, 'month').toDate() };
  }
  const start = dayjs(now).tz(BUSINESS_TZ).startOf('month');
  return { start: start.toDate(), end: start.add(1, 'month').toDate() };
}

export async function aiAllowance(userId: string, sub?: SubRow | null): Promise<AiAllowance> {
  const [settings, subscription] = await Promise.all([aiSettings(), sub === undefined ? currentSubscriptionRow(userId) : sub]);
  const active = subscription && (subscription.status === 'active' || subscription.status === 'trial') && subscription.ends_at > new Date();
  const quota = active ? subscription.ai_quota : 0;
  const period = allowancePeriod(settings.reset_cycle, active ? subscription.starts_at : null);
  // profile flag + period usage in one round trip (was two sequential queries)
  const usage = await db.maybeOne<{ ai_disabled: boolean | null; questions_used: number | null; bonus_questions: number | null }>(
    `SELECT (SELECT ai_disabled FROM ${T.student_profiles} WHERE user_id = $1) AS ai_disabled, u.questions_used, u.bonus_questions
       FROM (SELECT 1) one LEFT JOIN ${T.ai_usage} u ON u.user_id = $1 AND u.period_start = $2`,
    [userId, period.start],
  );
  const profile = { ai_disabled: usage?.ai_disabled ?? false };
  const used = usage?.questions_used ?? 0;
  const total = quota + (usage?.bonus_questions ?? 0);
  const disabledReason: AiAllowance['disabledReason'] = !settings.enabled ? 'GLOBAL' : profile?.ai_disabled ? 'USER' : total <= 0 ? 'NOT_INCLUDED' : null;
  return {
    enabled: disabledReason === null,
    disabledReason,
    used,
    quota: total,
    remaining: Math.max(0, total - used),
    cycle: settings.reset_cycle,
    resetsAt: period.end.toISOString(),
  };
}

/**
 * `pre` lets a composite endpoint (/auth/me, /progress/dashboard) share one subscription row / allowance between
 * its sections instead of re-reading them (previously 3–4 identical subscription queries per request).
 */
export async function mySubscription(userId: string, pre?: { sub?: SubRow | null; ai?: Promise<AiAllowance> }): Promise<MySubscription | null> {
  const sub = pre?.sub !== undefined ? pre.sub : await currentSubscriptionRow(userId);
  if (!sub) return null;
  // independent reads in parallel (were 6 sequential round trips)
  const [pkg, extras, ai, app, subjects, aiAllowanceDto] = await Promise.all([
    db.maybeOne<PackageRow>(`SELECT * FROM ${T.packages} WHERE id = $1`, [sub.package_id]),
    loadPackageExtras([sub.package_id]),
    aiSettings(),
    settingsStore.app(),
    db.many<{ id: string; slug: string; name_en: string; name_ar: string; color: string }>(
      `SELECT s.id, s.slug, s.name_en, s.name_ar, s.color FROM ${T.package_subjects} ps JOIN ${T.subjects} s ON s.id = ps.subject_id
        WHERE ps.package_id = $1 ORDER BY s.sort_order`,
      [sub.package_id],
    ),
    pre?.ai ?? aiAllowance(userId, sub),
  ]);
  if (!pkg) return null;
  const defaultAi = ai.monthly_allowance ?? 100;
  const totalDays = Math.max(1, Math.round((sub.ends_at.getTime() - sub.starts_at.getTime()) / 86_400_000));
  const remaining = daysRemaining(sub.ends_at);
  return {
    id: sub.id,
    status: sub.status as MySubscription['status'],
    package: toPackagePublic(pkg, { subjects: extras.subjects.get(pkg.id) ?? [], features: extras.features.get(pkg.id) ?? [], defaultAiQuota: defaultAi, currentPackageId: pkg.id, devices: app.deviceLimit }),
    cycle: sub.billing_cycle,
    startedAt: sub.starts_at.toISOString(),
    endsAt: sub.ends_at.toISOString(),
    daysRemaining: remaining,
    totalDays,
    remainingPct: Math.round((Math.min(remaining, totalDays) / totalDays) * 1000) / 10,
    subjects: subjects.map((s) => ({ id: s.id, slug: s.slug, name: { en: s.name_en, ar: s.name_ar }, color: s.color })),
    aiAllowance: aiAllowanceDto,
    renewal: pkg.renewal,
    source: (sub.source === 'promo' ? 'payment' : sub.source) as MySubscription['source'],
    lastPaymentId: sub.payment_id,
  };
}

export async function unreadNotifications(userId: string): Promise<number> {
  return (await db.scalar<number>(`SELECT count(*)::int FROM ${T.notifications} WHERE user_id = $1 AND read_at IS NULL`, [userId])) ?? 0;
}
