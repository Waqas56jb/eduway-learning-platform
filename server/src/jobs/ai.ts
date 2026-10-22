/** AI tutor jobs: allowance period reset + knowledge-base (pgvector RAG) indexing. */
import { T } from '../config/constants.js';
import { db } from '../config/db.js';
import { logger } from '../config/logger.js';
import { periodFor } from '../modules/ai-tutor/allowance.js';
import { createRun, executeRun, syncKnowledgeBase, type KbScope, type KbTrigger } from '../modules/ai-tutor/knowledge-base.js';
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

// ── knowledge base (embeddings) ───────────────────────────────────────────────────────────────────

export { chunkText } from '../modules/ai-tutor/knowledge-base.js';

/** Back-compat helper: sync one lesson / question (or everything) without a run row. */
export async function generateEmbeddings(opts: { lessonId?: string; questionId?: string } = {}): Promise<{ embedded: number; skipped: string | null }> {
  const scope: KbScope | undefined = opts.lessonId ? { ids: { lesson: [opts.lessonId] } } : opts.questionId ? { ids: { question_explanation: [opts.questionId] } } : undefined;
  const r = await syncKnowledgeBase(scope);
  return { embedded: r.embedded, skipped: r.skipped };
}

/**
 * `eduway.kb-index` — execute one knowledge-base index run (`{ runId }`), created by the admin "Reindex" action
 * (ADM-AI-17) or a debounced content-change trigger. Progress/status live on the run row.
 */
registerJob<{ runId: string }>({
  name: 'eduway.kb-index',
  description: 'Run one AI-tutor knowledge-base (pgvector RAG) index run (admin reindex / content change).',
  retryLimit: 1,
  handler: async (data) => {
    if (!data.runId) return;
    const r = await executeRun(data.runId);
    logger.info({ runId: data.runId, status: r?.status, embedded: r?.chunks_embedded, unchanged: r?.chunks_unchanged, deleted: r?.chunks_deleted, tokens: r?.tokens }, 'knowledge-base index run finished');
  },
});

/**
 * `eduway.embeddings-generate` — nightly full, incremental (hash-based) reindex of the knowledge base: published
 * lessons, units, topics, question explanations and FAQs → eduway_platform_embeddings. Unchanged chunks are not
 * re-embedded; unpublished/deleted sources are removed.
 */
registerJob<{ trigger?: KbTrigger; force?: boolean }>({
  name: 'eduway.embeddings-generate',
  description: 'Nightly knowledge-base reindex (pgvector RAG): lessons, units, topics, question explanations, FAQs.',
  cron: '30 23 * * *',
  retryLimit: 1,
  handler: async (data) => {
    const run = await createRun(data.trigger ?? 'cron', undefined, null, !!data.force);
    const r = await executeRun(run.id);
    logger.info({ runId: run.id, status: r?.status, embedded: r?.chunks_embedded, unchanged: r?.chunks_unchanged, deleted: r?.chunks_deleted, tokens: r?.tokens }, 'knowledge-base nightly index finished');
  },
});
