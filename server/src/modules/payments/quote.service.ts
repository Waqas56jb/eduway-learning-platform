/** Loads package / current subscription / promotion and runs the pure quote engine (PAY-04, PAY-05, PAY-06). */
import { T } from '../../config/constants.js';
import { db, type Executor } from '../../config/db.js';
import { BusinessRuleError } from '../../common/errors/index.js';
import { evaluatePromotion, type PromoReason, type PromoRecord } from '../promotions/engine.js';
import { promotionsRepo, toPromoRecord } from '../promotions/repository.js';
import { computeQuote, QuoteUnavailableError, type BillingCycle, type CurrentSubscription, type PriceQuote, type QuotePackage } from './pricing.js';

interface PkgRow {
  id: string;
  price: number;
  yearly_price: number | null;
  yearly_validity_days: number;
  validity_type: QuotePackage['validityType'];
  validity_value: number;
  valid_until: Date | null;
  access_start: QuotePackage['accessStart'];
  access_start_date: Date | null;
  currency: 'IQD' | 'USD';
  status: string;
  deleted_at: Date | null;
}

export async function loadQuotePackage(packageId: string, ex?: Executor): Promise<QuotePackage> {
  const p = await db.maybeOne<PkgRow>(`SELECT * FROM ${T.packages} WHERE id = $1`, [packageId], ex);
  if (!p || p.deleted_at || p.status !== 'active') throw new BusinessRuleError('PACKAGE_UNAVAILABLE', { packageId });
  if (p.validity_type === 'until_date' && p.valid_until && p.valid_until.getTime() <= Date.now()) throw new BusinessRuleError('PACKAGE_UNAVAILABLE', { packageId });
  return {
    id: p.id,
    price: p.price,
    yearlyPrice: p.yearly_price,
    yearlyValidityDays: p.yearly_validity_days,
    validityType: p.validity_type,
    validityValue: p.validity_value,
    validUntil: p.valid_until,
    accessStart: p.access_start,
    accessStartDate: p.access_start_date,
    currency: p.currency,
  };
}

/** Live (latest-ending) subscription the new purchase is compared against. */
export async function loadCurrentSubscription(userId: string, ex?: Executor): Promise<CurrentSubscription | null> {
  const r = await db.maybeOne<{ id: string; package_id: string; price: number; starts_at: Date; ends_at: Date; paid: number | null }>(
    `SELECT s.id, s.package_id, p.price, s.starts_at, s.ends_at, pay.total - pay.refunded_amount AS paid
       FROM ${T.subscriptions} s
       JOIN ${T.packages} p ON p.id = s.package_id
       LEFT JOIN ${T.payments} pay ON pay.id = s.payment_id AND pay.status IN ('paid', 'partially_refunded')
      WHERE s.user_id = $1 AND s.status IN ('active', 'trial') AND s.ends_at > now() AND s.starts_at <= now()
      ORDER BY s.ends_at DESC LIMIT 1`,
    [userId],
    ex,
  );
  return r ? { id: r.id, packageId: r.package_id, packagePrice: r.price, startsAt: r.starts_at, endsAt: r.ends_at, paidTotal: Number(r.paid ?? 0) } : null;
}

export interface PromoCheck {
  promo: PromoRecord | null;
  reason: PromoReason | null;
}

export async function checkPromotion(code: string, userId: string, packageId: string, ex?: Executor): Promise<PromoCheck> {
  const row = await promotionsRepo.byCode(code, ex);
  const promo = row ? toPromoRecord(row) : null;
  if (!promo) return { promo: null, reason: 'PROMO_INVALID' };
  const ctx = await promotionsRepo.studentContext(userId, promo.id, ex);
  const reason = evaluatePromotion(promo, { now: new Date(), packageId, userRedemptions: ctx.redemptions, hasPaidBefore: ctx.paid_before, schoolId: ctx.school_id });
  return { promo, reason };
}

/** Quote for a student; invalid promo → 422 with the promo reason (PAY-04 / PAY-06). */
export async function quoteFor(userId: string, input: { packageId: string; cycle: BillingCycle; promoCode?: string | null }, ex?: Executor): Promise<{ quote: PriceQuote; promo: PromoRecord | null; current: CurrentSubscription | null }> {
  const pkg = await loadQuotePackage(input.packageId, ex);
  const current = await loadCurrentSubscription(userId, ex);
  let promo: PromoRecord | null = null;
  if (input.promoCode) {
    const chk = await checkPromotion(input.promoCode, userId, input.packageId, ex);
    if (chk.reason) throw new BusinessRuleError(chk.reason, { code: input.promoCode.toUpperCase() });
    promo = chk.promo;
  }
  try {
    return { quote: computeQuote({ pkg, cycle: input.cycle, current, promo }), promo, current };
  } catch (e) {
    if (e instanceof QuoteUnavailableError) throw new BusinessRuleError('PACKAGE_UNAVAILABLE', { packageId: input.packageId, cycle: input.cycle });
    throw e;
  }
}
