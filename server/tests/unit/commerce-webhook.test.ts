import { describe, expect, it } from 'vitest';
import { decideAttribution } from '../../src/modules/marketers/attribution.js';
import { canonicalGateway, getProvider, mockGateway, signMock } from '../../src/modules/payments/providers.js';
import { decideWebhook, runWebhook, type LockedPayment, type ParsedWebhook, type WebhookStore } from '../../src/modules/payments/webhook-core.js';

/** In-memory store with the same uniqueness semantics as payment_events (provider, provider_event_id). */
function memoryStore(payments: LockedPayment[]) {
  const events = new Set<string>();
  const state = { grants: 0, failures: 0, duplicates: 0 };
  const store: WebhookStore = {
    async recordEvent(provider, evt) {
      const k = `${provider}|${evt.eventId}`;
      if (events.has(k)) return false;
      events.add(k);
      return true;
    },
    async recordDuplicate() {
      state.duplicates++;
    },
    async findPaymentForUpdate(evt) {
      return payments.find((p) => p.id === evt.paymentId) ?? null;
    },
    async applySuccess(p) {
      p.status = 'paid';
      state.grants++;
    },
    async applyFailure(p, status) {
      p.status = status;
      state.failures++;
    },
  };
  return { store, state };
}
const evt = (over: Partial<ParsedWebhook> = {}): ParsedWebhook => ({ eventId: 'evt_1', type: 'payment.succeeded', paymentId: 'pay1', providerRef: null, amount: 30_000, payload: {}, ...over });

describe('webhook idempotency', () => {
  it('applies a success once; the same event replayed is a duplicate and never re-grants', async () => {
    const p = { id: 'pay1', status: 'pending', total: 30_000 };
    const { store, state } = memoryStore([p]);
    const first = await runWebhook(store, 'mock', evt());
    const second = await runWebhook(store, 'mock', evt());
    expect(first).toMatchObject({ duplicate: false, applied: 'paid' });
    expect(second).toMatchObject({ duplicate: true, applied: null });
    expect(state.grants).toBe(1);
    expect(state.duplicates).toBe(1);
  });
  it('a NEW event id for an already-paid payment is also a duplicate (gateway retries)', async () => {
    const p = { id: 'pay1', status: 'pending', total: 30_000 };
    const { store, state } = memoryStore([p]);
    await runWebhook(store, 'mock', evt());
    const r = await runWebhook(store, 'mock', evt({ eventId: 'evt_2' }));
    expect(r.duplicate).toBe(true);
    expect(state.grants).toBe(1);
  });
  it('failure / cancel transitions only from open states', async () => {
    const p = { id: 'pay1', status: 'pending', total: 30_000 };
    const { store, state } = memoryStore([p]);
    expect((await runWebhook(store, 'mock', evt({ type: 'payment.cancelled' }))).applied).toBe('cancelled');
    expect((await runWebhook(store, 'mock', evt({ eventId: 'evt_9' }))).duplicate).toBe(true);
    expect(state.grants).toBe(0);
    expect(state.failures).toBe(1);
  });
  it('same event id on different providers is independent', async () => {
    const { store } = memoryStore([{ id: 'pay1', status: 'pending', total: 1 }, { id: 'pay2', status: 'pending', total: 1 }]);
    expect((await runWebhook(store, 'mock', evt())).duplicate).toBe(false);
    expect((await runWebhook(store, 'zaincash', evt({ paymentId: 'pay2' }))).duplicate).toBe(false);
  });
  it('decideWebhook matrix', () => {
    expect(decideWebhook('initiated', 'payment.succeeded')).toBe('apply_success');
    expect(decideWebhook('pending', 'payment.failed')).toBe('apply_failure');
    for (const s of ['paid', 'failed', 'cancelled', 'refunded', 'partially_refunded']) expect(decideWebhook(s, 'payment.succeeded')).toBe('duplicate');
  });
});

describe('MockGateway signature', () => {
  it('verifies HMAC signatures and rejects tampering', () => {
    const raw = JSON.stringify({ id: 'evt', type: 'payment.succeeded', data: { paymentId: 'x' } });
    expect(mockGateway.verifySignature(Buffer.from(raw), { 'x-signature': signMock(raw) })).toBe(true);
    expect(mockGateway.verifySignature(Buffer.from(raw + ' '), { 'x-signature': signMock(raw) })).toBe(false);
    expect(mockGateway.verifySignature(Buffer.from(raw), {})).toBe(false);
  });
  it('real gateways fail closed without a merchant secret', () => {
    const raw = '{}';
    expect(getProvider('zaincash')?.verifySignature(Buffer.from(raw), { 'x-signature': signMock(raw) })).toBe(false);
  });
  it('maps card brands and web/app aliases to canonical gateways', () => {
    expect(canonicalGateway('mastercard')).toBe('visa');
    expect(canonicalGateway('card')).toBe('visa');
    expect(canonicalGateway('zain')).toBe('zaincash');
    expect(canonicalGateway('asia')).toBe('asiahawala');
    expect(canonicalGateway('paypal')).toBeNull();
  });
});

describe('double-attribution guard', () => {
  it('assign / unassign / noop', () => {
    expect(decideAttribution(null, 'm1')).toMatchObject({ action: 'assign', error: null, auditAction: 'school.assign_marketer' });
    expect(decideAttribution('m1', null)).toMatchObject({ action: 'unassign', error: null, auditAction: 'school.unassign_marketer' });
    expect(decideAttribution('m1', 'm1')).toMatchObject({ action: 'noop', error: null });
  });
  it('reassigning to a different marketer requires an override reason (≥3 chars)', () => {
    expect(decideAttribution('m1', 'm2')).toMatchObject({ error: 'DOUBLE_ATTRIBUTION' });
    expect(decideAttribution('m1', 'm2', '  x ')).toMatchObject({ error: 'DOUBLE_ATTRIBUTION' });
    expect(decideAttribution('m1', 'm2', 'territory change')).toMatchObject({ action: 'override', error: null, auditAction: 'school.attribution_override' });
  });
});
