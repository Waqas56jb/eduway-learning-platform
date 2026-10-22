/**
 * WHK-01 webhook pipeline (signature verify → idempotent event record → one transactional state change).
 * Success: payment paid, receipt issued, promotion redeemed (+used), subscription + entitlements (+logs),
 * attribution verified, marketer milestones re-evaluated, student notified. Duplicates never re-grant access.
 */
import { T } from '../../config/constants.js';
import { db, tx, type TxClient } from '../../config/db.js';
import { logger } from '../../config/logger.js';
import { NotFoundError, UnauthorizedError } from '../../common/errors/index.js';
import { notifyStudent } from '../commerce/lib.js';
import { awardMilestones } from '../marketers/milestones.js';
import { subscriptionEngine } from '../subscriptions/engine.js';
import type { PriceQuote } from './pricing.js';
import { getProvider } from './providers.js';
import { issueReceipt } from './receipt.js';
import { paymentsRepo } from './repository.js';
import { runWebhook, type LockedPayment, type ParsedWebhook, type WebhookOutcome, type WebhookStore } from './webhook-core.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function dbWebhookStore(c: TxClient, provider: string): WebhookStore {
  return {
    async findPaymentForUpdate(evt) {
      if (evt.paymentId && UUID.test(evt.paymentId)) {
        return db.maybeOne<LockedPayment>(`SELECT id, status, total FROM ${T.payments} WHERE id = $1 FOR UPDATE`, [evt.paymentId], c);
      }
      if (evt.providerRef) {
        return db.maybeOne<LockedPayment>(`SELECT id, status, total FROM ${T.payments} WHERE (provider_ref = $1 OR ref = $1) FOR UPDATE`, [evt.providerRef], c);
      }
      return null;
    },
    async recordEvent(prov, evt, paymentId) {
      const r = await db.maybeOne<{ id: string }>(
        `INSERT INTO ${T.payment_events} (payment_id, kind, provider, provider_event_id, verified, payload, note)
         VALUES ($1, 'webhook', $2, $3, true, $4::jsonb, $5)
         ON CONFLICT (provider, provider_event_id) WHERE provider_event_id IS NOT NULL DO NOTHING RETURNING id`,
        [paymentId, prov, evt.eventId, JSON.stringify({ ...evt.payload, idempotencyKey: evt.eventId, type: evt.type }), evt.type],
        c,
      );
      return !!r;
    },
    async recordDuplicate(prov, evt, paymentId) {
      await db.query(
        `INSERT INTO ${T.payment_events} (payment_id, kind, provider, verified, payload, note) VALUES ($1, 'webhook', $2, true, $3::jsonb, $4)`,
        [paymentId, prov, JSON.stringify({ ...evt.payload, idempotencyKey: evt.eventId, type: evt.type, duplicate: true }), `${evt.type} (duplicate ignored)`],
        c,
      );
    },
    async applySuccess(payment, evt) {
      if (evt.amount !== null && Number.isFinite(evt.amount) && evt.amount !== payment.total) {
        // Amount tampering / mismatch → never grant access.
        await this.applyFailure(payment, 'failed', { ...evt, payload: { ...evt.payload, reason: 'amount_mismatch' } });
        return;
      }
      const p = await db.one<{ id: string; user_id: string; package_id: string; billing_cycle: 'monthly' | 'yearly'; promotion_id: string | null; marketer_id: string | null; metadata: { quote?: PriceQuote }; total: number; ref: string }>(
        `UPDATE ${T.payments} SET status = 'paid', paid_at = now(), provider_ref = COALESCE(provider_ref, $2) WHERE id = $1
         RETURNING id, user_id, package_id, billing_cycle, promotion_id, marketer_id, metadata, total, ref`,
        [payment.id, evt.providerRef],
        c,
      );
      await issueReceipt(p.id, c);
      if (p.promotion_id) {
        const n = await db.exec(`UPDATE ${T.promotion_redemptions} SET status = 'redeemed' WHERE payment_id = $1 AND status <> 'redeemed'`, [p.id], c);
        if (n) await db.query(`UPDATE ${T.promotions} SET used_count = used_count + 1 WHERE id = $1`, [p.promotion_id], c);
      }
      const subId = await subscriptionEngine.activateFromPayment({ id: p.id, user_id: p.user_id, package_id: p.package_id, billing_cycle: p.billing_cycle, quote: p.metadata?.quote ?? null }, c);
      await db.query(`UPDATE ${T.school_students} SET verified_paid_at = COALESCE(verified_paid_at, now()) WHERE user_id = $1`, [p.user_id], c);
      if (p.marketer_id) await awardMilestones(p.marketer_id, c);
      await paymentsRepo.addEvent(c, { paymentId: p.id, kind: 'status', status: 'paid', note: 'Payment confirmed; subscription activated and entitlements granted', provider, payload: { subscriptionId: subId } });
    },
    async applyFailure(payment, status, evt) {
      const reason = String((evt.payload as { reason?: unknown }).reason ?? (evt.payload.data as { reason?: unknown } | undefined)?.reason ?? status);
      await db.query(`UPDATE ${T.payments} SET status = $2, failure_reason = $3 WHERE id = $1`, [payment.id, status, reason], c);
      await db.query(`UPDATE ${T.promotion_redemptions} SET status = 'released' WHERE payment_id = $1 AND status = 'reserved'`, [payment.id], c);
      await paymentsRepo.addEvent(c, { paymentId: payment.id, kind: 'status', status, note: status === 'cancelled' ? 'Cancelled by the payer' : `Payment failed (${reason})`, provider });
    },
  };
}

