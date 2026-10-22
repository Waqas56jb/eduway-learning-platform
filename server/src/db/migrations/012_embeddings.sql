-- =====================================================================================================
-- 012_embeddings — pgvector store for AI-tutor retrieval (lesson transcripts + question explanations).
-- The `vector` extension is SHARED infrastructure: we never CREATE EXTENSION. If it is not enabled
-- (Dashboard → Database → Extensions → vector), this migration is skipped with a NOTICE and the AI tutor
-- falls back to keyword retrieval. Re-run `npm run migrate` after enabling it: the runner re-applies
-- migrations whose ledger row says `skipped`.
-- =====================================================================================================
DO $$
DECLARE
  v_schema text;
BEGIN
  SELECT n.nspname INTO v_schema
  FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'vector';

  IF v_schema IS NULL THEN
    RAISE NOTICE 'eduway_platform: pgvector extension not enabled — skipping eduway_platform_embeddings (EDUWAY_SKIPPED)';
    RETURN;
  END IF;

  IF to_regclass('public.eduway_platform_embeddings') IS NULL THEN
    EXECUTE format($sql$
      CREATE TABLE public.eduway_platform_embeddings (
        id           uuid NOT NULL DEFAULT gen_random_uuid(),
        source_type  text NOT NULL,
        source_id    uuid NOT NULL,
        subject_id   uuid,
        lesson_id    uuid,
        locale       text NOT NULL DEFAULT 'en',
        chunk_index  integer NOT NULL DEFAULT 0,
        content      text NOT NULL,
        content_hash text NOT NULL,
        model        text NOT NULL DEFAULT '',
        embedding    %I.vector(1536),
        created_at   timestamptz NOT NULL DEFAULT now(),
        updated_at   timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT eduway_platform_embeddings_pkey PRIMARY KEY (id),
        CONSTRAINT eduway_platform_embeddings_src_chunk_key UNIQUE (source_type, source_id, locale, chunk_index),
        CONSTRAINT eduway_platform_embeddings_type_check CHECK (source_type IN ('lesson_transcript', 'question_explanation', 'lesson_notes')),
        CONSTRAINT eduway_platform_embeddings_subject_fkey FOREIGN KEY (subject_id) REFERENCES public.eduway_platform_subjects (id) ON DELETE CASCADE,
        CONSTRAINT eduway_platform_embeddings_lesson_fkey FOREIGN KEY (lesson_id) REFERENCES public.eduway_platform_lessons (id) ON DELETE CASCADE
      )$sql$, v_schema);
  END IF;

  IF to_regclass('public.eduway_platform_idx_embeddings_vec') IS NULL THEN
    EXECUTE format(
      'CREATE INDEX eduway_platform_idx_embeddings_vec ON public.eduway_platform_embeddings USING hnsw (embedding %I.vector_cosine_ops)',
      v_schema);
  END IF;
  CREATE INDEX IF NOT EXISTS eduway_platform_idx_embeddings_subject ON public.eduway_platform_embeddings (subject_id);
  PERFORM eduway_platform_fn_secure_table('eduway_platform_embeddings');
END
$$;
