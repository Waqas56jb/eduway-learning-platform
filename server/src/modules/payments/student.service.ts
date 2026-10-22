/** Student payment flow: quote (PAY-04), initiate (PAY-06), mock confirm (PAY-07), status/history/receipt (PAY-08..10). */
import { T, type ClientPlatform } from '../../config/constants.js';
import { db, tx } from '../../config/db.js';
import { devFlags, env } from '../../config/env.js';
import { BusinessRuleError, ConflictError, NotFoundError, ValidationError } from '../../common/errors/index.js';
import { settingsStore } from '../../common/services/settings-store.js';
import { mySubscription } from '../../common/services/student-summary.js';
import { addMinutes } from '../../common/utils/dates.js';
import { iso, isoOrNull, L, newPaymentRef, type Row } from '../commerce/lib.js';
import type { BillingCycle } from './pricing.js';
import { canonicalGateway, getProvider, signMock, type Gateway } from './providers.js';
import { quoteFor } from './quote.service.js';
import { paymentsRepo } from './repository.js';
import { applyWebhookEvent, processWebhook } from './webhook.service.js';

export interface StudentPaymentDto {
  id: string;
  ref: string;
  receiptNumber: string | null;
  status: string;
  gateway: string;
  package: { id: string; name: { en: string; ar: string } };
  cycle: BillingCycle;
  amount: number;
  discount: number;
  refundedAmount: number;
  currency: 'IQD' | 'USD';
  promoCode: string | null;
  createdAt: string;
  paidAt: string | null;
}

const SELECT = `
  SELECT pay.*, r.number AS receipt_number, p.name_en AS p_name_en, p.name_ar AS p_name_ar
    FROM ${T.payments} pay JOIN ${T.packages} p ON p.id = pay.package_id LEFT JOIN ${T.receipts} r ON r.payment_id = pay.id`;

export function toStudentPayment(r: Row): StudentPaymentDto {
  return {
    id: String(r.id),
    ref: String(r.ref),
    receiptNumber: (r.receipt_number as string | null) ?? null,
    status: String(r.status),
    gateway: String(r.provider),
    package: { id: String(r.package_id), name: L(r, 'p_name') },
    cycle: r.billing_cycle as BillingCycle,
    amount: Number(r.total),
    discount: Number(r.discount),
    refundedAmount: Number(r.refunded_amount),
    currency: r.currency as 'IQD' | 'USD',
    promoCode: (r.promo_code as string | null) ?? null,
    createdAt: iso(r.created_at),
    paidAt: isoOrNull(r.paid_at),
  };
}

/** SEC-28: mock confirmation is allowed for the MockGateway and for gateways running as a dev stub (no credentials). */
export function mockConfirmAllowed(provider: string): boolean {
  if (!devFlags.mockPayments) return false;
  if (provider === 'mock') return true;
  const gw = getProvider(provider);
  return !!gw && !gw.configured();
}

async function assertGatewayEnabled(gateway: Gateway): Promise<void> {
  const settings = await settingsStore.get('payments');
  if (gateway === 'mock') {
    if (!devFlags.mockPayments || !settings.mockGatewayEnabled) throw new BusinessRuleError('PAYMENT_GATEWAY_DISABLED', { gateway });
    return;
  }
  const g = settings.gateways.find((x) => x.id === gateway);
  if (!g || !g.enabled) throw new BusinessRuleError('PAYMENT_GATEWAY_DISABLED', { gateway });
}

const apiBase = () => (env.PUBLIC_API_URL ?? '').replace(/\/+$/, '') + env.API_PREFIX;

export interface InitiateInput {
  packageId: string;
  cycle: BillingCycle;
  gateway: string;
  promoCode?: string;
  walletPhone?: string;
  returnUrl?: string;
  returnScheme?: string;
}

