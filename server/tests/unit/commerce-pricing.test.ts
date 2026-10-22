import { describe, expect, it } from 'vitest';
import { computeQuote, prorationCredit, QuoteUnavailableError, type CurrentSubscription, type QuotePackage } from '../../src/modules/payments/pricing.js';
import { discountFor, evaluatePromotion, promoPhase, type PromoContext, type PromoRecord } from '../../src/modules/promotions/engine.js';

const NOW = new Date('2026-10-22T06:30:00Z');
const day = 86_400_000;
const pkg = (over: Partial<QuotePackage> = {}): QuotePackage => ({
  id: 'p-basic', price: 30_000, yearlyPrice: 300_000, yearlyValidityDays: 365, validityType: 'days', validityValue: 30, validUntil: null,
  accessStart: 'immediate', accessStartDate: null, currency: 'IQD', ...over,
});
const sub = (over: Partial<CurrentSubscription> = {}): CurrentSubscription => ({
  id: 's1', packageId: 'p-basic', packagePrice: 30_000, startsAt: new Date(NOW.getTime() - 10 * day), endsAt: new Date(NOW.getTime() + 20 * day), paidTotal: 30_000, ...over,
});
const promo = (over: Partial<PromoRecord> = {}): PromoRecord => ({
  id: 'pr1', code: 'EDU-10', type: 'promo', discountType: 'percent', discountValue: 10, packageIds: [], eligibility: 'all', usageLimit: 100, perUserLimit: 1, used: 0,
  validFrom: new Date(NOW.getTime() - day), validTo: new Date(NOW.getTime() + day), enabled: true, ownerType: null, ownerId: null, ...over,
});
const ctx = (over: Partial<PromoContext> = {}): PromoContext => ({ now: NOW, packageId: 'p-basic', userRedemptions: 0, hasPaidBefore: false, schoolId: null, ...over });

describe('quote + proration', () => {
  it('new purchase starts now with base validity', () => {
    const q = computeQuote({ pkg: pkg(), cycle: 'monthly', current: null, promo: null, now: NOW });
    expect(q).toMatchObject({ intent: 'new', subtotal: 30_000, discount: 0, prorationCredit: 0, total: 30_000, baseValidityDays: 30, startsAt: NOW.toISOString() });
    expect(new Date(q.endsAt).getTime() - NOW.getTime()).toBe(30 * day);
  });
  it('yearly cycle uses yearlyPrice; unavailable when null', () => {
    expect(computeQuote({ pkg: pkg(), cycle: 'yearly', current: null, promo: null, now: NOW }).subtotal).toBe(300_000);
    expect(() => computeQuote({ pkg: pkg({ yearlyPrice: null }), cycle: 'yearly', current: null, promo: null, now: NOW })).toThrow(QuoteUnavailableError);
  });
  it('renewal starts when the current subscription ends', () => {
    const q = computeQuote({ pkg: pkg(), cycle: 'monthly', current: sub(), promo: null, now: NOW });
    expect(q.intent).toBe('renew');
    expect(q.startsAt).toBe(sub().endsAt.toISOString());
  });
  it('upgrade credits the unused value of the current subscription', () => {
    expect(prorationCredit(sub(), NOW)).toBe(20_000); // 20 of 30 days left of 30 000
    const q = computeQuote({ pkg: pkg({ id: 'p-full', price: 50_000 }), cycle: 'monthly', current: sub(), promo: null, now: NOW });
    expect(q).toMatchObject({ intent: 'upgrade', prorationCredit: 20_000, total: 30_000, startsAt: NOW.toISOString() });
  });
  it('credit is capped so the total never goes negative; manual grants give no credit', () => {
    const q = computeQuote({ pkg: pkg({ id: 'p-full', price: 35_000 }), cycle: 'monthly', current: sub({ paidTotal: 300_000 }), promo: promo({ discountValue: 50 }), now: NOW });
    expect(q.total).toBe(0);
    expect(q.prorationCredit).toBe(35_000 - q.discount);
    expect(prorationCredit(sub({ paidTotal: 0 }), NOW)).toBe(0);
  });
  it('downgrade is scheduled at the end of the current period without credit', () => {
    const q = computeQuote({ pkg: pkg({ id: 'p-lite', price: 15_000 }), cycle: 'monthly', current: sub(), promo: null, now: NOW });
    expect(q).toMatchObject({ intent: 'downgrade', prorationCredit: 0, total: 15_000 });
    expect(q.startsAt).toBe(sub().endsAt.toISOString());
  });
  it('honours a future access start date and until_date validity', () => {
    const start = new Date(NOW.getTime() + 5 * day);
    const q = computeQuote({ pkg: pkg({ accessStart: 'from_date', accessStartDate: start }), cycle: 'monthly', current: null, promo: null, now: NOW });
    expect(q.startsAt).toBe(start.toISOString());
    const until = new Date(NOW.getTime() + 60 * day);
    const u = computeQuote({ pkg: pkg({ validityType: 'until_date', validityValue: 0, validUntil: until }), cycle: 'monthly', current: null, promo: null, now: NOW });
    expect(u.endsAt).toBe(until.toISOString());
  });
  it('applies promo discounts (percent & fixed) on the subtotal', () => {
    const q = computeQuote({ pkg: pkg(), cycle: 'monthly', current: null, promo: promo(), now: NOW });
    expect(q).toMatchObject({ discount: 3_000, total: 27_000, promo: { code: 'EDU-10', discountType: 'percent', discountValue: 10 } });
    expect(discountFor({ discountType: 'fixed', discountValue: 5_000 }, 30_000)).toBe(5_000);
    expect(discountFor({ discountType: 'fixed', discountValue: 50_000 }, 30_000)).toBe(30_000);
  });
});

