/** Notifications SQL (student inbox, templates, campaigns, deliveries). Parameterized; tables via T.* only. */
import { T } from '../../config/constants.js';
import { db, type Executor } from '../../config/db.js';

export type Row = Record<string, unknown>;

export interface InboxRow {
  id: string;
  type: string;
  title_en: string;
  title_ar: string;
  body_en: string;
  body_ar: string;
  link: string | null;
  data: { target?: { kind: string; id: string | null } } | null;
  read_at: Date | null;
  created_at: Date;
}

export interface TemplateRow {
  id: string;
  key: string;
  name: string;
  type: string;
  channel: string;
  subject_en: string;
  subject_ar: string;
  body_en: string;
  body_ar: string;
  variables: string[];
  active: boolean;
  updated_at: Date;
  ub_id: string | null;
  ub_name_en: string | null;
  ub_name_ar: string | null;
  ub_avatar_url: string | null;
}

/** Inbox filter → SQL condition (type values map: system covers ai/support/admin rows). */
function inboxFilter(filter: string | undefined): string {
  switch (filter) {
    case undefined:
    case 'all':
      return 'TRUE';
    case 'unread':
      return 'n.read_at IS NULL';
    case 'system':
      return `n.type IN ('system', 'ai', 'support', 'admin')`;
    default:
      return `n.type = '${['lesson', 'exam', 'payment', 'subscription'].includes(filter) ? filter : 'none'}'`;
  }
}

const TEMPLATE_SELECT = `
  SELECT t.*, u.id AS ub_id, u.name_en AS ub_name_en, u.name_ar AS ub_name_ar, u.avatar_url AS ub_avatar_url
    FROM ${T.notification_templates} t LEFT JOIN ${T.users} u ON u.id = t.updated_by`;

