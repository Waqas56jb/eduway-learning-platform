/**
 * ZainCash (Iraq). Two API generations are supported, selected by ZAINCASH_API_VERSION (default v2):
 *
 * ── v2 "Payment Gateway API" (current, https://docs.zaincash.iq) ──
 *   0. auth:     POST {base}/oauth2/token (form: grant_type=client_credentials, client_id, client_secret, scope)
 *                → { access_token, expires_in } (cached until shortly before expiry)
 *   1. init:     POST {base}/api/v2/payment-gateway/transaction/init (Bearer)
 *                { language, externalReferenceId(uuid), orderId, serviceType, amount{value,currency:IQD},
 *                  customer{phone}?, redirectUrls{successUrl,failureUrl} }
 *                → { status, transactionDetails{transactionId,…}, redirectUrl }
 *   2. redirect: the student pays on redirectUrl (ZainCash-hosted page: wallet number → OTP → PIN)
 *   3. callback: ZainCash redirects the browser to successUrl|failureUrl ?token=<HS256 JWT signed with the client
 *                secret> { eventType, eventId, timestamp, data{ transactionId, orderId, currentStatus, amount{…} } }
 *                → GET /payments/callback/zaincash
 *      webhook:  POST { webhook_token: <same JWT> } → /payments/webhook/zaincash (production only; the URL is
 *                registered with ZainCash during onboarding — it cannot be tested in UAT)
 *   4. inquiry:  GET {base}/api/v2/payment-gateway/transaction/inquiry/{transactionId} (Bearer) → { status,
 *                transactionDetails{ orderId, amount{value,currency} } } — the token is never trusted on its own:
 *                every callback/webhook is re-read here and only the inquiry result (status + amount) is applied.
 *   refund:      POST {base}/api/v2/payment-gateway/transaction/partial-reverse { transactionId, amount, reason≤44 }
 *                → { status: COMPLETED|FAILED, reversalReferenceId } (a 200 can still be FAILED — always checked).
 *   Hosts: UAT https://pg-api-uat.zaincash.iq, live https://pg-api.zaincash.iq (or ZAINCASH_API_URL).
 *   Statuses: SUCCESS|COMPLETED → paid; FAILED|EXPIRED → failed; PENDING|OTP_SENT|CUSTOMER_AUTHENTICATION_REQUIRED
 *   → no change; REFUNDED|PARTIALLY_REFUNDED → no change (refunds are driven by our own refund flow).
 *   UAT test credentials are published in the "Test Credentials" section of docs.zaincash.iq.
 *
 * ── v1 legacy JWT API (test.zaincash.iq / api.zaincash.iq) ──
 *   init POST {base}/transaction/init (form: token=HS256{amount,serviceType,msisdn,orderId,redirectUrl}, merchantId,
 *   lang) → { id }; pay {base}/transaction/pay?id=…; callback ?token=HS256{status,orderid,id}; status POST
 *   {base}/transaction/get. Kept for merchants still on v1 credentials (needs ZAINCASH_MSISDN).
 *
 * Both: IQD only (other currencies are refused at checkout and every event carries IQD, SEC-24); a success without a
 * confirmed amount carries none and is never applied; event ids `zaincash:<txId>:<status>` make the redirect and the
 * webhook idempotent with each other.
 */
import { randomUUID } from 'node:crypto';
import axios, { type AxiosInstance } from 'axios';
import jwt from 'jsonwebtoken';
import { env, type Env } from '../../../config/env.js';
import { logger } from '../../../config/logger.js';
import { hmacHex } from '../hmac.js';
import { safeEqual } from '../../../common/utils/crypto.js';
import type { PaymentProvider } from '../providers.js';
import type { ParsedWebhook } from '../webhook-core.js';
import { assertGatewayCurrency, callbackUrl, event, gatewayFailure, GATEWAY_CURRENCY, header, scrub, stubCheckout } from './common.js';

/** Max age of a callback token (ZainCash signs it when it redirects the browser back). */
export const ZAINCASH_CALLBACK_MAX_AGE_SEC = 60 * 60;

export type ZainCashApiVersion = 'v1' | 'v2';

export interface ZainCashConfig {
  /** Defaults to v1 when omitted (explicit configs built by tests / older callers). */
  apiVersion?: ZainCashApiVersion;
  /** v1 merchant id | v2 OAuth client id. */
  merchantId: string;
  /** v1 merchant secret | v2 OAuth client secret (also the HS256 key of redirect/webhook tokens). */
  secret: string;
  /** v1 merchant wallet MSISDN (unused by v2). */
  msisdn: string;
  baseUrl: string;
  lang: string;
  serviceType: string;
}

