/**
 * Email delivery (admin invites, password resets, notifications).
 *
 *   EMAIL_PROVIDER=smtp  — nodemailer SMTP transport from SMTP_URL, or SMTP_HOST/PORT/SECURE/USER/PASS
 *   EMAIL_PROVIDER=mock  — JSON transport that logs the message (development)
 *   unset                — smtp when SMTP settings exist, else mock
 * NODE_ENV=test always uses the mock transport.
 */
import nodemailer, { type Transporter } from 'nodemailer';
import { env, isProd, type Env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

export interface MailAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
}

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: MailAttachment[];
  /** Extra headers (e.g. List-Unsubscribe, X-Entity-Ref-ID). */
  headers?: Record<string, string>;
  replyTo?: string;
}

export type SmtpOptions = string | { host: string; port: number; secure: boolean; auth?: { user: string; pass: string } };

/** SMTP connection options from env, or null when SMTP is not configured. */
export function smtpOptions(e: Env): SmtpOptions | null {
  if (e.SMTP_URL) return e.SMTP_URL;
  if (!e.SMTP_HOST) return null;
  const port = e.SMTP_PORT ?? 587;
  return { host: e.SMTP_HOST, port, secure: e.SMTP_SECURE ?? port === 465, ...(e.SMTP_USER ? { auth: { user: e.SMTP_USER, pass: e.SMTP_PASS ?? '' } } : {}) };
}

/** Which email provider is active: `smtp` or `mock-email` (with the reason when smtp was requested but unusable). */
export function selectEmailProvider(e: Env): { requested: 'mock' | 'smtp' | 'auto'; active: 'smtp' | 'mock-email' } {
  const requested = e.EMAIL_PROVIDER ?? 'auto';
  const usable = !!smtpOptions(e) && e.NODE_ENV !== 'test';
  const active = requested === 'mock' ? 'mock-email' : usable ? 'smtp' : 'mock-email';
  return { requested, active };
}

/** Splits `Name <addr@x>` / `addr@x` into its parts. */
export function parseAddress(from: string): { name: string | null; address: string } {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(from);
  if (m) return { name: (m[1] ?? '').trim() || null, address: (m[2] ?? '').trim() };
  return { name: null, address: from.trim() };
}

const ACCOUNT_BOUND_HOSTS = /(^|\.)(gmail|googlemail)\.com$/i;

/**
 * The From header. Gmail / Google Workspace SMTP rewrites the sender to the authenticated account, so when the
 * host is Gmail and MAIL_FROM names another address, the display name is kept and the address becomes SMTP_USER
 * (`EDUWAY <account@gmail.com>`) — the message stays aligned with SPF/DKIM instead of being rewritten or flagged.
 */
export function resolveFrom(e: Pick<Env, 'MAIL_FROM' | 'SMTP_HOST' | 'SMTP_URL' | 'SMTP_USER'>): string {
  const { name, address } = parseAddress(e.MAIL_FROM);
  const display = name ?? 'EDUWAY';
  let host = e.SMTP_HOST ?? '';
  if (!host && e.SMTP_URL) {
    try {
      host = new URL(e.SMTP_URL).hostname;
    } catch {
      host = '';
    }
  }
  const account = e.SMTP_USER?.includes('@') ? e.SMTP_USER : null;
  const addr = ACCOUNT_BOUND_HOSTS.test(host) && account && account.toLowerCase() !== address.toLowerCase() ? account : address;
  return `"${display.replace(/"/g, '')}" <${addr}>`;
}

let transporter: Transporter | null = null;
/** Test hook: replace the transport (null restores env selection). */
export function setMailTransport(t: Transporter | null): void {
  transporter = t;
}

function getTransport(): Transporter {
  if (!transporter) {
    const opts = selectEmailProvider(env).active === 'smtp' ? smtpOptions(env) : null;
    transporter = opts ? nodemailer.createTransport(opts) : nodemailer.createTransport({ jsonTransport: true });
  }
  return transporter;
}

export const emailProviderName = (): 'smtp' | 'mock-email' => selectEmailProvider(env).active;

export const mailer = {
  /** Sends an email. Never throws for the callers that fire-and-forget; use `sendOrThrow` for delivery jobs. */
  async send(msg: MailMessage): Promise<void> {
    try {
      await this.sendOrThrow(msg);
    } catch (err) {
      logger.error({ err: (err as Error).message, to: msg.to }, 'email send failed');
    }
  },
  async sendOrThrow(msg: MailMessage): Promise<{ messageId: string | null }> {
    const info = (await getTransport().sendMail({ from: resolveFrom(env), ...msg })) as { messageId?: string };
    if (emailProviderName() === 'mock-email') {
      if (isProd) logger.warn({ to: msg.to, subject: msg.subject }, 'email provider is mock — email NOT delivered');
      else logger.info({ to: msg.to, subject: msg.subject, text: msg.text, attachments: msg.attachments?.map((a) => a.filename) }, '[Mail:dev] email logged instead of sent');
    }
    return { messageId: info.messageId ?? null };
  },
};
