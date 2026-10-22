/**
 * WHK-01 webhook pipeline (signature verify → idempotent event record → one transactional state change).
 * Success: payment paid, receipt issued, promotion redeemed (+used), subscription + entitlements (+logs),
 * attribution verified, marketer milestones re-evaluated, student notified. Duplicates never re-grant access.
 */
import { T } from '../../config/constants.js';
import { db, tx, type TxClient } from '../../config/db.js';
import { devFlags, env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { NotFoundError, UnauthorizedError } from '../../common/errors/index.js';
import { notifyStudent } from '../commerce/lib.js';
import { awardMilestones } from '../marketers/milestones.js';
import { subscriptionEngine } from '../subscriptions/engine.js';
import type { PriceQuote } from './pricing.js';
import { getProvider } from './providers.js';
import { issueReceipt } from './receipt.js';
import { paymentsRepo } from './repository.js';
import { runWebhook, settlementProblem, type LockedPayment, type ParsedWebhook, type WebhookOutcome, type WebhookStore } from './webhook-core.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function dbWebhookStore(c: TxClient, provider: string): WebhookStore {
  return {
    async findPaymentForUpdate(evt) {
      // SEC-10: an event from gateway X may only settle a payment made through gateway X (outside production the
      // MockGateway may confirm any gateway's checkout — that is how dev/staging test unconfigured gateways).
      const bound = provider === 'mock' && devFlags.mockPayments ? null : provider;
      if (evt.paymentId && UUID.test(evt.paymentId)) {
        return db.maybeOne<LockedPayment>(`SELECT id, status, total, currency FROM ${T.payments} WHERE id = $1 AND ($2::text IS NULL OR provider = $2::text) FOR UPDATE`, [evt.paymentId, bound], c);
      }
      if (evt.providerRef) {
        return db.maybeOne<LockedPayment>(`SELECT id, status, total, currency FROM ${T.payments} WHERE (provider_ref = $1 OR ref = $1) AND ($2::text IS NULL OR provider = $2::text) FOR UPDATE`, [evt.providerRef, bound], c);
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
    async recordRejected(prov, evt, paymentId, reason) {
      await db.query(
        `INSERT INTO ${T.payment_events} (payment_id, kind, provider, verified, payload, note) VALUES ($1, 'webhook', $2, true, $3::jsonb, $4)`,
        [paymentId, prov, JSON.stringify({ ...evt.payload, idempotencyKey: evt.eventId, type: evt.type, rejected: reason }), `${evt.type} rejected (${reason})`],
        c,
      );
      logger.warn({ provider: prov, paymentId, reason }, 'payment success event rejected');
    },
    async applySuccess(payment, evt) {
      // Defence in depth — runWebhook already refused these (SEC-24).
      const problem = settlementProblem(payment, evt);
      if (problem) {
        await this.applyFailure(payment, 'failed', { ...evt, payload: { ...evt.payload, reason: problem } });
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

async function recordUnverified(provider: string, body: Record<string, unknown>, note: string): Promise<void> {
  await db
    .query(`INSERT INTO ${T.payment_events} (payment_id, kind, provider, verified, payload, note) VALUES (NULL, 'webhook', $1, false, $2::jsonb, $3)`, [provider, JSON.stringify(body).slice(0, 10_000), note])
    .catch(() => undefined);
}

export async function processWebhook(providerId: string, rawBody: Buffer | undefined, headers: Record<string, string | string[] | undefined>, body: Record<string, unknown>): Promise<{ received: true; duplicate: boolean }> {
  const provider = getProvider(providerId);
  // SEC-10: the MockGateway endpoint does not exist in production (its HMAC key may be derived from another secret).
  if (!provider || (provider.id === 'mock' && !devFlags.mockPayments)) throw new NotFoundError('resource');
  const raw = rawBody ?? Buffer.from(JSON.stringify(body));
  // Gateways with API-verified notifications (FastPay IPN, Qi notify): trust only what the gateway API confirms.
  if (provider.verifyWebhook && provider.configured()) {
    const verified = await provider.verifyWebhook({ rawBody: raw, headers, body });
    if (!verified) {
      await recordUnverified(provider.id, body, 'notification verification failed');
      logger.warn({ provider: provider.id }, 'webhook verification failed');
      throw new UnauthorizedError('SIGNATURE_INVALID');
    }
    if (!verified.event) return { received: true, duplicate: false };
    const out = await applyWebhookEvent(provider.id, verified.event);
    return { received: true, duplicate: out.duplicate };
  }
  if (!provider.verifySignature(raw, headers)) {
    await recordUnverified(provider.id, body, 'signature verification failed');
    logger.warn({ provider: provider.id }, 'webhook signature invalid');
    throw new UnauthorizedError('SIGNATURE_INVALID');
  }
  const evt = provider.parseWebhook(body);
  const out = await applyWebhookEvent(provider.id, evt);
  return { received: true, duplicate: out.duplicate };
}

/** Allowed browser return targets: app custom schemes, or http(s) URLs on our own web origins. */
export function safeReturnTarget(url: string | null | undefined): string | null {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return /^javascript:|^data:|^vbscript:/i.test(url) ? null : url;
  const origins = new Set([env.USER_APP_URL, env.ADMIN_APP_URL, ...env.CORS_ORIGINS].map((o) => {
    try {
      return new URL(o).origin;
    } catch {
      return '';
    }
  }));
  return origins.has(u.origin) ? url : null;
}

/**
 * Browser redirect callback (ZainCash token redirect, Qi finish URL, FastPay return URL). Verifies the result
 * with the gateway, applies it through the same idempotent pipeline as webhooks, then returns the URL the
 * browser is sent back to (the app's returnUrl / returnScheme, else the web app's subscription page).
 */
export async function processCallback(providerId: string, query: Record<string, unknown>, body: Record<string, unknown>, headers: Record<string, string | string[] | undefined>): Promise<{ redirectTo: string }> {
  const provider = getProvider(providerId);
  if (!provider?.handleCallback || !provider.configured()) throw new NotFoundError('resource');
  const result = await provider.handleCallback({
    query,
    body,
    headers,
    lookupProviderRef: (ref) => db.scalar<string>(`SELECT provider_ref FROM ${T.payments} WHERE ref = $1 AND provider = $2`, [ref, provider.id]).then((v) => v ?? null),
  });
  if (!result) {
    await recordUnverified(provider.id, { query }, 'callback verification failed');
    logger.warn({ provider: provider.id }, 'payment callback verification failed');
    throw new UnauthorizedError('SIGNATURE_INVALID');
  }
  let paymentId: string | null = null;
  if (result.event) paymentId = (await applyWebhookEvent(provider.id, result.event)).paymentId;
  const keys = [result.ref, result.providerRef, result.event?.providerRef].filter((k): k is string => !!k);
  const p = await db.maybeOne<{ id: string; status: string; metadata: { returnUrl?: string | null; returnScheme?: string | null } | null }>(
    paymentId
      ? `SELECT id, status, metadata FROM ${T.payments} WHERE id = $1`
      : `SELECT id, status, metadata FROM ${T.payments} WHERE provider = $2 AND (ref = ANY($1::text[]) OR provider_ref = ANY($1::text[])) LIMIT 1`,
    paymentId ? [paymentId] : [keys, provider.id],
  );
  const fallback = `${env.USER_APP_URL.replace(/\/+$/, '')}/subscription`;
  const target = safeReturnTarget(p?.metadata?.returnScheme) ?? safeReturnTarget(p?.metadata?.returnUrl) ?? fallback;
  const sep = target.includes('?') ? '&' : '?';
  return { redirectTo: p ? `${target}${sep}paymentId=${encodeURIComponent(p.id)}&status=${encodeURIComponent(p.status)}` : target };
}
