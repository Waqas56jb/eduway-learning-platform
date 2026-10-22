/** Shared helpers for the real Iraqi gateway adapters (ZainCash, FastPay, Qi Card). */
import type { AxiosError } from 'axios';
import { devFlags, env } from '../../../config/env.js';
import { logger } from '../../../config/logger.js';
import { BusinessRuleError } from '../../../common/errors/index.js';
import type { ParsedWebhook } from '../webhook-core.js';

export type Headers = Record<string, string | string[] | undefined>;

export const header = (h: Headers, name: string): string => {
  const v = h[name.toLowerCase()];
  return Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
};

/** Absolute API base used to build gateway callback / notification URLs (PUBLIC_API_URL + API_PREFIX). */
export const publicApiBase = (): string | null => (env.PUBLIC_API_URL ? env.PUBLIC_API_URL.replace(/\/+$/, '') + env.API_PREFIX : null);

export const callbackUrl = (gateway: string, query: Record<string, string> = {}): string => {
  const base = publicApiBase();
  if (!base) throw new BusinessRuleError('PAYMENT_GATEWAY_DISABLED', { gateway, missing: 'PUBLIC_API_URL' });
  const qs = new URLSearchParams(query).toString();
  return `${base}/payments/callback/${gateway}${qs ? `?${qs}` : ''}`;
};
export const webhookUrl = (gateway: string): string => {
  const base = publicApiBase();
  if (!base) throw new BusinessRuleError('PAYMENT_GATEWAY_DISABLED', { gateway, missing: 'PUBLIC_API_URL' });
  return `${base}/payments/webhook/${gateway}`;
};

/** The Iraqi wallet/card gateways settle in Iraqi dinar only (SEC-24). */
export const GATEWAY_CURRENCY = 'IQD';

/** Refuse a checkout in a currency the gateway cannot settle (a USD-priced package must not go through it). */
export function assertGatewayCurrency(gateway: string, currency: string): void {
  if ((currency ?? '').trim().toUpperCase() !== GATEWAY_CURRENCY) throw new BusinessRuleError('PAYMENT_GATEWAY_DISABLED', { gateway, currency });
}

/** Replay window for signed gateway timestamps (SEC-24). */
export const REPLAY_WINDOW_SEC = 5 * 60;

/** Parse a gateway timestamp: unix seconds, unix milliseconds or an ISO string → epoch ms (null = unusable). */
export function timestampMs(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number' || (typeof v === 'string' && /^\d+(\.\d+)?$/.test(v))) {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n < 1e12 ? n * 1000 : n;
  }
  if (typeof v === 'string') {
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

/** True when `ts` lies within ±`windowSec` of now (a missing/unparseable timestamp is NOT fresh). */
export function isFresh(ts: unknown, windowSec = REPLAY_WINDOW_SEC, now = Date.now()): boolean {
  const ms = timestampMs(ts);
  return ms !== null && Math.abs(now - ms) <= windowSec * 1000;
}

/** Development checkout without a merchant contract: the payment is confirmed through the MockGateway (PAY-07). */
export function stubCheckout(gateway: string, ref: string) {
  if (!devFlags.mockPayments) throw new BusinessRuleError('PAYMENT_GATEWAY_DISABLED', { gateway });
  return { providerRef: `${gateway}_dev_${ref}`, redirectUrl: null, deeplink: null };
}

/** Upstream gateway failure → 422 PAYMENT_GATEWAY_DISABLED for the client; details logged (never secrets). */
export function gatewayFailure(gateway: string, op: string, err: unknown): BusinessRuleError {
  const ax = err as AxiosError<unknown>;
  const status = ax.response?.status;
  logger.error({ gateway, op, status, err: ax.message }, 'payment gateway request failed');
  return new BusinessRuleError('PAYMENT_GATEWAY_DISABLED', { gateway, upstreamStatus: status ?? null });
}

export const event = (gateway: string, txId: string, status: string, evt: Omit<ParsedWebhook, 'eventId'>): ParsedWebhook => ({
  eventId: `${gateway}:${txId}:${status}`.slice(0, 200),
  ...evt,
});

/** Strip credential-like keys before a gateway payload is stored in payment_events. */
export function scrub(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (!/password|secret|token|authorization/i.test(k)) out[k] = v;
  return out;
}
