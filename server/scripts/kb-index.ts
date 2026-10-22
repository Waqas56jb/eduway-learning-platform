/**
 * npm run kb:index [-- --force]
 * (Re)index the AI-tutor knowledge base (pgvector RAG) now, in this process — same code path as the admin
 * "Reindex knowledge base" action / `eduway.embeddings-generate` job. Incremental (hash-based) unless --force.
 */
import { closeDb } from '../src/config/db.js';
import { createRun, executeRun, knowledgeBaseStatus } from '../src/modules/ai-tutor/knowledge-base.js';

async function main() {
  const force = process.argv.includes('--force');
  const run = await createRun('script', undefined, null, force);
  const started = Date.now();
  const r = await executeRun(run.id);
  const st = await knowledgeBaseStatus();
  console.log(
    JSON.stringify(
      {
        run: r && { status: r.status, model: r.model, sources: r.sources_total, chunks: r.chunks_total, embedded: r.chunks_embedded, unchanged: r.chunks_unchanged, deleted: r.chunks_deleted, tokens: r.tokens, costUsd: Number(r.cost_usd), error: r.error },
        ms: Date.now() - started,
        index: { embeddingModel: st.embeddingModel, realEmbeddings: st.realEmbeddings, totals: st.totals },
      },
      null,
      2,
    ),
  );
  if (r?.status === 'failed') process.exitCode = 1;
}

main()
  .catch((err: Error) => {
    console.error(`KB INDEX FAILED: ${err.message.replace(/postgres(ql)?:\/\/\S+/gi, '[db-url]')}`);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
