/** Business + learning analytics (ADM-ANL-01..05). Paid definitions per API_CONTRACT §29. */
import { T } from '../../config/constants.js';
import { db } from '../../config/db.js';
import { BUSINESS_TZ, dayjs } from '../../common/utils/dates.js';
import { colorAt, L, round1, type Row } from '../commerce/lib.js';
import { schoolsService } from '../schools/service.js';
import { activeWindows, buckets, daysOf, defaultGrain, kpi, loadDailyMetrics, previousRange, resolveRange, type Grain, type Range } from './metrics.js';

export interface AnalyticsQuery {
  from?: string;
  to?: string;
  grain?: Grain;
  compare?: boolean;
  platform?: 'web' | 'ios' | 'android';
  subjectId?: string;
}

const instants = (r: Range) => ({ t0: dayjs.tz(r.from, BUSINESS_TZ).startOf('day').toDate(), t1: dayjs.tz(r.to, BUSINESS_TZ).add(1, 'day').startOf('day').toDate() });
const pct = (a: number, b: number) => (b > 0 ? round1((a / b) * 100) : 0);

const SOURCE_LABELS: Record<string, { en: string; ar: string }> = {
  organic: { en: 'Organic', ar: 'مباشر' },
  school: { en: 'School', ar: 'مدرسة' },
  marketer: { en: 'Marketer', ar: 'مسوّق' },
  referral: { en: 'Referral', ar: 'إحالة' },
  campaign: { en: 'Campaign', ar: 'حملة' },
};

/** Per-day business series (registrations, paid, renewals, revenue, refunds). */
async function businessDaily(r: Range, platform?: string) {
  const { t0, t1 } = instants(r);
  // Sequential on purpose: keeps connection usage low on the shared Supabase pooler.
  const regs = await db.many<{ d: string; n: number }>(
      `SELECT (u.created_at AT TIME ZONE $3)::date::text AS d, count(*)::int AS n
         FROM ${T.users} u LEFT JOIN ${T.student_profiles} sp ON sp.user_id = u.id
        WHERE u.kind = 'student' AND u.deleted_at IS NULL AND u.created_at >= $1 AND u.created_at < $2 AND ($4::text IS NULL OR COALESCE(sp.registered_platform::text, 'web') = $4)
        GROUP BY 1`,
      [t0, t1, BUSINESS_TZ, platform ?? null],
  );
  const pays = await db.many<{ d: string; n: number; renewals: number; revenue: number }>(
      `SELECT (v.paid_at AT TIME ZONE $3)::date::text AS d, count(*)::int AS n,
              count(*) FILTER (WHERE EXISTS (SELECT 1 FROM ${T.payments} o WHERE o.user_id = v.user_id AND o.id <> v.id AND o.paid_at < v.paid_at AND o.status IN ('paid', 'partially_refunded', 'refunded')))::int AS renewals,
              COALESCE(sum(v.total), 0)::bigint AS revenue
         FROM ${T.payments} v
        WHERE v.status IN ('paid', 'partially_refunded', 'refunded') AND v.paid_at >= $1 AND v.paid_at < $2 AND ($4::text IS NULL OR v.platform::text = $4)
        GROUP BY 1`,
      [t0, t1, BUSINESS_TZ, platform ?? null],
  );
  const refs = await db.many<{ d: string; amount: number; n: number }>(
      `SELECT (rf.decided_at AT TIME ZONE $3)::date::text AS d, COALESCE(sum(rf.amount), 0)::bigint AS amount, count(*)::int AS n
         FROM ${T.refunds} rf JOIN ${T.payments} p ON p.id = rf.payment_id
        WHERE rf.status IN ('approved', 'processed') AND rf.decided_at >= $1 AND rf.decided_at < $2 AND ($4::text IS NULL OR p.platform::text = $4)
        GROUP BY 1`,
      [t0, t1, BUSINESS_TZ, platform ?? null],
    );
  const by = new Map<string, { registrations: number; paid: number; renewals: number; revenue: number; refunds: number; refundCount: number }>();
  for (const d of daysOf(r)) by.set(d, { registrations: 0, paid: 0, renewals: 0, revenue: 0, refunds: 0, refundCount: 0 });
  for (const x of regs) if (by.has(x.d)) (by.get(x.d) as { registrations: number }).registrations = x.n;
  for (const x of pays) {
    const v = by.get(x.d);
    if (v) Object.assign(v, { paid: x.n, renewals: x.renewals, revenue: Number(x.revenue) });
  }
  for (const x of refs) {
    const v = by.get(x.d);
    if (v) Object.assign(v, { refunds: Number(x.amount), refundCount: x.n });
  }
  return by;
}

