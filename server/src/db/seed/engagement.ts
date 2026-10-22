/**
 * Engagement seed (Agent D) — idempotent:
 *   - feature flag `ai_tutor_attachments` (enabled)
 *   - AI settings: per-subject suggested prompts + provider/model catalogue (only when still empty)
 *   - demo student Expo push token (iOS) so push campaigns have a reachable app user
 *   - delivery log for the seeded `sent` campaigns (delivered/failed mix per channel provider) + campaign stats
 */
import type { TxClient } from '../../config/db.js';
import { T } from '../../config/constants.js';
import { DEMO_PHONE } from './demo.js';
import { daysAgo, insertMany, loadJson, rng, sid } from './helpers.js';

type L = { en: string; ar: string };

export async function seedEngagement(c: TxClient): Promise<void> {
  await c.query(
    `INSERT INTO ${T.feature_flags} (id, key, name_en, name_ar, description_en, description_ar, enabled, environment, platforms)
     VALUES ($1, 'ai_tutor_attachments', 'AI tutor image attachments', 'إرفاق الصور في المعلّم الذكي',
             'Students can attach a photo of a question to the AI tutor.', 'يمكن للطلاب إرفاق صورة السؤال للمعلّم الذكي.', true, 'production', '{web,ios,android}')
     ON CONFLICT (key) DO NOTHING`,
    [sid('flag', 'ai_tutor_attachments')],
  );

  const extras = loadJson<{ tutorSuggestions: Record<string, L[]> }>('student-extras.json');
  const mock = loadJson<{ aiModels?: Record<string, { value: string; label: string }[]> }>('admin-mock.json');
  await c.query(`INSERT INTO ${T.ai_settings} (id) VALUES (1) ON CONFLICT (id) DO NOTHING`);
  await c.query(
    `UPDATE ${T.ai_settings}
        SET suggested_prompts = CASE WHEN suggested_prompts = '{}'::jsonb THEN $1::jsonb ELSE suggested_prompts END,
            models = CASE WHEN models = '{}'::jsonb THEN $2::jsonb ELSE models END
      WHERE id = 1`,
    [JSON.stringify(extras.tutorSuggestions), JSON.stringify(mock.aiModels ?? {})],
  );

  const demo = await c.query<{ id: string }>(`SELECT id FROM ${T.users} WHERE phone = $1 AND kind = 'student'`, [DEMO_PHONE]);
  const demoId = demo.rows[0]?.id;
  if (demoId) {
    await c.query(
      `INSERT INTO ${T.push_tokens} (user_id, token, provider, platform, device_id) VALUES ($1, 'ExponentPushToken[demo-ahmed-iphone]', 'expo', 'ios', 'demo-ahmed-iphone')
       ON CONFLICT (token) DO NOTHING`,
      [demoId],
    );
  }

  // Delivery log for already-sent seeded campaigns (only when they have none yet).
  const campaigns = await c.query<{ id: string; channel: string; template_id: string | null; audience_count: number; sent_at: Date | null; title_en: string; body_en: string }>(
    `SELECT c.id, c.channel, c.template_id, c.audience_count, c.sent_at, coalesce(t.subject_en, c.title_en) AS title_en, coalesce(t.body_en, c.body_en) AS body_en
       FROM ${T.campaigns} c LEFT JOIN ${T.notification_templates} t ON t.id = c.template_id
      WHERE c.status = 'sent' AND NOT EXISTS (SELECT 1 FROM ${T.notification_deliveries} d WHERE d.campaign_id = c.id)`,
  );
  if (!campaigns.rows.length) return;
  const students = await c.query<{ id: string; phone: string | null; email: string | null }>(
    `SELECT id, phone, email FROM ${T.users} WHERE kind = 'student' AND deleted_at IS NULL ORDER BY created_at LIMIT 300`,
  );
  if (!students.rows.length) return;
  const PROVIDER: Record<string, string> = { push: 'expo', in_app: 'in-app', sms: 'korek', whatsapp: 'whatsapp-cloud', email: 'smtp' };
  const ERRORS: Record<string, string> = { push: 'DeviceNotRegistered', sms: 'Carrier rejected message', whatsapp: 'Recipient not on WhatsApp', email: 'Mailbox unavailable', in_app: '' };
  for (const [ci, cm] of campaigns.rows.entries()) {
    const r = rng(1000 + ci);
    const n = Math.max(1, Math.min(cm.audience_count || 20, students.rows.length, 120));
    const sentAt = cm.sent_at ?? daysAgo(3);
    const rows: unknown[][] = [];
    for (let k = 0; k < n; k++) {
      const s = students.rows[(k * 7 + ci) % students.rows.length];
      if (!s) continue;
      const failed = cm.channel !== 'in_app' && r.next() < 0.06;
      const platform = cm.channel === 'push' ? (r.next() < 0.55 ? 'android' : 'ios') : null;
      const recipient = cm.channel === 'push' ? `ExponentPushToken[seed-${s.id.slice(0, 8)}]` : cm.channel === 'email' ? (s.email ?? `${s.id.slice(0, 8)}@example.com`) : cm.channel === 'in_app' ? null : s.phone;
      const at = new Date(sentAt.getTime() + k * 1500);
      rows.push([
        sid('delivery', `${cm.id}:${k}`),
        cm.id,
        cm.template_id,
        s.id,
        cm.channel,
        PROVIDER[cm.channel] ?? cm.channel,
        recipient,
        failed ? 'failed' : 'delivered',
        failed ? ERRORS[cm.channel] : null,
        failed ? 3 : 1,
        platform,
        JSON.stringify({ title: cm.title_en, body: cm.body_en }),
        at,
        failed ? null : at,
        at,
        at,
      ]);
    }
    await insertMany(
      c,
      T.notification_deliveries,
      ['id', 'campaign_id', 'template_id', 'user_id', 'channel', 'provider', 'recipient', 'status', 'error', 'attempts', 'platform', 'payload', 'sent_at', 'delivered_at', 'created_at', 'updated_at'],
      rows,
      '(id) DO NOTHING',
    );
    await c.query(
      `UPDATE ${T.campaigns} SET stats = (
         SELECT jsonb_build_object('queued', count(*) FILTER (WHERE status = 'queued'), 'sent', count(*) FILTER (WHERE status = 'sent'),
                                   'delivered', count(*) FILTER (WHERE status = 'delivered'), 'failed', count(*) FILTER (WHERE status = 'failed'))
           FROM ${T.notification_deliveries} WHERE campaign_id = $1) WHERE id = $1`,
      [cm.id],
    );
  }
}
