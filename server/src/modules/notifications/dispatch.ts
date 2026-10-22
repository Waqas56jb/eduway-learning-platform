/**
 * Delivery dispatcher (pg-boss job `eduway.notification-dispatch`). Claims queued deliveries in batches with
 * row locks that skip locked rows (+ a 5-minute lease in next_attempt_at so concurrent workers never double-send),
 * sends them through the channel providers and records the outcome. Transient failures are retried with
 * exponential backoff (max 3 attempts); invalid Expo tokens are revoked.
 */
import { T } from '../../config/constants.js';
import { db } from '../../config/db.js';
import { isDev } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { pushProvider, sendEmail, sendSms } from './channels.js';
import { emailRateLimiter, SECRET_TEMPLATE_KEYS, type EmailPayload } from './email/send.js';

export const MAX_ATTEMPTS = 3;

interface Claimed {
  id: string;
  channel: 'push' | 'in_app' | 'sms' | 'whatsapp' | 'email';
  recipient: string | null;
  payload: { title?: string; body?: string; subject?: string; data?: Record<string, unknown> } & EmailPayload;
  attempts: number;
  campaign_id: string | null;
}

type Outcome =
  | { id: string; ok: true; status: 'sent' | 'delivered'; provider: string; providerMessageId?: string | null }
  | { id: string; ok: false; error: string; permanent: boolean; provider: string; revokeToken?: string; deferred?: boolean };

async function claim(opts: { campaignId?: string; ids?: string[] }, limit: number): Promise<Claimed[]> {
  return db.many<Claimed>(
    `UPDATE ${T.notification_deliveries} d SET attempts = d.attempts + 1, next_attempt_at = now() + interval '5 minutes', updated_at = now()
      WHERE d.id IN (
        SELECT q.id FROM ${T.notification_deliveries} q
         WHERE q.status = 'queued' AND (q.next_attempt_at IS NULL OR q.next_attempt_at <= now())
           AND ($1::uuid IS NULL OR q.campaign_id = $1) AND ($2::uuid[] IS NULL OR q.id = ANY($2))
         ORDER BY q.created_at LIMIT $3 FOR UPDATE OF q SKIP LOCKED)
      RETURNING d.id, d.channel, d.recipient, d.payload, d.attempts, d.campaign_id`,
    [opts.campaignId ?? null, opts.ids?.length ? opts.ids : null, limit],
  );
}

async function sendBatch(rows: Claimed[]): Promise<Outcome[]> {
  const out: Outcome[] = [];
  const push = rows.filter((r) => r.channel === 'push');
  if (push.length) {
    const provider = pushProvider();
    const tickets = await provider.send(push.map((r) => ({ to: r.recipient ?? '', title: r.payload.title ?? '', body: r.payload.body ?? '', data: r.payload.data })));
    push.forEach((r, i) => {
      const t = tickets[i] ?? { ok: false, error: 'no ticket' };
      out.push(
        t.ok
          ? { id: r.id, ok: true, status: provider.name === 'expo' ? 'sent' : 'delivered', provider: provider.name, providerMessageId: t.id ?? null }
          : { id: r.id, ok: false, error: t.error ?? 'error', permanent: !!t.invalidToken, provider: provider.name, revokeToken: t.invalidToken ? (r.recipient ?? undefined) : undefined },
      );
    });
  }
  for (const r of rows.filter((x) => x.channel !== 'push')) {
    try {
      if (r.channel === 'in_app') out.push({ id: r.id, ok: true, status: 'delivered', provider: 'in-app' });
      else if (r.channel === 'sms' || r.channel === 'whatsapp') {
        if (!r.recipient) throw Object.assign(new Error('no phone number'), { permanent: true });
        const s = await sendSms(r.recipient, r.payload.body ?? '', r.channel);
        out.push({ id: r.id, ok: true, status: s.provider.startsWith('mock') ? 'delivered' : 'sent', provider: s.provider, providerMessageId: s.id });
      } else if (r.channel === 'email') {
        if (!r.recipient) throw Object.assign(new Error('no email address'), { permanent: true });
        // Throttle (MAIL_RATE_PER_MINUTE): over the limit the row goes back to the queue without using an attempt.
        if (!emailRateLimiter.tryAcquire()) {
          out.push({ id: r.id, ok: false, error: 'rate limited — retrying in the next window', permanent: false, provider: 'email', deferred: true });
          continue;
        }
        const s = await sendEmail(r.recipient, r.payload);
        out.push({ id: r.id, ok: true, status: s.provider === 'mock-email' ? 'delivered' : 'sent', provider: s.provider, providerMessageId: s.id ?? null });
      }
    } catch (err) {
      out.push({ id: r.id, ok: false, error: (err as Error).message, permanent: !!(err as { permanent?: boolean }).permanent, provider: r.channel });
    }
  }
  return out;
}