type Day = { registrations: number; paid: number; renewals: number; revenue: number; refunds: number; refundCount: number };
const total = (m: Map<string, Day>, k: keyof Day) => [...m.values()].reduce((a, v) => a + v[k], 0);

async function grouped(sql: string, r: Range, platform?: string) {
  const { t0, t1 } = instants(r);
  return db.many<Row>(sql, [t0, t1, platform ?? null]);
}

export const analyticsService = {
  async business(q: AnalyticsQuery) {
    const r = resolveRange(q.from, q.to);
    const prev = previousRange(r);
    const grain = q.grain ?? defaultGrain(r);
    const [cur, pr] = await Promise.all([businessDaily(r, q.platform), businessDaily(prev, q.platform)]);
    const bk = buckets(r, grain);
    const pbk = buckets(prev, grain);
    const sumB = (m: Map<string, Day>, days: string[], k: keyof Day) => days.reduce((a, d) => a + (m.get(d)?.[k] ?? 0), 0);
    const timeline = bk.map((b, i) => {
      const revenue = sumB(cur, b.days, 'revenue');
      const refunds = sumB(cur, b.days, 'refunds');
      return {
        bucketStart: b.bucketStart,
        label: b.label,
        registrations: sumB(cur, b.days, 'registrations'),
        paid: sumB(cur, b.days, 'paid'),
        renewals: sumB(cur, b.days, 'renewals'),
        revenue,
        refunds,
        net: revenue - refunds,
        prevRevenue: q.compare && pbk[i] ? sumB(pr, (pbk[i] as { days: string[] }).days, 'revenue') : null,
        prevRegistrations: q.compare && pbk[i] ? sumB(pr, (pbk[i] as { days: string[] }).days, 'registrations') : null,
      };
    });
    const spark = (k: 'registrations' | 'paid' | 'renewals' | 'revenue' | 'refunds' | 'net') => timeline.map((t) => t[k]);
    const gross = total(cur, 'revenue');
    const refunds = total(cur, 'refunds');
    const pGross = total(pr, 'revenue');
    const pRefunds = total(pr, 'refunds');
    const regsN = total(cur, 'registrations');
    const pRegs = total(pr, 'registrations');

    // Funnel: students registered in range who paid (in range) / renewed.
    const funnelOf = async (rg: Range) => {
      const { t0, t1 } = instants(rg);
      const f = await db.one<{ regs: number; paid: number; renewals: number }>(
        `SELECT count(*)::int AS regs,
                count(*) FILTER (WHERE EXISTS (SELECT 1 FROM ${T.payments} p WHERE p.user_id = u.id AND p.status IN ('paid', 'partially_refunded', 'refunded') AND p.paid_at >= $1 AND p.paid_at < $2))::int AS paid,
                count(*) FILTER (WHERE (SELECT count(*) FROM ${T.payments} p WHERE p.user_id = u.id AND p.status IN ('paid', 'partially_refunded', 'refunded')) > 1)::int AS renewals
           FROM ${T.users} u LEFT JOIN ${T.student_profiles} sp ON sp.user_id = u.id
          WHERE u.kind = 'student' AND u.deleted_at IS NULL AND u.created_at >= $1 AND u.created_at < $2 AND ($3::text IS NULL OR COALESCE(sp.registered_platform::text, 'web') = $3)`,
        [t0, t1, q.platform ?? null],
      );
      return { registrations: f.regs, paid: f.paid, renewals: f.renewals, conversionPct: pct(f.paid, f.regs) };
    };
    const [funnel, pFunnel] = await Promise.all([funnelOf(r), q.compare ? funnelOf(prev) : Promise.resolve(null)]);

    const PKG_SQL = `SELECT pk.id, pk.name_en, pk.name_ar, pk.sort_order, count(v.id)::int AS n, COALESCE(sum(v.total), 0)::bigint AS revenue
        FROM ${T.packages} pk LEFT JOIN ${T.payments} v ON v.package_id = pk.id AND v.status IN ('paid', 'partially_refunded', 'refunded') AND v.paid_at >= $1 AND v.paid_at < $2 AND ($3::text IS NULL OR v.platform::text = $3)
       WHERE pk.deleted_at IS NULL GROUP BY pk.id ORDER BY pk.sort_order`;
    const [pk, pPk] = await Promise.all([grouped(PKG_SQL, r, q.platform), grouped(PKG_SQL, prev, q.platform)]);
    const packages = pk.map((x, i) => ({ packageId: String(x.id), name: L(x, 'name'), color: colorAt(i), count: Number(x.n), prev: Number(pPk.find((y) => y.id === x.id)?.n ?? 0), revenue: Number(x.revenue) }));

    const SRC_SQL = `SELECT COALESCE(sp.source, 'organic') AS source, count(DISTINCT u.id) FILTER (WHERE u.created_at >= $1 AND u.created_at < $2)::int AS regs,
              count(DISTINCT v.user_id)::int AS paid, COALESCE(sum(v.total), 0)::bigint AS revenue
         FROM ${T.users} u LEFT JOIN ${T.student_profiles} sp ON sp.user_id = u.id
         LEFT JOIN ${T.payments} v ON v.user_id = u.id AND v.status IN ('paid', 'partially_refunded', 'refunded') AND v.paid_at >= $1 AND v.paid_at < $2 AND ($3::text IS NULL OR v.platform::text = $3)
        WHERE u.kind = 'student' AND u.deleted_at IS NULL GROUP BY 1`;
    const [src, pSrc] = await Promise.all([grouped(SRC_SQL, r, q.platform), grouped(SRC_SQL, prev, q.platform)]);
    const sources = Object.keys(SOURCE_LABELS).map((s, i) => {
      const x = src.find((y) => y.source === s);
      const regs = Number(x?.regs ?? 0);
      const paid = Number(x?.paid ?? 0);
      return { source: s, label: SOURCE_LABELS[s] as { en: string; ar: string }, color: colorAt(i), regs, prev: Number(pSrc.find((y) => y.source === s)?.regs ?? 0), paid, conv: pct(paid, regs), revenue: Number(x?.revenue ?? 0) };
    });

    const PARTNER_SQL = (col: 'school_id' | 'marketer_id') =>
      `SELECT v.${col} AS id, count(DISTINCT v.user_id)::int AS paid, COALESCE(sum(v.total), 0)::bigint AS revenue
         FROM ${T.payments} v WHERE v.${col} IS NOT NULL AND v.status IN ('paid', 'partially_refunded') AND v.paid_at >= $1 AND v.paid_at < $2 AND ($3::text IS NULL OR v.platform::text = $3) GROUP BY 1`;
    const [sch, pSch, mk, pMk, allSchools, marketers] = await Promise.all([
      grouped(PARTNER_SQL('school_id'), r, q.platform),
      grouped(PARTNER_SQL('school_id'), prev, q.platform),
      grouped(PARTNER_SQL('marketer_id'), r, q.platform),
      grouped(PARTNER_SQL('marketer_id'), prev, q.platform),
      schoolsService.all(),
      db.many<Row>(
        `SELECT m.id, m.name_en, m.name_ar, (SELECT count(*)::int FROM ${T.marketer_schools} ms WHERE ms.marketer_id = m.id AND ms.unassigned_at IS NULL) AS schools
           FROM ${T.marketers} m WHERE m.deleted_at IS NULL ORDER BY m.name_en`,
      ),
    ]);
    const schools = allSchools
      .map((s) => ({ id: s.id, name: s.name, tier: s.tier, paid: Number(sch.find((x) => x.id === s.id)?.paid ?? 0), prev: Number(pSch.find((x) => x.id === s.id)?.paid ?? 0), revenue: Number(sch.find((x) => x.id === s.id)?.revenue ?? 0) }))
      .sort((a, b) => b.revenue - a.revenue);
    const mks = marketers.map((m, i) => ({ id: String(m.id), name: L(m, 'name'), color: colorAt(i), schools: Number(m.schools), paid: Number(mk.find((x) => x.id === m.id)?.paid ?? 0), prev: Number(pMk.find((x) => x.id === m.id)?.paid ?? 0), revenue: Number(mk.find((x) => x.id === m.id)?.revenue ?? 0) }));

    const platforms: { platform: 'web' | 'ios' | 'android'; registrations: number; paid: number; revenue: number }[] = [];
    for (const p of ['web', 'ios', 'android'] as const) {
      const d = await businessDaily(r, p);
      platforms.push({ platform: p, registrations: total(d, 'registrations'), paid: total(d, 'paid'), revenue: total(d, 'revenue') });
    }

    return {
      kpis: {
        registrations: kpi(regsN, pRegs, spark('registrations')),
        paidSubscriptions: kpi(total(cur, 'paid'), total(pr, 'paid'), spark('paid')),
        renewals: kpi(total(cur, 'renewals'), total(pr, 'renewals'), spark('renewals')),
        grossRevenue: kpi(gross, pGross, spark('revenue')),
        refunds: { ...kpi(refunds, pRefunds, spark('refunds')), count: total(cur, 'refundCount') },
        netRevenue: kpi(gross - refunds, pGross - pRefunds, spark('net')),
      },
      timeline,
      funnel: { ...funnel, prev: pFunnel },
      packages,
      sources,
      schools,
      marketers: mks,
      platforms,
    };
  },

  /** Per-topic accuracy from quiz + practice + exam answers in range. */
  async topics(q: { from?: string; to?: string; subjectId?: string; sort?: string; limit?: number }) {
    const r = resolveRange(q.from, q.to);
    const { t0, t1 } = instants(r);
    const rows = await db.many<Row>(
      `WITH ans AS (
         SELECT qa.question_id, qa.is_correct, qa.time_sec FROM ${T.quiz_attempt_answers} qa WHERE qa.answered_at >= $1 AND qa.answered_at < $2
         UNION ALL SELECT pa.question_id, pa.is_correct, pa.time_sec FROM ${T.practice_answers} pa WHERE pa.answered_at >= $1 AND pa.answered_at < $2
         UNION ALL SELECT ea.question_id, ea.is_correct, ea.time_sec FROM ${T.exam_attempt_answers} ea WHERE ea.is_correct IS NOT NULL AND ea.updated_at >= $1 AND ea.updated_at < $2
       )
       SELECT t.id AS topic_id, t.title_en AS topic_en, t.title_ar AS topic_ar, un.title_en AS unit_en, un.title_ar AS unit_ar,
              s.id AS s_id, s.slug AS s_slug, s.name_en AS s_name_en, s.name_ar AS s_name_ar, s.color AS s_color,
              count(*)::int AS attempts, round(avg(CASE WHEN ans.is_correct THEN 100 ELSE 0 END)::numeric, 1) AS accuracy, round(avg(ans.time_sec)::numeric, 1) AS avg_time,
              (SELECT round(avg(mr.repeat_count)::numeric, 2) FROM ${T.mistake_records} mr WHERE mr.topic_id = t.id) AS recurrence
         FROM ans JOIN ${T.questions} qn ON qn.id = ans.question_id
         JOIN ${T.topics} t ON t.id = qn.topic_id
         JOIN ${T.units} un ON un.id = t.unit_id
         JOIN ${T.subjects} s ON s.id = un.subject_id
        WHERE ($3::uuid IS NULL OR s.id = $3::uuid)
        GROUP BY t.id, un.id, s.id`,
      [t0, t1, q.subjectId ?? null],
    );
    const list = rows.map((x) => ({
      topicId: String(x.topic_id),
      topic: L(x, 'topic'),
      unit: L(x, 'unit'),
      subject: { id: String(x.s_id), slug: String(x.s_slug), name: L(x, 's_name'), color: String(x.s_color) },
      accuracy: Number(x.accuracy),
      attempts: Number(x.attempts),
      mistakeRecurrence: Number(x.recurrence ?? 0),
      avgTimeSec: Number(x.avg_time ?? 0),
    }));
    const sortKey = (q.sort ?? 'accuracy').replace(/^-/, '');
    const desc = (q.sort ?? '').startsWith('-');
    const key = ['accuracy', 'attempts', 'mistakeRecurrence', 'avgTimeSec'].includes(sortKey) ? (sortKey as 'accuracy') : 'accuracy';
    list.sort((a, b) => (a[key] - b[key]) * (desc ? -1 : 1));
    return q.limit ? list.slice(0, q.limit) : list;
  },

  async learning(q: AnalyticsQuery) {
    const r = resolveRange(q.from, q.to);
    const prev = previousRange(r);
    const grain = q.grain ?? defaultGrain(r);
    const pf = q.platform ?? 'all';
    const [m, pm, win, pwin] = await Promise.all([loadDailyMetrics(r), loadDailyMetrics(prev), activeWindows(r, q.platform), activeWindows(prev, q.platform)]);
    const bk = buckets(r, grain);
    const pbk = buckets(prev, grain);
    const avgDau = (w: Map<string, { dau: number }>, days: string[]) => (days.length ? Math.round(days.reduce((a, d) => a + (w.get(d)?.dau ?? 0), 0) / days.length) : 0);
    const timeline = bk.map((b, i) => {
      const end = b.days[b.days.length - 1] as string;
      const watched = m.sum(b.days, 'videos_watched');
      const qa = m.sum(b.days, 'quiz_attempts', pf);
      return {
        bucketStart: b.bucketStart,
        label: b.label,
        dau: avgDau(win, b.days),
        wau: win.get(end)?.wau ?? 0,
        mau: win.get(end)?.mau ?? 0,
        watchHours: round1(m.sum(b.days, 'watch_minutes', pf) / 60),
        videoCompletion: pct(m.sum(b.days, 'lessons_completed'), watched),
        quizCompletion: pct(m.sum(b.days, 'quiz_completed'), m.sum(b.days, 'quiz_attempts')),
        quizAttempts: qa,
        examAttempts: m.sum(b.days, 'exam_attempts', pf),
        aiQuestions: m.sum(b.days, 'ai_questions', pf),
        prevDau: q.compare && pbk[i] ? avgDau(pwin, (pbk[i] as { days: string[] }).days) : null,
      };
    });
    const days = daysOf(r);
    const pdays = daysOf(prev);
    const spark = (k: keyof (typeof timeline)[number]) => timeline.map((t) => Number(t[k] ?? 0));
    const endW = win.get(r.to) ?? { wau: 0, mau: 0 };
    const pEndW = pwin.get(prev.to) ?? { wau: 0, mau: 0 };

    const { t0, t1 } = instants(r);
    // `subjectId` narrows every subject-scoped chart (scores, accuracy bands, exam scores, mistakes, topics).
    // KPIs / timeline / platform rows come from the daily rollups, which have no subject dimension.
    const sid = q.subjectId ?? null;
    const [scores, accuracy, examBest, recurrence, topics] = await Promise.all([
      db.many<Row>(
        `SELECT s.id, s.name_en, s.name_ar, s.color, round(avg(qa.score)::numeric, 1) AS score
           FROM ${T.quiz_attempts} qa JOIN ${T.lessons} l ON l.id = qa.lesson_id JOIN ${T.subjects} s ON s.id = l.subject_id
          WHERE qa.status IN ('passed', 'failed') AND qa.submitted_at >= $1 AND qa.submitted_at < $2 AND ($3::text IS NULL OR qa.platform::text = $3)
            AND ($4::uuid IS NULL OR s.id = $4)
          GROUP BY s.id ORDER BY s.sort_order`,
        [t0, t1, q.platform ?? null, sid],
      ),
      db.many<{ acc: number }>(
        `WITH ans AS (
           SELECT qa.question_id, qa.is_correct FROM ${T.quiz_attempt_answers} qa WHERE qa.answered_at >= $1 AND qa.answered_at < $2
           UNION ALL SELECT pa.question_id, pa.is_correct FROM ${T.practice_answers} pa WHERE pa.answered_at >= $1 AND pa.answered_at < $2
           UNION ALL SELECT ea.question_id, ea.is_correct FROM ${T.exam_attempt_answers} ea WHERE ea.is_correct IS NOT NULL AND ea.updated_at >= $1 AND ea.updated_at < $2
         ) SELECT avg(CASE WHEN ans.is_correct THEN 100 ELSE 0 END)::float AS acc FROM ans
             WHERE $3::uuid IS NULL OR EXISTS (SELECT 1 FROM ${T.questions} qq WHERE qq.id = ans.question_id AND qq.subject_id = $3)
            GROUP BY ans.question_id`,
        [t0, t1, sid],
      ),
      db.many<{ best: number }>(
        `SELECT max(e.score)::float AS best FROM ${T.exam_attempts} e
          WHERE e.status IN ('submitted', 'auto_submitted') AND e.submitted_at >= $1 AND e.submitted_at < $2 AND ($3::text IS NULL OR e.platform::text = $3)
            AND ($4::uuid IS NULL OR EXISTS (SELECT 1 FROM ${T.exam_blueprints} b WHERE b.id = e.blueprint_id AND b.subject_id = $4))
          GROUP BY e.user_id`,
        [t0, t1, q.platform ?? null, sid],
      ),
      db.many<Row>(
        `SELECT t.id, t.title_en AS name_en, t.title_ar AS name_ar, sum(mr.repeat_count)::int AS recurrence
           FROM ${T.mistake_records} mr JOIN ${T.topics} t ON t.id = mr.topic_id
          WHERE mr.last_wrong_at >= $1 AND mr.last_wrong_at < $2 AND ($3::uuid IS NULL OR mr.subject_id = $3)
          GROUP BY t.id ORDER BY recurrence DESC LIMIT 8`,
        [t0, t1, sid],
      ),
      this.topics({ from: q.from, to: q.to, subjectId: q.subjectId }),
    ]);
    const ACC = [
      { label: '0–40', min: 0, max: 40, color: '#DC2626' },
      { label: '40–60', min: 40, max: 60, color: '#F59E0B' },
      { label: '60–75', min: 60, max: 75, color: '#EAB308' },
      { label: '75–90', min: 75, max: 90, color: '#65A30D' },
      { label: '90–100', min: 90, max: 101, color: '#16A34A' },
    ];
    const EX = [
      { label: '<50', min: 0, max: 50 },
      { label: '50–69', min: 50, max: 70 },
      { label: '70–79', min: 70, max: 80 },
      { label: '80–89', min: 80, max: 90 },
      { label: '90+', min: 90, max: 101 },
    ];
    const platformRows = (['web', 'ios', 'android'] as const).map((p) => ({
      platform: p,
      dau: days.length ? Math.round(m.sum(days, 'dau', p) / days.length) : 0,
      watchHours: round1(m.sum(days, 'watch_minutes', p) / 60),
      quizAttempts: m.sum(days, 'quiz_attempts', p),
    }));
    return {
      kpis: {
        dau: { ...kpi(avgDau(win, days), avgDau(pwin, pdays), spark('dau')), wau: endW.wau, mau: endW.mau, prevWau: pEndW.wau, prevMau: pEndW.mau },
        watchHours: kpi(round1(m.sum(days, 'watch_minutes', pf) / 60), round1(pm.sum(pdays, 'watch_minutes', pf) / 60), spark('watchHours')),
        videoCompletion: kpi(pct(m.sum(days, 'lessons_completed'), m.sum(days, 'videos_watched')), pct(pm.sum(pdays, 'lessons_completed'), pm.sum(pdays, 'videos_watched')), spark('videoCompletion')),
        quizCompletion: kpi(pct(m.sum(days, 'quiz_completed'), m.sum(days, 'quiz_attempts')), pct(pm.sum(pdays, 'quiz_completed'), pm.sum(pdays, 'quiz_attempts')), spark('quizCompletion')),
        examAttempts: kpi(m.sum(days, 'exam_attempts', pf), pm.sum(pdays, 'exam_attempts', pf), spark('examAttempts')),
        aiQuestions: kpi(m.sum(days, 'ai_questions', pf), pm.sum(pdays, 'ai_questions', pf), spark('aiQuestions')),
      },
      timeline,
      scoreBySubject: scores.map((s) => ({ subjectId: String(s.id), name: L(s, 'name'), score: Number(s.score), color: String(s.color) })),
      weakTopics: topics.slice(0, 50),
      questionAccuracy: ACC.map((b) => ({ label: b.label, questions: accuracy.filter((a) => a.acc >= b.min && a.acc < b.max).length, color: b.color })),
      examScores: EX.map((b) => ({ label: b.label, students: examBest.filter((e) => Number(e.best) >= b.min && Number(e.best) < b.max).length })),
      mistakeRecurrence: recurrence.map((x) => ({ topicId: String(x.id), name: L(x, 'name'), recurrence: Number(x.recurrence) })),
      platforms: platformRows,
    };
  },

  async daily(q: { from?: string; to?: string; fields?: string[]; platform?: 'web' | 'ios' | 'android' }) {
    const r = resolveRange(q.from, q.to);
    const pf = q.platform ?? 'all';
    const [m, win] = await Promise.all([loadDailyMetrics(r), activeWindows(r, q.platform)]);
    const want = new Set(q.fields?.length ? q.fields : ['dau', 'wau', 'mau', 'watchMinutes', 'videoCompletionRate', 'quizAttempts', 'quizCompletionRate', 'examAttempts', 'aiQuestions', 'aiActiveUsers', 'aiTokens', 'aiCostUsd', 'errorRate', 'registrations', 'revenue']);
    const slugs = m.dimValues('ai_questions', 'subject');
    return daysOf(r).map((d) => {
      const all: Record<string, number> = {
        dau: win.get(d)?.dau ?? 0,
        wau: win.get(d)?.wau ?? 0,
        mau: win.get(d)?.mau ?? 0,
        watchMinutes: m.get(d, 'watch_minutes', pf),
        videoCompletionRate: pct(m.get(d, 'lessons_completed'), m.get(d, 'videos_watched')),
        quizAttempts: m.get(d, 'quiz_attempts', pf),
        quizCompletionRate: pct(m.get(d, 'quiz_completed'), m.get(d, 'quiz_attempts')),
        examAttempts: m.get(d, 'exam_attempts', pf),
        aiQuestions: m.get(d, 'ai_questions', pf),
        aiActiveUsers: m.get(d, 'ai_active_users'),
        aiTokens: m.get(d, 'ai_tokens'),
        aiCostUsd: m.get(d, 'ai_cost_usd'),
        errorRate: 0,
        registrations: m.get(d, 'registrations', pf),
        revenue: m.get(d, 'revenue', pf),
      };
      const row: Record<string, unknown> = { date: d };
      for (const [k, v] of Object.entries(all)) if (want.has(k)) row[k] = v;
      if (want.has('aiBySubject')) row.aiBySubject = Object.fromEntries(slugs.map((s) => [s, m.get(d, 'ai_questions', 'all', 'subject', s)]));
      return row;
    });
  },

  async platformSplit(q: { from?: string; to?: string }) {
    const r = resolveRange(q.from, q.to);
    const m = await loadDailyMetrics(r);
    const days = daysOf(r);
    const active = await db.many<{ pf: string; n: number }>(
      `SELECT x.pf, count(DISTINCT a.user_id)::int AS n FROM ${T.daily_activity} a, unnest(a.platforms) AS x(pf) WHERE a.activity_date BETWEEN $1::date AND $2::date GROUP BY 1`,
      [r.from, r.to],
    );
    return (['web', 'ios', 'android'] as const).map((p) => ({
      platform: p,
      activeUsers: active.find((a) => a.pf === p)?.n ?? 0,
      sessions: m.sum(days, 'sessions', p),
      registrations: m.sum(days, 'registrations', p),
      payments: m.sum(days, 'payments', p),
      revenue: m.sum(days, 'revenue', p),
      watchMinutes: round1(m.sum(days, 'watch_minutes', p)),
      aiQuestions: m.sum(days, 'ai_questions', p),
    }));
  },
};
