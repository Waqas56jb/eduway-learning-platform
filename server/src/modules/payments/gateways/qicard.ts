/**
 * Qi Card (Iraq) 3DS payment gateway — Qi's public "3DS API" (developers-gate.qi.iq, v2.0.x):
 *
 *   create:  POST {base}/api/v1/payment   Basic auth (QICARD_USERNAME:QICARD_SECRET) + header X-Terminal-Id
 *            { requestId, amount, currency, locale, finishPaymentUrl, notificationUrl }
 *            → { requestId, paymentId, status: 'CREATED', canceled, amount, currency, creationDate, formUrl }
 *            requestId must be unique per terminal and short (a 40+ char id is refused: "requestId is too long.").
 *   status:  GET  {base}/api/v1/payment/{paymentId}/status → same payment object
 *   refund:  POST {base}/api/v1/payment/{paymentId}/refund { requestId, amount, message }
 *   notify:  Qi POSTs the payment object to notificationUrl → POST /payments/webhook/qicard (must answer 200 or Qi
 *            retries). Optional X-Signature: base64 RSA-SHA256 over `paymentId|amount.000|currency|creationDate|status`
 *            verified with Qi's public key (QICARD_WEBHOOK_PUBLIC_KEY, requested from Qi support). The payment status
 *            is ALWAYS re-read from the status API and only that is applied.
 *   finish:  the browser returns to finishPaymentUrl → GET /payments/callback/qicard?ref=<ref> (status re-read,
 *            then redirect to the app).
 *
 * Statuses: SUCCESS → paid; FAILED / AUTHENTICATION_FAILED → failed; `canceled: true` (or CANCELED) → cancelled;
 * CREATED / FORM_SHOWED / … → pending (no change).
 *
 * SEC-24: the status API's `amount` must equal the payment total and its `currency` (when reported) the payment
 * currency; a status without an amount never settles a payment. Qi publishes no signed timestamp, so replays are
 * neutralised by the status re-check + idempotent event ids.
 *
 * Hosts: UAT https://uat-sandbox-3ds-api.qi.iq, live https://3ds-api.qi.iq (QICARD_ENV). Qi publishes a public
 * sandbox terminal, Basic-auth user and test cards (static 3DS OTP) on developers-gate.qi.iq → "Sandbox Environment".
 *
 * TODO(merchant): confirm with Qi before go-live — the live host and terminal credentials, and the webhook public key.
 */
import axios, { type AxiosInstance } from 'axios';
import { createVerify } from 'node:crypto';
import { env, type Env } from '../../../config/env.js';
import { logger } from '../../../config/logger.js';
import type { PaymentProvider } from '../providers.js';
import type { ParsedWebhook } from '../webhook-core.js';
import { assertGatewayCurrency, callbackUrl, event, gatewayFailure, header, scrub, stubCheckout, webhookUrl } from './common.js';

export interface QiConfig {
  terminalId: string;
  username: string;
  password: string;
  baseUrl: string;
  publicKey?: string;
}

export const QI_HOSTS = { uat: 'https://uat-sandbox-3ds-api.qi.iq', live: 'https://3ds-api.qi.iq' } as const;

export function qiConfig(e: Env): QiConfig | null {
  if (!e.QICARD_TERMINAL_ID || !e.QICARD_USERNAME || !e.QICARD_SECRET || !e.PUBLIC_API_URL) return null;
  return { terminalId: e.QICARD_TERMINAL_ID, username: e.QICARD_USERNAME, password: e.QICARD_SECRET, baseUrl: QI_HOSTS[e.QICARD_ENV], publicKey: e.QICARD_WEBHOOK_PUBLIC_KEY?.replace(/\\n/g, '\n') };
}
export const qiMissing = (e: Env): string[] => (['QICARD_TERMINAL_ID', 'QICARD_USERNAME', 'QICARD_SECRET', 'PUBLIC_API_URL'] as const).filter((k) => !e[k]);

interface QiStatus {
  paymentId?: string;
  requestId?: string;
  status?: string;
  canceled?: boolean;
  amount?: number | string;
  currency?: string;
  creationDate?: string;
}

/** The string Qi signs for a webhook (docs → Webhook Verification): `paymentId|amount.000|currency|creationDate|status`. */
export function qiSignatureString(body: Record<string, unknown>): string {
  const f = (v: unknown) => (v === undefined || v === null || v === '' ? '-' : String(v));
  const amount = body.amount ? `${String(body.amount)}.000` : '-';
  return [f(body.paymentId), amount, f(body.currency), f(body.creationDate), f(body.status)].join('|');
}

/** RSA-SHA256 (base64) signature check over `data` (the documented field string, or a raw body). */
export function verifyQiSignature(publicKey: string, data: Buffer | string, signature: string): boolean {
  if (!signature) return false;
  try {
    return createVerify('RSA-SHA256').update(data).verify(publicKey, signature.replace(/\s+/g, ''), 'base64');
  } catch {
    return false;
  }
}

