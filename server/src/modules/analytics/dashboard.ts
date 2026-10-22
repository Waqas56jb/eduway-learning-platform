/**
 * Admin dashboard composite (ADM-DSH-01, API_CONTRACT §19).
 * `from`/`to` only affect `dau` and `registrationsByGovernorate`; every other block uses fixed windows.
 * Sections the caller lacks module permission for are returned as `null`.
 */
import { catalogCache } from '../../common/services/catalog-cache.js';
import { T } from '../../config/constants.js';
import { db } from '../../config/db.js';
import { packageRef, refCols, studentRef, subjectRef } from '../../common/dto/refs.js';
import { hasAnyPermission } from '../../common/middleware/rbac.js';
import type { AdminPrincipal } from '../../common/types/index.js';
import { BUSINESS_TZ, dayjs } from '../../common/utils/dates.js';
import { colorAt, iso, L, round1, type Row } from '../commerce/lib.js';
import { marketersService } from '../marketers/service.js';
import { schoolsService } from '../schools/service.js';
import { kpi, resolveRange } from './metrics.js';
import { analyticsService } from './service.js';

const PAID = `('paid', 'partially_refunded')`;
const can = (a: AdminPrincipal, ...perms: string[]) => hasAnyPermission(a, perms);

/** Business-tz month keys (yyyy-MM) for the last `n` months ending with the current one. */
function lastMonths(n: number): string[] {
  const now = dayjs().tz(BUSINESS_TZ).startOf('month');
  return Array.from({ length: n }, (_, i) => now.subtract(n - 1 - i, 'month').format('YYYY-MM'));
}
function lastDays(n: number): string[] {
  const today = dayjs().tz(BUSINESS_TZ).startOf('day');
  return Array.from({ length: n }, (_, i) => today.subtract(n - 1 - i, 'day').format('YYYY-MM-DD'));
}
const monthStart = (m: string) => dayjs.tz(`${m}-01`, BUSINESS_TZ).startOf('day').toDate();
const dayStart = (d: string) => dayjs.tz(d, BUSINESS_TZ).startOf('day').toDate();
const sumOf = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** Map `{ k, n }` rows onto an ordered key list (missing keys → 0). */
function series(keys: string[], rows: { k: string; n: number | string }[]): number[] {
  const m = new Map(rows.map((r) => [r.k, Number(r.n)]));
  return keys.map((k) => m.get(k) ?? 0);
}

