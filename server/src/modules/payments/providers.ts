/**
 * Payment gateway abstraction. Card numbers, CVV and wallet PINs never reach our API — every provider uses a
 * hosted page / wallet deep link and notifies us via a signed webhook (WHK-01).
 *
 *   PaymentProvider   — interface
 *   MockGateway       — dev/test: HMAC-SHA256 webhooks signed with MOCK_GATEWAY_SECRET, instant refunds
 *   ZainCash / FastPay / Qi Card — real adapters (gateways/*.ts), live when their credentials are set
 *   HostedGateway     — stub for AsiaHawala and Visa/Mastercard: HMAC webhook verification with the merchant
 *                       secret; checkout/refund calls are integration points (fails closed when unconfigured).
 * A real gateway without credentials behaves like the stub: production rejects it (PAYMENT_GATEWAY_DISABLED),
 * development confirms it through the MockGateway (PAY-07). See docs/PROVIDERS.md.
 */
import { devFlags, env } from '../../config/env.js';
import { BusinessRuleError, UnauthorizedError } from '../../common/errors/index.js';
import { safeEqual } from '../../common/utils/crypto.js';
import { isFresh, REPLAY_WINDOW_SEC } from './gateways/common.js';
import { createFastPay } from './gateways/fastpay.js';
import { createQiCard } from './gateways/qicard.js';
import { createZainCash } from './gateways/zaincash.js';
import { hmacHex } from './hmac.js';
import type { ParsedWebhook, WebhookEventType } from './webhook-core.js';

export { hmacHex } from './hmac.js';

export const GATEWAYS = ['zaincash', 'fastpay', 'qicard', 'asiahawala', 'visa', 'mock'] as const;
export type Gateway = (typeof GATEWAYS)[number];

/** Client aliases → canonical ids (web zain/card/asia, app mastercard; card brands map to `visa`). */
export const GATEWAY_ALIASES: Record<string, Gateway> = {
  zain: 'zaincash', zaincash: 'zaincash', fastpay: 'fastpay', qi: 'qicard', qicard: 'qicard', asia: 'asiahawala', asiahawala: 'asiahawala',
  card: 'visa', visa: 'visa', mastercard: 'visa', master: 'visa', mock: 'mock',
};
export const canonicalGateway = (id: string): Gateway | null => GATEWAY_ALIASES[id.toLowerCase()] ?? null;

export interface CheckoutInput {
  paymentId: string;
  ref: string;
  amount: number;
  currency: string;
  returnUrl: string | null;
  returnScheme: string | null;
  walletPhone: string | null;
}
export interface CheckoutResult {
  providerRef: string | null;
  redirectUrl: string | null;
  deeplink: string | null;
}

export interface PaymentProvider {
  id: Gateway;
  /** True when the provider can take real payments (credentials present) or is the dev mock. */
  configured(): boolean;
  createCheckout(input: CheckoutInput): Promise<CheckoutResult>;
  verifySignature(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): boolean;
  parseWebhook(body: Record<string, unknown>): ParsedWebhook;
  refund(input: { paymentId: string; providerRef: string | null; amount: number; reason: string }): Promise<{ refundId: string }>;
  /**
   * Async webhook verification for gateways whose notifications are unsigned or must be re-checked against the
   * gateway API. Returns null when the notification cannot be trusted; `event: null` = trusted but no state change.
   */
  verifyWebhook?(input: { rawBody: Buffer; headers: Record<string, string | string[] | undefined>; body: Record<string, unknown> }): Promise<{ event: ParsedWebhook | null } | null>;
  /** Browser redirect callback (GET/POST /payments/callback/:provider). null = invalid / untrusted. */
  handleCallback?(input: {
    query: Record<string, unknown>;
    body: Record<string, unknown>;
    headers: Record<string, string | string[] | undefined>;
    /** Resolve our payment ref → stored provider reference. */
    lookupProviderRef?: (ref: string) => Promise<string | null>;
  }): Promise<CallbackResult | null>;
}

export interface CallbackResult {
  event: ParsedWebhook | null;
  /** Our payment ref when known (used to redirect the browser back to the app). */
  ref?: string;
  providerRef?: string;
}

const header = (h: Record<string, string | string[] | undefined>, name: string): string => {
  const v = h[name.toLowerCase()];
  return Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
};

/** MockGateway secret (derived from JWT_REFRESH_SECRET when MOCK_GATEWAY_SECRET is unset). */
export const mockSecret = (): string => env.MOCK_GATEWAY_SECRET ?? hmacHex(env.JWT_REFRESH_SECRET, 'eduway-mock-gateway');

/**
 * Generic signed-JSON webhook `{ id, type, created?, data: { paymentId|orderId, providerRef|transactionId, amount, currency? } }`.
 * SEC-24: the HMAC covers the raw body, so `created` (unix seconds/ms or ISO) is trusted as the send time and must lie
 * within REPLAY_WINDOW_SEC of now. `requireTimestamp` (real hosted gateways) rejects events without one.
 */
