/**
 * FastPay (Iraq) merchant payment gateway — follows FastPay's public "PGW" merchant API pattern:
 *
 *   initiate: POST {base}/api/v1/public/pgw/payment/initiation
 *             { store_id, store_password, order_id, bill_amount, currency, cart[] } → { code: 200, data: { redirect_uri } }
 *   validate: POST {base}/api/v1/public/pgw/payment/validate
 *             { store_id, store_password, order_id } → { code: 200, data: { gw_transaction_id, merchant_order_id,
 *             received_amount, currency, status: 'Success'|'Failed'|'Cancelled'|… } }
 *   IPN:      FastPay POSTs { gw_transaction_id, merchant_order_id, status, received_amount, … } to the IPN URL
 *             configured in the merchant panel → POST /payments/webhook/fastpay. The IPN is NOT signed, so it is
 *             never trusted as-is: every IPN is re-validated with the validate API (server-to-server, with the
 *             store password) and only the validated data is applied.
 *   Currency: IQD only (refused at checkout otherwise); the validated `currency` is compared with the payment's and a
 *   validation without `received_amount` never settles a payment (SEC-24). The IPN carries no signed timestamp,
 *   so replays are neutralised by the validate re-check + idempotent event ids instead of a time window.
 *   refund:   POST {base}/api/v1/public/pgw/payment/refund { store_id, store_password, order_id, amount, msisdn? }
 *
 * Hosts: staging https://staging-apigw-merchant.fast-pay.iq, live https://apigw-merchant.fast-pay.iq (FASTPAY_ENV).
 *
 * TODO(merchant): confirm with FastPay before go-live —
 *   - the exact endpoint paths/hosts above for your store, and whether `cart` is required,
 *   - the success/fail/cancel redirect URLs (configured in the panel; point them at
 *     {PUBLIC_API_URL}/api/v1/payments/callback/fastpay so the result is validated immediately) and the
 *     IPN URL ({PUBLIC_API_URL}/api/v1/payments/webhook/fastpay),
 *   - the exact `status` values returned by validate (assumed 'Success' / 'Failed' / 'Cancelled'),
 *   - the refund endpoint and its required fields (msisdn of the payer?).
 */
import axios, { type AxiosInstance } from 'axios';
import { env, type Env } from '../../../config/env.js';
import { logger } from '../../../config/logger.js';
import type { PaymentProvider } from '../providers.js';
import type { ParsedWebhook } from '../webhook-core.js';
import { assertGatewayCurrency, event, gatewayFailure, GATEWAY_CURRENCY, scrub, stubCheckout } from './common.js';

export interface FastPayConfig {
  storeId: string;
  storePassword: string;
  baseUrl: string;
}

export const FASTPAY_HOSTS = { staging: 'https://staging-apigw-merchant.fast-pay.iq', live: 'https://apigw-merchant.fast-pay.iq' } as const;

export function fastPayConfig(e: Env): FastPayConfig | null {
  if (!e.FASTPAY_STORE_ID || !e.FASTPAY_SECRET) return null;
  return { storeId: e.FASTPAY_STORE_ID, storePassword: e.FASTPAY_SECRET, baseUrl: FASTPAY_HOSTS[e.FASTPAY_ENV] };
}
export const fastPayMissing = (e: Env): string[] => (['FASTPAY_STORE_ID', 'FASTPAY_SECRET'] as const).filter((k) => !e[k]);

interface FastPayEnvelope<T> {
  code?: number;
  messages?: string[];
  data?: T;
}
interface Validation {
  gw_transaction_id?: string;
  merchant_order_id?: string;
  received_amount?: number | string;
  currency?: string;
  status?: string;
}