async function kpis() {
  const months = lastMonths(12);
  const days14 = lastDays(14);
  const t12 = monthStart(months[0] as string);
  const t14 = dayStart(days14[0] as string);
  const now = dayjs().tz(BUSINESS_TZ);
  const thisMonth = now.startOf('month');
  const prevMonth = thisMonth.subtract(1, 'month');
  const prevSpanEnd = prevMonth.add(now.diff(thisMonth, 'millisecond'), 'millisecond');

  // Students: cumulative at the end of each month.
  const totalStudents = (await db.scalar<number>(`SELECT count(*)::int FROM ${T.users} WHERE kind = 'student' AND deleted_at IS NULL`)) ?? 0;
  const regsByMonth = await db.many<{ k: string; n: number }>(
    `SELECT to_char(created_at AT TIME ZONE $2, 'YYYY-MM') AS k, count(*)::int AS n FROM ${T.users}
      WHERE kind = 'student' AND deleted_at IS NULL AND created_at >= $1 GROUP BY 1`,
    [t12, BUSINESS_TZ],
  );
  const regsMonthly = series(months, regsByMonth);
  const before12 = totalStudents - sumOf(regsMonthly);
  const cumulative: number[] = [];
  regsMonthly.reduce((acc, n) => {
    cumulative.push(acc + n);
    return acc + n;
  }, before12);
  const studentsPrev = cumulative.length > 1 ? (cumulative[cumulative.length - 2] as number) : null;

  // Subscriptions.
  const activeSubs = (await db.scalar<number>(`SELECT count(DISTINCT user_id)::int FROM ${T.subscriptions} WHERE status IN ('active', 'trial') AND ends_at > now()`)) ?? 0;
  const subsByMonth = await db.many<{ k: string; n: number }>(
    `SELECT to_char(paid_at AT TIME ZONE $2, 'YYYY-MM') AS k, count(*)::int AS n FROM ${T.payments}
      WHERE status IN ${PAID} AND paid_at >= $1 GROUP BY 1`,
    [t12, BUSINESS_TZ],
  );
  const subsMonthly = series(months, subsByMonth);

  // Revenue (net) per month.
  const revByMonth = await db.many<{ k: string; n: string }>(
    `SELECT to_char(paid_at AT TIME ZONE $2, 'YYYY-MM') AS k, COALESCE(sum(total - refunded_amount), 0)::bigint AS n FROM ${T.payments}
      WHERE status IN ${PAID} AND paid_at >= $1 GROUP BY 1`,
    [t12, BUSINESS_TZ],
  );
  const revMonthly = series(months, revByMonth);

  // Registrations, quiz attempts: 14 daily values.
  const regsDaily = series(
    days14,
    await db.many<{ k: string; n: number }>(
      `SELECT (created_at AT TIME ZONE $2)::date::text AS k, count(*)::int AS n FROM ${T.users}
        WHERE kind = 'student' AND deleted_at IS NULL AND created_at >= $1 GROUP BY 1`,
      [t14, BUSINESS_TZ],
    ),
  );
  const quizDaily = series(
    days14,
    await db.many<{ k: string; n: number }>(
      `SELECT (started_at AT TIME ZONE $2)::date::text AS k, count(*)::int AS n FROM ${T.quiz_attempts} WHERE started_at >= $1 GROUP BY 1`,
      [t14, BUSINESS_TZ],
    ),
  );

  // Lessons.
  const lessons = await db.one<{ published: number; total: number; prev: number }>(
    `SELECT count(*) FILTER (WHERE status = 'published')::int AS published, count(*)::int AS total,
            count(*) FILTER (WHERE status = 'published' AND COALESCE(published_at, created_at) < $1)::int AS prev
       FROM ${T.lessons} WHERE deleted_at IS NULL`,
    [thisMonth.toDate()],
  );

  // AI questions: month-to-date vs the same span of the previous month; spark = daily current month.
  const ai = await db.one<{ cur: number; prev: number }>(
    `SELECT count(*) FILTER (WHERE m.created_at >= $1)::int AS cur,
            count(*) FILTER (WHERE m.created_at >= $2 AND m.created_at < $3)::int AS prev
       FROM ${T.ai_messages} m WHERE m.role = 'user' AND m.created_at >= $2`,
    [thisMonth.toDate(), prevMonth.toDate(), prevSpanEnd.toDate()],
  );
  const monthDays = Array.from({ length: now.date() }, (_, i) => thisMonth.add(i, 'day').format('YYYY-MM-DD'));
  const aiDaily = series(
    monthDays,
    await db.many<{ k: string; n: number }>(
      `SELECT (created_at AT TIME ZONE $2)::date::text AS k, count(*)::int AS n FROM ${T.ai_messages} WHERE role = 'user' AND created_at >= $1 GROUP BY 1`,
      [thisMonth.toDate(), BUSINESS_TZ],
    ),
  );

  // Support tickets: open count now + open count at the end of each of the last 9 weeks.
  const tickets = await db.one<{ open: number; pending: number }>(
    `SELECT count(*) FILTER (WHERE status = 'open')::int AS open, count(*) FILTER (WHERE status = 'pending')::int AS pending FROM ${T.support_tickets}`,
  );
  const weekEnds = Array.from({ length: 9 }, (_, i) => now.subtract(8 - i, 'week').toDate());
  const openWeekly = await db.many<{ n: number }>(
    `SELECT (SELECT count(*)::int FROM ${T.support_tickets} st WHERE st.created_at <= w.at AND (st.resolved_at IS NULL OR st.resolved_at > w.at)) AS n
       FROM unnest($1::timestamptz[]) WITH ORDINALITY AS w(at, i) ORDER BY w.i`,
    [weekEnds],
  );
  const openSpark = openWeekly.map((r) => Number(r.n));

  const reg7 = sumOf(regsDaily.slice(7));
  const reg7prev = sumOf(regsDaily.slice(0, 7));
  const quiz7 = sumOf(quizDaily.slice(7));
  const quiz7prev = sumOf(quizDaily.slice(0, 7));
  const last = (xs: number[], back = 1) => xs[xs.length - back] ?? 0;
  return {
    totalStudents: kpi(totalStudents, studentsPrev, cumulative),
    activeSubscriptions: { ...kpi(activeSubs, null, subsMonthly), deltaPct: kpi(last(subsMonthly), last(subsMonthly, 2), []).deltaPct, pctOfTotal: totalStudents ? round1((activeSubs / totalStudents) * 100) : 0 },
    revenueThisMonth: kpi(last(revMonthly), last(revMonthly, 2), revMonthly),
    newRegistrations7d: kpi(reg7, reg7prev, regsDaily),
    publishedLessons: { ...kpi(lessons.published, lessons.prev, []), totalLessons: lessons.total },
    quizAttempts7d: kpi(quiz7, quiz7prev, quizDaily),
    aiQuestionsMonth: kpi(ai.cur, ai.prev, aiDaily),
    openIssues: { ...kpi(tickets.open, openSpark.length > 1 ? (openSpark[openSpark.length - 2] as number) : null, openSpark), pending: tickets.pending },
    _monthly: { months, revMonthly, subsMonthly, regsMonthly },
  };
}

