/**
 * Daily metrics source: eduway_platform_analytics_daily_rollups (written by the daily job via
 * eduway_platform_fn_rollup_daily) + LIVE eduway_platform_fn_daily_metrics for today and any day without rollups.
 */
import { obj, T } from '../../config/constants.js';
import { db } from '../../config/db.js';
import { logger } from '../../config/logger.js';
import { BUSINESS_TZ, dayjs } from '../../common/utils/dates.js';

export type Grain = 'day' | 'week' | 'month';
export interface Range {
  from: string; // YYYY-MM-DD inclusive (business tz)
  to: string; // YYYY-MM-DD inclusive
}

export class DailyMetrics {
  private readonly map = new Map<string, number>();
  constructor(readonly range: Range) {}
  set(day: string, metric: string, platform: string, dim: string, dv: string, value: number) {
    this.map.set(`${day}|${metric}|${platform}|${dim}|${dv}`, value);
  }
  get(day: string, metric: string, platform = 'all', dim = '', dv = ''): number {
    return this.map.get(`${day}|${metric}|${platform}|${dim}|${dv}`) ?? 0;
  }
  /** Σ metric over days. */
  sum(days: string[], metric: string, platform = 'all'): number {
    return days.reduce((a, d) => a + this.get(d, metric, platform), 0);
  }
  /** Values of a dimension (e.g. subject slugs for ai_questions). */
  dimValues(metric: string, dim: string): string[] {
    const out = new Set<string>();
    for (const k of this.map.keys()) {
      const [, m, , d, v] = k.split('|');
      if (m === metric && d === dim && v) out.add(v);
    }
    return [...out].sort();
  }
}

export function daysOf(r: Range): string[] {
  const out: string[] = [];
  for (let d = dayjs(r.from); !d.isAfter(dayjs(r.to)); d = d.add(1, 'day')) out.push(d.format('YYYY-MM-DD'));
  return out;
}

/** Resolve query `from`/`to` (ISO instants) to business-day range; default last 30 days. */
export function resolveRange(from?: string, to?: string): Range {
  // Date-only inputs are business days already — parsing them in the host timezone would shift them on non-UTC hosts.
  const at = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? dayjs.tz(v, BUSINESS_TZ) : dayjs(v).tz(BUSINESS_TZ));
  const t = to ? at(to) : dayjs().tz(BUSINESS_TZ);
  const f = from ? at(from) : t.subtract(29, 'day');
  return { from: f.format('YYYY-MM-DD'), to: t.format('YYYY-MM-DD') };
}

export function previousRange(r: Range): Range {
  const n = daysOf(r).length;
  const to = dayjs(r.from).subtract(1, 'day');
  return { from: to.subtract(n - 1, 'day').format('YYYY-MM-DD'), to: to.format('YYYY-MM-DD') };
}

export function defaultGrain(r: Range): Grain {
  const n = daysOf(r).length;
  return n <= 31 ? 'day' : n <= 120 ? 'week' : 'month';
}

export interface Bucket {
  bucketStart: string;
  label: string;
  days: string[];
}

export function buckets(r: Range, grain: Grain): Bucket[] {
  const all = daysOf(r);
  if (grain === 'day') return all.map((d) => ({ bucketStart: d, label: dayjs(d).format('D MMM'), days: [d] }));
  if (grain === 'week') {
    const out: Bucket[] = [];
    for (let i = 0; i < all.length; i += 7) out.push({ bucketStart: all[i] as string, label: dayjs(all[i]).format('D MMM'), days: all.slice(i, i + 7) });
    return out;
  }
  const byMonth = new Map<string, string[]>();
  for (const d of all) byMonth.set(d.slice(0, 7), [...(byMonth.get(d.slice(0, 7)) ?? []), d]);
  return [...byMonth.entries()].map(([m, days]) => ({ bucketStart: `${m}-01`, label: dayjs(`${m}-01`).format('MMM YY'), days }));
}

export async function loadDailyMetrics(r: Range): Promise<DailyMetrics> {
  const out = new DailyMetrics(r);
  const today = dayjs().tz(BUSINESS_TZ).format('YYYY-MM-DD');
  const rolled = await db.many<{ day: string; metric: string; dimension: string; dimension_value: string; platform: string; value: number }>(
    `SELECT day::text AS day, metric, dimension, dimension_value, platform, value FROM ${T.analytics_daily_rollups} WHERE day BETWEEN $1::date AND $2::date AND day < $3::date`,
    [r.from, r.to, today],
  );
  const have = new Set(rolled.map((x) => x.day));
  for (const x of rolled) out.set(x.day, x.metric, x.platform, x.dimension, x.dimension_value, Number(x.value));
  const missing = daysOf(r).filter((d) => !have.has(d));
  if (missing.length) {
    const live = await db.many<{ o_day: string; o_metric: string; o_dimension: string; o_dimension_value: string; o_platform: string; o_value: number }>(
      `SELECT o_day::text AS o_day, o_metric, o_dimension, o_dimension_value, o_platform, o_value FROM ${obj('fn_daily_metrics')}($1::date, $2::date, $3)`,
      [missing[0], r.to, BUSINESS_TZ],
    );
    const need = new Set(missing);
    for (const x of live) if (need.has(x.o_day)) out.set(x.o_day, x.o_metric, x.o_platform, x.o_dimension, x.o_dimension_value, Number(x.o_value));
  }
  return out;
}

/** Distinct active users over trailing windows ending at each day (WAU = 7 d, MAU = 30 d). */
export async function activeWindows(r: Range, platform?: string): Promise<Map<string, { dau: number; wau: number; mau: number }>> {
  const rows = await db.many<{ d: string; dau: number; wau: number; mau: number }>(
    `SELECT g.d::date::text AS d,
            (SELECT count(DISTINCT a.user_id)::int FROM ${T.daily_activity} a WHERE a.activity_date = g.d::date AND ($3::text IS NULL OR $3 = ANY(a.platforms))) AS dau,
            (SELECT count(DISTINCT a.user_id)::int FROM ${T.daily_activity} a WHERE a.activity_date BETWEEN g.d::date - 6 AND g.d::date AND ($3::text IS NULL OR $3 = ANY(a.platforms))) AS wau,
            (SELECT count(DISTINCT a.user_id)::int FROM ${T.daily_activity} a WHERE a.activity_date BETWEEN g.d::date - 29 AND g.d::date AND ($3::text IS NULL OR $3 = ANY(a.platforms))) AS mau
       FROM generate_series($1::date, $2::date, interval '1 day') AS g(d)`,
    [r.from, r.to, platform ?? null],
  );
  return new Map(rows.map((x) => [x.d, { dau: x.dau, wau: x.wau, mau: x.mau }]));
}

/** Job entry point (analytics-daily-rollup): persist yesterday (or `day`) into the rollup table. */
export async function rollupDailyAnalytics(day?: string): Promise<{ day: string; rows: number }> {
  const d = day ?? dayjs().tz(BUSINESS_TZ).subtract(1, 'day').format('YYYY-MM-DD');
  const rows = (await db.scalar<number>(`SELECT ${obj('fn_rollup_daily')}($1::date, $2)`, [d, BUSINESS_TZ])) ?? 0;
  logger.info({ day: d, rows }, 'analytics daily rollup');
  return { day: d, rows };
}

export const kpi = (value: number, prev: number | null, spark: number[]) => ({
  value,
  prev,
  deltaPct: prev === null ? null : prev === 0 ? (value === 0 ? 0 : 100) : Math.round(((value - prev) / prev) * 1000) / 10,
  spark,
});
