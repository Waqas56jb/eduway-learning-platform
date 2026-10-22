/** AI tutor jobs: allowance period reset + pgvector embeddings generation. */
import { T } from '../config/constants.js';
import { db } from '../config/db.js';
import { logger } from '../config/logger.js';
import { sha256 } from '../common/utils/crypto.js';
import { periodFor } from '../modules/ai-tutor/allowance.js';
import { embeddingProvider } from '../modules/ai-tutor/providers/index.js';
import { invalidateVectorCache } from '../modules/ai-tutor/retrieval.js';
import { loadAiSettings } from '../modules/ai-tutor/settings.js';
import { registerJob } from './index.js';

/**
 * Opens the current allowance period for every student with an active AI-enabled subscription: inserts the empty
 * `ai_usage` row (questions_used = 0, allowance snapshot) when missing. Usage rows are keyed by period start, so this
 * IS the reset — calendar cycle on the 1st 00:00 Baghdad time, billing cycle on each subscription's monthly
 * anniversary. Idempotent; runs hourly.
 */
export async function resetAiAllowances(now = new Date()): Promise<{ opened: number; checked: number }> {
  const settings = await loadAiSettings();
  const subs = await db.many<{ user_id: string; starts_at: Date; ai_quota: number }>(
    `SELECT DISTINCT ON (user_id) user_id, starts_at, ai_quota FROM ${T.subscriptions}
      WHERE status IN ('active', 'trial') AND starts_at <= $1 AND ends_at > $1 AND ai_quota > 0
      ORDER BY user_id, ends_at DESC`,
    [now],
  );
  let opened = 0;
  for (const s of subs) {
    const p = periodFor(settings.reset_cycle, s.starts_at, now);
    opened += await db.exec(
      `INSERT INTO ${T.ai_usage} (user_id, period_start, period_end, allowance) VALUES ($1,$2,$3,$4)
       ON CONFLICT (user_id, period_start) DO NOTHING`,
      [s.user_id, p.start, p.end, s.ai_quota],
    );
  }
  return { opened, checked: subs.length };
}

registerJob({
  name: 'eduway.ai-allowance-reset',
  description: 'Open the new AI allowance period (calendar month / billing anniversary).',
  cron: '5 * * * *',
  handler: async () => {
    const r = await resetAiAllowances();
    if (r.opened) logger.info(r, 'AI allowance periods opened');
  },
});

// ── embeddings ───────────────────────────────────────────────────────────────────────────────────────