export function parseGeneric(body: Record<string, unknown>, requireTimestamp = false): ParsedWebhook {
  const created = body.created ?? body.timestamp;
  if ((requireTimestamp || (created !== undefined && created !== null)) && !isFresh(created, REPLAY_WINDOW_SEC)) throw new UnauthorizedError('SIGNATURE_INVALID');
  const type = String(body.type ?? body.event ?? '') as WebhookEventType;
  const valid: WebhookEventType[] = ['payment.succeeded', 'payment.failed', 'payment.cancelled'];
  const data = (body.data ?? {}) as Record<string, unknown>;
  const eventId = String(body.id ?? body.eventId ?? '');
  if (!eventId || !valid.includes(type)) throw new BusinessRuleError('INVALID_TRANSITION', { event: type || null });
  return {
    eventId,
    type,
    paymentId: (data.paymentId as string | undefined) ?? (data.orderId as string | undefined) ?? null,
    providerRef: (data.providerRef as string | undefined) ?? (data.transactionId as string | undefined) ?? null,
    amount: data.amount === undefined || data.amount === null || data.amount === '' ? null : Number(data.amount),
    currency: typeof data.currency === 'string' && data.currency ? data.currency.toUpperCase() : null,
    payload: body,
  };
}

export const mockGateway: PaymentProvider = {
  id: 'mock',
  configured: () => devFlags.mockPayments,
  async createCheckout(input) {
    return { providerRef: `mock_${input.ref}`, redirectUrl: null, deeplink: null };
  },
  verifySignature(raw, headers) {
    const sig = header(headers, 'x-signature').replace(/^sha256=/, '');
    return !!sig && safeEqual(sig, hmacHex(mockSecret(), raw));
  },
  parseWebhook: (body) => parseGeneric(body),
  async refund(input) {
    return { refundId: `mock_rf_${input.paymentId.slice(0, 8)}_${Date.now()}` };
  },
};

type StubGateway = 'asiahawala' | 'visa';
const CREDS: Record<StubGateway, () => { id?: string; secret?: string; checkoutBase: string }> = {
  asiahawala: () => ({ id: env.ASIAHAWALA_MERCHANT_ID, secret: env.ASIAHAWALA_SECRET, checkoutBase: 'https://pay.asiahawala.com/checkout' }),
  visa: () => ({ id: env.VISA_MERCHANT_ID, secret: env.VISA_SECRET, checkoutBase: 'https://checkout.eduway.iq/card' }),
};

function hostedGateway(id: StubGateway): PaymentProvider {
  const creds = CREDS[id];
  return {
    id,
    configured: () => !!(creds().id && creds().secret),
    async createCheckout(input) {
      const c = creds();
      if (!c.id || !c.secret) {
        if (!devFlags.mockPayments) throw new BusinessRuleError('PAYMENT_GATEWAY_DISABLED', { gateway: id });
        // Development: no merchant contract → the payment is confirmed through the MockGateway (PAY-07).
        return { providerRef: `${id}_dev_${input.ref}`, redirectUrl: null, deeplink: null };
      }
      // Integration point: call the gateway's "create transaction" API with a signed payload.
      const token = hmacHex(c.secret, `${c.id}|${input.ref}|${input.amount}`);
      const qs = new URLSearchParams({ merchant: c.id, order: input.ref, amount: String(input.amount), currency: input.currency, sig: token, ...(input.returnUrl ? { return: input.returnUrl } : {}) });
      return { providerRef: input.ref, redirectUrl: `${c.checkoutBase}?${qs.toString()}`, deeplink: id === 'asiahawala' ? `${id}://pay?${qs.toString()}` : null };
    },
    verifySignature(raw, headers) {
      const secret = creds().secret;
      const sig = header(headers, 'x-signature').replace(/^sha256=/, '');
      // Without a merchant secret, real-gateway webhooks are rejected (fail closed).
      return !!secret && !!sig && safeEqual(sig, hmacHex(secret, raw));
    },
    parseWebhook: (body) => parseGeneric(body, true),
    async refund(input) {
      if (!creds().secret && !devFlags.mockPayments) throw new BusinessRuleError('PAYMENT_GATEWAY_DISABLED', { gateway: id });
      // Integration point: gateway refund API. Development returns a synthetic id.
      return { refundId: `${id}_rf_${input.paymentId.slice(0, 8)}_${Date.now()}` };
    },
  };
}

const REGISTRY: Record<Gateway, PaymentProvider> = {
  mock: mockGateway,
  zaincash: createZainCash(),
  fastpay: createFastPay(),
  qicard: createQiCard(),
  asiahawala: hostedGateway('asiahawala'),
  visa: hostedGateway('visa'),
};

export function getProvider(id: string): PaymentProvider | null {
  const g = canonicalGateway(id);
  return g ? REGISTRY[g] : null;
}

/**
 * How a gateway currently takes payments: `live` (real money), `sandbox` (real gateway API in its test/staging/UAT
 * environment — no real money), `mock` (dev stub confirmed through the MockGateway) or `disabled`.
 * Shown as the "Sandbox / test mode" badge in the admin settings and the student checkout.
 */
export type GatewayMode = 'live' | 'sandbox' | 'mock' | 'disabled';
const SANDBOX_ENV: Partial<Record<Gateway, () => boolean>> = {
  zaincash: () => env.ZAINCASH_ENV === 'test',
  fastpay: () => env.FASTPAY_ENV === 'staging',
  qicard: () => env.QICARD_ENV === 'uat',
};
export function gatewayMode(id: string): GatewayMode {
  const g = canonicalGateway(id);
  if (!g) return 'disabled';
  if (g === 'mock') return devFlags.mockPayments ? 'mock' : 'disabled';
  if (REGISTRY[g].configured()) return SANDBOX_ENV[g]?.() ? 'sandbox' : 'live';
  return devFlags.mockPayments ? 'mock' : 'disabled';
}

/** Sign a body the way the MockGateway does (used by PAY-07 and tests). */
export function signMock(body: string): string {
  return `sha256=${hmacHex(mockSecret(), body)}`;
}