export function createQiCard(getCfg: () => QiConfig | null = () => qiConfig(env), http: AxiosInstance = axios): PaymentProvider {
  const auth = (c: QiConfig) => ({ auth: { username: c.username, password: c.password }, headers: { 'X-Terminal-Id': c.terminalId, 'Content-Type': 'application/json' }, timeout: 15_000 });

  async function status(c: QiConfig, paymentId: string): Promise<QiStatus | null> {
    try {
      return (await http.get<QiStatus>(`${c.baseUrl}/api/v1/payment/${encodeURIComponent(paymentId)}/status`, auth(c))).data ?? null;
    } catch (err) {
      logger.warn({ gateway: 'qicard', err: (err as Error).message }, 'qi status check failed');
      return null;
    }
  }

  function toEvent(s: QiStatus, qiPaymentId: string): ParsedWebhook | null {
    const st = String(s.status ?? '').toUpperCase();
    const amount = s.amount === undefined || s.amount === null || s.amount === '' ? null : Number(s.amount);
    const base = { paymentId: null, providerRef: qiPaymentId, amount: amount === null ? null : Number.isFinite(amount) ? amount : Number.NaN, currency: s.currency ? String(s.currency).toUpperCase() : null, payload: { gateway: 'qicard', ...scrub(s as Record<string, unknown>) } };
    if (st === 'SUCCESS' && s.canceled !== true) return event('qicard', qiPaymentId, st, { ...base, type: 'payment.succeeded' });
    if (st === 'FAILED' || st === 'AUTHENTICATION_FAILED') return event('qicard', qiPaymentId, st, { ...base, type: 'payment.failed', payload: { ...base.payload, reason: st.toLowerCase() } });
    if (st === 'CANCELED' || st === 'CANCELLED' || s.canceled === true) return event('qicard', qiPaymentId, 'CANCELED', { ...base, type: 'payment.cancelled' });
    return null;
  }

  return {
    id: 'qicard',
    configured: () => !!getCfg(),
    async createCheckout(input) {
      const c = getCfg();
      if (!c) return stubCheckout('qicard', input.ref);
      assertGatewayCurrency('qicard', input.currency);
      let data: { paymentId?: string; formUrl?: string };
      try {
        data = (
          await http.post<typeof data>(
            `${c.baseUrl}/api/v1/payment`,
            {
              requestId: input.ref,
              amount: input.amount,
              currency: input.currency,
              locale: 'ar_IQ',
              finishPaymentUrl: callbackUrl('qicard', { ref: input.ref }),
              notificationUrl: webhookUrl('qicard'),
            },
            auth(c),
          )
        ).data;
      } catch (err) {
        throw gatewayFailure('qicard', 'create', err);
      }
      if (!data?.paymentId || !data.formUrl) throw gatewayFailure('qicard', 'create', new Error('missing paymentId/formUrl'));
      return { providerRef: data.paymentId, redirectUrl: data.formUrl, deeplink: null };
    },
    verifySignature: () => false,
    parseWebhook() {
      throw new Error('qicard: use verifyWebhook');
    },
    async verifyWebhook({ rawBody, headers, body }) {
      const c = getCfg();
      const qiPaymentId = String(body.paymentId ?? '');
      if (!c || !qiPaymentId) return null;
      if (c.publicKey) {
        const sig = header(headers, 'x-signature');
        if (!verifyQiSignature(c.publicKey, qiSignatureString(body), sig) && !verifyQiSignature(c.publicKey, rawBody, sig)) return null;
      }
      const s = await status(c, qiPaymentId);
      if (!s) return null;
      return { event: toEvent(s, qiPaymentId) };
    },
    async handleCallback({ query, body, lookupProviderRef }) {
      const c = getCfg();
      const ref = String(query.ref ?? '');
      const qiPaymentId = String(query.paymentId ?? body.paymentId ?? '') || (ref ? ((await lookupProviderRef?.(ref)) ?? '') : '');
      if (!c || !qiPaymentId) return null;
      const s = await status(c, qiPaymentId);
      return { event: s ? toEvent(s, qiPaymentId) : null, ref: ref || undefined, providerRef: qiPaymentId };
    },
    async refund(input) {
      const c = getCfg();
      if (!c) return { refundId: `qicard_rf_${input.paymentId.slice(0, 8)}_${Date.now()}` };
      if (!input.providerRef) throw gatewayFailure('qicard', 'refund', new Error('missing Qi paymentId'));
      try {
        const res = await http.post<{ refundId?: string; paymentId?: string; status?: string }>(
          `${c.baseUrl}/api/v1/payment/${encodeURIComponent(input.providerRef)}/refund`,
          { requestId: `rf-${input.paymentId.slice(0, 8)}-${Date.now().toString(36)}`, amount: input.amount, message: input.reason.slice(0, 200) },
          auth(c),
        );
        if (res.data?.status && String(res.data.status).toUpperCase() === 'FAILED') throw new Error('refund FAILED');
        return { refundId: String(res.data?.refundId ?? res.data?.paymentId ?? `qicard_rf_${Date.now()}`) };
      } catch (err) {
        throw gatewayFailure('qicard', 'refund', err);
      }
    },
  };
}