/** v1 hosts. */
export const ZAINCASH_HOSTS = { test: 'https://test.zaincash.iq', live: 'https://api.zaincash.iq' } as const;
/** v2 hosts (live host is confirmed by ZainCash at go-live; override with ZAINCASH_API_URL). */
export const ZAINCASH_V2_HOSTS = { test: 'https://pg-api-uat.zaincash.iq', live: 'https://pg-api.zaincash.iq' } as const;
export const ZAINCASH_V2_SCOPE = 'payment:read payment:write reverse:read reverse:write';

const requiredVars = (e: Env) =>
  (e.ZAINCASH_API_VERSION === 'v1' ? (['ZAINCASH_MERCHANT_ID', 'ZAINCASH_SECRET', 'ZAINCASH_MSISDN', 'PUBLIC_API_URL'] as const) : (['ZAINCASH_MERCHANT_ID', 'ZAINCASH_SECRET', 'PUBLIC_API_URL'] as const));

export function zainCashConfig(e: Env): ZainCashConfig | null {
  if (requiredVars(e).some((k) => !e[k]) || !e.ZAINCASH_MERCHANT_ID || !e.ZAINCASH_SECRET) return null;
  const apiVersion = e.ZAINCASH_API_VERSION;
  const hosts = apiVersion === 'v1' ? ZAINCASH_HOSTS : ZAINCASH_V2_HOSTS;
  return {
    apiVersion,
    merchantId: e.ZAINCASH_MERCHANT_ID,
    secret: e.ZAINCASH_SECRET,
    msisdn: e.ZAINCASH_MSISDN ?? '',
    baseUrl: (e.ZAINCASH_API_URL ?? hosts[e.ZAINCASH_ENV]).replace(/\/+$/, ''),
    lang: e.ZAINCASH_LANG,
    serviceType: e.ZAINCASH_SERVICE_TYPE,
  };
}
export const zainCashMissing = (e: Env): string[] => requiredVars(e).filter((k) => !e[k]);

interface CallbackClaims {
  iat?: number;
  status?: string;
  orderid?: string;
  orderId?: string;
  id?: string;
  operationid?: string;
  msg?: string;
}

/** v2 redirect / webhook token payload. */
interface V2Claims {
  iat?: number;
  eventType?: string;
  eventId?: string;
  timestamp?: string;
  data?: { transactionId?: string; orderId?: string; currentStatus?: string; errorMessage?: string | null; amount?: { value?: number | string; currency?: string } };
}

/** v2 inquiry response. */
interface V2Inquiry {
  status?: string;
  transactionDetails?: { transactionId?: string; orderId?: string; amount?: { value?: number | string; currency?: string } };
}

/** Customer wallet for the v2 init (`9647XXXXXXXXX`), from +9647…, 9647… or 07…; anything else is omitted. */
export function zainCashMsisdn(phone: string | null | undefined): string | null {
  return iraqiWalletMsisdn(phone);
}

/**
 * Iraqi mobile-wallet number (ZainCash / FastPay / AsiaHawala are Iraqi wallets) in any common form →
 * `9647XXXXXXXXX`, else null. Accepts 07XXXXXXXXX, 7XXXXXXXXX, 9647…, +964 7…, 00964…, spaces / dashes /
 * brackets, and Arabic-Indic or Persian digits.
 */
