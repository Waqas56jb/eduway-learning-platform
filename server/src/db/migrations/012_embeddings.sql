-- =====================================================================================================
-- 012_embeddings — pgvector knowledge base for AI-tutor retrieval (RAG): published lessons (title, description,
-- transcript), units, topics, question-bank explanations and FAQs, chunked + embedded per locale.
-- The `vector` extension is SHARED infrastructure: we never CREATE EXTENSION. If it is not enabled
-- (Dashboard → Database → Extensions → vector), this migration is skipped with a NOTICE and the AI tutor
-- falls back to keyword retrieval. Re-run `npm run migrate` after enabling it: the runner re-applies
-- migrations whose ledger row says `skipped`.
-- The extension may live in any schema (Supabase: `extensions`), so the vector type and operator class are
-- schema-qualified via format(%I) — nothing depends on search_path.
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
        unit_id      uuid,
        lesson_id    uuid,
        locale       text NOT NULL DEFAULT 'en',
        chunk_index  integer NOT NULL DEFAULT 0,
        title        text NOT NULL DEFAULT '',
        content      text NOT NULL,
        content_hash text NOT NULL,
        model        text NOT NULL DEFAULT '',
        tokens       integer NOT NULL DEFAULT 0,
        embedding    %I.vector(1536),
        created_at   timestamptz NOT NULL DEFAULT now(),
        updated_at   timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT eduway_platform_embeddings_pkey PRIMARY KEY (id),
        CONSTRAINT eduway_platform_embeddings_src_chunk_key UNIQUE (source_type, source_id, locale, chunk_index),
        CONSTRAINT eduway_platform_embeddings_type_check CHECK (source_type IN
          ('lesson', 'unit', 'topic', 'question_explanation', 'faq', 'lesson_transcript', 'lesson_notes')),
        CONSTRAINT eduway_platform_embeddings_locale_check CHECK (locale IN ('en', 'ar')),
        CONSTRAINT eduway_platform_embeddings_subject_fkey FOREIGN KEY (subject_id) REFERENCES public.eduway_platform_subjects (id) ON DELETE CASCADE,
        CONSTRAINT eduway_platform_embeddings_unit_fkey FOREIGN KEY (unit_id) REFERENCES public.eduway_platform_units (id) ON DELETE CASCADE,
        CONSTRAINT eduway_platform_embeddings_lesson_fkey FOREIGN KEY (lesson_id) REFERENCES public.eduway_platform_lessons (id) ON DELETE CASCADE
      )$sql$, v_schema);
  END IF;

  -- HNSW cosine index (pgvector ≥ 0.5). Retrieval orders by `embedding <=> query` so this index serves top-k.
  IF to_regclass('public.eduway_platform_idx_embeddings_vec') IS NULL THEN
    EXECUTE format(
      'CREATE INDEX eduway_platform_idx_embeddings_vec ON public.eduway_platform_embeddings USING hnsw (embedding %I.vector_cosine_ops)',
      v_schema);
  END IF;
  CREATE INDEX IF NOT EXISTS eduway_platform_idx_embeddings_subject ON public.eduway_platform_embeddings (subject_id, locale);
  CREATE INDEX IF NOT EXISTS eduway_platform_idx_embeddings_source ON public.eduway_platform_embeddings (source_type, source_id);
  CREATE INDEX IF NOT EXISTS eduway_platform_idx_embeddings_lesson ON public.eduway_platform_embeddings (lesson_id);
  PERFORM eduway_platform_fn_secure_table('eduway_platform_embeddings');
END
$$;
