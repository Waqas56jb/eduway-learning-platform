import { describe, expect, it } from 'vitest';
import { calcIncentive, parsePeriodKey, periodFor, previousPeriod, progressPct, validateTiers, type Tier } from '../../src/modules/incentives/calculator.js';

const tiers: Tier[] = [
  { id: 't1', from: 10, to: 24, rewardType: 'per_student', amount: 2_000, label: 'Bronze' },
  { id: 't2', from: 25, to: 49, rewardType: 'per_student', amount: 3_000, label: 'Silver' },
  { id: 't3', from: 50, to: null, rewardType: 'fixed', amount: 250_000, label: 'Gold' },
];
const rule = { qualificationThreshold: 10, tiers };

describe('calcIncentive', () => {
  it('is not qualified below the threshold and points to the first tier', () => {
    const r = calcIncentive(rule, 7);
    expect(r).toMatchObject({ qualified: false, tier: null, amount: 0, breakdown: 'not_qualified', studentsToNext: 3 });
    expect(r.nextTier?.label).toBe('Bronze');
  });
  it('pays per student inside a per_student tier (all qualified students)', () => {
    const r = calcIncentive(rule, 10);
    expect(r).toMatchObject({ qualified: true, amount: 20_000, breakdown: 'per_student', studentsToNext: 15 });
    expect(r.tier?.label).toBe('Bronze');
    expect(calcIncentive(rule, 30).amount).toBe(90_000);
  });
  it('pays the fixed amount in a fixed tier and has no next tier when open-ended', () => {
    const r = calcIncentive(rule, 80);
    expect(r).toMatchObject({ amount: 250_000, breakdown: 'fixed', nextTier: null, studentsToNext: null });
  });
  it('reports no_tier when qualified but inside a gap', () => {
    const r = calcIncentive({ qualificationThreshold: 0, tiers: [{ id: 'x', from: 5, to: 9, rewardType: 'fixed', amount: 100, label: 'X' }] }, 2);
    expect(r.breakdown).toBe('no_tier');
    expect(r.studentsToNext).toBe(3);
  });
  it('handles unsorted tiers and negative / fractional input', () => {
    expect(calcIncentive({ qualificationThreshold: 10, tiers: [...tiers].reverse() }, 26).tier?.label).toBe('Silver');
    expect(calcIncentive(rule, -5).qualified).toBe(false);
    expect(calcIncentive(rule, 10.9).amount).toBe(20_000);
  });
  it('progressPct toward next tier', () => {
    expect(progressPct(5, calcIncentive(rule, 5), 10)).toBe(50);
    expect(progressPct(80, calcIncentive(rule, 80), 10)).toBe(100);
  });
});

describe('validateTiers', () => {
  const ok = tiers.map(({ id: _id, ...t }) => t);
  it('accepts contiguous tiers starting at the threshold', () => expect(validateTiers(10, ok)).toEqual([]));
  it('rejects empty, wrong start, gaps, open-ended in the middle and zero amounts', () => {
    expect(validateTiers(10, [])).toHaveLength(1);
    expect(validateTiers(5, ok).join()).toMatch(/threshold/);
    expect(validateTiers(10, [ok[0]!, { ...ok[1]!, from: 30 }, ok[2]!]).join()).toMatch(/contiguous/);
    expect(validateTiers(10, [{ ...ok[0]!, to: null }, ok[1]!]).join()).toMatch(/open-ended/);
    expect(validateTiers(10, [{ ...ok[0]!, amount: 0 }]).join()).toMatch(/amount/);
    expect(validateTiers(10, [{ ...ok[0]!, to: 5 }]).join()).toMatch(/≥/);
  });
});

describe('periods', () => {
  it('parses every key type', () => {
    expect(parsePeriodKey('2026-10')?.type).toBe('monthly');
    expect(parsePeriodKey('2026-Q4')?.type).toBe('quarterly');
    expect(parsePeriodKey('2026-S1')?.type).toBe('semester');
    expect(parsePeriodKey('2026')?.type).toBe('yearly');
    expect(parsePeriodKey('2026-Y')?.key).toBe('2026');
    expect(parsePeriodKey('2026-13')).toBeNull();
    expect(parsePeriodKey('nope')).toBeNull();
  });
  it('uses the Baghdad timezone for boundaries', () => {
    const p = parsePeriodKey('2026-10')!;
    expect(p.from.toISOString()).toBe('2026-09-30T21:00:00.000Z');
    expect(p.to.toISOString()).toBe('2026-10-31T21:00:00.000Z');
  });
  it('periodFor / previousPeriod', () => {
    const at = new Date('2026-10-22T06:30:00Z');
    expect(periodFor('monthly', at).key).toBe('2026-10');
    expect(periodFor('quarterly', at).key).toBe('2026-Q4');
    expect(periodFor('semester', at).key).toBe('2026-S2');
    expect(periodFor('yearly', at).key).toBe('2026');
    expect(previousPeriod('monthly', at).key).toBe('2026-09');
    expect(previousPeriod('quarterly', new Date('2026-01-05T00:00:00Z')).key).toBe('2025-Q4');
  });
});