export const studentPayments = {
  quote: (userId: string, body: { packageId: string; cycle: BillingCycle; promoCode?: string }) => quoteFor(userId, body).then((r) => r.quote),

  async initiate(userId: string, body: InitiateInput, platform: ClientPlatform | null) {
    const gateway = canonicalGateway(body.gateway);
    if (!gateway) throw new ValidationError([{ path: 'gateway', message: 'unknown gateway' }]);
    await assertGatewayEnabled(gateway);
    const provider = getProvider(gateway);
    if (!provider) throw new BusinessRuleError('PAYMENT_GATEWAY_DISABLED', { gateway });
    const ttl = env.PAYMENT_CHECKOUT_TTL_MIN;

    const created = await tx(async (c) => {
      const { quote, promo } = await quoteFor(userId, { packageId: body.packageId, cycle: body.cycle, promoCode: body.promoCode }, c);
      const attr = await db.maybeOne<{ school_id: string | null; marketer_id: string | null }>(
        `SELECT sp.school_id, COALESCE(sp.marketer_id, ms.marketer_id) AS marketer_id
           FROM ${T.student_profiles} sp
           LEFT JOIN ${T.marketer_schools} ms ON ms.school_id = sp.school_id AND ms.unassigned_at IS NULL
          WHERE sp.user_id = $1`,
        [userId],
        c,
      );
      let id: string | null = null;
      let ref = '';
      for (let i = 0; i < 5 && !id; i++) {
        ref = newPaymentRef();
        id = await db.scalar<string>(
          `INSERT INTO ${T.payments} (ref, user_id, package_id, billing_cycle, amount, discount, total, currency, provider, status, promotion_id, promo_code,
                                       school_id, marketer_id, platform, idempotency_key, metadata, expires_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'initiated',$10,$11,$12,$13,$14,$15,$16::jsonb,$17)
           ON CONFLICT (ref) DO NOTHING RETURNING id`,
          [ref, userId, body.packageId, body.cycle, quote.subtotal, quote.discount + quote.prorationCredit, quote.total, quote.currency, gateway, promo?.id ?? null, promo?.code ?? null,
            attr?.school_id ?? null, attr?.marketer_id ?? null, platform && platform !== 'admin' ? platform : null, null,
            JSON.stringify({ quote, returnUrl: body.returnUrl ?? null, returnScheme: body.returnScheme ?? null, walletPhone: body.walletPhone ?? null }), addMinutes(new Date(), ttl)],
          c,
        );
      }
      if (!id) throw new ConflictError('ALREADY_EXISTS');
      await paymentsRepo.addEvent(c, { paymentId: id, kind: 'status', status: 'initiated', note: `Checkout started (${platform ?? 'web'})` });
      if (promo) {
        await db.query(`INSERT INTO ${T.promotion_redemptions} (promotion_id, user_id, payment_id, discount_amount, status) VALUES ($1,$2,$3,$4,'reserved')`, [promo.id, userId, id, quote.discount], c);
      }
      const returnUrl = body.returnUrl ? body.returnUrl.replace(/__ID__/g, id) : null;
      const returnScheme = body.returnScheme ? body.returnScheme.replace(/__ID__/g, id) : null;
      const checkout = await provider.createCheckout({ paymentId: id, ref, amount: quote.total, currency: quote.currency, returnUrl, returnScheme, walletPhone: body.walletPhone ?? null });
      await db.query(
        `UPDATE ${T.payments} SET status = 'pending', provider_ref = $2, checkout_url = $3, metadata = metadata || jsonb_build_object('returnUrl', $4::text, 'returnScheme', $5::text) WHERE id = $1`,
        [id, checkout.providerRef, checkout.redirectUrl, returnUrl, returnScheme],
        c,
      );
      await paymentsRepo.addEvent(c, { paymentId: id, kind: 'status', status: 'pending', note: checkout.redirectUrl ? `Redirected to ${gateway} payment page` : `Awaiting ${gateway} confirmation` });
      return { id, ref, quote, checkout };
    });

    // Fully covered by promo/proration credit: no gateway round-trip needed.
    if (created.quote.total === 0) {
      await applyWebhookEvent(gateway, { eventId: `free_${created.id}`, type: 'payment.succeeded', paymentId: created.id, providerRef: null, amount: 0, payload: { reason: 'zero_total' } });
    }
    const useMock = devFlags.mockPayments && (gateway === 'mock' || !provider.configured() || !created.checkout.redirectUrl);
    return {
      paymentId: created.id,
      ref: created.ref,
      status: 'pending' as const,
      quote: created.quote,
      amount: created.quote.total,
      currency: created.quote.currency,
      redirectUrl: created.checkout.redirectUrl,
      deeplink: created.checkout.deeplink,
      mock: useMock && created.quote.total > 0 ? { confirmUrl: `${apiBase()}/payments/mock/${created.id}/confirm` } : null,
      expiresAt: addMinutes(new Date(), ttl).toISOString(),
    };
  },

  /** PAY-07 — emits a signed MockGateway webhook into the normal pipeline (DEV_MOCK_PAYMENTS only, never production). */
  async mockConfirm(userId: string, paymentId: string, outcome: 'success' | 'failure' | 'cancel') {
    if (!devFlags.mockPayments) throw new NotFoundError('resource');
    const p = await db.maybeOne<{ user_id: string; status: string; total: number; provider_ref: string | null; provider: string }>(`SELECT user_id, status, total, provider_ref, provider FROM ${T.payments} WHERE id = $1`, [paymentId]);
    if (!p || p.user_id !== userId) throw new NotFoundError('payment');
    // SEC-28: only MockGateway checkouts and dev stubs of UNCONFIGURED gateways may be confirmed here — never a
    // checkout that went to a real (credentialed) gateway.
    if (!mockConfirmAllowed(p.provider)) throw new NotFoundError('payment');
    if (['initiated', 'pending'].includes(p.status)) {
      const type = outcome === 'success' ? 'payment.succeeded' : outcome === 'cancel' ? 'payment.cancelled' : 'payment.failed';
      const body = { id: `evt_mock_${paymentId}_${outcome}`, type, data: { paymentId, providerRef: p.provider_ref, amount: p.total, ...(outcome === 'failure' ? { reason: 'declined' } : {}) } };
      const raw = JSON.stringify(body);
      await processWebhook('mock', Buffer.from(raw), { 'x-signature': signMock(raw) }, body);
    }
    return this.get(userId, paymentId);
  },

  async get(userId: string, paymentId: string) {
    const r = await db.maybeOne<Row>(`${SELECT} WHERE pay.id = $1 AND pay.user_id = $2`, [paymentId, userId]);
    if (!r) throw new NotFoundError('payment');
    const dto = toStudentPayment(r);
    return { ...dto, subscription: dto.status === 'paid' || dto.status === 'partially_refunded' ? await mySubscription(userId) : null };
  },

  async my(userId: string, limit: number, offset: number) {
    const total = (await db.scalar<number>(`SELECT count(*)::int FROM ${T.payments} WHERE user_id = $1`, [userId])) ?? 0;
    const rows = await db.many<Row>(`${SELECT} WHERE pay.user_id = $1 ORDER BY pay.created_at DESC LIMIT $2 OFFSET $3`, [userId, limit, offset]);
    return { total, items: rows.map(toStudentPayment) };
  },
};