export function createFastPay(getCfg: () => FastPayConfig | null = () => fastPayConfig(env), http: AxiosInstance = axios): PaymentProvider {
  async function validate(c: FastPayConfig, orderId: string): Promise<Validation | null> {
    try {
      const res = await http.post<FastPayEnvelope<Validation>>(`${c.baseUrl}/api/v1/public/pgw/payment/validate`, { store_id: c.storeId, store_password: c.storePassword, order_id: orderId }, { timeout: 15_000 });
      return res.data?.code === 200 && res.data.data ? res.data.data : null;
    } catch (err) {
      logger.warn({ gateway: 'fastpay', err: (err as Error).message }, 'fastpay validate failed');
      return null;
    }
  }

  /** Validated gateway data → event (null while pending / unknown). */
  function toEvent(v: Validation, orderId: string): ParsedWebhook | null {
    const status = String(v.status ?? '').toLowerCase();
    const txId = String(v.gw_transaction_id ?? orderId);
    const amount = v.received_amount === undefined || v.received_amount === null || v.received_amount === '' ? null : Number(v.received_amount);
    const currency = v.currency ? String(v.currency).toUpperCase() : GATEWAY_CURRENCY;
    const base = { paymentId: null, providerRef: String(v.merchant_order_id ?? orderId), amount: amount === null ? null : Number.isFinite(amount) ? amount : Number.NaN, currency, payload: { gateway: 'fastpay', ...scrub(v as Record<string, unknown>) } };
    if (status === 'success') return event('fastpay', txId, 'success', { ...base, type: 'payment.succeeded' });
    if (status === 'failed' || status === 'failure') return event('fastpay', txId, 'failed', { ...base, type: 'payment.failed', payload: { ...base.payload, reason: 'declined' } });
    if (status === 'cancelled' || status === 'canceled') return event('fastpay', txId, 'cancelled', { ...base, type: 'payment.cancelled' });
    return null;
  }

  return {
    id: 'fastpay',
    configured: () => !!getCfg(),
    async createCheckout(input) {
      const c = getCfg();
      if (!c) return stubCheckout('fastpay', input.ref);
      assertGatewayCurrency('fastpay', input.currency);
      let res: FastPayEnvelope<{ redirect_uri?: string }>;
      try {
        res = (
          await http.post<typeof res>(
            `${c.baseUrl}/api/v1/public/pgw/payment/initiation`,
            {
              store_id: c.storeId,
              store_password: c.storePassword,
              order_id: input.ref,
              bill_amount: input.amount,
              currency: input.currency,
              cart: [{ name: 'EDUWAY subscription', qty: 1, unit_price: input.amount, sub_total: input.amount }],
            },
            { timeout: 15_000 },
          )
        ).data;
      } catch (err) {
        throw gatewayFailure('fastpay', 'initiation', err);
      }
      const uri = res?.data?.redirect_uri;
      if (res?.code !== 200 || !uri) throw gatewayFailure('fastpay', 'initiation', new Error(res?.messages?.join('; ') ?? 'no redirect_uri'));
      // order_id = our payment ref (stored as provider_ref) — IPN/validate are keyed by it.
      return { providerRef: input.ref, redirectUrl: uri, deeplink: null };
    },
    // IPNs are unsigned; trust comes from verifyWebhook (validate API). The sync path always fails closed.
    verifySignature: () => false,
    parseWebhook() {
      throw new Error('fastpay: use verifyWebhook');
    },
    async verifyWebhook({ body }) {
      const c = getCfg();
      const orderId = String(body.merchant_order_id ?? body.order_id ?? '');
      if (!c || !orderId) return null;
      const v = await validate(c, orderId);
      if (!v) return null;
      return { event: toEvent(v, orderId) };
    },
    async handleCallback({ query, body }) {
      const c = getCfg();
      const orderId = String(query.order_id ?? query.merchant_order_id ?? body.order_id ?? body.merchant_order_id ?? '');
      if (!c || !orderId) return null;
      const v = await validate(c, orderId);
      return { event: v ? toEvent(v, orderId) : null, ref: orderId };
    },
    async refund(input) {
      const c = getCfg();
      if (!c) return { refundId: `fastpay_rf_${input.paymentId.slice(0, 8)}_${Date.now()}` };
      try {
        const res = await http.post<FastPayEnvelope<{ refund_id?: string; gw_transaction_id?: string }>>(
          `${c.baseUrl}/api/v1/public/pgw/payment/refund`,
          { store_id: c.storeId, store_password: c.storePassword, order_id: input.providerRef, amount: input.amount },
          { timeout: 20_000 },
        );
        if (res.data?.code !== 200) throw new Error(res.data?.messages?.join('; ') ?? 'refund rejected');
        return { refundId: String(res.data.data?.refund_id ?? res.data.data?.gw_transaction_id ?? `fastpay_rf_${Date.now()}`) };
      } catch (err) {
        throw gatewayFailure('fastpay', 'refund', err);
      }
    },
  };
}
