/** AI tutor SQL (parameterized; tables only via T.*). */
import { T } from '../../config/constants.js';
import { db, type Executor } from '../../config/db.js';

export interface AiSettingsRow {
  enabled: boolean;
  monthly_allowance: number;
  reset_cycle: 'calendar' | 'billing';
  provider: 'openai' | 'anthropic' | 'azure' | 'mock';
  model: string;
  temperature: number;
  max_tokens: number;
  retrieval_transcripts: boolean;
  retrieval_explanations: boolean;
  retrieval_lesson_notes: boolean;
  safety_rules: string;
  rate_limit_per_minute: number;
  rate_limit_per_hour: number;
  blocked_keywords: string[];
  cost_per_1k_input_usd: number;
  cost_per_1k_output_usd: number;
  iqd_per_usd: number;
  suggested_prompts: Record<string, { en: string; ar: string }[]>;
  models: Record<string, { value: string; label: string }[]>;
  disabled_reason: string | null;
  disabled_at: Date | null;
  updated_by: string | null;
  updated_at: Date;
  ub_id: string | null;
  ub_name_en: string | null;
  ub_name_ar: string | null;
  ub_avatar_url: string | null;
}

export interface SubjectLite {
  id: string;
  slug: string;
  name_en: string;
  name_ar: string;
  color: string;
}

export interface ConversationRow {
  id: string;
  user_id: string;
  subject_id: string | null;
  subject_slug: string | null;
  subject_name_en: string | null;
  subject_name_ar: string | null;
  title: string;
  status: string;
  flagged: boolean;
  message_count: number;
  last_message_at: Date | null;
  created_at: Date;
  updated_at: Date;
  preview: string | null;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  model: string | null;
  counted: boolean;
  attachment_file_key: string | null;
  feedback: 'up' | 'down' | null;
  status: 'pending' | 'streaming' | 'complete' | 'failed' | 'blocked';
  client_message_id: string | null;
  lang: string | null;
  created_at: Date;
  updated_at: Date;
}

const CONV_SELECT = `
  SELECT c.id, c.user_id, c.subject_id, s.slug AS subject_slug, s.name_en AS subject_name_en, s.name_ar AS subject_name_ar,
         c.title, c.status, c.flagged, c.message_count, c.last_message_at, c.created_at, c.updated_at,
         (SELECT left(m.content, 160) FROM ${T.ai_messages} m
           WHERE m.conversation_id = c.id AND m.role <> 'system' ORDER BY m.created_at DESC LIMIT 1) AS preview
    FROM ${T.ai_conversations} c
    LEFT JOIN ${T.subjects} s ON s.id = c.subject_id`;

