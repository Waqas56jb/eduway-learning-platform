/**
 * Transactional email pipeline.
 *
 *   await queueEmail({ to, template: 'admin_password_reset', vars: { name, link, minutes }, lang: 'ar', userId });
 *
 * `queueEmail` writes one `email` row to the delivery log (eduway_platform_notification_deliveries, payload =
 * { template, vars, lang, attachments, dedupeKey }) and pokes the pg-boss job `eduway.notification-dispatch`
 * without awaiting it — the request never waits for SMTP. The dispatcher renders the branded bilingual template
 * (+ attachments such as the receipt PDF), sends it through nodemailer, records sent/failed + the SMTP message id,
 * retries transient failures with backoff (3 attempts, cron sweep every 2 min) and throttles to
 * MAIL_RATE_PER_MINUTE. One-time links (password reset, invite, email verification) are scrubbed from the row
 * once the delivery is final. Never throws.
 */
import { T } from '../../../config/constants.js';
import { db } from '../../../config/db.js';
import { env } from '../../../config/env.js';
import { logger } from '../../../config/logger.js';
import { mailer, type MailAttachment } from '../../../common/providers/mail.js';
import { enqueue } from '../../../jobs/index.js';
import { isEmailTemplate, renderTemplateEmail, SECRET_TEMPLATES, type EmailTemplateKey, type EmailVars } from './catalog.js';
import type { EmailLang } from './layout.js';

export type EmailAttachmentSpec = { kind: 'receipt_pdf'; paymentId: string };

export interface QueueEmailInput {
  to: string | null | undefined;
  template: EmailTemplateKey;
  vars: EmailVars;
  /** Primary language of the email (default Arabic). */
  lang?: EmailLang | null;
  /** Recipient's user id (admin or student) — links the delivery-log row. */
  userId?: string | null;
  attachments?: EmailAttachmentSpec[];
  /** Send at most once per key (e.g. `sub-expired:<id>`). */
  dedupeKey?: string;
}