describe('promo validation', () => {
  it('valid promo passes', () => expect(evaluatePromotion(promo(), ctx())).toBeNull());
  it('unknown / disabled / not-yet-valid → PROMO_INVALID', () => {
    expect(evaluatePromotion(null, ctx())).toBe('PROMO_INVALID');
    expect(evaluatePromotion(promo({ enabled: false }), ctx())).toBe('PROMO_INVALID');
    expect(evaluatePromotion(promo({ validFrom: new Date(NOW.getTime() + day) }), ctx())).toBe('PROMO_INVALID');
    expect(evaluatePromotion(promo({ deleted: true }), ctx())).toBe('PROMO_INVALID');
  });
  it('expired / exhausted', () => {
    expect(evaluatePromotion(promo({ validTo: new Date(NOW.getTime() - 1) }), ctx())).toBe('PROMO_EXPIRED');
    expect(evaluatePromotion(promo({ usageLimit: 10, used: 10 }), ctx())).toBe('PROMO_EXHAUSTED');
    expect(evaluatePromotion(promo({ usageLimit: null, used: 999 }), ctx())).toBeNull();
    expect(evaluatePromotion(promo({ perUserLimit: 1 }), ctx({ userRedemptions: 1 }))).toBe('PROMO_EXHAUSTED');
  });
  it('package applicability', () => {
    expect(evaluatePromotion(promo({ packageIds: ['p-full'] }), ctx())).toBe('PROMO_NOT_APPLICABLE');
    expect(evaluatePromotion(promo({ packageIds: ['p-basic'] }), ctx())).toBeNull();
  });
  it('eligibility rules', () => {
    expect(evaluatePromotion(promo({ eligibility: 'new_users' }), ctx({ hasPaidBefore: true }))).toBe('PROMO_NOT_ELIGIBLE');
    expect(evaluatePromotion(promo({ eligibility: 'renewals' }), ctx())).toBe('PROMO_NOT_ELIGIBLE');
    expect(evaluatePromotion(promo({ eligibility: 'school_students' }), ctx())).toBe('PROMO_NOT_ELIGIBLE');
    expect(evaluatePromotion(promo({ eligibility: 'school_students', ownerType: 'school', ownerId: 'sch1' }), ctx({ schoolId: 'sch2' }))).toBe('PROMO_NOT_ELIGIBLE');
    expect(evaluatePromotion(promo({ eligibility: 'school_students', ownerType: 'school', ownerId: 'sch1' }), ctx({ schoolId: 'sch1' }))).toBeNull();
  });
  it('phase is computed with the real clock', () => {
    expect(promoPhase(promo(), NOW)).toBe('live');
    expect(promoPhase(promo({ enabled: false }), NOW)).toBe('disabled');
    expect(promoPhase(promo({ validFrom: new Date(NOW.getTime() + day) }), NOW)).toBe('upcoming');
    expect(promoPhase(promo({ usageLimit: 1, used: 1 }), NOW)).toBe('exhausted');
  });
});
