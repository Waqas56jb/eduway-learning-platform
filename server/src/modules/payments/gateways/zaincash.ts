/**
 * ZainCash (Iraq) — legacy merchant API v1 ("JWT" integration, as in ZainCash's public PHP/Node SDKs):
 *
 *   1. init:     POST {base}/transaction/init  (form: token, merchantId, lang)
 *                token = HS256 JWT signed with the merchant secret:
 *                { amount, serviceType, msisdn, orderId, redirectUrl, iat, exp }
 *                → { id: <transactionId> }
 *   2. redirect: {base}/transaction/pay?id=<transactionId>   (student pays on ZainCash's page)
 *   3. callback: ZainCash redirects the browser to redirectUrl?token=<JWT signed with the same secret>
 *                payload { status: 'success'|'failed'|'pending', orderid, id, operationid?, msg? }
 *                → GET /payments/callback/zaincash (verified here, then cross-checked with step 4)
 *   4. status:   POST {base}/transaction/get (form: token{ id, msisdn, iat, exp }, merchantId) → { status, amount, … }
 *
 * Hosts: test https://test.zaincash.iq, live https://api.zaincash.iq (ZAINCASH_ENV).
 * Minimum amount is 250 IQD (ZainCash rule). IQD only: other currencies are refused at checkout and every event
 * carries currency IQD, so it can only settle an IQD payment (SEC-24). A callback token older than
 * CALLBACK_MAX_AGE_SEC (by its `iat`) is refused as a replay; a success without a confirmed amount is not applied.
 *
 * TODO(merchant): confirm with ZainCash before go-live —
 *   - that the merchant account is on the v1 JWT API above (newer merchants may be issued the v2 OAuth
 *     "pg-api" credentials instead; then this adapter must be switched to v2),
 *   - the exact field names of the callback JWT (`status`, `orderid`, `id`) and the `/transaction/get`
 *     response (`status: 'completed'`, `amount`) for your account,
 *   - refunds: ZainCash has no public refund API — refunds are done in the merchant portal (this adapter
 *     records a manual refund reference).
 */
import axios, { type AxiosInstance } from 'axios';
import jwt from 'jsonwebtoken';
import { env, type Env } from '../../../config/env.js';
import { logger } from '../../../config/logger.js';
import { hmacHex } from '../hmac.js';
import { safeEqual } from '../../../common/utils/crypto.js';
import type { PaymentProvider } from '../providers.js';
import { assertGatewayCurrency, callbackUrl, event, gatewayFailure, GATEWAY_CURRENCY, header, scrub, stubCheckout } from './common.js';

/** Max age of a callback token (ZainCash signs it when it redirects the browser back). */
export const ZAINCASH_CALLBACK_MAX_AGE_SEC = 60 * 60;

export interface ZainCashConfig {
  merchantId: string;
  secret: string;
  msisdn: string;
  baseUrl: string;
  lang: string;
  serviceType: string;
}

export const ZAINCASH_HOSTS = { test: 'https://test.zaincash.iq', live: 'https://api.zaincash.iq' } as const;

export function zainCashConfig(e: Env): ZainCashConfig | null {
  if (!e.ZAINCASH_MERCHANT_ID || !e.ZAINCASH_SECRET || !e.ZAINCASH_MSISDN || !e.PUBLIC_API_URL) return null;
  return { merchantId: e.ZAINCASH_MERCHANT_ID, secret: e.ZAINCASH_SECRET, msisdn: e.ZAINCASH_MSISDN, baseUrl: ZAINCASH_HOSTS[e.ZAINCASH_ENV], lang: e.ZAINCASH_LANG, serviceType: e.ZAINCASH_SERVICE_TYPE };
}
export const zainCashMissing = (e: Env): string[] =>
  (['ZAINCASH_MERCHANT_ID', 'ZAINCASH_SECRET', 'ZAINCASH_MSISDN', 'PUBLIC_API_URL'] as const).filter((k) => !e[k]);

interface CallbackClaims {
  iat?: number;
  status?: string;
  orderid?: string;
  orderId?: string;
  id?: string;
  operationid?: string;
  msg?: string;
}