/** Apply a parsed, verified event (used by WHK-01, PAY-07 and zero-total checkouts). */
export async function applyWebhookEvent(provider: string, evt: ParsedWebhook): Promise<WebhookOutcome> {
  const out = await tx((c) => runWebhook(dbWebhookStore(c, provider), provider, evt));
  if (out.applied === 'paid' && out.paymentId) await notifyPaid(out.paymentId);
  return out;
}

/** Payment confirmation (after commit): template `payment_confirmation`, in-app + push. */
async function notifyPaid(paymentId: string): Promise<void> {
  const info = await db.maybeOne<{ user_id: string; total: number; ref: string; pkg_en: string; pkg_ar: string; ends_at: Date | null }>(
    `SELECT p.user_id, p.total, p.ref, pk.name_en AS pkg_en, pk.name_ar AS pkg_ar, s.ends_at
       FROM ${T.payments} p JOIN ${T.packages} pk ON pk.id = p.package_id LEFT JOIN ${T.subscriptions} s ON s.payment_id = p.id WHERE p.id = $1`,
    [paymentId],
  );
  if (!info) return;
  const until = info.ends_at ? info.ends_at.toISOString().slice(0, 10) : '';
  await notifyStudent({
    userId: info.user_id,
    type: 'payment',
    templateType: 'payment_confirmation',
    vars: { amount: `${info.total.toLocaleString('en-US')} IQD`, package_name: info.pkg_en, expiry_date: until, ref: info.ref },
    fallback: {
      title: { en: 'Payment successful', ar: 'تمت عملية الدفع بنجاح' },
      body: { en: `Your ${info.pkg_en} subscription is active until ${until}.`, ar: `اشتراكك في ${info.pkg_ar} فعّال حتى ${until}.` },
    },
    link: '/subscription',
  });
}

export async function processWebhook(providerId: string, rawBody: Buffer | undefined, headers: Record<string, string | string[] | undefined>, body: Record<string, unknown>): Promise<{ received: true; duplicate: boolean }> {
  const provider = getProvider(providerId);
  if (!provider) throw new NotFoundError('resource');
  const raw = rawBody ?? Buffer.from(JSON.stringify(body));
  if (!provider.verifySignature(raw, headers)) {
    await db
      .query(`INSERT INTO ${T.payment_events} (payment_id, kind, provider, verified, payload, note) VALUES (NULL, 'webhook', $1, false, $2::jsonb, 'signature verification failed')`, [provider.id, JSON.stringify(body).slice(0, 10_000)])
      .catch(() => undefined);
    logger.warn({ provider: provider.id }, 'webhook signature invalid');
    throw new UnauthorizedError('SIGNATURE_INVALID');
  }
  const evt = provider.parseWebhook(body);
  const out = await applyWebhookEvent(provider.id, evt);
  return { received: true, duplicate: out.duplicate };
}