async function packageDistribution() {
  const rows = await db.many<Row>(
    `SELECT p.id, p.name_en, p.name_ar, count(DISTINCT s.user_id)::int AS n
       FROM ${T.subscriptions} s JOIN ${T.packages} p ON p.id = s.package_id
      WHERE s.status IN ('active', 'trial') AND s.ends_at > now()
      GROUP BY p.id ORDER BY n DESC, p.sort_order`,
  );
  const withSub = sumOf(rows.map((r) => Number(r.n)));
  const total = (await db.scalar<number>(`SELECT count(*)::int FROM ${T.users} WHERE kind = 'student' AND deleted_at IS NULL`)) ?? 0;
  const out: { packageId: string | null; name: { en: string; ar: string }; value: number; color: string }[] = rows.map((r, i) => ({ packageId: String(r.id), name: L(r, 'name'), value: Number(r.n), color: colorAt(i) }));
  out.push({ packageId: null, name: { en: 'No package', ar: 'بدون باقة' }, value: Math.max(0, total - withSub), color: '#94A3B8' });
  return out.filter((x) => x.value > 0);
}

async function dau(from: string, to: string) {
  const rows = await db.many<{ d: string; n: number }>(
    `SELECT g.d::date::text AS d, (SELECT count(DISTINCT a.user_id)::int FROM ${T.daily_activity} a WHERE a.activity_date = g.d::date) AS n
       FROM generate_series($1::date, $2::date, interval '1 day') AS g(d) ORDER BY 1`,
    [from, to],
  );
  return rows.map((r) => ({ date: r.d, dau: Number(r.n) }));
}

async function registrationsByGovernorate(from: string, to: string) {
  const t0 = dayStart(from);
  const t1 = dayjs.tz(to, BUSINESS_TZ).add(1, 'day').startOf('day').toDate();
  const rows = await db.many<Row>(
    `SELECT g.code, g.name_en, g.name_ar, count(*)::int AS n
       FROM ${T.users} u JOIN ${T.student_profiles} sp ON sp.user_id = u.id JOIN ${T.governorates} g ON g.id = sp.governorate_id
      WHERE u.kind = 'student' AND u.deleted_at IS NULL AND u.created_at >= $1 AND u.created_at < $2
      GROUP BY g.id ORDER BY n DESC, g.sort_order LIMIT 8`,
    [t0, t1],
  );
  return rows.map((r) => ({ governorateId: String(r.code), name: L(r, 'name'), registrations: Number(r.n) }));
}

async function pendingReview() {
  const rows = await db.many<Row>(
    `SELECT l.id, l.title_en, l.title_ar, l.updated_at, ${refCols.subject('s', 's_')}
       FROM ${T.lessons} l JOIN ${T.subjects} s ON s.id = l.subject_id
      WHERE l.status = 'in_review' AND l.deleted_at IS NULL ORDER BY l.updated_at DESC LIMIT 10`,
  );
  const count = (await db.scalar<number>(`SELECT count(*)::int FROM ${T.lessons} WHERE status = 'in_review' AND deleted_at IS NULL`)) ?? 0;
  return { items: rows.map((r) => ({ id: String(r.id), title: L(r, 'title'), subject: subjectRef(r, 's_'), updatedAt: iso(r.updated_at) })), count };
}

