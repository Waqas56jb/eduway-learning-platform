/**
 * Promotion rules (pure, unit-tested). Values (discounts, limits, windows, eligibility) come from
 * eduway_platform_promotions — never constants.
 */
export type PromoReason = 'PROMO_INVALID' | 'PROMO_EXPIRED' | 'PROMO_EXHAUSTED' | 'PROMO_NOT_APPLICABLE' | 'PROMO_NOT_ELIGIBLE';
export type PromoPhase = 'live' | 'upcoming' | 'expired' | 'exhausted' | 'disabled';

export interface PromoRecord {
  id: string;
  code: string;
  type: 'promo' | 'school' | 'referral' | 'campaign';
  discountType: 'percent' | 'fixed';
  discountValue: number;
  packageIds: string[]; // [] = all packages
  eligibility: 'all' | 'new_users' | 'renewals' | 'school_students';
  usageLimit: number | null; // null/0 = unlimited
  perUserLimit: number;
  used: number;
  validFrom: Date;
  validTo: Date | null;
  enabled: boolean;
  ownerType: 'school' | 'marketer' | null;
  ownerId: string | null;
  deleted?: boolean;
}

export interface PromoContext {
  now: Date;
  packageId: string;
  /** Redemptions (reserved or redeemed) already made by this student with this promotion. */
  userRedemptions: number;
  /** Student has at least one paid payment. */
  hasPaidBefore: boolean;
  /** School the student is attributed to (null when none). */
  schoolId: string | null;
}

export function promoPhase(p: Pick<PromoRecord, 'enabled' | 'validFrom' | 'validTo' | 'usageLimit' | 'used'>, now = new Date()): PromoPhase {
  if (!p.enabled) return 'disabled';
  if (p.validTo && p.validTo.getTime() < now.getTime()) return 'expired';
  if (p.validFrom.getTime() > now.getTime()) return 'upcoming';
  if (p.usageLimit && p.used >= p.usageLimit) return 'exhausted';
  return 'live';
}

/** Returns null when the promotion can be applied, else the localized reason key. */
export function evaluatePromotion(p: PromoRecord | null, ctx: PromoContext): PromoReason | null {
  if (!p || p.deleted) return 'PROMO_INVALID';
  const phase = promoPhase(p, ctx.now);
  if (phase === 'disabled' || phase === 'upcoming') return 'PROMO_INVALID';
  if (phase === 'expired') return 'PROMO_EXPIRED';
  if (phase === 'exhausted') return 'PROMO_EXHAUSTED';
  if (p.perUserLimit > 0 && ctx.userRedemptions >= p.perUserLimit) return 'PROMO_EXHAUSTED';
  if (p.packageIds.length && !p.packageIds.includes(ctx.packageId)) return 'PROMO_NOT_APPLICABLE';
  if (p.eligibility === 'new_users' && ctx.hasPaidBefore) return 'PROMO_NOT_ELIGIBLE';
  if (p.eligibility === 'renewals' && !ctx.hasPaidBefore) return 'PROMO_NOT_ELIGIBLE';
  if (p.eligibility === 'school_students') {
    if (!ctx.schoolId) return 'PROMO_NOT_ELIGIBLE';
    if (p.ownerType === 'school' && p.ownerId && p.ownerId !== ctx.schoolId) return 'PROMO_NOT_ELIGIBLE';
  }
  return null;
}

/** Discount for a subtotal (never more than the subtotal, never negative). */
export function discountFor(p: Pick<PromoRecord, 'discountType' | 'discountValue'>, subtotal: number): number {
  if (subtotal <= 0) return 0;
  const d = p.discountType === 'percent' ? Math.round((subtotal * Math.min(100, Math.max(0, p.discountValue))) / 100) : Math.max(0, p.discountValue);
  return Math.min(subtotal, d);
}
