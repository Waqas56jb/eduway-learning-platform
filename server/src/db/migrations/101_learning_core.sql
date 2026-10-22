-- =====================================================================================================
-- 101_learning_core — Agent B (content, questions, quizzes, practice, mistakes, exams, progress, search).
-- Additive, idempotent column/index/constraint changes on tables created by 005/006/009.
-- PREFIX POLICY: every object referenced or created here starts with eduway_platform_.
-- =====================================================================================================

-- ── quizzes: served set number, mistakes created per attempt, fill-blank text answers ────────────────
ALTER TABLE eduway_platform_quiz_attempts ADD COLUMN IF NOT EXISTS set_number integer NOT NULL DEFAULT 1;
ALTER TABLE eduway_platform_quiz_attempts ADD COLUMN IF NOT EXISTS mistakes_added integer NOT NULL DEFAULT 0;
ALTER TABLE eduway_platform_quiz_attempt_answers ADD COLUMN IF NOT EXISTS text_answer text;
CREATE INDEX IF NOT EXISTS eduway_platform_idx_quiz_attempts_user_lesson
  ON eduway_platform_quiz_attempts (user_id, lesson_id, started_at DESC);

-- ── practice sessions: served option order, attempt counter, timing, titles ──────────────────────────
ALTER TABLE eduway_platform_practice_sessions ADD COLUMN IF NOT EXISTS option_orders jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE eduway_platform_practice_sessions ADD COLUMN IF NOT EXISTS attempt_number integer NOT NULL DEFAULT 1;
ALTER TABLE eduway_platform_practice_sessions ADD COLUMN IF NOT EXISTS time_spent_sec integer NOT NULL DEFAULT 0;
ALTER TABLE eduway_platform_practice_sessions ADD COLUMN IF NOT EXISTS mistakes_added integer NOT NULL DEFAULT 0;
ALTER TABLE eduway_platform_practice_sessions ADD COLUMN IF NOT EXISTS title_en text NOT NULL DEFAULT '';
ALTER TABLE eduway_platform_practice_sessions ADD COLUMN IF NOT EXISTS title_ar text NOT NULL DEFAULT '';
ALTER TABLE eduway_platform_practice_sessions ADD COLUMN IF NOT EXISTS subtitle_en text NOT NULL DEFAULT '';
ALTER TABLE eduway_platform_practice_sessions ADD COLUMN IF NOT EXISTS subtitle_ar text NOT NULL DEFAULT '';
ALTER TABLE eduway_platform_practice_answers ADD COLUMN IF NOT EXISTS text_answer text;

-- ── mistakes: text answers, history correctness + status changes ─────────────────────────────────────
ALTER TABLE eduway_platform_mistake_records ADD COLUMN IF NOT EXISTS text_answer text;
ALTER TABLE eduway_platform_mistake_history ADD COLUMN IF NOT EXISTS text_answer text;
ALTER TABLE eduway_platform_mistake_history ADD COLUMN IF NOT EXISTS correct boolean;
ALTER TABLE eduway_platform_mistake_history ADD COLUMN IF NOT EXISTS status_to text;
DO $$
BEGIN
  -- Widen the event set with 'status_change' (MST-04). Only our own prefixed constraint is touched.
  IF EXISTS (SELECT 1 FROM pg_constraint
              WHERE conname = 'eduway_platform_mistake_history_event_check'
                AND pg_get_constraintdef(oid) NOT LIKE '%status_change%') THEN
    ALTER TABLE eduway_platform_mistake_history DROP CONSTRAINT eduway_platform_mistake_history_event_check;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eduway_platform_mistake_history_event_check') THEN
    ALTER TABLE eduway_platform_mistake_history ADD CONSTRAINT eduway_platform_mistake_history_event_check
      CHECK (event IN ('wrong', 'retry_correct', 'retry_wrong', 'reviewed', 'mastered', 'reset', 'status_change'));
  END IF;
END
$$;
CREATE INDEX IF NOT EXISTS eduway_platform_idx_mistake_records_subject
  ON eduway_platform_mistake_records (user_id, subject_id, unit_id, topic_id);

-- ── exams: autosave sequencing, resume position, submit bookkeeping ──────────────────────────────────
ALTER TABLE eduway_platform_exam_attempts ADD COLUMN IF NOT EXISTS autosave_seq integer NOT NULL DEFAULT 0;
ALTER TABLE eduway_platform_exam_attempts ADD COLUMN IF NOT EXISTS current_index integer NOT NULL DEFAULT 0;
ALTER TABLE eduway_platform_exam_attempts ADD COLUMN IF NOT EXISTS client_saved_at timestamptz;
ALTER TABLE eduway_platform_exam_attempts ADD COLUMN IF NOT EXISTS mistakes_added integer NOT NULL DEFAULT 0;
ALTER TABLE eduway_platform_exam_attempts ADD COLUMN IF NOT EXISTS submit_reason text;
ALTER TABLE eduway_platform_exam_attempts ADD COLUMN IF NOT EXISTS raw_score numeric(8,2);
ALTER TABLE eduway_platform_exam_attempts ADD COLUMN IF NOT EXISTS max_score numeric(8,2);

-- ── videos: library metadata (file name, renditions, processing progress, detach time) ───────────────
ALTER TABLE eduway_platform_video_assets ADD COLUMN IF NOT EXISTS file_name text;
ALTER TABLE eduway_platform_video_assets ADD COLUMN IF NOT EXISTS renditions text[] NOT NULL DEFAULT '{}';
ALTER TABLE eduway_platform_video_assets ADD COLUMN IF NOT EXISTS processing_progress integer;
ALTER TABLE eduway_platform_video_assets ADD COLUMN IF NOT EXISTS detached_at timestamptz;
CREATE INDEX IF NOT EXISTS eduway_platform_idx_video_assets_status ON eduway_platform_video_assets (stream_status, cdn_status);

-- ── question imports: upload reference + expiry ──────────────────────────────────────────────────────
ALTER TABLE eduway_platform_question_imports ADD COLUMN IF NOT EXISTS file_key text;
ALTER TABLE eduway_platform_question_imports ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE eduway_platform_question_imports ADD COLUMN IF NOT EXISTS created_ids uuid[] NOT NULL DEFAULT '{}';

-- ── lessons / questions lookup helpers ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS eduway_platform_idx_questions_status_topic ON eduway_platform_questions (status, topic_id, difficulty);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_lesson_completions_user ON eduway_platform_lesson_completions (user_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_bookmarks_user ON eduway_platform_bookmarks (user_id, entity_type, created_at DESC);
