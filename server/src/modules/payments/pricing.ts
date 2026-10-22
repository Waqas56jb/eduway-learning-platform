/**
 * Price quote engine (pure, unit-tested) — PAY-04 / PAY-06. Prices, validity and promo values come from the
 * package / promotion rows; nothing is hardcoded.
 *
 * intent:
 *   new       — no live subscription → starts now (or the package's accessStartDate when in the future)
 *   renew     — live subscription on the same package → starts when the current one ends
 *   upgrade   — live subscription on a cheaper package → starts now; prorationCredit = unused value of the
 *               current subscription (paid total × remaining time / total time), capped so total ≥ 0
 *   downgrade — live subscription on a more expensive package → starts when the current one ends, no credit
 */
import { addDays } from '../../common/utils/dates.js';
import { discountFor, type PromoRecord } from '../promotions/engine.js';

export type BillingCycle = 'monthly' | 'yearly';
export type Intent = 'new' | 'renew' | 'upgrade' | 'downgrade';

export interface QuotePackage {
  id: string;
  price: number;
  yearlyPrice: number | null;
  yearlyValidityDays: number;
  validityType: 'days' | 'months' | 'until_date';
  validityValue: number;
  validUntil: Date | null;
  accessStart: 'immediate' | 'from_date';
  accessStartDate: Date | null;
  currency: 'IQD' | 'USD';
}

export interface CurrentSubscription {
  id: string;
  packageId: string;
  packagePrice: number;
  startsAt: Date;
  endsAt: Date;
  /** Amount actually paid for it (0 for manual/trial grants → no credit). */
  paidTotal: number;
}

export interface PriceQuote {
  packageId: string;
  cycle: BillingCycle;
  currency: 'IQD' | 'USD';
  subtotal: number;
  discount: number;
  prorationCredit: number;
  total: number;
  promo: { code: string; discountType: 'percent' | 'fixed'; discountValue: number } | null;
  intent: Intent;
  startsAt: string;
  endsAt: string;
  baseValidityDays: number;
}

export class QuoteUnavailableError extends Error {
  constructor() {
    super('PACKAGE_UNAVAILABLE');
  }
}

/** Validity of a cycle in days (`until_date` resolved against `from`). */
export function cycleDays(p: QuotePackage, cycle: BillingCycle, from: Date): number {
  if (cycle === 'yearly') return p.yearlyValidityDays;
  if (p.validityType === 'days') return p.validityValue;
  if (p.validityType === 'months') return Math.round(p.validityValue * 30.4375);
  return p.validUntil ? Math.max(0, Math.ceil((p.validUntil.getTime() - from.getTime()) / 86_400_000)) : 0;
}

function endFor(p: QuotePackage, cycle: BillingCycle, start: Date): Date {
  if (cycle === 'monthly' && p.validityType === 'until_date' && p.validUntil) return p.validUntil;
  if (cycle === 'monthly' && p.validityType === 'months') {
    const d = new Date(start);
    d.setUTCMonth(d.getUTCMonth() + p.validityValue);
    return d;
  }
  return addDays(start, cycleDays(p, cycle, start));
}

/** Unused value of the current subscription, IQD (rounded). */
export function prorationCredit(cur: CurrentSubscription, now: Date): number {
  const total = cur.endsAt.getTime() - cur.startsAt.getTime();
  const remaining = cur.endsAt.getTime() - Math.max(now.getTime(), cur.startsAt.getTime());
  if (total <= 0 || remaining <= 0 || cur.paidTotal <= 0) return 0;
  return Math.round((cur.paidTotal * remaining) / total);
}

export function computeQuote(input: { pkg: QuotePackage; cycle: BillingCycle; current: CurrentSubscription | null; promo: PromoRecord | null; now?: Date }): PriceQuote {
  const { pkg, cycle, current, promo } = input;
  const now = input.now ?? new Date();
  const subtotal = cycle === 'yearly' ? pkg.yearlyPrice : pkg.price;
  if (subtotal === null || subtotal === undefined) throw new QuoteUnavailableError();

  const live = current && current.endsAt.getTime() > now.getTime() ? current : null;
  let intent: Intent = 'new';
  if (live) intent = live.packageId === pkg.id ? 'renew' : pkg.price > live.packagePrice ? 'upgrade' : 'downgrade';

  let start: Date;
  if (intent === 'renew' || intent === 'downgrade') start = (live as CurrentSubscription).endsAt;
  else if (pkg.accessStart === 'from_date' && pkg.accessStartDate && pkg.accessStartDate.getTime() > now.getTime()) start = pkg.accessStartDate;
  else start = now;
  const end = endFor(pkg, cycle, start);
  if (end.getTime() <= start.getTime()) throw new QuoteUnavailableError();

  const discount = promo ? discountFor(promo, subtotal) : 0;
  const credit = intent === 'upgrade' && live ? Math.min(prorationCredit(live, now), subtotal - discount) : 0;
  return {
    packageId: pkg.id,
    cycle,
    currency: pkg.currency,
    subtotal,
    discount,
    prorationCredit: credit,
    total: Math.max(0, subtotal - discount - credit),
    promo: promo ? { code: promo.code, discountType: promo.discountType, discountValue: promo.discountValue } : null,
    intent,
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    baseValidityDays: cycleDays(pkg, cycle, start),
  };
}
