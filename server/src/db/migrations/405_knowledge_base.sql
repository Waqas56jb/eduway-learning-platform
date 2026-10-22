-- =====================================================================================================
-- 405_knowledge_base — AI-tutor knowledge-base (RAG) index runs: one row per (re)index of
-- eduway_platform_embeddings (manual admin action, content change, nightly cron, script). Drives the admin
-- "Reindex knowledge base" progress/status. Additive + idempotent; touches ONLY eduway_platform_ objects.
-- (The embeddings table itself is 012_embeddings — it needs the shared pgvector extension; this table does not.)
-- =====================================================================================================

CREATE TABLE IF NOT EXISTS eduway_platform_kb_index_runs (
  id                uuid NOT NULL DEFAULT gen_random_uuid(),
  trigger           text NOT NULL DEFAULT 'manual',
  scope             jsonb NOT NULL DEFAULT '{}'::jsonb,
  status            text NOT NULL DEFAULT 'queued',
  model             text NOT NULL DEFAULT '',
  sources_total     integer NOT NULL DEFAULT 0,
  sources_done      integer NOT NULL DEFAULT 0,
  chunks_total      integer NOT NULL DEFAULT 0,
  chunks_embedded   integer NOT NULL DEFAULT 0,
  chunks_unchanged  integer NOT NULL DEFAULT 0,
  chunks_deleted    integer NOT NULL DEFAULT 0,
  tokens            integer NOT NULL DEFAULT 0,
  cost_usd          numeric(12, 6) NOT NULL DEFAULT 0,
  error             text,
  requested_by      uuid,
  started_at        timestamptz,
  finished_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_kb_index_runs_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_kb_index_runs_trigger_check CHECK (trigger IN ('manual', 'content', 'cron', 'script')),
  CONSTRAINT eduway_platform_kb_index_runs_status_check CHECK (status IN ('queued', 'running', 'completed', 'failed', 'skipped')),
  CONSTRAINT eduway_platform_kb_index_runs_by_fkey FOREIGN KEY (requested_by) REFERENCES eduway_platform_users (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_kb_index_runs_created ON eduway_platform_kb_index_runs (created_at DESC);
SELECT eduway_platform_fn_secure_table('eduway_platform_kb_index_runs');
