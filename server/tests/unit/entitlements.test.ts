import { describe, expect, it } from 'vitest';
import { evaluateSubjectAccess, lockedError, summarize, type EntitlementRecord } from '../../src/common/entitlements.js';
import { NotEntitledError, PaymentRequiredError } from '../../src/common/errors/index.js';

const NOW = new Date('2026-10-22T12:00:00Z');
const day = 86_400_000;
const rec = (subjectId: string, startOffsetDays: number, endOffsetDays: number, extra: Partial<EntitlementRecord> = {}): EntitlementRecord => ({
  id: `${subjectId}-${startOffsetDays}-${endOffsetDays}`,
  subjectId,
  source: 'package',
  subscriptionId: 'sub-1',
  startsAt: new Date(NOW.getTime() + startOffsetDays * day),
  endsAt: new Date(NOW.getTime() + endOffsetDays * day),
  revokedAt: null,
  ...extra,
});

describe('entitlement engine — evaluateSubjectAccess', () => {
  it('grants access inside the window', () => {
    const d = evaluateSubjectAccess([rec('math', -7, 23)], 'math', NOW);
    expect(d.allowed).toBe(true);
    expect(d.source).toBe('package');
    expect(d.expiresAt?.toISOString()).toBe(new Date(NOW.getTime() + 23 * day).toISOString());
  });

  it('NO_SUBSCRIPTION when the student never had access', () => {
    expect(evaluateSubjectAccess([], 'math', NOW)).toEqual({ allowed: false, reason: 'NO_SUBSCRIPTION' });
  });

  it('EXPIRED when the only entitlement ended', () => {
    const d = evaluateSubjectAccess([rec('math', -40, -10)], 'math', NOW);
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe('EXPIRED');
    expect(d.expiredAt?.getTime()).toBe(NOW.getTime() - 10 * day);
  });

  it('SUBJECT_NOT_IN_PACKAGE when other subjects are active', () => {
    const d = evaluateSubjectAccess([rec('physics', -1, 29)], 'math', NOW);
    expect(d).toEqual({ allowed: false, reason: 'SUBJECT_NOT_IN_PACKAGE' });
  });

  it('ignores revoked entitlements', () => {
    const d = evaluateSubjectAccess([rec('math', -1, 29, { revokedAt: new Date(NOW.getTime() - day) })], 'math', NOW);
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe('NO_SUBSCRIPTION');
  });

  it('future-dated access is not active yet', () => {
    const d = evaluateSubjectAccess([rec('math', 3, 33)], 'math', NOW);
    expect(d.allowed).toBe(false);
  });

  it('manual grant extends beyond an expired package', () => {
    const d = evaluateSubjectAccess([rec('math', -40, -10), rec('math', -2, 12, { source: 'manual', subscriptionId: null })], 'math', NOW);
    expect(d.allowed).toBe(true);
    expect(d.source).toBe('manual');
  });

  it('picks the latest expiry when several are live', () => {
    const d = evaluateSubjectAccess([rec('math', -5, 10), rec('math', -1, 50, { source: 'manual' })], 'math', NOW);
    expect(d.expiresAt?.getTime()).toBe(NOW.getTime() + 50 * day);
  });

  it('boundary: endsAt == now is expired, startsAt == now is active', () => {
    expect(evaluateSubjectAccess([rec('math', -10, 0)], 'math', NOW).allowed).toBe(false);
    expect(evaluateSubjectAccess([rec('math', 0, 10)], 'math', NOW).allowed).toBe(true);
  });
});

describe('entitlement engine — summarize & errors', () => {
  it('summarizes per subject', () => {
    const s = summarize([rec('math', -7, 23), rec('physics', -40, -10)], NOW);
    expect(s.find((x) => x.subjectId === 'math')?.active).toBe(true);
    expect(s.find((x) => x.subjectId === 'physics')?.active).toBe(false);
  });

  it('maps NO_SUBSCRIPTION/EXPIRED → 402 and SUBJECT_NOT_IN_PACKAGE → 403 with locked payload', () => {
    const e1 = lockedError({ allowed: false, reason: 'EXPIRED' }, { subjectId: 'math', packageIds: ['p1'] });
    expect(e1).toBeInstanceOf(PaymentRequiredError);
    expect(e1.status).toBe(402);
    expect(e1.code).toBe('SUBSCRIPTION_REQUIRED');
    expect(e1.toDetails()).toEqual({ reason: 'EXPIRED', locked: { reason: 'EXPIRED', subjectId: 'math', packageIds: ['p1'] } });
    const e2 = lockedError({ allowed: false, reason: 'SUBJECT_NOT_IN_PACKAGE' }, { subjectId: 'math', subjectSlug: 'math' });
    expect(e2).toBeInstanceOf(NotEntitledError);
    expect(e2.status).toBe(403);
    expect(e2.code).toBe('NOT_ENTITLED');
  });
});