async function recentPayments() {
  const rows = await db.many<Row>(
    `SELECT p.id, p.ref, p.total, p.currency, p.status, p.created_at, ${refCols.user('u', 'u_')}, ${refCols.package('pk', 'pk_')}
       FROM ${T.payments} p JOIN ${T.users} u ON u.id = p.user_id JOIN ${T.packages} pk ON pk.id = p.package_id
      ORDER BY p.created_at DESC LIMIT 6`,
  );
  return rows.map((r) => ({
    id: String(r.id),
    ref: String(r.ref),
    student: studentRef(r, 'u_'),
    package: packageRef(r, 'pk_'),
    amount: Number(r.total),
    currency: String(r.currency),
    status: String(r.status),
    createdAt: iso(r.created_at),
  }));
}

/** The permission-dependent sections of the composite (cache key component). */
const sectionFlags = (admin: AdminPrincipal) =>
  [
    can(admin, 'payments.view', 'analytics.view'),
    can(admin, 'packages.view', 'analytics.view'),
    can(admin, 'analytics.view', 'dashboard.view'),
    can(admin, 'users.view', 'analytics.view'),
    can(admin, 'analytics.view', 'content.view'),
    can(admin, 'schools.view'),
    can(admin, 'marketers.view'),
    can(admin, 'content.view'),
    can(admin, 'payments.view'),
  ]
    .map((b) => (b ? '1' : '0'))
    .join('');

export const dashboardService = {
  /**
   * ADM-DSH-01. ~25 sequential aggregate queries (kept sequential to spare the shared pooler), so the composite is
   * served from the shared read cache (≤15 s old, cleared by any admin mutation — common/services/catalog-cache.ts).
   * Key: range rounded to the minute (the admin UI sends millisecond timestamps) + visible sections.
   */
  async get(admin: AdminPrincipal, q: { from?: string; to?: string }) {
    const key = `admin-dashboard:${q.from?.slice(0, 16) ?? ''}:${q.to?.slice(0, 16) ?? ''}:${sectionFlags(admin)}`;
    return catalogCache.get(key, () => dashboardService.compute(admin, q));
  },

  async compute(admin: AdminPrincipal, q: { from?: string; to?: string }) {
    const r = resolveRange(q.from, q.to);
    // Sequential on purpose: keeps connection usage low on the shared Supabase pooler.
    const k = await kpis();
    const { _monthly: m, ...kpiBlock } = k;
    const seeMoney = can(admin, 'payments.view', 'analytics.view');
    const monthly = seeMoney ? m.months.map((month, i) => ({ month, revenue: m.revMonthly[i] ?? 0, subs: m.subsMonthly[i] ?? 0, regs: m.regsMonthly[i] ?? 0 })) : null;
    const pkg = can(admin, 'packages.view', 'analytics.view') ? await packageDistribution() : null;
    const dauRows = can(admin, 'analytics.view', 'dashboard.view') ? await dau(r.from, r.to) : null;
    const govs = can(admin, 'users.view', 'analytics.view') ? await registrationsByGovernorate(r.from, r.to) : null;
    const weakest = can(admin, 'analytics.view', 'content.view')
      ? (await analyticsService.topics({ sort: 'accuracy', limit: 6, to: dayjs().toISOString(), from: dayjs().subtract(90, 'day').toISOString() })).map((t) => ({
          topicId: t.topicId,
          name: t.topic,
          accuracy: t.accuracy,
          color: t.subject.color,
        }))
      : null;
    const topSchools = can(admin, 'schools.view')
      ? [...(await schoolsService.all())]
          .sort((a, b) => b.verifiedPaidStudents - a.verifiedPaidStudents)
          .slice(0, 5)
          .map((s) => ({ id: s.id, name: s.name, tier: s.tier, verifiedPaidStudents: s.verifiedPaidStudents }))
      : null;
    const topMarketers = can(admin, 'marketers.view')
      ? [...(await marketersService.all())]
          .sort((a, b) => b.paidStudents - a.paidStudents)
          .slice(0, 5)
          .map((x) => ({ id: x.id, name: x.name, avatarUrl: x.avatarUrl, paidStudents: x.paidStudents, pendingReward: x.pendingReward }))
      : null;
    const review = can(admin, 'content.view') ? await pendingReview() : null;
    const payments = can(admin, 'payments.view') ? await recentPayments() : null;
    return {
      kpis: kpiBlock,
      monthly,
      packageDistribution: pkg,
      dau: dauRows,
      registrationsByGovernorate: govs,
      weakestTopics: weakest,
      topSchools,
      topMarketers,
      pendingReview: review?.items ?? null,
      pendingReviewCount: review?.count ?? null,
      recentPayments: payments,
    };
  },
};