export function createZainCash(getCfg: () => ZainCashConfig | null = () => zainCashConfig(env), http: AxiosInstance = axios): PaymentProvider {
  const form = (data: Record<string, string>) => new URLSearchParams(data).toString();
  const formHeaders = { 'Content-Type': 'application/x-www-form-urlencoded' };

  async function getTransaction(c: ZainCashConfig, id: string): Promise<{ status?: string; amount?: number | string; orderid?: string } | null> {
    const now = Math.floor(Date.now() / 1000);
    const token = jwt.sign({ id, msisdn: c.msisdn, iat: now, exp: now + 60 * 60 * 4 }, c.secret, { algorithm: 'HS256', noTimestamp: true });
    try {
      const res = await http.post<{ status?: string; amount?: number | string; orderid?: string }>(`${c.baseUrl}/transaction/get`, form({ token, merchantId: c.merchantId }), { headers: formHeaders, timeout: 15_000 });
      return res.data ?? null;
    } catch (err) {
      logger.warn({ gateway: 'zaincash', err: (err as Error).message }, 'zaincash status check failed');
      return null;
    }
  }

  return {
    id: 'zaincash',
    configured: () => !!getCfg(),
    async createCheckout(input) {
      const c = getCfg();
      if (!c) return stubCheckout('zaincash', input.ref);
      assertGatewayCurrency('zaincash', input.currency);
      const now = Math.floor(Date.now() / 1000);
      const token = jwt.sign(
        { amount: input.amount, serviceType: c.serviceType, msisdn: Number(c.msisdn), orderId: input.ref, redirectUrl: callbackUrl('zaincash'), iat: now, exp: now + 60 * 60 * 4 },
        c.secret,
        { algorithm: 'HS256', noTimestamp: true },
      );
      let data: { id?: string; err?: { msg?: string } };
      try {
        data = (await http.post<typeof data>(`${c.baseUrl}/transaction/init`, form({ token, merchantId: c.merchantId, lang: c.lang }), { headers: formHeaders, timeout: 15_000 })).data;
      } catch (err) {
        throw gatewayFailure('zaincash', 'init', err);
      }
      if (!data?.id) throw gatewayFailure('zaincash', 'init', new Error(data?.err?.msg ?? 'no transaction id'));
      return { providerRef: data.id, redirectUrl: `${c.baseUrl}/transaction/pay?id=${encodeURIComponent(data.id)}`, deeplink: null };
    },
    // ZainCash has no server-to-server webhook; results arrive via the signed redirect token (handleCallback).
    // The legacy HMAC header path stays for gateway-side tooling that posts with X-Signature = HMAC(secret, body).
    verifySignature(raw, headers) {
      const secret = getCfg()?.secret ?? env.ZAINCASH_SECRET;
      const sig = header(headers, 'x-signature').replace(/^sha256=/, '');
      return !!secret && !!sig && safeEqual(sig, hmacHex(secret, raw));
    },
    parseWebhook() {
      throw new Error('zaincash: use the redirect callback');
    },
    async handleCallback({ query }) {
      const c = getCfg();
      const token = String(query.token ?? '');
      if (!c || !token) return null;
      let claims: CallbackClaims;
      try {
        claims = jwt.verify(token, c.secret, { algorithms: ['HS256'] }) as CallbackClaims;
      } catch {
        return null; // bad signature / expired → rejected by the caller
      }
      // Replay window: a token issued long ago (or in the future) is not accepted.
      if (typeof claims.iat === 'number' && Math.abs(Date.now() / 1000 - claims.iat) > ZAINCASH_CALLBACK_MAX_AGE_SEC) return null;
      const txId = String(claims.id ?? '');
      const ref = String(claims.orderid ?? claims.orderId ?? '');
      const status = String(claims.status ?? '').toLowerCase();
      if (!txId && !ref) return null;
      const base = { paymentId: null, providerRef: txId || ref, currency: GATEWAY_CURRENCY, payload: { gateway: 'zaincash', ...scrub(claims as Record<string, unknown>) } };
      if (status === 'success') {
        // Cross-check with the status API (amount + final state). If ZainCash says otherwise, don't grant.
        const tx = await getTransaction(c, txId);
        if (tx && tx.status && !['completed', 'success'].includes(String(tx.status).toLowerCase())) {
          logger.warn({ gateway: 'zaincash', txId, apiStatus: tx.status }, 'zaincash callback success not confirmed by status API');
          return { event: null, ref };
        }
        // No status-API amount → the event carries none and is not applied (SEC-24); the payment stays pending.
        const amount = tx?.amount !== undefined && tx.amount !== null && tx.amount !== '' ? Number(tx.amount) : null;
        return { ref, event: event('zaincash', txId || ref, 'success', { ...base, type: 'payment.succeeded', amount: Number.isFinite(amount) ? amount : null }) };
      }
      if (status === 'failed' || status === 'cancel' || status === 'cancelled') {
        const type = status === 'failed' ? 'payment.failed' : 'payment.cancelled';
        return { ref, event: event('zaincash', txId || ref, status, { ...base, type, amount: null, payload: { ...base.payload, reason: claims.msg ?? status } }) };
      }
      return { event: null, ref }; // pending → no state change yet
    },
    async refund(input) {
      if (!getCfg()) return { refundId: `zaincash_rf_${input.paymentId.slice(0, 8)}_${Date.now()}` };
      // TODO(merchant): ZainCash exposes no public refund API — reverse the transaction in the merchant portal.
      logger.warn({ gateway: 'zaincash', paymentId: input.paymentId, amount: input.amount }, 'ZainCash refund must be completed manually in the merchant portal');
      return { refundId: `zaincash_manual_${input.providerRef ?? input.paymentId.slice(0, 8)}_${Date.now()}` };
    },
  };
}
