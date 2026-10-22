/** AI allowance accounting + reset cycle (Agent D). Pure — no database. */
import { describe, expect, it } from 'vitest';
import { computeAllowance, consume, costUsd, denialFor, isNewPeriod, periodFor } from '../../src/modules/ai-tutor/allowance.js';

const base = { globalEnabled: true, userDisabled: false, quota: 100, used: 27, cycle: 'calendar' as const, anchor: null };

describe('AI allowance accounting', () => {
  it('computes remaining from quota + bonus − used', () => {
    const a = computeAllowance({ ...base, bonus: 10, now: new Date('2026-10-22T10:00:00Z') });
    expect(a).toMatchObject({ enabled: true, disabledReason: null, used: 27, quota: 110, remaining: 83, cycle: 'calendar' });
  });

  it('never returns negative remaining', () => {
    expect(computeAllowance({ ...base, used: 140 }).remaining).toBe(0);
  });

  it('applies the AIT-08 check order: global → user → package → allowance', () => {
    expect(denialFor(computeAllowance({ ...base, globalEnabled: false, userDisabled: true, quota: 0 }))).toBe('AI_GLOBALLY_DISABLED');
    expect(denialFor(computeAllowance({ ...base, userDisabled: true, quota: 0 }))).toBe('AI_DISABLED');
    expect(denialFor(computeAllowance({ ...base, quota: 0, used: 0 }))).toBe('AI_NOT_INCLUDED');
    expect(denialFor(computeAllowance({ ...base, used: 100 }))).toBe('AI_ALLOWANCE_EXHAUSTED');
    expect(denialFor(computeAllowance(base))).toBeNull();
  });

  it('consumes exactly one question per successful answer', () => {
    const a = computeAllowance({ ...base, used: 99 });
    const b = consume(a);
    expect(b.used).toBe(100);
    expect(b.remaining).toBe(0);
    expect(denialFor(b)).toBe('AI_ALLOWANCE_EXHAUSTED');
  });

  it('computes the USD cost from per-1k token prices', () => {
    expect(costUsd(1000, 2000, 0.003, 0.015)).toBe(0.033);
    expect(costUsd(0, 0, 0.003, 0.015)).toBe(0);
  });
});

describe('AI allowance reset cycle', () => {
  it('calendar cycle = Baghdad calendar month (resets on the 1st 00:00 local = 21:00 UTC the day before)', () => {
    const p = periodFor('calendar', null, new Date('2026-10-22T10:00:00Z'));
    expect(p.start.toISOString()).toBe('2026-09-30T21:00:00.000Z');
    expect(p.end.toISOString()).toBe('2026-10-31T21:00:00.000Z');
    // 31 Oct 22:00 UTC is already 1 Nov 01:00 in Baghdad → new period
    expect(periodFor('calendar', null, new Date('2026-10-31T22:00:00Z')).start.toISOString()).toBe('2026-10-31T21:00:00.000Z');
  });

  it('billing cycle steps monthly from the subscription start', () => {
    const anchor = new Date('2026-07-15T08:00:00Z');
    const p = periodFor('billing', anchor, new Date('2026-10-22T10:00:00Z'));
    expect(p.start.toISOString()).toBe('2026-10-15T08:00:00.000Z');
    expect(p.end.toISOString()).toBe('2026-11-15T08:00:00.000Z');
    const before = periodFor('billing', anchor, new Date('2026-10-15T07:59:00Z'));
    expect(before.start.toISOString()).toBe('2026-09-15T08:00:00.000Z');
  });

  it('billing without a subscription falls back to the calendar month', () => {
    expect(periodFor('billing', null, new Date('2026-10-22T10:00:00Z')).start.toISOString()).toBe('2026-09-30T21:00:00.000Z');
  });

  it('detects a new period (usage counter restarts at 0)', () => {
    const anchor = new Date('2026-07-15T08:00:00Z');
    expect(isNewPeriod('calendar', null, new Date('2026-10-30T10:00:00Z'), new Date('2026-11-02T10:00:00Z'))).toBe(true);
    expect(isNewPeriod('calendar', null, new Date('2026-10-02T10:00:00Z'), new Date('2026-10-29T10:00:00Z'))).toBe(false);
    expect(isNewPeriod('billing', anchor, new Date('2026-10-14T10:00:00Z'), new Date('2026-10-16T10:00:00Z'))).toBe(true);
  });

  it('resetsAt equals the end of the current period', () => {
    const a = computeAllowance({ ...base, now: new Date('2026-10-22T10:00:00Z') });
    expect(a.resetsAt).toBe('2026-10-31T21:00:00.000Z');
  });
});