async function record(rows: Claimed[], outcomes: Outcome[]): Promise<void> {
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const o of outcomes) {
    const row = byId.get(o.id);
    if (!o.ok && o.deferred) {
      await db.query(
        `UPDATE ${T.notification_deliveries} SET attempts = greatest(attempts - 1, 0), next_attempt_at = now() + interval '1 minute', updated_at = now() WHERE id = $1`,
        [o.id],
      );
      continue;
    }
    const final = o.ok || o.permanent || (row?.attempts ?? MAX_ATTEMPTS) >= MAX_ATTEMPTS;
    if (final && !isDev && row?.channel === 'email' && row.payload.template && SECRET_TEMPLATE_KEYS.includes(row.payload.template)) {
      // One-time links (reset / invite / verification) never stay in the delivery log once the delivery is
      // final (NODE_ENV=development keeps them so local testing can read the link from the row).
      await db.query(`UPDATE ${T.notification_deliveries} SET payload = (payload #- '{vars,link}') || '{"scrubbed": true}'::jsonb WHERE id = $1`, [o.id]);
    }
    if (o.ok) {
      await db.query(
        `UPDATE ${T.notification_deliveries} SET status = $2, provider = $3, provider_message_id = $4, error = NULL, sent_at = now(),
                delivered_at = CASE WHEN $2 = 'delivered' THEN now() ELSE delivered_at END, next_attempt_at = NULL, updated_at = now() WHERE id = $1`,
        [o.id, o.status, o.provider, o.providerMessageId ?? null],
      );
    } else {
      const retry = !o.permanent && (row?.attempts ?? MAX_ATTEMPTS) < MAX_ATTEMPTS;
      await db.query(
        `UPDATE ${T.notification_deliveries} SET status = $2, provider = $3, error = $4,
                next_attempt_at = CASE WHEN $2 = 'queued' THEN now() + make_interval(mins => $5) ELSE NULL END, updated_at = now() WHERE id = $1`,
        [o.id, retry ? 'queued' : 'failed', o.provider, o.error.slice(0, 500), 2 ** (row?.attempts ?? 1)],
      );
      if (o.revokeToken) await db.query(`UPDATE ${T.push_tokens} SET revoked_at = now() WHERE token = $1 AND revoked_at IS NULL`, [o.revokeToken]);
    }
  }
}

/** Recompute campaign stats; a `sending` campaign with nothing queued becomes `sent` (or `failed` if all failed). */
export async function refreshCampaign(campaignId: string): Promise<void> {
  const s = await db.one<{ queued: number; sent: number; delivered: number; failed: number }>(
    `SELECT count(*) FILTER (WHERE status = 'queued')::int AS queued, count(*) FILTER (WHERE status = 'sent')::int AS sent,
            count(*) FILTER (WHERE status = 'delivered')::int AS delivered, count(*) FILTER (WHERE status = 'failed')::int AS failed
       FROM ${T.notification_deliveries} WHERE campaign_id = $1`,
    [campaignId],
  );
  const total = s.queued + s.sent + s.delivered + s.failed;
  await db.query(
    `UPDATE ${T.campaigns} SET stats = $2::jsonb, updated_at = now(),
            status = CASE WHEN status = 'sending' AND $3 = 0 THEN (CASE WHEN $4 > 0 AND $5 = $4 THEN 'failed' ELSE 'sent' END) ELSE status END,
            sent_at = CASE WHEN status = 'sending' AND $3 = 0 THEN coalesce(sent_at, now()) ELSE sent_at END
      WHERE id = $1`,
    [campaignId, JSON.stringify(s), s.queued, total, s.failed],
  );
}

/** Dispatch queued deliveries (optionally for one campaign / specific ids). Returns counts. */
export async function dispatchQueued(opts: { campaignId?: string; ids?: string[]; maxBatches?: number } = {}): Promise<{ processed: number; ok: number; failed: number }> {
  let processed = 0;
  let ok = 0;
  let failed = 0;
  const campaigns = new Set<string>(opts.campaignId ? [opts.campaignId] : []);
  for (let b = 0; b < (opts.maxBatches ?? 50); b++) {
    const rows = await claim(opts, 500);
    if (!rows.length) break;
    const outcomes = await sendBatch(rows);
    await record(rows, outcomes);
    processed += rows.length;
    ok += outcomes.filter((o) => o.ok).length;
    failed += outcomes.filter((o) => !o.ok).length;
    for (const r of rows) if (r.campaign_id) campaigns.add(r.campaign_id);
  }
  for (const c of campaigns) await refreshCampaign(c).catch((err: Error) => logger.warn({ err: err.message, campaignId: c }, 'campaign stats refresh failed'));
  if (processed) logger.info({ processed, ok, failed }, 'notification deliveries dispatched');
  return { processed, ok, failed };
}

/** Expo push receipts: `sent` push deliveries older than 15 min → delivered/failed (job `eduway.expo-push-receipts`). */
export async function checkPushReceipts(): Promise<number> {
  const provider = pushProvider();
  if (!provider.receipts) return 0;
  const rows = await db.many<{ id: string; provider_message_id: string; recipient: string | null; campaign_id: string | null }>(
    `SELECT id, provider_message_id, recipient, campaign_id FROM ${T.notification_deliveries}
      WHERE channel = 'push' AND status = 'sent' AND provider_message_id IS NOT NULL
        AND sent_at < now() - interval '15 minutes' AND sent_at > now() - interval '1 day' LIMIT 1000`,
  );
  if (!rows.length) return 0;
  const receipts = await provider.receipts(rows.map((r) => r.provider_message_id));
  const campaigns = new Set<string>();
  for (const r of rows) {
    const rc = receipts[r.provider_message_id];
    if (!rc) continue;
    await db.query(
      `UPDATE ${T.notification_deliveries} SET status = $2, error = $3, delivered_at = CASE WHEN $2 = 'delivered' THEN now() ELSE NULL END, updated_at = now() WHERE id = $1`,
      [r.id, rc.ok ? 'delivered' : 'failed', rc.ok ? null : (rc.error ?? 'error')],
    );
    if (rc.invalidToken && r.recipient) await db.query(`UPDATE ${T.push_tokens} SET revoked_at = now() WHERE token = $1 AND revoked_at IS NULL`, [r.recipient]);
    if (r.campaign_id) campaigns.add(r.campaign_id);
  }
  for (const c of campaigns) await refreshCampaign(c);
  return rows.length;
}
