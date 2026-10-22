/**
 * Incentive calculator + tier validator + settlement periods (pure, unit-tested).
 * All thresholds / tiers / amounts come from eduway_platform_incentive_rules(+_tiers) — never constants.
 */
import { BUSINESS_TZ, dayjs } from '../../common/utils/dates.js';

export interface TierInput {
  from: number;
  to: number | null;
  rewardType: 'per_student' | 'fixed';
  amount: number;
  label: string;
}
export interface Tier extends TierInput {
  id: string;
}

export interface IncentiveResult<T extends TierInput = Tier> {
  qualified: boolean;
  tier: T | null;
  amount: number;
  nextTier: T | null;
  studentsToNext: number | null;
  breakdown: 'not_qualified' | 'no_tier' | 'per_student' | 'fixed';
}

const sortTiers = <T extends TierInput>(tiers: readonly T[]) => [...tiers].sort((a, b) => a.from - b.from);

/** calcIncentive(rule, paidStudents). `per_student` pays amount × students; `fixed` pays the tier amount. */
export function calcIncentive<T extends TierInput>(rule: { qualificationThreshold: number; tiers: readonly T[] }, students: number): IncentiveResult<T> {
  const n = Math.max(0, Math.floor(students));
  const tiers = sortTiers(rule.tiers);
  if (n < rule.qualificationThreshold) {
    const first = tiers[0] ?? null;
    const target = Math.max(rule.qualificationThreshold, first?.from ?? 0);
    return { qualified: false, tier: null, amount: 0, nextTier: first, studentsToNext: first ? Math.max(0, target - n) : null, breakdown: 'not_qualified' };
  }
  const idx = tiers.findIndex((t) => n >= t.from && (t.to === null || n <= t.to));
  if (idx < 0) {
    const next = tiers.find((t) => t.from > n) ?? null;
    return { qualified: true, tier: null, amount: 0, nextTier: next, studentsToNext: next ? next.from - n : null, breakdown: 'no_tier' };
  }
  const tier = tiers[idx] as T;
  const next = tiers[idx + 1] ?? null;
  const amount = tier.rewardType === 'per_student' ? tier.amount * n : tier.amount;
  return { qualified: true, tier, amount, nextTier: next, studentsToNext: next ? Math.max(0, next.from - n) : null, breakdown: tier.rewardType };
}

/**
 * Activation validator (ADM-INC-06): ≥1 tier; tiers[0].from = threshold; to ≥ from; only the last tier open-ended;
 * contiguous (next.from = prev.to + 1); amount > 0. Returns human-readable issues (empty = valid).
 */
export function validateTiers(threshold: number, tiersIn: readonly TierInput[]): string[] {
  const issues: string[] = [];
  const tiers = sortTiers(tiersIn);
  if (!tiers.length) return ['At least one tier is required'];
  if (tiers[0]?.from !== threshold) issues.push(`The first tier must start at the qualification threshold (${threshold})`);
  tiers.forEach((t, i) => {
    const n = i + 1;
    if (!Number.isInteger(t.from) || t.from < 0) issues.push(`Tier ${n}: "from" must be a non-negative integer`);
    if (t.to !== null && t.to < t.from) issues.push(`Tier ${n}: "to" must be ≥ "from"`);
    if (t.to === null && i < tiers.length - 1) issues.push(`Tier ${n}: only the last tier may be open-ended`);
    if (!(t.amount > 0)) issues.push(`Tier ${n}: amount must be greater than 0`);
    const next = tiers[i + 1];
    if (next && t.to !== null && next.from !== t.to + 1) issues.push(`Tier ${n + 1}: must start at ${t.to + 1} (tiers must be contiguous)`);
  });
  return issues;
}

// ── periods ─────────────────────────────────────────────────────────────────────────────────────────

export type PeriodType = 'monthly' | 'quarterly' | 'semester' | 'yearly';
export interface PeriodRange {
  key: string;
  type: PeriodType;
  from: Date;
  /** exclusive */
  to: Date;
}

/** Period containing `at` (business timezone). Keys: 2026-10 | 2026-Q4 | 2026-S2 | 2026. */
export function periodFor(type: PeriodType, at: Date = new Date()): PeriodRange {
  const d = dayjs(at).tz(BUSINESS_TZ);
  const y = d.year();
  const m = d.month(); // 0-based
  if (type === 'monthly') return parsePeriodKey(`${y}-${String(m + 1).padStart(2, '0')}`) as PeriodRange;
  if (type === 'quarterly') return parsePeriodKey(`${y}-Q${Math.floor(m / 3) + 1}`) as PeriodRange;
  if (type === 'semester') return parsePeriodKey(`${y}-S${m < 6 ? 1 : 2}`) as PeriodRange;
  return parsePeriodKey(String(y)) as PeriodRange;
}

/** Parse a period key; null when invalid. Legacy `YYYY-Y` accepted as yearly. */
export function parsePeriodKey(key: string): PeriodRange | null {
  const start = (y: number, m0: number) => dayjs.tz(`${y}-${String(m0 + 1).padStart(2, '0')}-01`, BUSINESS_TZ);
  let mm: RegExpExecArray | null;
  if ((mm = /^(\d{4})-(\d{2})$/.exec(key))) {
    const y = Number(mm[1]);
    const m = Number(mm[2]) - 1;
    if (m < 0 || m > 11) return null;
    const s = start(y, m);
    return { key, type: 'monthly', from: s.toDate(), to: s.add(1, 'month').toDate() };
  }
  if ((mm = /^(\d{4})-Q([1-4])$/.exec(key))) {
    const s = start(Number(mm[1]), (Number(mm[2]) - 1) * 3);
    return { key, type: 'quarterly', from: s.toDate(), to: s.add(3, 'month').toDate() };
  }
  if ((mm = /^(\d{4})-S([12])$/.exec(key))) {
    const s = start(Number(mm[1]), mm[2] === '1' ? 0 : 6);
    return { key, type: 'semester', from: s.toDate(), to: s.add(6, 'month').toDate() };
  }
  if ((mm = /^(\d{4})(?:-Y)?$/.exec(key))) {
    const s = start(Number(mm[1]), 0);
    return { key: mm[1] as string, type: 'yearly', from: s.toDate(), to: s.add(12, 'month').toDate() };
  }
  return null;
}

/** Previous period of the same type (used by the settlement job at period end). */
export function previousPeriod(type: PeriodType, at: Date = new Date()): PeriodRange {
  const cur = periodFor(type, at);
  return periodFor(type, new Date(cur.from.getTime() - 1000));
}

/** progressPct toward the next tier (or threshold) for progress cards. */
export function progressPct(students: number, r: IncentiveResult<TierInput>, threshold: number): number {
  if (!r.qualified) return threshold > 0 ? Math.min(100, Math.round((students / threshold) * 1000) / 10) : 0;
  if (!r.nextTier) return 100;
  const base = r.tier?.from ?? threshold;
  const span = r.nextTier.from - base;
  return span > 0 ? Math.min(100, Math.round(((students - base) / span) * 1000) / 10) : 100;
}
