/**
 * Qi Card (Iraq) 3DS payment gateway — follows Qi's public "3DS API" merchant pattern:
 *
 *   create:  POST {base}/api/v1/payment   Basic auth (QICARD_USERNAME:QICARD_SECRET) + header X-Terminal-Id
 *            { requestId, amount, currency, locale, finishPaymentUrl, notificationUrl } → { paymentId, formUrl, status }
 *   status:  GET  {base}/api/v1/payment/{paymentId}/status → { paymentId, requestId, status, amount, … }
 *   refund:  POST {base}/api/v1/payment/{paymentId}/refund { requestId, amount, message }
 *   notify:  Qi POSTs { paymentId, status, … } to notificationUrl → POST /payments/webhook/qicard
 *            (optional RSA signature header verified with QICARD_WEBHOOK_PUBLIC_KEY; the payment status is ALWAYS
 *            re-read from the status API and only that is applied).
 *   finish:  the browser returns to finishPaymentUrl → GET /payments/callback/qicard?ref=<ref> (status re-read,
 *            then redirect to the app).
 *
 * SEC-24: the status API's `amount` must equal the payment total and its `currency` (when reported) the payment
 * currency; a status without an amount never settles a payment. Qi publishes no signed timestamp, so replays are
 * neutralised by the status re-check + idempotent event ids.
 *
 * Hosts: UAT https://uat-sandbox-3ds-api.qi.iq, live https://3ds-api.qi.iq (QICARD_ENV).
 *
 * TODO(merchant): confirm with Qi before go-live —
 *   - API hosts/paths and the auth scheme (Basic auth + X-Terminal-Id) issued for your terminal,
 *   - the status values (assumed SUCCESS / FAILED / CANCELED / AUTHENTICATION_FAILED; others = pending),
 *   - the notification signature: header name (assumed `X-Signature`), algorithm (assumed RSA-SHA256, base64)
 *     and exactly which bytes are signed (assumed the raw JSON body) — until confirmed, leave
 *     QICARD_WEBHOOK_PUBLIC_KEY unset; the status re-check alone is authoritative,
 *   - whether `amount` is in IQD units (assumed) and the refund request fields.
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
  amount?: number | string;
  currency?: string;
}

/** RSA-SHA256 (base64) signature check over the raw body. */
export function verifyQiSignature(publicKey: string, raw: Buffer, signature: string): boolean {
  if (!signature) return false;
  try {
    return createVerify('RSA-SHA256').update(raw).verify(publicKey, signature, 'base64');
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
    if (st === 'SUCCESS') return event('qicard', qiPaymentId, st, { ...base, type: 'payment.succeeded' });
    if (st === 'FAILED' || st === 'AUTHENTICATION_FAILED') return event('qicard', qiPaymentId, st, { ...base, type: 'payment.failed', payload: { ...base.payload, reason: st.toLowerCase() } });
    if (st === 'CANCELED' || st === 'CANCELLED') return event('qicard', qiPaymentId, st, { ...base, type: 'payment.cancelled' });
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
      if (c.publicKey && !verifyQiSignature(c.publicKey, rawBody, header(headers, 'x-signature'))) return null;
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
          { requestId: `rf_${input.paymentId.slice(0, 8)}_${Date.now()}`, amount: input.amount, message: input.reason.slice(0, 200) },
          auth(c),
        );
        return { refundId: String(res.data?.refundId ?? res.data?.paymentId ?? `qicard_rf_${Date.now()}`) };
      } catch (err) {
        throw gatewayFailure('qicard', 'refund', err);
      }
    },
  };
}
