/**
 * Transactional notifications — the one call other modules use to reach a student:
 *
 *   import { notify } from '../notifications/notify.js';
 *   await notify({ userId, templateType: 'payment_confirmation', vars: { amount: '150,000 IQD', package_name: pkg.name },
 *                  channels: ['in_app', 'push', 'sms'], link: '/subscription', target: { kind: 'subscription', id: null } });
 *
 * Uses the active admin template of that type per channel (EN/AR by the student's language; `fallback` texts when no
 * template exists), always writes the in-app inbox row (unless `inApp: false`), honours notification preferences
 * (channel + category switches; OTP/support are never suppressed) and queues push/SMS/WhatsApp/email deliveries for
 * the dispatcher job. Never throws (errors are logged) so callers' main actions are never broken by notifications.
 */
import { T } from '../../config/constants.js';
import { db } from '../../config/db.js';
import { logger } from '../../config/logger.js';
import { enqueue } from '../../jobs/index.js';
import { CHANNEL_PREF_DEFAULT } from './audience.js';
import { categoryForType, inboxTypeFor, linkForType, renderTemplate, type NotifChannel } from './templates.js';

type L = { en: string; ar: string };

export interface NotifyInput {
  userId: string;
  /** Template type (selects admin-managed templates); omit for ad-hoc texts in `fallback`. */
  templateType?: string;
  /** Channels to use (default in_app + push). */
  channels?: NotifChannel[];
  vars?: Record<string, string | number | L | null | undefined>;
  fallback?: { title: L; body: L };
  /** Inbox type override (lesson|exam|payment|subscription|system). */
  notificationType?: 'lesson' | 'exam' | 'payment' | 'subscription' | 'system' | 'ai' | 'support';
  link?: string | null;
  target?: { kind: string; id: string | null };
  /** Write the inbox row (default true when in_app or push is requested). */
  inApp?: boolean;
  campaignId?: string | null;
}

interface TemplateRow {
  id: string;
  channel: NotifChannel;
  subject_en: string;
  subject_ar: string;
  body_en: string;
  body_ar: string;
}

export interface NotifyResult {
  notificationId: string | null;
  deliveryIds: string[];
}

export async function notify(input: NotifyInput): Promise<NotifyResult> {
  try {
    return await notifyOrThrow(input);
  } catch (err) {
    logger.error({ err: (err as Error).message, userId: input.userId, type: input.templateType }, 'notify failed');
    return { notificationId: null, deliveryIds: [] };
  }
}