export function iraqiWalletMsisdn(phone: string | null | undefined): string | null {
  // Arabic-Indic / Persian digits → 0-9, then keep digits only.
  const d = Array.from(phone ?? '', toAsciiDigit).join('').replace(/\D/g, '');
  const n = d.startsWith('00964') ? d.slice(2) : d.startsWith('964') ? d : d.startsWith('07') && d.length === 11 ? `964${d.slice(1)}` : d.startsWith('7') && d.length === 10 ? `964${d}` : d;
  return /^9647\d{9}$/.test(n) ? n : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SUCCESS_STATES = ['success', 'completed'];

export function createZainCash(getCfg: () => ZainCashConfig | null = () => zainCashConfig(env), http: AxiosInstance = axios): PaymentProvider {
  const form = (data: Record<string, string>) => new URLSearchParams(data).toString();
  const formHeaders = { 'Content-Type': 'application/x-www-form-urlencoded' };
  const isV2 = (c: ZainCashConfig) => c.apiVersion === 'v2';

  // ── v2 OAuth token cache (per host + client) ──
  const tokens = new Map<string, { token: string; expiresAt: number }>();
  async function accessToken(c: ZainCashConfig): Promise<string> {
    const key = `${c.baseUrl}|${c.merchantId}`;
    const hit = tokens.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.token;
    const res = await http.post<{ access_token?: string; expires_in?: number }>(
      `${c.baseUrl}/oauth2/token`,
      form({ grant_type: 'client_credentials', client_id: c.merchantId, client_secret: c.secret, scope: ZAINCASH_V2_SCOPE }),
      { headers: formHeaders, timeout: 15_000 },
    );
    const token = res.data?.access_token;
    if (!token) throw new Error('no access_token');
    const ttl = Math.max(60, Number(res.data.expires_in ?? 3600) - 120);
    tokens.set(key, { token, expiresAt: Date.now() + ttl * 1000 });
    return token;
  }
  const bearer = async (c: ZainCashConfig) => ({ Authorization: `Bearer ${await accessToken(c)}`, 'Content-Type': 'application/json' });

  async function inquiry(c: ZainCashConfig, txId: string): Promise<V2Inquiry | null> {
    try {
      const res = await http.get<V2Inquiry>(`${c.baseUrl}/api/v2/payment-gateway/transaction/inquiry/${encodeURIComponent(txId)}`, { headers: await bearer(c), timeout: 15_000 });
      return res.data ?? null;
    } catch (err) {
      tokens.clear(); // an expired/revoked token must not stick
      logger.warn({ gateway: 'zaincash', err: (err as Error).message }, 'zaincash inquiry failed');
      return null;
    }
  }

  /** v2: verify the HS256 token, then apply ONLY what the inquiry API reports. null = untrusted. */
  async function v2Verify(c: ZainCashConfig, token: string): Promise<{ event: ParsedWebhook | null; ref?: string; providerRef?: string } | null> {
    let claims: V2Claims;
    try {
      claims = jwt.verify(token, c.secret, { algorithms: ['HS256'] }) as V2Claims;
    } catch {
      return null; // bad signature / expired
    }
    if (typeof claims.iat === 'number' && Math.abs(Date.now() / 1000 - claims.iat) > ZAINCASH_CALLBACK_MAX_AGE_SEC) return null;
    const txId = String(claims.data?.transactionId ?? '');
    const ref = String(claims.data?.orderId ?? '');
    if (!txId) return null;
    const q = await inquiry(c, txId);
    // Gateway unreachable → trusted token but no state change yet (the payment stays pending; never granted blind).
    if (!q) return { event: null, ref: ref || undefined, providerRef: txId };
    const apiRef = String(q.transactionDetails?.orderId ?? '');
    if (apiRef && ref && apiRef !== ref) {
      logger.warn({ gateway: 'zaincash', txId }, 'zaincash token orderId does not match the inquiry');
      return null;
    }
    const status = String(q.status ?? '').toLowerCase();
    const amt = q.transactionDetails?.amount;
    const amount = amt?.value === undefined || amt.value === null || amt.value === '' ? null : Number(amt.value);
    const currency = amt?.currency ? String(amt.currency).toUpperCase() : GATEWAY_CURRENCY;
    const base = {
      paymentId: null,
      providerRef: txId,
      currency,
      amount: amount === null ? null : Number.isFinite(amount) ? amount : Number.NaN,
      payload: { gateway: 'zaincash', apiVersion: 'v2', eventType: claims.eventType ?? null, tokenStatus: claims.data?.currentStatus ?? null, ...scrub(q as Record<string, unknown>) },
    };
    const out = { ref: apiRef || ref || undefined, providerRef: txId };
    if (SUCCESS_STATES.includes(status)) return { ...out, event: event('zaincash', txId, 'success', { ...base, type: 'payment.succeeded' }) };
    if (status === 'failed' || status === 'expired') {
      const reason = status === 'expired' ? 'expired' : String(claims.data?.errorMessage ?? 'failed');
      return { ...out, event: event('zaincash', txId, status, { ...base, type: 'payment.failed', amount: null, payload: { ...base.payload, reason } }) };
    }
    return { ...out, event: null }; // pending / OTP_SENT / refunded states → no change
  }

  // ── v1 status API ──
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

  async function v2Checkout(c: ZainCashConfig, input: Parameters<PaymentProvider['createCheckout']>[0]) {
    const phone = zainCashMsisdn(input.walletPhone);
    const back = callbackUrl('zaincash');
    let data: { status?: string; transactionDetails?: { transactionId?: string }; redirectUrl?: string; message?: string };
    try {
      data = (
        await http.post<typeof data>(
          `${c.baseUrl}/api/v2/payment-gateway/transaction/init`,
          {
            language: c.lang === 'en' ? 'en' : 'ar',
            externalReferenceId: UUID_RE.test(input.paymentId) ? input.paymentId : randomUUID(),
            orderId: input.ref,
            serviceType: c.serviceType.replace(/[+,]/g, ' ').trim().slice(0, 100) || 'EDUWAY',
            amount: { value: String(input.amount), currency: GATEWAY_CURRENCY },
            ...(phone ? { customer: { phone } } : {}),
            redirectUrls: { successUrl: back, failureUrl: back },
          },
          { headers: await bearer(c), timeout: 20_000 },
        )
      ).data;
    } catch (err) {
      tokens.clear();
      throw gatewayFailure('zaincash', 'init', err);
    }
    const txId = data?.transactionDetails?.transactionId;
    if (!txId || !data.redirectUrl) throw gatewayFailure('zaincash', 'init', new Error(data?.message ?? `no transaction (status ${data?.status ?? '?'})`));
    return { providerRef: txId, redirectUrl: data.redirectUrl, deeplink: null };
  }

  return {
    id: 'zaincash',
    configured: () => !!getCfg(),
    async createCheckout(input) {
      const c = getCfg();
      if (!c) return stubCheckout('zaincash', input.ref);
      assertGatewayCurrency('zaincash', input.currency);
      if (isV2(c)) return v2Checkout(c, input);
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
    // v1 has no server-to-server webhook (results arrive via the signed redirect token). The legacy HMAC header
    // path stays for gateway-side tooling that posts with X-Signature = HMAC(secret, body).
    verifySignature(raw, headers) {
      const secret = getCfg()?.secret ?? env.ZAINCASH_SECRET;
      const sig = header(headers, 'x-signature').replace(/^sha256=/, '');
      return !!secret && !!sig && safeEqual(sig, hmacHex(secret, raw));
    },
    parseWebhook() {
      throw new Error('zaincash: use the redirect callback');
    },
    /** v2 webhook `{ webhook_token }` → token verified + inquiry re-check. v1 has no webhook → untrusted. */
    async verifyWebhook({ body }) {
      const c = getCfg();
      const token = String(body.webhook_token ?? '');
      if (!c || !isV2(c) || !token) return null;
      const r = await v2Verify(c, token);
      return r ? { event: r.event } : null;
    },
    async handleCallback({ query, body }) {
      const c = getCfg();
      const token = String(query.token ?? body.token ?? '');
      if (!c || !token) return null;
      if (isV2(c)) return v2Verify(c, token);
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
        if (tx && tx.status && !SUCCESS_STATES.includes(String(tx.status).toLowerCase())) {
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
      const c = getCfg();
      if (!c) return { refundId: `zaincash_rf_${input.paymentId.slice(0, 8)}_${Date.now()}` };
      if (!isV2(c)) {
        // v1 exposes no refund API — reverse the transaction in the merchant portal.
        logger.warn({ gateway: 'zaincash', paymentId: input.paymentId, amount: input.amount }, 'ZainCash refund must be completed manually in the merchant portal');
        return { refundId: `zaincash_manual_${input.providerRef ?? input.paymentId.slice(0, 8)}_${Date.now()}` };
      }
      if (!input.providerRef) throw gatewayFailure('zaincash', 'refund', new Error('missing ZainCash transactionId'));
      try {
        // partial-reverse covers full and partial amounts (cumulative refunds may not exceed the original).
        const res = await http.post<{ status?: string; reversalReferenceId?: string; id?: number | string; errorMessage?: string | null }>(
          `${c.baseUrl}/api/v2/payment-gateway/transaction/partial-reverse`,
          { transactionId: input.providerRef, amount: input.amount, reason: input.reason.replace(/,/g, ' ').trim().slice(0, 44) || 'refund' },
          { headers: await bearer(c), timeout: 20_000 },
        );
        if (String(res.data?.status ?? '').toUpperCase() !== 'COMPLETED') throw new Error(res.data?.errorMessage ?? `refund ${res.data?.status ?? 'rejected'}`);
        return { refundId: String(res.data.reversalReferenceId ?? res.data.id ?? `zaincash_rf_${Date.now()}`) };
      } catch (err) {
        tokens.clear();
        throw gatewayFailure('zaincash', 'refund', err);
      }
    },
  };
}

/** Arabic-Indic (U+0660–U+0669) or Persian (U+06F0–U+06F9) digit → ASCII digit; anything else unchanged. */
function toAsciiDigit(c: string): string {
  const k = c.charCodeAt(0);
  if (k >= 0x0660 && k <= 0x0669) return String(k - 0x0660);
  if (k >= 0x06f0 && k <= 0x06f9) return String(k - 0x06f0);
  return c;
}
