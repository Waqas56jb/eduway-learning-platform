/**
 * Email delivery (admin invites, password resets, notifications). Uses SMTP_URL when configured; otherwise a
 * JSON transport that logs the message (development).
 */
import nodemailer, { type Transporter } from 'nodemailer';
import { env, isProd } from '../../config/env.js';
import { logger } from '../../config/logger.js';

let transporter: Transporter | null = null;

function getTransport(): Transporter {
  if (!transporter) transporter = env.SMTP_URL ? nodemailer.createTransport(env.SMTP_URL) : nodemailer.createTransport({ jsonTransport: true });
  return transporter;
}

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export const mailer = {
  async send(msg: MailMessage): Promise<void> {
    try {
      await getTransport().sendMail({ from: env.MAIL_FROM, ...msg });
      if (!env.SMTP_URL) {
        if (isProd) logger.warn({ to: msg.to, subject: msg.subject }, 'SMTP_URL not configured — email NOT delivered');
        else logger.info({ to: msg.to, subject: msg.subject, text: msg.text }, '[Mail:dev] email logged instead of sent');
      }
    } catch (err) {
      logger.error({ err: (err as Error).message, to: msg.to }, 'email send failed');
    }
  },
};