/** Split long text into ~800-char chunks on paragraph/sentence boundaries. */
export function chunkText(text: string, max = 800): string[] {
  const clean = text.replace(/\r/g, '').trim();
  if (!clean) return [];
  const parts = clean.split(/\n{2,}|(?<=[.!?؟])\s+/);
  const out: string[] = [];
  let cur = '';
  for (const p of parts) {
    if ((cur + ' ' + p).trim().length > max && cur) {
      out.push(cur.trim());
      cur = p;
    } else cur = `${cur} ${p}`;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.flatMap((c) => (c.length > max * 1.5 ? (c.match(new RegExp(`[\\s\\S]{1,${max}}`, 'g')) ?? []) : [c]));
}

interface Doc {
  sourceType: 'lesson_transcript' | 'question_explanation';
  sourceId: string;
  subjectId: string;
  lessonId: string | null;
  locale: 'en' | 'ar';
  text: string;
}

export async function generateEmbeddings(opts: { lessonId?: string; questionId?: string } = {}): Promise<{ embedded: number; skipped: string | null }> {
  const exists = await db.scalar<boolean>(`SELECT to_regclass($1) IS NOT NULL`, [`public.${T.embeddings}`]);
  if (!exists) return { embedded: 0, skipped: 'vector extension / embeddings table not available' };
  const { provider, model } = embeddingProvider();
  if (!provider.embed) return { embedded: 0, skipped: 'no embedding provider' };

  const docs: Doc[] = [];
  if (!opts.questionId) {
    const lessons = await db.many<{ id: string; subject_id: string; title_en: string; title_ar: string; description_en: string; description_ar: string; transcript_en: string | null; transcript_ar: string | null }>(
      `SELECT id, subject_id, title_en, title_ar, description_en, description_ar, transcript_en, transcript_ar FROM ${T.lessons}
        WHERE status = 'published' AND deleted_at IS NULL AND ($1::uuid IS NULL OR id = $1)`,
      [opts.lessonId ?? null],
    );
    for (const l of lessons) {
      for (const locale of ['en', 'ar'] as const) {
        const body = (locale === 'en' ? l.transcript_en : l.transcript_ar)?.trim() || (locale === 'en' ? l.description_en : l.description_ar);
        docs.push({ sourceType: 'lesson_transcript', sourceId: l.id, subjectId: l.subject_id, lessonId: l.id, locale, text: `${locale === 'en' ? l.title_en : l.title_ar}\n\n${body}` });
      }
    }
  }
  if (!opts.lessonId) {
    const qs = await db.many<{ id: string; subject_id: string; lesson_id: string | null; body_en: string; body_ar: string; explanation_en: string; explanation_ar: string }>(
      `SELECT id, subject_id, lesson_id, body_en, body_ar, explanation_en, explanation_ar FROM ${T.questions}
        WHERE status = 'published' AND deleted_at IS NULL AND (explanation_en <> '' OR explanation_ar <> '') AND ($1::uuid IS NULL OR id = $1)`,
      [opts.questionId ?? null],
    );
    for (const q of qs) {
      for (const locale of ['en', 'ar'] as const) {
        const expl = locale === 'en' ? q.explanation_en : q.explanation_ar;
        if (expl.trim()) docs.push({ sourceType: 'question_explanation', sourceId: q.id, subjectId: q.subject_id, lessonId: q.lesson_id, locale, text: `${locale === 'en' ? q.body_en : q.body_ar}\n\n${expl}` });
      }
    }
  }

  let embedded = 0;
  const pending: { doc: Doc; idx: number; content: string; hash: string }[] = [];
  for (const d of docs) {
    const chunks = chunkText(d.text);
    const existing = await db.many<{ chunk_index: number; content_hash: string }>(
      `SELECT chunk_index, content_hash FROM ${T.embeddings} WHERE source_type = $1 AND source_id = $2 AND locale = $3`,
      [d.sourceType, d.sourceId, d.locale],
    );
    const have = new Map(existing.map((e) => [e.chunk_index, e.content_hash]));
    chunks.forEach((content, idx) => {
      const hash = sha256(`${model}:${content}`);
      if (have.get(idx) !== hash) pending.push({ doc: d, idx, content, hash });
    });
    await db.query(`DELETE FROM ${T.embeddings} WHERE source_type = $1 AND source_id = $2 AND locale = $3 AND chunk_index >= $4`, [d.sourceType, d.sourceId, d.locale, chunks.length]);
  }
  for (let i = 0; i < pending.length; i += 64) {
    const batch = pending.slice(i, i + 64);
    const vectors = await provider.embed(batch.map((b) => b.content), model);
    for (const [k, b] of batch.entries()) {
      const vec = vectors[k];
      if (!vec) continue;
      await db.query(
        `INSERT INTO ${T.embeddings} (source_type, source_id, subject_id, lesson_id, locale, chunk_index, content, content_hash, model, embedding)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::text::vector)
         ON CONFLICT (source_type, source_id, locale, chunk_index) DO UPDATE SET content = EXCLUDED.content, content_hash = EXCLUDED.content_hash,
           model = EXCLUDED.model, embedding = EXCLUDED.embedding, subject_id = EXCLUDED.subject_id, lesson_id = EXCLUDED.lesson_id, updated_at = now()`,
        [b.doc.sourceType, b.doc.sourceId, b.doc.subjectId, b.doc.lessonId, b.doc.locale, b.idx, b.content, b.hash, model, `[${vec.join(',')}]`],
      );
      embedded++;
    }
  }
  if (embedded) invalidateVectorCache();
  return { embedded, skipped: null };
}

registerJob<{ lessonId?: string; questionId?: string }>({
  name: 'eduway.embeddings-generate',
  description: 'Embed published lesson transcripts + question explanations into eduway_platform_embeddings (pgvector).',
  cron: '30 23 * * *',
  handler: async (data) => {
    const r = await generateEmbeddings(data);
    logger.info(r, 'embeddings generation finished');
  },
});