const EMAIL_RE = /^[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+\.[^\s@<>()[\],;:"]+$/;
export const isEmailAddress = (s: unknown): s is string => typeof s === 'string' && s.length <= 254 && EMAIL_RE.test(s.trim());

/** Queue a transactional email. Returns the delivery id (null when skipped or on error). */
export async function queueEmail(input: QueueEmailInput): Promise<string | null> {
  try {
    const to = input.to?.trim().toLowerCase();
    if (!isEmailAddress(to)) return null;
    if (input.dedupeKey) {
      const seen = await db.scalar<number>(
        `SELECT count(*)::int FROM ${T.notification_deliveries} WHERE channel = 'email' AND payload ? 'dedupeKey' AND payload->>'dedupeKey' = $1 AND status <> 'failed'`,
        [input.dedupeKey],
      );
      if (seen) return null;
    }
    const payload = {
      template: input.template,
      vars: input.vars,
      lang: input.lang === 'en' ? 'en' : 'ar',
      subject: renderTemplateEmail(input.template, input.vars, { lang: input.lang ?? 'ar' }).subject,
      ...(input.attachments?.length ? { attachments: input.attachments } : {}),
      ...(input.dedupeKey ? { dedupeKey: input.dedupeKey } : {}),
    };
    const id = await db.scalar<string>(
      `INSERT INTO ${T.notification_deliveries} (user_id, channel, provider, recipient, status, payload) VALUES ($1, 'email', '', $2, 'queued', $3::jsonb) RETURNING id`,
      [input.userId ?? null, to, JSON.stringify(payload)],
    );
    if (id) void enqueue('eduway.notification-dispatch', { ids: [id] }).catch((err: Error) => logger.warn({ err: err.message }, 'email dispatch enqueue failed'));
    return id ?? null;
  } catch (err) {
    logger.error({ err: (err as Error).message, template: input.template }, 'queue email failed');
    return null;
  }
}

// ── rate limiting (sliding one-minute window, per process) ──
const sentAt: number[] = [];
export const emailRateLimiter = {
  tryAcquire(now = Date.now(), limit = env.MAIL_RATE_PER_MINUTE): boolean {
    while (sentAt.length && (sentAt[0] as number) <= now - 60_000) sentAt.shift();
    if (sentAt.length >= limit) return false;
    sentAt.push(now);
    return true;
  },
  reset(): void {
    sentAt.length = 0;
  },
};

/** App route (`/subscription`) or absolute URL → absolute website URL for an email button. */
export function absoluteUserLink(link: unknown): string | null {
  if (typeof link !== 'string' || !link) return null;
  if (/^https?:\/\//i.test(link)) return link;
  const path = link.startsWith('/student/') ? link : `/student${link.startsWith('/') ? link : `/${link}`}`;
  return `${env.USER_APP_URL.replace(/\/$/, '')}${path}`;
}

export interface EmailPayload {
  template?: string;
  vars?: EmailVars;
  lang?: string;
  attachments?: EmailAttachmentSpec[];
  scrubbed?: boolean;
  // plain notification deliveries (campaigns / notify())
  title?: string;
  subject?: string;
  body?: string;
  /** Both languages of a notification (campaign / notify()) → a bilingual email. */
  i18n?: { title?: { en?: string; ar?: string }; body?: { en?: string; ar?: string } };
  data?: { link?: unknown };
}

async function buildAttachments(specs: EmailAttachmentSpec[] | undefined, lang: EmailLang): Promise<MailAttachment[]> {
  const out: MailAttachment[] = [];
  for (const s of specs ?? []) {
    if (s.kind === 'receipt_pdf') {
      const { buildReceipt, renderReceiptPdf } = await import('../../payments/receipt.js');
      const receipt = await buildReceipt(s.paymentId);
      out.push({ filename: `EDUWAY-receipt-${receipt.receiptNumber}.pdf`, content: await renderReceiptPdf(receipt, lang), contentType: 'application/pdf' });
    }
  }
  return out;
}

/** Render a delivery payload (template email or plain notification) into a mail message. */
export async function renderEmailPayload(p: EmailPayload): Promise<{ subject: string; html: string; text: string; attachments: MailAttachment[] }> {
  const lang: EmailLang = p.lang === 'en' ? 'en' : 'ar';
  const site = env.USER_APP_URL;
  if (p.template) {
    if (!isEmailTemplate(p.template)) throw Object.assign(new Error(`unknown email template ${p.template}`), { permanent: true });
    if (p.scrubbed) throw Object.assign(new Error('one-time link already sent — request a new email from the original action'), { permanent: true });
    const r = renderTemplateEmail(p.template, p.vars ?? {}, { lang, siteUrl: p.template.startsWith('admin_') ? env.ADMIN_APP_URL : site });
    return { ...r, attachments: await buildAttachments(p.attachments, lang) };
  }
  const title = p.subject || p.title || 'EDUWAY';
  const body = p.body ?? '';
  const t = p.i18n?.title;
  const b = p.i18n?.body;
  const vars: EmailVars = {
    title: { en: t?.en || title, ar: t?.ar || title },
    body: { en: b?.en ?? body, ar: b?.ar ?? body },
    link: absoluteUserLink(p.data?.link),
  };
  const r = renderTemplateEmail('notification', vars, { lang, siteUrl: site });
  return { ...r, attachments: [] };
}

/** Send one email delivery (used by the dispatcher). */
export async function sendEmailPayload(to: string, payload: EmailPayload): Promise<{ messageId: string | null }> {
  const m = await renderEmailPayload(payload);
  return mailer.sendOrThrow({
    to,
    subject: m.subject,
    text: m.text,
    html: m.html,
    attachments: m.attachments.length ? m.attachments : undefined,
    headers: { 'X-Entity-Ref-ID': `eduway-${payload.template ?? 'notification'}-${Date.now()}` },
  });
}

/** SQL fragment value: template keys whose one-time link is removed from the row once delivery is final. */
export const SECRET_TEMPLATE_KEYS: string[] = [...SECRET_TEMPLATES];

/** Send a template right now (scripts / live tests) — bypasses the queue. */
export async function sendTemplateNow(to: string, template: EmailTemplateKey, vars: EmailVars, opts: { lang?: EmailLang; attachments?: EmailAttachmentSpec[] } = {}) {
  return sendEmailPayload(to, { template, vars, lang: opts.lang ?? 'ar', attachments: opts.attachments });
}