export const notificationsRepo = {
  // ── student inbox ──
  async inbox(userId: string, filter: string | undefined, cursor: { v: string | number; id: string } | null, limit: number): Promise<InboxRow[]> {
    return db.many<InboxRow>(
      `SELECT n.id, n.type, n.title_en, n.title_ar, n.body_en, n.body_ar, n.link, n.data, n.read_at, n.created_at
         FROM ${T.notifications} n
        WHERE n.user_id = $1 AND ${inboxFilter(filter)}
          AND ($2::timestamptz IS NULL OR (n.created_at, n.id) < ($2::timestamptz, $3::uuid))
        ORDER BY n.created_at DESC, n.id DESC LIMIT $4`,
      [userId, cursor ? String(cursor.v) : null, cursor?.id ?? null, limit + 1],
    );
  },

  async inboxCounts(userId: string): Promise<Record<string, number>> {
    const r = await db.one<Record<string, number>>(
      `SELECT count(*)::int AS all, count(*) FILTER (WHERE read_at IS NULL)::int AS unread,
              count(*) FILTER (WHERE type = 'lesson')::int AS lesson, count(*) FILTER (WHERE type = 'exam')::int AS exam,
              count(*) FILTER (WHERE type = 'payment')::int AS payment, count(*) FILTER (WHERE type = 'subscription')::int AS subscription,
              count(*) FILTER (WHERE type IN ('system', 'ai', 'support', 'admin'))::int AS system
         FROM ${T.notifications} WHERE user_id = $1`,
      [userId],
    );
    return r;
  },

  async unreadCount(userId: string): Promise<number> {
    return (await db.scalar<number>(`SELECT count(*)::int FROM ${T.notifications} WHERE user_id = $1 AND read_at IS NULL`, [userId])) ?? 0;
  },

  markRead(userId: string, id: string): Promise<number> {
    return db.exec(`UPDATE ${T.notifications} SET read_at = coalesce(read_at, now()) WHERE id = $1 AND user_id = $2`, [id, userId]);
  },

  markAllRead(userId: string): Promise<number> {
    return db.exec(`UPDATE ${T.notifications} SET read_at = now() WHERE user_id = $1 AND read_at IS NULL`, [userId]);
  },

  remove(userId: string, id: string): Promise<number> {
    return db.exec(`DELETE FROM ${T.notifications} WHERE id = $1 AND user_id = $2`, [id, userId]);
  },

  // ── templates ──
  async templates(where: string, params: unknown[], order: string, limit: number, offset: number): Promise<{ rows: TemplateRow[]; total: number }> {
    const [rows, total] = await Promise.all([
      db.many<TemplateRow>(`${TEMPLATE_SELECT} WHERE ${where} ORDER BY ${order}, t.id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, limit, offset]),
      db.scalar<number>(`SELECT count(*)::int FROM ${T.notification_templates} t WHERE ${where}`, params),
    ]);
    return { rows, total: total ?? 0 };
  },

  matrix(): Promise<{ type: string; channel: string; count: number; active: boolean }[]> {
    return db.many(`SELECT type, channel, count(*)::int AS count, bool_or(active) AS active FROM ${T.notification_templates} GROUP BY type, channel`);
  },

  template(id: string, ex?: Executor): Promise<TemplateRow | null> {
    return db.maybeOne<TemplateRow>(`${TEMPLATE_SELECT} WHERE t.id = $1`, [id], ex);
  },

  async insertTemplate(t: { key: string; name: string; type: string; channel: string; subject: { en: string; ar: string }; body: { en: string; ar: string }; variables: string[]; active: boolean; by: string }): Promise<string> {
    const r = await db.one<{ id: string }>(
      `INSERT INTO ${T.notification_templates} (key, name, type, channel, subject_en, subject_ar, body_en, body_ar, variables, active, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [t.key, t.name, t.type, t.channel, t.subject.en, t.subject.ar, t.body.en, t.body.ar, t.variables, t.active, t.by],
    );
    return r.id;
  },

  async updateTemplate(id: string, patch: Record<string, unknown>, by: string): Promise<void> {
    const keys = Object.keys(patch);
    await db.query(
      `UPDATE ${T.notification_templates} SET ${[...keys.map((k, i) => `${k} = $${i + 2}`), `updated_by = $${keys.length + 2}`, 'updated_at = now()'].join(', ')} WHERE id = $1`,
      [id, ...keys.map((k) => patch[k]), by],
    );
  },

  deleteTemplate(id: string): Promise<number> {
    return db.exec(`DELETE FROM ${T.notification_templates} WHERE id = $1`, [id]);
  },

  async otherActiveCount(id: string, type: string, channel: string): Promise<number> {
    return (await db.scalar<number>(`SELECT count(*)::int FROM ${T.notification_templates} WHERE type = $1 AND channel = $2 AND active AND id <> $3`, [type, channel, id])) ?? 0;
  },

  // ── campaigns ──
  campaignSelect(): string {
    return `
      SELECT c.*, t.name AS template_name,
             u.id AS cb_id, u.name_en AS cb_name_en, u.name_ar AS cb_name_ar, u.avatar_url AS cb_avatar_url,
             coalesce(d.queued, 0) AS d_queued, coalesce(d.sent, 0) AS d_sent, coalesce(d.delivered, 0) AS d_delivered, coalesce(d.failed, 0) AS d_failed,
             d.total AS d_total
        FROM ${T.campaigns} c
        LEFT JOIN ${T.notification_templates} t ON t.id = c.template_id
        LEFT JOIN ${T.users} u ON u.id = c.created_by
        LEFT JOIN LATERAL (
          SELECT count(*)::int AS total, count(*) FILTER (WHERE status = 'queued')::int AS queued, count(*) FILTER (WHERE status = 'sent')::int AS sent,
                 count(*) FILTER (WHERE status = 'delivered')::int AS delivered, count(*) FILTER (WHERE status = 'failed')::int AS failed
            FROM ${T.notification_deliveries} WHERE campaign_id = c.id) d ON true`;
  },

  async campaigns(where: string, params: unknown[], order: string, limit: number, offset: number): Promise<{ rows: Row[]; total: number }> {
    const [rows, total] = await Promise.all([
      db.many<Row>(`${this.campaignSelect()} WHERE ${where} ORDER BY ${order}, c.id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, limit, offset]),
      db.scalar<number>(`SELECT count(*)::int FROM ${T.campaigns} c WHERE ${where}`, params),
    ]);
    return { rows, total: total ?? 0 };
  },

  campaign(id: string): Promise<Row | null> {
    return db.maybeOne<Row>(`${this.campaignSelect()} WHERE c.id = $1`, [id]);
  },

  async insertCampaign(c: {
    name: string;
    channel: string;
    templateId: string;
    template: TemplateRow;
    filters: Record<string, unknown>;
    platforms: string[];
    audienceCount: number;
    status: string;
    scheduledAt: Date | null;
    by: string;
    byName: string;
  }): Promise<string> {
    const r = await db.one<{ id: string }>(
      `INSERT INTO ${T.campaigns} (name, channel, template_id, title_en, title_ar, body_en, body_ar, platforms, audience_filters, audience_count, status, scheduled_at, created_by, created_by_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14) RETURNING id`,
      [c.name, c.channel, c.templateId, c.template.subject_en, c.template.subject_ar, c.template.body_en, c.template.body_ar, c.platforms, JSON.stringify(c.filters), c.audienceCount, c.status, c.scheduledAt, c.by, c.byName],
    );
    return r.id;
  },

  /** Atomically move scheduled campaigns that are due to `sending` (returns their ids). */
  claimDueCampaigns(): Promise<{ id: string }[]> {
    return db.many<{ id: string }>(
      `UPDATE ${T.campaigns} SET status = 'sending', updated_at = now()
        WHERE id IN (SELECT q.id FROM ${T.campaigns} q WHERE q.status = 'scheduled' AND q.scheduled_at <= now() ORDER BY q.scheduled_at LIMIT 20 FOR UPDATE OF q SKIP LOCKED)
        RETURNING id`,
    );
  },

  // ── deliveries ──
  deliverySelect(): string {
    return `
      SELECT d.*, t.name AS template_name, u.id AS st_id, u.name_en AS st_name_en, u.name_ar AS st_name_ar, u.avatar_url AS st_avatar_url, u.phone AS st_phone
        FROM ${T.notification_deliveries} d
        LEFT JOIN ${T.notification_templates} t ON t.id = d.template_id
        LEFT JOIN ${T.users} u ON u.id = d.user_id`;
  },
};