export async function notifyOrThrow(input: NotifyInput): Promise<NotifyResult> {
  const user = await db.maybeOne<{ id: string; locale: 'en' | 'ar'; name_en: string; name_ar: string; phone: string | null; email: string | null; prefs: Record<string, boolean> }>(
    `SELECT id, locale, name_en, name_ar, phone, email, notification_prefs AS prefs FROM ${T.users} WHERE id = $1 AND deleted_at IS NULL`,
    [input.userId],
  );
  if (!user) return { notificationId: null, deliveryIds: [] };
  const lang = user.locale === 'en' ? 'en' : 'ar';
  const channels = input.channels ?? ['in_app', 'push'];
  const vars = { student_name: { en: user.name_en, ar: user.name_ar || user.name_en }, ...(input.vars ?? {}) };
  const templates = input.templateType
    ? await db.many<TemplateRow>(
        `SELECT id, channel, subject_en, subject_ar, body_en, body_ar FROM ${T.notification_templates}
          WHERE type = $1 AND active ORDER BY updated_at DESC`,
        [input.templateType],
      )
    : [];
  const pick = (ch: NotifChannel) => templates.find((t) => t.channel === ch) ?? (ch === 'in_app' ? templates.find((t) => t.channel === 'push') : ch === 'push' ? templates.find((t) => t.channel === 'in_app') : undefined);
  const text = (ch: NotifChannel, l: 'en' | 'ar') => {
    const t = pick(ch);
    if (t) return { title: renderTemplate(l === 'en' ? t.subject_en : t.subject_ar, vars, l), body: renderTemplate(l === 'en' ? t.body_en : t.body_ar, vars, l), templateId: t.id };
    if (input.fallback) return { title: renderTemplate(input.fallback.title[l], vars, l), body: renderTemplate(input.fallback.body[l], vars, l), templateId: null };
    return null;
  };

  const prefs = user.prefs ?? {};
  const category = input.templateType ? categoryForType(input.templateType) : null;
  const categoryOff = category ? prefs[category] === false : false;
  const def = input.templateType ? linkForType(input.templateType) : { link: null, target: { kind: 'none', id: null } };
  const link = input.link !== undefined ? input.link : def.link;
  const target = input.target ?? def.target;

  let notificationId: string | null = null;
  const writeInbox = input.inApp ?? (channels.includes('in_app') || channels.includes('push'));
  if (writeInbox) {
    const en = text('in_app', 'en');
    const ar = text('in_app', 'ar');
    if (en && ar) {
      const row = await db.one<{ id: string }>(
        `INSERT INTO ${T.notifications} (user_id, type, title_en, title_ar, body_en, body_ar, link, data, campaign_id, template_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10) RETURNING id`,
        [user.id, input.notificationType ?? (input.templateType ? inboxTypeFor(input.templateType) : 'system'), en.title || ar.title, ar.title || en.title, en.body, ar.body, link, JSON.stringify({ target }), input.campaignId ?? null, en.templateId],
      );
      notificationId = row.id;
    }
  }

  const deliveryIds: string[] = [];
  const insertDelivery = async (ch: NotifChannel, recipient: string | null, platform: string | null, payload: Record<string, unknown>, templateId: string | null, status: 'queued' | 'delivered' = 'queued') => {
    const r = await db.one<{ id: string }>(
      `INSERT INTO ${T.notification_deliveries} (notification_id, campaign_id, template_id, user_id, channel, provider, recipient, status, platform, payload, sent_at, delivered_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb, CASE WHEN $8 = 'delivered' THEN now() END, CASE WHEN $8 = 'delivered' THEN now() END) RETURNING id`,
      [notificationId, input.campaignId ?? null, templateId, user.id, ch, ch === 'in_app' ? 'in-app' : '', recipient, status, platform, JSON.stringify(payload)],
    );
    if (status === 'queued') deliveryIds.push(r.id);
  };

  for (const ch of channels) {
    const content = text(ch, lang);
    if (!content) continue;
    if (ch === 'in_app') {
      if (notificationId) await insertDelivery('in_app', null, null, { title: content.title, body: content.body }, content.templateId, 'delivered');
      continue;
    }
    if (category && categoryOff) continue;
    const channelOn = prefs[ch] ?? CHANNEL_PREF_DEFAULT[ch];
    if (!channelOn && input.templateType !== 'otp' && input.templateType !== 'support_message') continue;
    const payload = { title: content.title, subject: content.title, body: content.body, data: { link, target, notificationId } };
    if (ch === 'push') {
      const tokens = await db.many<{ token: string; platform: string }>(`SELECT token, platform::text AS platform FROM ${T.push_tokens} WHERE user_id = $1 AND revoked_at IS NULL`, [user.id]);
      for (const t of tokens) await insertDelivery('push', t.token, t.platform, payload, content.templateId);
    } else if (ch === 'email') {
      if (user.email) await insertDelivery('email', user.email, null, payload, content.templateId);
    } else if (user.phone) await insertDelivery(ch, user.phone, null, payload, content.templateId);
  }

  if (deliveryIds.length) {
    void enqueue('eduway.notification-dispatch', { ids: deliveryIds }).catch((err: Error) => logger.warn({ err: err.message }, 'dispatch enqueue failed'));
  }
  return { notificationId, deliveryIds };
}
