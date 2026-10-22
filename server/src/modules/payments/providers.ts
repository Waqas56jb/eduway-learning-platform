/**
 * Payment gateway abstraction. Card numbers, CVV and wallet PINs never reach our API — every provider uses a
 * hosted page / wallet deep link and notifies us via a signed webhook (WHK-01).
 *
 *   PaymentProvider   — interface
 *   MockGateway       — dev/test: HMAC-SHA256 webhooks signed with MOCK_GATEWAY_SECRET, instant refunds
 *   HostedGateway     — stub for the real Iraqi gateways (ZainCash, FastPay, Qi Card, AsiaHawala, Visa/Mastercard):
 *                       HMAC webhook verification with the merchant secret; checkout/refund API calls are the
 *                       integration points to fill in with the merchant contract (fails closed when unconfigured).
 */
import { createHmac } from 'node:crypto';
import { env, isProd } from '../../config/env.js';
import { BusinessRuleError } from '../../common/errors/index.js';
import { safeEqual } from '../../common/utils/crypto.js';
import type { ParsedWebhook, WebhookEventType } from './webhook-core.js';

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
}

const header = (h: Record<string, string | string[] | undefined>, name: string): string => {
  const v = h[name.toLowerCase()];
  return Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
};

export function hmacHex(secret: string, raw: Buffer | string): string {
  return createHmac('sha256', secret).update(raw).digest('hex');
}

/** MockGateway secret (derived from JWT_REFRESH_SECRET when MOCK_GATEWAY_SECRET is unset). */
export const mockSecret = (): string => env.MOCK_GATEWAY_SECRET ?? hmacHex(env.JWT_REFRESH_SECRET, 'eduway-mock-gateway');

function parseGeneric(body: Record<string, unknown>): ParsedWebhook {
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
    amount: data.amount === undefined ? null : Number(data.amount),
    payload: body,
  };
}

export const mockGateway: PaymentProvider = {
  id: 'mock',
  configured: () => !isProd,
  async createCheckout(input) {
    return { providerRef: `mock_${input.ref}`, redirectUrl: null, deeplink: null };
  },
  verifySignature(raw, headers) {
    const sig = header(headers, 'x-signature').replace(/^sha256=/, '');
    return !!sig && safeEqual(sig, hmacHex(mockSecret(), raw));
  },
  parseWebhook: parseGeneric,
  async refund(input) {
    return { refundId: `mock_rf_${input.paymentId.slice(0, 8)}_${Date.now()}` };
  },
};

const CREDS: Record<Exclude<Gateway, 'mock'>, () => { id?: string; secret?: string; checkoutBase: string }> = {
  zaincash: () => ({ id: env.ZAINCASH_MERCHANT_ID, secret: env.ZAINCASH_SECRET, checkoutBase: 'https://api.zaincash.iq/transaction/pay' }),
  fastpay: () => ({ id: env.FASTPAY_STORE_ID, secret: env.FASTPAY_SECRET, checkoutBase: 'https://secure.fast-pay.iq/pay' }),
  qicard: () => ({ id: env.QICARD_TERMINAL_ID, secret: env.QICARD_SECRET, checkoutBase: 'https://3ds.qi.iq/pay' }),
  asiahawala: () => ({ id: env.ASIAHAWALA_MERCHANT_ID, secret: env.ASIAHAWALA_SECRET, checkoutBase: 'https://pay.asiahawala.com/checkout' }),
  visa: () => ({ id: env.VISA_MERCHANT_ID, secret: env.VISA_SECRET, checkoutBase: 'https://checkout.eduway.iq/card' }),
};

function hostedGateway(id: Exclude<Gateway, 'mock'>): PaymentProvider {
  const creds = CREDS[id];
  return {
    id,
    configured: () => !!(creds().id && creds().secret),
    async createCheckout(input) {
      const c = creds();
      if (!c.id || !c.secret) {
        if (isProd) throw new BusinessRuleError('PAYMENT_GATEWAY_DISABLED', { gateway: id });
        // Development: no merchant contract → the payment is confirmed through the MockGateway (PAY-07).
        return { providerRef: `${id}_dev_${input.ref}`, redirectUrl: null, deeplink: null };
      }
      // Integration point: call the gateway's "create transaction" API with a signed payload.
      const token = hmacHex(c.secret, `${c.id}|${input.ref}|${input.amount}`);
      const qs = new URLSearchParams({ merchant: c.id, order: input.ref, amount: String(input.amount), currency: input.currency, sig: token, ...(input.returnUrl ? { return: input.returnUrl } : {}) });
      return { providerRef: input.ref, redirectUrl: `${c.checkoutBase}?${qs.toString()}`, deeplink: id === 'zaincash' || id === 'fastpay' || id === 'asiahawala' ? `${id}://pay?${qs.toString()}` : null };
    },
    verifySignature(raw, headers) {
      const secret = creds().secret;
      const sig = header(headers, 'x-signature').replace(/^sha256=/, '');
      // Without a merchant secret, real-gateway webhooks are rejected (fail closed).
      return !!secret && !!sig && safeEqual(sig, hmacHex(secret, raw));
    },
    parseWebhook: parseGeneric,
    async refund(input) {
      if (!creds().secret && isProd) throw new BusinessRuleError('PAYMENT_GATEWAY_DISABLED', { gateway: id });
      // Integration point: gateway refund API. Development returns a synthetic id.
      return { refundId: `${id}_rf_${input.paymentId.slice(0, 8)}_${Date.now()}` };
    },
  };
}

const REGISTRY: Record<Gateway, PaymentProvider> = {
  mock: mockGateway,
  zaincash: hostedGateway('zaincash'),
  fastpay: hostedGateway('fastpay'),
  qicard: hostedGateway('qicard'),
  asiahawala: hostedGateway('asiahawala'),
  visa: hostedGateway('visa'),
};

export function getProvider(id: string): PaymentProvider | null {
  const g = canonicalGateway(id);
  return g ? REGISTRY[g] : null;
}

/** Sign a body the way the MockGateway does (used by PAY-07 and tests). */
export function signMock(body: string): string {
  return `sha256=${hmacHex(mockSecret(), body)}`;
}
