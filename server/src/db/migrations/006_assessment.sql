-- =====================================================================================================
-- 006_assessment — question bank, tags, imports/reviews, quizzes, practice, bookmarks, mistakes, exams.
-- =====================================================================================================

CREATE TABLE IF NOT EXISTS eduway_platform_tags (
  id          uuid NOT NULL DEFAULT gen_random_uuid(),
  slug        text NOT NULL,
  name_en     text NOT NULL,
  name_ar     text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_tags_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_tags_slug_key UNIQUE (slug)
);
SELECT eduway_platform_fn_secure_table('eduway_platform_tags');

CREATE TABLE IF NOT EXISTS eduway_platform_questions (
  id               uuid NOT NULL DEFAULT gen_random_uuid(),
  code             text NOT NULL,
  subject_id       uuid NOT NULL,
  unit_id          uuid,
  topic_id         uuid,
  lesson_id        uuid,
  type             text NOT NULL DEFAULT 'mcq',
  difficulty       eduway_platform_enum_difficulty NOT NULL DEFAULT 'medium',
  topic_label_en   text NOT NULL DEFAULT '',
  topic_label_ar   text NOT NULL DEFAULT '',
  body_en          text NOT NULL,
  body_ar          text NOT NULL,
  formula          text,
  image_bucket     text,
  image_path       text,
  image_url        text,
  explanation_en   text NOT NULL DEFAULT '',
  explanation_ar   text NOT NULL DEFAULT '',
  source           text NOT NULL DEFAULT 'EDUWAY Original',
  year             integer,
  status           text NOT NULL DEFAULT 'draft',
  content_hash     text,
  duplicate_of     uuid,
  review_comment   text,
  author_id        uuid,
  reviewer_id      uuid,
  usage_count      integer NOT NULL DEFAULT 0,
  attempts_count   integer NOT NULL DEFAULT 0,
  correct_count    integer NOT NULL DEFAULT 0,
  published_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz,
  CONSTRAINT eduway_platform_questions_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_questions_code_key UNIQUE (code),
  CONSTRAINT eduway_platform_questions_type_check CHECK (type IN ('mcq', 'true_false', 'fill_blank')),
  CONSTRAINT eduway_platform_questions_status_check CHECK (status IN ('draft', 'in_review', 'approved', 'published', 'archived')),
  CONSTRAINT eduway_platform_questions_bucket_check CHECK (image_bucket IS NULL OR image_bucket LIKE 'eduway-platform-%'),
  CONSTRAINT eduway_platform_questions_subject_fkey FOREIGN KEY (subject_id) REFERENCES eduway_platform_subjects (id) ON DELETE CASCADE,
  CONSTRAINT eduway_platform_questions_unit_fkey FOREIGN KEY (unit_id) REFERENCES eduway_platform_units (id) ON DELETE SET NULL,
  CONSTRAINT eduway_platform_questions_topic_fkey FOREIGN KEY (topic_id) REFERENCES eduway_platform_topics (id) ON DELETE SET NULL,
  CONSTRAINT eduway_platform_questions_lesson_fkey FOREIGN KEY (lesson_id) REFERENCES eduway_platform_lessons (id) ON DELETE SET NULL,
  CONSTRAINT eduway_platform_questions_dup_fkey FOREIGN KEY (duplicate_of) REFERENCES eduway_platform_questions (id) ON DELETE SET NULL,
  CONSTRAINT eduway_platform_questions_author_fkey FOREIGN KEY (author_id) REFERENCES eduway_platform_users (id) ON DELETE SET NULL,
  CONSTRAINT eduway_platform_questions_reviewer_fkey FOREIGN KEY (reviewer_id) REFERENCES eduway_platform_users (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_questions_subject ON eduway_platform_questions (subject_id, status, difficulty);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_questions_unit ON eduway_platform_questions (unit_id);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_questions_topic ON eduway_platform_questions (topic_id);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_questions_lesson ON eduway_platform_questions (lesson_id);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_questions_hash ON eduway_platform_questions (content_hash);
SELECT eduway_platform_fn_secure_table('eduway_platform_questions');

CREATE TABLE IF NOT EXISTS eduway_platform_question_options (
  id           uuid NOT NULL DEFAULT gen_random_uuid(),
  question_id  uuid NOT NULL,
  sort_order   integer NOT NULL DEFAULT 0,
  text_en      text NOT NULL,
  text_ar      text NOT NULL,
  is_correct   boolean NOT NULL DEFAULT false,
  image_path   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_question_options_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_question_options_q_order_key UNIQUE (question_id, sort_order),
  CONSTRAINT eduway_platform_question_options_q_fkey FOREIGN KEY (question_id) REFERENCES eduway_platform_questions (id) ON DELETE CASCADE
);
SELECT eduway_platform_fn_secure_table('eduway_platform_question_options');

CREATE TABLE IF NOT EXISTS eduway_platform_question_tags (
  question_id  uuid NOT NULL,
  tag_id       uuid NOT NULL,
  CONSTRAINT eduway_platform_question_tags_pkey PRIMARY KEY (question_id, tag_id),
  CONSTRAINT eduway_platform_question_tags_q_fkey FOREIGN KEY (question_id) REFERENCES eduway_platform_questions (id) ON DELETE CASCADE,
  CONSTRAINT eduway_platform_question_tags_tag_fkey FOREIGN KEY (tag_id) REFERENCES eduway_platform_tags (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_question_tags_tag ON eduway_platform_question_tags (tag_id);
SELECT eduway_platform_fn_secure_table('eduway_platform_question_tags');

CREATE TABLE IF NOT EXISTS eduway_platform_question_imports (
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  file_name       text NOT NULL,
  storage_bucket  text,
  storage_path    text,
  status          text NOT NULL DEFAULT 'uploaded',
  total_rows      integer NOT NULL DEFAULT 0,
  valid_rows      integer NOT NULL DEFAULT 0,
  error_rows      integer NOT NULL DEFAULT 0,
  duplicate_rows  integer NOT NULL DEFAULT 0,
  errors          jsonb NOT NULL DEFAULT '[]'::jsonb,
  preview         jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by      uuid,
  committed_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_question_imports_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_question_imports_status_check CHECK (status IN ('uploaded', 'previewed', 'processing', 'committed', 'failed')),
  CONSTRAINT eduway_platform_question_imports_by_fkey FOREIGN KEY (created_by) REFERENCES eduway_platform_users (id) ON DELETE SET NULL
);
SELECT eduway_platform_fn_secure_table('eduway_platform_question_imports');

CREATE TABLE IF NOT EXISTS eduway_platform_question_reviews (
  id           uuid NOT NULL DEFAULT gen_random_uuid(),
  question_id  uuid NOT NULL,
  reviewer_id  uuid,
  decision     text NOT NULL,
  comment      text NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_question_reviews_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_question_reviews_decision_check CHECK (decision IN ('approved', 'rejected', 'changes_requested')),
  CONSTRAINT eduway_platform_question_reviews_q_fkey FOREIGN KEY (question_id) REFERENCES eduway_platform_questions (id) ON DELETE CASCADE,
  CONSTRAINT eduway_platform_question_reviews_by_fkey FOREIGN KEY (reviewer_id) REFERENCES eduway_platform_users (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_question_reviews_q ON eduway_platform_question_reviews (question_id, created_at DESC);
SELECT eduway_platform_fn_secure_table('eduway_platform_question_reviews');

-- Quiz rules: one global default, optional per-subject and per-lesson overrides.
CREATE TABLE IF NOT EXISTS eduway_platform_quiz_rules (
  id                            uuid NOT NULL DEFAULT gen_random_uuid(),
  scope                         text NOT NULL,
  subject_id                    uuid,
  lesson_id                     uuid,
  question_count                integer NOT NULL DEFAULT 5,
  pool_size                     integer NOT NULL DEFAULT 15,
  randomize_questions           boolean NOT NULL DEFAULT true,
  randomize_options             boolean NOT NULL DEFAULT true,
  alternative_sets              integer NOT NULL DEFAULT 3,
  pass_threshold                integer NOT NULL DEFAULT 60,
  retry_policy                  text NOT NULL DEFAULT 'unlimited',
  max_retries                   integer NOT NULL DEFAULT 0,
  cooldown_minutes              integer NOT NULL DEFAULT 0,
  show_explanation              boolean NOT NULL DEFAULT true,
  require_completion_to_unlock  boolean NOT NULL DEFAULT false,
  time_limit_sec                integer,
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_quiz_rules_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_quiz_rules_scope_check CHECK (
    (scope = 'global' AND subject_id IS NULL AND lesson_id IS NULL) OR
    (scope = 'subject' AND subject_id IS NOT NULL AND lesson_id IS NULL) OR
    (scope = 'lesson' AND lesson_id IS NOT NULL)),
  CONSTRAINT eduway_platform_quiz_rules_retry_check CHECK (retry_policy IN ('unlimited', 'limited', 'cooldown')),
  CONSTRAINT eduway_platform_quiz_rules_sets_check CHECK (alternative_sets BETWEEN 1 AND 5),
  CONSTRAINT eduway_platform_quiz_rules_pass_check CHECK (pass_threshold BETWEEN 0 AND 100),
  CONSTRAINT eduway_platform_quiz_rules_subject_fkey FOREIGN KEY (subject_id) REFERENCES eduway_platform_subjects (id) ON DELETE CASCADE,
  CONSTRAINT eduway_platform_quiz_rules_lesson_fkey FOREIGN KEY (lesson_id) REFERENCES eduway_platform_lessons (id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS eduway_platform_uq_quiz_rules_global ON eduway_platform_quiz_rules (scope) WHERE scope = 'global';
CREATE UNIQUE INDEX IF NOT EXISTS eduway_platform_uq_quiz_rules_subject ON eduway_platform_quiz_rules (subject_id) WHERE scope = 'subject';
CREATE UNIQUE INDEX IF NOT EXISTS eduway_platform_uq_quiz_rules_lesson ON eduway_platform_quiz_rules (lesson_id) WHERE scope = 'lesson';
SELECT eduway_platform_fn_secure_table('eduway_platform_quiz_rules');

-- Up to 5 pre-generated alternative question sets per lesson.
CREATE TABLE IF NOT EXISTS eduway_platform_quiz_sets (
  id            uuid NOT NULL DEFAULT gen_random_uuid(),
  lesson_id     uuid NOT NULL,
  set_number    integer NOT NULL,
  question_ids  uuid[] NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_quiz_sets_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_quiz_sets_lesson_set_key UNIQUE (lesson_id, set_number),
  CONSTRAINT eduway_platform_quiz_sets_number_check CHECK (set_number BETWEEN 1 AND 5),
  CONSTRAINT eduway_platform_quiz_sets_lesson_fkey FOREIGN KEY (lesson_id) REFERENCES eduway_platform_lessons (id) ON DELETE CASCADE
);
SELECT eduway_platform_fn_secure_table('eduway_platform_quiz_sets');

CREATE TABLE IF NOT EXISTS eduway_platform_quiz_attempts (
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL,
  lesson_id       uuid NOT NULL,
  quiz_set_id     uuid,
  attempt_number  integer NOT NULL DEFAULT 1,
  question_ids    uuid[] NOT NULL DEFAULT '{}',
  option_orders   jsonb NOT NULL DEFAULT '{}'::jsonb,
  status          text NOT NULL DEFAULT 'in_progress',
  score           numeric(5,2),
  correct_count   integer NOT NULL DEFAULT 0,
  total_count     integer NOT NULL DEFAULT 0,
  pass_threshold  integer NOT NULL DEFAULT 60,
  platform        eduway_platform_enum_platform,
  started_at      timestamptz NOT NULL DEFAULT now(),
  submitted_at    timestamptz,
  time_sec        integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_quiz_attempts_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_quiz_attempts_status_check CHECK (status IN ('in_progress', 'passed', 'failed', 'abandoned')),
  CONSTRAINT eduway_platform_quiz_attempts_user_fkey FOREIGN KEY (user_id) REFERENCES eduway_platform_users (id) ON DELETE CASCADE,
  CONSTRAINT eduway_platform_quiz_attempts_lesson_fkey FOREIGN KEY (lesson_id) REFERENCES eduway_platform_lessons (id) ON DELETE CASCADE,
  CONSTRAINT eduway_platform_quiz_attempts_set_fkey FOREIGN KEY (quiz_set_id) REFERENCES eduway_platform_quiz_sets (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_quiz_attempts_user ON eduway_platform_quiz_attempts (user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_quiz_attempts_lesson ON eduway_platform_quiz_attempts (lesson_id, user_id);
SELECT eduway_platform_fn_secure_table('eduway_platform_quiz_attempts');

CREATE TABLE IF NOT EXISTS eduway_platform_quiz_attempt_answers (
  id                  uuid NOT NULL DEFAULT gen_random_uuid(),
  attempt_id          uuid NOT NULL,
  question_id         uuid NOT NULL,
  selected_option_id  uuid,
  is_correct          boolean NOT NULL DEFAULT false,
  time_sec            integer NOT NULL DEFAULT 0,
  answered_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_quiz_attempt_answers_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_quiz_answers_attempt_q_key UNIQUE (attempt_id, question_id),
  CONSTRAINT eduway_platform_quiz_answers_attempt_fkey FOREIGN KEY (attempt_id) REFERENCES eduway_platform_quiz_attempts (id) ON DELETE CASCADE,
  CONSTRAINT eduway_platform_quiz_answers_q_fkey FOREIGN KEY (question_id) REFERENCES eduway_platform_questions (id) ON DELETE CASCADE,
  CONSTRAINT eduway_platform_quiz_answers_opt_fkey FOREIGN KEY (selected_option_id) REFERENCES eduway_platform_question_options (id) ON DELETE SET NULL
);
SELECT eduway_platform_fn_secure_table('eduway_platform_quiz_attempt_answers');

CREATE TABLE IF NOT EXISTS eduway_platform_practice_sessions (
  id             uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL,
  subject_id     uuid,
  mode           text NOT NULL DEFAULT 'bank',
  filters        jsonb NOT NULL DEFAULT '{}'::jsonb,
  question_ids   uuid[] NOT NULL DEFAULT '{}',
  status         text NOT NULL DEFAULT 'in_progress',
  correct_count  integer NOT NULL DEFAULT 0,
  total_count    integer NOT NULL DEFAULT 0,
  platform       eduway_platform_enum_platform,
  started_at     timestamptz NOT NULL DEFAULT now(),
  finished_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_practice_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_practice_sessions_mode_check CHECK (mode IN ('bank', 'custom', 'mistakes', 'bookmarks')),
  CONSTRAINT eduway_platform_practice_sessions_status_check CHECK (status IN ('in_progress', 'finished', 'abandoned')),
  CONSTRAINT eduway_platform_practice_sessions_user_fkey FOREIGN KEY (user_id) REFERENCES eduway_platform_users (id) ON DELETE CASCADE,
  CONSTRAINT eduway_platform_practice_sessions_subject_fkey FOREIGN KEY (subject_id) REFERENCES eduway_platform_subjects (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_practice_sessions_user ON eduway_platform_practice_sessions (user_id, started_at DESC);
SELECT eduway_platform_fn_secure_table('eduway_platform_practice_sessions');

CREATE TABLE IF NOT EXISTS eduway_platform_practice_answers (
  id                  uuid NOT NULL DEFAULT gen_random_uuid(),
  session_id          uuid NOT NULL,
  question_id         uuid NOT NULL,
  selected_option_id  uuid,
  is_correct          boolean NOT NULL DEFAULT false,
  time_sec            integer NOT NULL DEFAULT 0,
  answered_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_practice_answers_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_practice_answers_sess_q_key UNIQUE (session_id, question_id),
  CONSTRAINT eduway_platform_practice_answers_sess_fkey FOREIGN KEY (session_id) REFERENCES eduway_platform_practice_sessions (id) ON DELETE CASCADE,
  CONSTRAINT eduway_platform_practice_answers_q_fkey FOREIGN KEY (question_id) REFERENCES eduway_platform_questions (id) ON DELETE CASCADE,
  CONSTRAINT eduway_platform_practice_answers_opt_fkey FOREIGN KEY (selected_option_id) REFERENCES eduway_platform_question_options (id) ON DELETE SET NULL
);
SELECT eduway_platform_fn_secure_table('eduway_platform_practice_answers');

CREATE TABLE IF NOT EXISTS eduway_platform_bookmarks (
  id            uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL,
  entity_type   text NOT NULL,
  entity_id     uuid NOT NULL,
  position_sec  integer,
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_bookmarks_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_bookmarks_type_check CHECK (entity_type IN ('question', 'lesson')),
  CONSTRAINT eduway_platform_bookmarks_user_fkey FOREIGN KEY (user_id) REFERENCES eduway_platform_users (id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS eduway_platform_uq_bookmarks_entity ON eduway_platform_bookmarks (user_id, entity_type, entity_id, (COALESCE(position_sec, -1)));
SELECT eduway_platform_fn_secure_table('eduway_platform_bookmarks');

-- One record per (user, question); history keeps every wrong/retry event.
CREATE TABLE IF NOT EXISTS eduway_platform_mistake_records (
  id                 uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL,
  question_id        uuid NOT NULL,
  subject_id         uuid,
  unit_id            uuid,
  topic_id           uuid,
  lesson_id          uuid,
  source             text NOT NULL,
  source_ref_id      uuid,
  chosen_option_id   uuid,
  status             text NOT NULL DEFAULT 'unresolved',
  repeat_count       integer NOT NULL DEFAULT 1,
  mastery_level      integer NOT NULL DEFAULT 0,
  correct_streak     integer NOT NULL DEFAULT 0,
  first_wrong_at     timestamptz NOT NULL DEFAULT now(),
  last_wrong_at      timestamptz NOT NULL DEFAULT now(),
  last_reviewed_at   timestamptz,
  mastered_at        timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_mistake_records_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_mistake_records_user_q_key UNIQUE (user_id, question_id),
  CONSTRAINT eduway_platform_mistake_records_source_check CHECK (source IN ('quiz', 'bank', 'exam', 'practice')),
  CONSTRAINT eduway_platform_mistake_records_status_check CHECK (status IN ('unresolved', 'reviewed', 'mastered')),
  CONSTRAINT eduway_platform_mistake_records_user_fkey FOREIGN KEY (user_id) REFERENCES eduway_platform_users (id) ON DELETE CASCADE,
  CONSTRAINT eduway_platform_mistake_records_q_fkey FOREIGN KEY (question_id) REFERENCES eduway_platform_questions (id) ON DELETE CASCADE,
  CONSTRAINT eduway_platform_mistake_records_subject_fkey FOREIGN KEY (subject_id) REFERENCES eduway_platform_subjects (id) ON DELETE SET NULL,
  CONSTRAINT eduway_platform_mistake_records_unit_fkey FOREIGN KEY (unit_id) REFERENCES eduway_platform_units (id) ON DELETE SET NULL,
  CONSTRAINT eduway_platform_mistake_records_topic_fkey FOREIGN KEY (topic_id) REFERENCES eduway_platform_topics (id) ON DELETE SET NULL,
  CONSTRAINT eduway_platform_mistake_records_lesson_fkey FOREIGN KEY (lesson_id) REFERENCES eduway_platform_lessons (id) ON DELETE SET NULL,
  CONSTRAINT eduway_platform_mistake_records_opt_fkey FOREIGN KEY (chosen_option_id) REFERENCES eduway_platform_question_options (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_mistake_records_user ON eduway_platform_mistake_records (user_id, status, last_wrong_at DESC);
SELECT eduway_platform_fn_secure_table('eduway_platform_mistake_records');

CREATE TABLE IF NOT EXISTS eduway_platform_mistake_history (
  id                uuid NOT NULL DEFAULT gen_random_uuid(),
  mistake_id        uuid NOT NULL,
  event             text NOT NULL,
  source            text,
  chosen_option_id  uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_mistake_history_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_mistake_history_event_check CHECK (event IN ('wrong', 'retry_correct', 'retry_wrong', 'reviewed', 'mastered', 'reset')),
  CONSTRAINT eduway_platform_mistake_history_m_fkey FOREIGN KEY (mistake_id) REFERENCES eduway_platform_mistake_records (id) ON DELETE CASCADE,
  CONSTRAINT eduway_platform_mistake_history_opt_fkey FOREIGN KEY (chosen_option_id) REFERENCES eduway_platform_question_options (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_mistake_history_m ON eduway_platform_mistake_history (mistake_id, created_at DESC);
SELECT eduway_platform_fn_secure_table('eduway_platform_mistake_history');

CREATE TABLE IF NOT EXISTS eduway_platform_exam_blueprints (
  id                    uuid NOT NULL DEFAULT gen_random_uuid(),
  slug                  text NOT NULL,
  subject_id            uuid,
  title_en              text NOT NULL,
  title_ar              text NOT NULL,
  description_en        text NOT NULL DEFAULT '',
  description_ar        text NOT NULL DEFAULT '',
  duration_min          integer NOT NULL,
  question_count        integer NOT NULL,
  pass_mark             integer NOT NULL DEFAULT 50,
  randomize             boolean NOT NULL DEFAULT true,
  scoring               text NOT NULL DEFAULT 'standard',
  negative_mark         numeric(4,2) NOT NULL DEFAULT 0,
  attempt_limit         integer NOT NULL DEFAULT 3,
  review_before_submit  boolean NOT NULL DEFAULT true,
  fixed_question_ids    uuid[] NOT NULL DEFAULT '{}',
  available_from        timestamptz,
  available_to          timestamptz,
  scheduled_at          timestamptz,
  status                text NOT NULL DEFAULT 'draft',
  created_by            uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  deleted_at            timestamptz,
  CONSTRAINT eduway_platform_exam_blueprints_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_exam_blueprints_slug_key UNIQUE (slug),
  CONSTRAINT eduway_platform_exam_blueprints_scoring_check CHECK (scoring IN ('standard', 'negative', 'weighted')),
  CONSTRAINT eduway_platform_exam_blueprints_status_check CHECK (status IN ('draft', 'published', 'archived')),
  CONSTRAINT eduway_platform_exam_blueprints_values_check CHECK (duration_min > 0 AND question_count > 0 AND pass_mark BETWEEN 0 AND 100),
  CONSTRAINT eduway_platform_exam_blueprints_subject_fkey FOREIGN KEY (subject_id) REFERENCES eduway_platform_subjects (id) ON DELETE SET NULL,
  CONSTRAINT eduway_platform_exam_blueprints_by_fkey FOREIGN KEY (created_by) REFERENCES eduway_platform_users (id) ON DELETE SET NULL
);
SELECT eduway_platform_fn_secure_table('eduway_platform_exam_blueprints');

CREATE TABLE IF NOT EXISTS eduway_platform_exam_blueprint_sections (
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  blueprint_id    uuid NOT NULL,
  subject_id      uuid NOT NULL,
  unit_id         uuid,
  topic_id        uuid,
  question_count  integer NOT NULL,
  easy_count      integer NOT NULL DEFAULT 0,
  medium_count    integer NOT NULL DEFAULT 0,
  hard_count      integer NOT NULL DEFAULT 0,
  sort_order      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_exam_bp_sections_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_exam_bp_sections_dist_check CHECK (easy_count + medium_count + hard_count = question_count),
  CONSTRAINT eduway_platform_exam_bp_sections_bp_fkey FOREIGN KEY (blueprint_id) REFERENCES eduway_platform_exam_blueprints (id) ON DELETE CASCADE,
  CONSTRAINT eduway_platform_exam_bp_sections_subject_fkey FOREIGN KEY (subject_id) REFERENCES eduway_platform_subjects (id) ON DELETE CASCADE,
  CONSTRAINT eduway_platform_exam_bp_sections_unit_fkey FOREIGN KEY (unit_id) REFERENCES eduway_platform_units (id) ON DELETE SET NULL,
  CONSTRAINT eduway_platform_exam_bp_sections_topic_fkey FOREIGN KEY (topic_id) REFERENCES eduway_platform_topics (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_exam_bp_sections_bp ON eduway_platform_exam_blueprint_sections (blueprint_id, sort_order);
SELECT eduway_platform_fn_secure_table('eduway_platform_exam_blueprint_sections');

CREATE TABLE IF NOT EXISTS eduway_platform_exam_attempts (
  id                uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL,
  blueprint_id      uuid NOT NULL,
  attempt_number    integer NOT NULL DEFAULT 1,
  status            text NOT NULL DEFAULT 'in_progress',
  question_ids      uuid[] NOT NULL DEFAULT '{}',
  option_orders     jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at        timestamptz NOT NULL DEFAULT now(),
  deadline_at       timestamptz NOT NULL,
  submitted_at      timestamptz,
  last_autosave_at  timestamptz,
  time_spent_sec    integer NOT NULL DEFAULT 0,
  score             numeric(5,2),
  correct_count     integer NOT NULL DEFAULT 0,
  total_count       integer NOT NULL DEFAULT 0,
  passed            boolean,
  breakdown         jsonb NOT NULL DEFAULT '{}'::jsonb,
  platform          eduway_platform_enum_platform,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_exam_attempts_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_exam_attempts_status_check CHECK (status IN ('in_progress', 'submitted', 'auto_submitted', 'abandoned')),
  CONSTRAINT eduway_platform_exam_attempts_user_fkey FOREIGN KEY (user_id) REFERENCES eduway_platform_users (id) ON DELETE CASCADE,
  CONSTRAINT eduway_platform_exam_attempts_bp_fkey FOREIGN KEY (blueprint_id) REFERENCES eduway_platform_exam_blueprints (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_exam_attempts_user ON eduway_platform_exam_attempts (user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_exam_attempts_deadline ON eduway_platform_exam_attempts (deadline_at) WHERE status = 'in_progress';
CREATE INDEX IF NOT EXISTS eduway_platform_idx_exam_attempts_bp ON eduway_platform_exam_attempts (blueprint_id, user_id);
SELECT eduway_platform_fn_secure_table('eduway_platform_exam_attempts');

CREATE TABLE IF NOT EXISTS eduway_platform_exam_attempt_answers (
  id                  uuid NOT NULL DEFAULT gen_random_uuid(),
  attempt_id          uuid NOT NULL,
  question_id         uuid NOT NULL,
  selected_option_id  uuid,
  is_correct          boolean,
  flagged             boolean NOT NULL DEFAULT false,
  time_sec            integer NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_exam_attempt_answers_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_exam_answers_attempt_q_key UNIQUE (attempt_id, question_id),
  CONSTRAINT eduway_platform_exam_answers_attempt_fkey FOREIGN KEY (attempt_id) REFERENCES eduway_platform_exam_attempts (id) ON DELETE CASCADE,
  CONSTRAINT eduway_platform_exam_answers_q_fkey FOREIGN KEY (question_id) REFERENCES eduway_platform_questions (id) ON DELETE CASCADE,
  CONSTRAINT eduway_platform_exam_answers_opt_fkey FOREIGN KEY (selected_option_id) REFERENCES eduway_platform_question_options (id) ON DELETE SET NULL
);
SELECT eduway_platform_fn_secure_table('eduway_platform_exam_attempt_answers');
