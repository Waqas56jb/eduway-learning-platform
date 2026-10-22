/**
 * Who gets which transactional email (all helpers are fire-and-forget: they never throw and never block on SMTP).
 *
 *   emailAdmin(userId, 'admin_mfa_enabled', { at })            — security mail to one admin (always sent)
 *   emailAdminAlert(userIds, { title, body, href, kind })       — admin alerts, honouring the admin's `emailAlerts` preference
 *   emailStudent(userId, 'payment_receipt', vars, { category }) — only to a CONFIRMED student email, honouring category prefs
 */
import { T } from '../../../config/constants.js';
import { db } from '../../../config/db.js';
import { env } from '../../../config/env.js';
import { logger } from '../../../config/logger.js';
import type { EmailTemplateKey, EmailVars } from './catalog.js';
import { queueEmail, type EmailAttachmentSpec } from './send.js';
import type { EmailLang } from './layout.js';

type L = { en: string; ar: string };

export const adminUrl = (path: string): string => `${env.ADMIN_APP_URL.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
export const userUrl = (path: string): string => `${env.USER_APP_URL.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;

interface AdminTarget {
  id: string;
  email: string;
  lang: EmailLang;
  name: L;
  emailAlerts: boolean;
}

export async function adminTargets(userIds: string[]): Promise<AdminTarget[]> {
  if (!userIds.length) return [];
  const rows = await db.many<{ id: string; email: string | null; name_en: string; name_ar: string; prefs: Record<string, unknown> | null }>(
    `SELECT u.id, u.email, u.name_en, u.name_ar, au.preferences AS prefs
       FROM ${T.users} u JOIN ${T.admin_users} au ON au.user_id = u.id
      WHERE u.id = ANY($1::uuid[]) AND u.kind = 'admin' AND u.deleted_at IS NULL`,
    [userIds],
  );
  return rows
    .filter((r) => !!r.email)
    .map((r) => ({
      id: r.id,
      email: r.email as string,
      lang: r.prefs?.language === 'en' ? 'en' : 'ar',
      name: { en: r.name_en, ar: r.name_ar || r.name_en },
      emailAlerts: r.prefs?.emailAlerts !== false,
    }));
}

/**
 * Email to one admin. Security / account mails (password changed, 2FA, new device, invite, reset) are always sent;
 * `alert: true` mails (export ready, ...) honour the admin's `emailAlerts` preference.
 */
export async function emailAdmin(userId: string, template: EmailTemplateKey, vars: EmailVars, opts: { to?: string; alert?: boolean } = {}): Promise<string | null> {
  try {
    const [a] = await adminTargets([userId]);
    if (!a || (opts.alert && !a.emailAlerts)) return null;
    return await queueEmail({ to: opts.to ?? a.email, template, vars: { name: a.name, securityLink: adminUrl('/profile'), ...vars }, lang: a.lang, userId: a.id });
  } catch (err) {
    logger.warn({ err: (err as Error).message, template }, 'admin email failed');
    return null;
  }
}

/** Admin inbox alert by email (skips admins who turned `emailAlerts` off). */
export async function emailAdminAlert(userIds: string[], alert: { title: L; body?: L; href: string; kind?: string; dedupeKey?: string }): Promise<number> {
  try {
    let n = 0;
    for (const a of await adminTargets(userIds)) {
      if (!a.emailAlerts) continue;
      const id = await queueEmail({
        to: a.email,
        template: 'admin_alert',
        vars: { name: a.name, title: alert.title, body: alert.body ?? { en: '', ar: '' }, link: adminUrl(alert.href), kind: alert.kind ?? 'info' },
        lang: a.lang,
        userId: a.id,
        dedupeKey: alert.dedupeKey ? `admin-alert:${alert.dedupeKey}:${a.id}` : undefined,
      });
      if (id) n++;
    }
    return n;
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'admin alert email failed');
    return 0;
  }
}

/**
 * Email to a student — only to a confirmed address. `category` (e.g. 'payments') honours the student's category
 * switch (transactional receipts / support replies pass no category and are always sent).
 */
export async function emailStudent(
  userId: string,
  template: EmailTemplateKey,
  vars: EmailVars,
  opts: { category?: 'payments' | 'lessons' | 'exams' | 'progress'; attachments?: EmailAttachmentSpec[]; dedupeKey?: string } = {},
): Promise<string | null> {
  try {
    const u = await db.maybeOne<{ email: string | null; verified: boolean; locale: string; name_en: string; name_ar: string; prefs: Record<string, unknown> | null }>(
      `SELECT email, email_verified_at IS NOT NULL AS verified, locale, name_en, name_ar, notification_prefs AS prefs
         FROM ${T.users} WHERE id = $1 AND kind = 'student' AND deleted_at IS NULL AND status <> 'deactivated'`,
      [userId],
    );
    if (!u?.email || !u.verified) return null;
    if (opts.category && u.prefs?.[opts.category] === false) return null;
    return await queueEmail({
      to: u.email,
      template,
      vars: { name: { en: u.name_en, ar: u.name_ar || u.name_en }, ...vars },
      lang: u.locale === 'en' ? 'en' : 'ar',
      userId,
      attachments: opts.attachments,
      dedupeKey: opts.dedupeKey,
    });
  } catch (err) {
    logger.warn({ err: (err as Error).message, template }, 'student email failed');
    return null;
  }
}
