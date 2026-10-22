/**
 * Webhook processing core (storage-agnostic, unit-tested with an in-memory store).
 *
 * Guarantees: a webhook is applied AT MOST ONCE.
 *   1. the provider event id is recorded first (unique (provider, provider_event_id)) — a replay of the same
 *      event id is recorded as `duplicate` and never re-applied;
 *   2. the payment row is locked and only transitions from a non-terminal state (initiated|pending); a NEW
 *      event id for an already-paid payment (gateway retry with a fresh id) is also treated as a duplicate.
 * The DB implementation runs every step inside one transaction (see webhook.service.ts).
 */
export type WebhookEventType = 'payment.succeeded' | 'payment.failed' | 'payment.cancelled';

export interface ParsedWebhook {
  eventId: string;
  type: WebhookEventType;
  /** Our payment id, or the provider reference (resolved by the store). */
  paymentId: string | null;
  providerRef: string | null;
  amount: number | null;
  payload: Record<string, unknown>;
}

export interface LockedPayment {
  id: string;
  status: string;
  total: number;
}

export interface WebhookStore {
  /** Insert the event; false when (provider, eventId) already exists. */
  recordEvent(provider: string, evt: ParsedWebhook, paymentId: string | null): Promise<boolean>;
  /** Record a duplicate delivery (audit trail only). */
  recordDuplicate(provider: string, evt: ParsedWebhook, paymentId: string | null): Promise<void>;
  findPaymentForUpdate(evt: ParsedWebhook): Promise<LockedPayment | null>;
  applySuccess(payment: LockedPayment, evt: ParsedWebhook): Promise<void>;
  applyFailure(payment: LockedPayment, status: 'failed' | 'cancelled', evt: ParsedWebhook): Promise<void>;
}

export interface WebhookOutcome {
  received: true;
  duplicate: boolean;
  applied: 'paid' | 'failed' | 'cancelled' | null;
  paymentId: string | null;
}

const OPEN = new Set(['initiated', 'pending']);

/** Pure decision for a locked payment + event type. */
export function decideWebhook(paymentStatus: string, type: WebhookEventType): 'apply_success' | 'apply_failure' | 'duplicate' {
  if (!OPEN.has(paymentStatus)) return 'duplicate';
  return type === 'payment.succeeded' ? 'apply_success' : 'apply_failure';
}

export async function runWebhook(store: WebhookStore, provider: string, evt: ParsedWebhook): Promise<WebhookOutcome> {
  const payment = await store.findPaymentForUpdate(evt);
  const inserted = await store.recordEvent(provider, evt, payment?.id ?? null);
  if (!inserted) {
    await store.recordDuplicate(provider, evt, payment?.id ?? null);
    return { received: true, duplicate: true, applied: null, paymentId: payment?.id ?? null };
  }
  if (!payment) return { received: true, duplicate: false, applied: null, paymentId: null };
  const decision = decideWebhook(payment.status, evt.type);
  if (decision === 'duplicate') return { received: true, duplicate: true, applied: null, paymentId: payment.id };
  if (decision === 'apply_success') {
    await store.applySuccess(payment, evt);
    return { received: true, duplicate: false, applied: 'paid', paymentId: payment.id };
  }
  const status = evt.type === 'payment.cancelled' ? 'cancelled' : 'failed';
  await store.applyFailure(payment, status, evt);
  return { received: true, duplicate: false, applied: status, paymentId: payment.id };
}