export const aiRepo = {
  async settings(ex?: Executor): Promise<AiSettingsRow | null> {
    return db.maybeOne<AiSettingsRow>(
      `SELECT a.*, u.id AS ub_id, u.name_en AS ub_name_en, u.name_ar AS ub_name_ar, u.avatar_url AS ub_avatar_url
         FROM ${T.ai_settings} a LEFT JOIN ${T.users} u ON u.id = a.updated_by WHERE a.id = 1`,
      [],
      ex,
    );
  },

  async ensureSettings(): Promise<void> {
    await db.query(`INSERT INTO ${T.ai_settings} (id) VALUES (1) ON CONFLICT (id) DO NOTHING`);
  },

  async updateSettings(patch: Record<string, unknown>, by: string | null): Promise<void> {
    const keys = Object.keys(patch);
    if (!keys.length && !by) return;
    const sets = keys.map((k, i) => `${k} = $${i + 1}`);
    const values = keys.map((k) => {
      const v = patch[k];
      return v !== null && typeof v === 'object' && !Array.isArray(v) ? JSON.stringify(v) : v;
    });
    await db.query(`UPDATE ${T.ai_settings} SET ${[...sets, `updated_by = $${keys.length + 1}`, 'updated_at = now()'].join(', ')} WHERE id = 1`, [...values, by]);
  },

  subjectByIdOrSlug(idOrSlug: string): Promise<SubjectLite | null> {
    const isUuid = /^[0-9a-f-]{36}$/i.test(idOrSlug);
    return db.maybeOne<SubjectLite>(
      `SELECT id, slug, name_en, name_ar, color FROM ${T.subjects} WHERE ${isUuid ? 'id = $1::uuid' : 'slug = $1'} AND deleted_at IS NULL`,
      [idOrSlug],
    );
  },

  subjectById(id: string): Promise<SubjectLite | null> {
    return db.maybeOne<SubjectLite>(`SELECT id, slug, name_en, name_ar, color FROM ${T.subjects} WHERE id = $1`, [id]);
  },

  async listConversations(userId: string, subjectId: string | null, limit: number, offset: number): Promise<{ rows: ConversationRow[]; total: number }> {
    const where = `c.user_id = $1 AND c.deleted_at IS NULL AND ($2::uuid IS NULL OR c.subject_id = $2)`;
    const [rows, total] = await Promise.all([
      db.many<ConversationRow>(`${CONV_SELECT} WHERE ${where} ORDER BY coalesce(c.last_message_at, c.created_at) DESC, c.id DESC LIMIT $3 OFFSET $4`, [userId, subjectId, limit, offset]),
      db.scalar<number>(`SELECT count(*)::int FROM ${T.ai_conversations} c WHERE ${where}`, [userId, subjectId]),
    ]);
    return { rows, total: total ?? 0 };
  },

  getConversation(userId: string, id: string): Promise<ConversationRow | null> {
    return db.maybeOne<ConversationRow>(`${CONV_SELECT} WHERE c.id = $1 AND c.user_id = $2 AND c.deleted_at IS NULL`, [id, userId]);
  },

  async createConversation(userId: string, subjectId: string, title: string, platform: string | null): Promise<string> {
    const row = await db.one<{ id: string }>(
      `INSERT INTO ${T.ai_conversations} (user_id, subject_id, title, platform) VALUES ($1,$2,$3,$4) RETURNING id`,
      [userId, subjectId, title, platform && ['web', 'ios', 'android'].includes(platform) ? platform : null],
    );
    await db.query(`INSERT INTO ${T.ai_messages} (conversation_id, role, content, status) VALUES ($1, 'system', 'welcome', 'complete')`, [row.id]);
    return row.id;
  },

  async updateConversation(id: string, patch: { subjectId?: string; title?: string }): Promise<void> {
    await db.query(
      `UPDATE ${T.ai_conversations} SET subject_id = coalesce($2, subject_id), title = coalesce($3, title), updated_at = now() WHERE id = $1`,
      [id, patch.subjectId ?? null, patch.title ?? null],
    );
  },

  softDeleteConversation(userId: string, id: string): Promise<number> {
    return db.exec(`UPDATE ${T.ai_conversations} SET deleted_at = now(), updated_at = now() WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`, [id, userId]);
  },

  async hasStudentMessages(conversationId: string): Promise<boolean> {
    return (await db.scalar<boolean>(`SELECT EXISTS (SELECT 1 FROM ${T.ai_messages} WHERE conversation_id = $1 AND role = 'user')`, [conversationId])) ?? false;
  },

  /** Newest `limit` messages (optionally before a timestamp), returned chronologically. */
  async messages(conversationId: string, before: Date | null, limit: number): Promise<MessageRow[]> {
    const rows = await db.many<MessageRow>(
      `SELECT * FROM ${T.ai_messages} WHERE conversation_id = $1 AND ($2::timestamptz IS NULL OR created_at < $2)
        ORDER BY created_at DESC, id DESC LIMIT $3`,
      [conversationId, before, limit],
    );
    return rows.reverse();
  },

  /** Last `limit` completed turns for the model prompt. */
  async history(conversationId: string, limit: number): Promise<MessageRow[]> {
    const rows = await db.many<MessageRow>(
      `SELECT * FROM ${T.ai_messages} WHERE conversation_id = $1 AND role IN ('user', 'assistant') AND status = 'complete'
        ORDER BY created_at DESC LIMIT $2`,
      [conversationId, limit],
    );
    return rows.reverse();
  },

  byClientMessageId(conversationId: string, clientMessageId: string): Promise<MessageRow | null> {
    return db.maybeOne<MessageRow>(
      `SELECT * FROM ${T.ai_messages} WHERE conversation_id = $1 AND client_message_id = $2 AND role = 'user' ORDER BY created_at LIMIT 1`,
      [conversationId, clientMessageId],
    );
  },

  /** The assistant reply that follows a student message. */
  replyTo(studentMessage: MessageRow): Promise<MessageRow | null> {
    return db.maybeOne<MessageRow>(
      `SELECT * FROM ${T.ai_messages} WHERE conversation_id = $1 AND role = 'assistant' AND created_at >= $2 ORDER BY created_at LIMIT 1`,
      [studentMessage.conversation_id, studentMessage.created_at],
    );
  },

  async insertMessage(m: {
    id?: string;
    conversationId: string;
    role: 'user' | 'assistant';
    content: string;
    status: MessageRow['status'];
    attachmentFileKey?: string | null;
    clientMessageId?: string | null;
    lang?: string | null;
    createdAt?: Date;
  }): Promise<MessageRow> {
    return db.one<MessageRow>(
      `INSERT INTO ${T.ai_messages} (id, conversation_id, role, content, status, attachment_file_key, client_message_id, lang, created_at)
       VALUES (coalesce($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, coalesce($9::timestamptz, now())) RETURNING *`,
      [m.id ?? null, m.conversationId, m.role, m.content, m.status, m.attachmentFileKey ?? null, m.clientMessageId ?? null, m.lang ?? null, m.createdAt ?? null],
    );
  },

  async touchConversation(id: string, addMessages: number, titleIfEmpty: string | null): Promise<void> {
    await db.query(
      `UPDATE ${T.ai_conversations}
          SET message_count = message_count + $2, last_message_at = now(), updated_at = now(),
              title = CASE WHEN title = '' AND $3::text IS NOT NULL THEN $3 ELSE title END
        WHERE id = $1`,
      [id, addMessages, titleIfEmpty],
    );
  },

  async setPartial(id: string, content: string): Promise<void> {
    await db.query(`UPDATE ${T.ai_messages} SET content = $2, status = 'streaming', updated_at = now() WHERE id = $1 AND status IN ('pending', 'streaming')`, [id, content]);
  },

  async completeMessage(id: string, r: { content: string; tokensIn: number; tokensOut: number; costUsd: number; model: string; citations: unknown }): Promise<MessageRow> {
    return db.one<MessageRow>(
      `UPDATE ${T.ai_messages} SET content = $2, status = 'complete', tokens_in = $3, tokens_out = $4, cost_usd = $5, model = $6,
              citations = $7::jsonb, updated_at = now() WHERE id = $1 RETURNING *`,
      [id, r.content, r.tokensIn, r.tokensOut, r.costUsd, r.model, JSON.stringify(r.citations ?? [])],
    );
  },

  async failMessage(id: string, error: string, content: string): Promise<MessageRow | null> {
    return db.maybeOne<MessageRow>(`UPDATE ${T.ai_messages} SET status = 'failed', error = $2, content = $3, updated_at = now() WHERE id = $1 RETURNING *`, [id, error.slice(0, 500), content]);
  },

  async markCounted(id: string): Promise<void> {
    await db.query(`UPDATE ${T.ai_messages} SET counted = true WHERE id = $1`, [id]);
  },

  getMessageForUser(userId: string, messageId: string): Promise<MessageRow | null> {
    return db.maybeOne<MessageRow>(
      `SELECT m.* FROM ${T.ai_messages} m JOIN ${T.ai_conversations} c ON c.id = m.conversation_id
        WHERE m.id = $1 AND c.user_id = $2 AND c.deleted_at IS NULL`,
      [messageId, userId],
    );
  },

  async setFeedback(id: string, rating: 'up' | 'down' | null, comment: string | null): Promise<MessageRow> {
    return db.one<MessageRow>(
      `UPDATE ${T.ai_messages} SET feedback = $2, feedback_comment = $3, feedback_at = CASE WHEN $2::text IS NULL THEN NULL ELSE now() END WHERE id = $1 RETURNING *`,
      [id, rating, comment],
    );
  },

  /** Student questions sent in the last `seconds` (blocked ones excluded). */
  async recentQuestionCount(userId: string, seconds: number): Promise<number> {
    return (
      (await db.scalar<number>(
        `SELECT count(*)::int FROM ${T.ai_messages} m JOIN ${T.ai_conversations} c ON c.id = m.conversation_id
          WHERE c.user_id = $1 AND m.role = 'user' AND m.status <> 'blocked' AND m.created_at > now() - make_interval(secs => $2)`,
        [userId, seconds],
      )) ?? 0
    );
  },

  async addUsage(u: { userId: string; periodStart: Date; periodEnd: Date; allowance: number; tokensIn: number; tokensOut: number; costUsd: number }): Promise<void> {
    await db.query(
      `INSERT INTO ${T.ai_usage} (user_id, period_start, period_end, allowance, questions_used, tokens_in, tokens_out, cost_usd, last_used_at)
       VALUES ($1,$2,$3,$4,1,$5,$6,$7, now())
       ON CONFLICT (user_id, period_start) DO UPDATE SET
         questions_used = ${T.ai_usage}.questions_used + 1,
         tokens_in = ${T.ai_usage}.tokens_in + EXCLUDED.tokens_in,
         tokens_out = ${T.ai_usage}.tokens_out + EXCLUDED.tokens_out,
         cost_usd = ${T.ai_usage}.cost_usd + EXCLUDED.cost_usd,
         allowance = EXCLUDED.allowance, period_end = EXCLUDED.period_end, last_used_at = now(), updated_at = now()`,
      [u.userId, u.periodStart, u.periodEnd, u.allowance, u.tokensIn, u.tokensOut, u.costUsd],
    );
  },

  async insertFlag(f: {
    conversationId: string | null;
    messageId: string | null;
    userId: string;
    subjectId: string | null;
    reason: string;
    severity: string;
    excerpt: string;
    source: 'auto' | 'keyword' | 'rate_limit' | 'manual';
  }): Promise<string> {
    const row = await db.one<{ id: string }>(
      `INSERT INTO ${T.ai_flags} (conversation_id, message_id, user_id, subject_id, reason, severity, excerpt, source, auto_detected)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, $8 <> 'manual') RETURNING id`,
      [f.conversationId, f.messageId, f.userId, f.subjectId, f.reason, f.severity, f.excerpt, f.source],
    );
    if (f.conversationId) await db.query(`UPDATE ${T.ai_conversations} SET flagged = true WHERE id = $1`, [f.conversationId]);
    return row.id;
  },

  async recentRateLimitFlag(userId: string): Promise<boolean> {
    return (
      (await db.scalar<boolean>(
        `SELECT EXISTS (SELECT 1 FROM ${T.ai_flags} WHERE user_id = $1 AND source = 'rate_limit' AND created_at > now() - interval '1 hour')`,
        [userId],
      )) ?? false
    );
  },
};
