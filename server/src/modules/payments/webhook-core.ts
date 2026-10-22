/**
 * Webhook processing core (storage-agnostic, unit-tested with an in-memory store).
 *
 * Guarantees: a webhook is applied AT MOST ONCE.
 *   1. the provider event id is recorded first (unique (provider, provider_event_id)) — a replay of the same
 *      event id is recorded as `duplicate` and never re-applied;
 *   2. the payment row is locked and only transitions from a non-terminal state (initiated|pending); a NEW
 *      event id for an already-paid payment (gateway retry with a fresh id) is also treated as a duplicate.
 * The DB implementation runs every step inside one transaction (see webhook.service.ts).
 *
 * SEC-24: a success must carry the settled amount, equal to `payment.total`, and — when the gateway reports one —
 * the payment's currency. A success without an amount is rejected WITHOUT consuming its event id (a later
 * delivery that carries the amount can still settle the payment); a wrong amount or currency fails the payment.
 */
export type WebhookEventType = 'payment.succeeded' | 'payment.failed' | 'payment.cancelled';

export interface ParsedWebhook {
  eventId: string;
  type: WebhookEventType;
  /** Our payment id, or the provider reference (resolved by the store). */
  paymentId: string | null;
  providerRef: string | null;
  amount: number | null;
  /** ISO currency reported by the gateway (null/undefined = not reported). */
  currency?: string | null;
  payload: Record<string, unknown>;
}

export interface LockedPayment {
  id: string;
  status: string;
  total: number;
  /** Payment currency (IQD); undefined = not loaded (currency not compared). */
  currency?: string;
}

export interface WebhookStore {
  /** Insert the event; false when (provider, eventId) already exists. */
  recordEvent(provider: string, evt: ParsedWebhook, paymentId: string | null): Promise<boolean>;
  /** Record a duplicate delivery (audit trail only). */
  recordDuplicate(provider: string, evt: ParsedWebhook, paymentId: string | null): Promise<void>;
  /** Record a rejected success (audit trail only; the event id is NOT consumed). */
  recordRejected(provider: string, evt: ParsedWebhook, paymentId: string, reason: SettlementProblem): Promise<void>;
  findPaymentForUpdate(evt: ParsedWebhook): Promise<LockedPayment | null>;
  applySuccess(payment: LockedPayment, evt: ParsedWebhook): Promise<void>;
  applyFailure(payment: LockedPayment, status: 'failed' | 'cancelled', evt: ParsedWebhook): Promise<void>;
}

export interface WebhookOutcome {
  received: true;
  duplicate: boolean;
  applied: 'paid' | 'failed' | 'cancelled' | null;
  paymentId: string | null;
  /** Set when a success was refused (SEC-24). */
  rejected?: SettlementProblem;
}

export type SettlementProblem = 'amount_missing' | 'amount_mismatch' | 'currency_mismatch';

/** Pure SEC-24 check of a success event against the locked payment. null = amount (and currency) match. */
export function settlementProblem(payment: Pick<LockedPayment, 'total' | 'currency'>, evt: Pick<ParsedWebhook, 'amount' | 'currency'>): SettlementProblem | null {
  if (evt.amount === null || evt.amount === undefined) return 'amount_missing';
  // NaN / non-numeric amounts count as a mismatch.
  if (!Number.isFinite(evt.amount) || evt.amount !== Number(payment.total)) return 'amount_mismatch';
  if (evt.currency && payment.currency && evt.currency.trim().toUpperCase() !== payment.currency.trim().toUpperCase()) return 'currency_mismatch';
  return null;
}

const OPEN = new Set(['initiated', 'pending']);

/** Pure decision for a locked payment + event type. */
export function decideWebhook(paymentStatus: string, type: WebhookEventType): 'apply_success' | 'apply_failure' | 'duplicate' {
  if (!OPEN.has(paymentStatus)) return 'duplicate';
  return type === 'payment.succeeded' ? 'apply_success' : 'apply_failure';
}

export async function runWebhook(store: WebhookStore, provider: string, evt: ParsedWebhook): Promise<WebhookOutcome> {
  const payment = await store.findPaymentForUpdate(evt);
  if (payment && evt.type === 'payment.succeeded' && OPEN.has(payment.status) && settlementProblem(payment, evt) === 'amount_missing') {
    await store.recordRejected(provider, evt, payment.id, 'amount_missing');
    return { received: true, duplicate: false, applied: null, paymentId: payment.id, rejected: 'amount_missing' };
  }
  const inserted = await store.recordEvent(provider, evt, payment?.id ?? null);
  if (!inserted) {
    await store.recordDuplicate(provider, evt, payment?.id ?? null);
    return { received: true, duplicate: true, applied: null, paymentId: payment?.id ?? null };
  }
  if (!payment) return { received: true, duplicate: false, applied: null, paymentId: null };
  const decision = decideWebhook(payment.status, evt.type);
  if (decision === 'duplicate') return { received: true, duplicate: true, applied: null, paymentId: payment.id };
  if (decision === 'apply_success') {
    const problem = settlementProblem(payment, evt);
    if (problem) {
      // Amount / currency tampering or mismatch → never grant access.
      await store.applyFailure(payment, 'failed', { ...evt, payload: { ...evt.payload, reason: problem } });
      return { received: true, duplicate: false, applied: 'failed', paymentId: payment.id, rejected: problem };
    }
    await store.applySuccess(payment, evt);
    return { received: true, duplicate: false, applied: 'paid', paymentId: payment.id };
  }
  const status = evt.type === 'payment.cancelled' ? 'cancelled' : 'failed';
  await store.applyFailure(payment, status, evt);
  return { received: true, duplicate: false, applied: status, paymentId: payment.id };
}
