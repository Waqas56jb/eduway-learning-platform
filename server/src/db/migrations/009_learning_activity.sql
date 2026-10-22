-- =====================================================================================================
-- 009_learning_activity — watch progress, completions, streaks, daily activity, achievements.
-- =====================================================================================================

CREATE TABLE IF NOT EXISTS eduway_platform_watch_progress (
  id             uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL,
  lesson_id      uuid NOT NULL,
  position_sec   integer NOT NULL DEFAULT 0,
  duration_sec   integer NOT NULL DEFAULT 0,
  watched_sec    integer NOT NULL DEFAULT 0,
  percent        integer NOT NULL DEFAULT 0,
  completed      boolean NOT NULL DEFAULT false,
  platform       eduway_platform_enum_platform,
  device_id      text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_watch_progress_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_watch_progress_user_lesson_key UNIQUE (user_id, lesson_id),
  CONSTRAINT eduway_platform_watch_progress_pct_check CHECK (percent BETWEEN 0 AND 100),
  CONSTRAINT eduway_platform_watch_progress_user_fkey FOREIGN KEY (user_id) REFERENCES eduway_platform_users (id) ON DELETE CASCADE,
  CONSTRAINT eduway_platform_watch_progress_lesson_fkey FOREIGN KEY (lesson_id) REFERENCES eduway_platform_lessons (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_watch_progress_user ON eduway_platform_watch_progress (user_id, updated_at DESC);
SELECT eduway_platform_fn_secure_table('eduway_platform_watch_progress');

CREATE TABLE IF NOT EXISTS eduway_platform_lesson_completions (
  id            uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL,
  lesson_id     uuid NOT NULL,
  source        text NOT NULL DEFAULT 'watch',
  completed_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_lesson_completions_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_lesson_completions_user_lesson_key UNIQUE (user_id, lesson_id),
  CONSTRAINT eduway_platform_lesson_completions_source_check CHECK (source IN ('watch', 'quiz', 'manual')),
  CONSTRAINT eduway_platform_lesson_completions_user_fkey FOREIGN KEY (user_id) REFERENCES eduway_platform_users (id) ON DELETE CASCADE,
  CONSTRAINT eduway_platform_lesson_completions_lesson_fkey FOREIGN KEY (lesson_id) REFERENCES eduway_platform_lessons (id) ON DELETE CASCADE
);
SELECT eduway_platform_fn_secure_table('eduway_platform_lesson_completions');

CREATE TABLE IF NOT EXISTS eduway_platform_streaks (
  user_id           uuid NOT NULL,
  current_streak    integer NOT NULL DEFAULT 0,
  longest_streak    integer NOT NULL DEFAULT 0,
  last_active_date  date,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_streaks_pkey PRIMARY KEY (user_id),
  CONSTRAINT eduway_platform_streaks_user_fkey FOREIGN KEY (user_id) REFERENCES eduway_platform_users (id) ON DELETE CASCADE
);
SELECT eduway_platform_fn_secure_table('eduway_platform_streaks');

CREATE TABLE IF NOT EXISTS eduway_platform_daily_activity (
  id                  uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL,
  activity_date       date NOT NULL,
  minutes             integer NOT NULL DEFAULT 0,
  watch_seconds       integer NOT NULL DEFAULT 0,
  lessons_completed   integer NOT NULL DEFAULT 0,
  questions_answered  integer NOT NULL DEFAULT 0,
  questions_correct   integer NOT NULL DEFAULT 0,
  quizzes_taken       integer NOT NULL DEFAULT 0,
  exams_taken         integer NOT NULL DEFAULT 0,
  ai_questions        integer NOT NULL DEFAULT 0,
  platforms           text[] NOT NULL DEFAULT '{}',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_daily_activity_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_daily_activity_user_date_key UNIQUE (user_id, activity_date),
  CONSTRAINT eduway_platform_daily_activity_user_fkey FOREIGN KEY (user_id) REFERENCES eduway_platform_users (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_daily_activity_date ON eduway_platform_daily_activity (activity_date);
SELECT eduway_platform_fn_secure_table('eduway_platform_daily_activity');

-- Badge definitions (admin-editable) + per-user progress.
CREATE TABLE IF NOT EXISTS eduway_platform_achievements (
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  key             text NOT NULL,
  icon            text NOT NULL DEFAULT 'star',
  title_en        text NOT NULL,
  title_ar        text NOT NULL,
  description_en  text NOT NULL DEFAULT '',
  description_ar  text NOT NULL DEFAULT '',
  hint_en         text NOT NULL DEFAULT '',
  hint_ar         text NOT NULL DEFAULT '',
  metric          text NOT NULL,
  target          integer NOT NULL DEFAULT 1,
  sort_order      integer NOT NULL DEFAULT 0,
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_achievements_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_achievements_key_key UNIQUE (key)
);
SELECT eduway_platform_fn_secure_table('eduway_platform_achievements');

CREATE TABLE IF NOT EXISTS eduway_platform_user_achievements (
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL,
  achievement_id  uuid NOT NULL,
  current         integer NOT NULL DEFAULT 0,
  earned_at       timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_user_achievements_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_user_achievements_key UNIQUE (user_id, achievement_id),
  CONSTRAINT eduway_platform_user_achievements_user_fkey FOREIGN KEY (user_id) REFERENCES eduway_platform_users (id) ON DELETE CASCADE,
  CONSTRAINT eduway_platform_user_achievements_ach_fkey FOREIGN KEY (achievement_id) REFERENCES eduway_platform_achievements (id) ON DELETE CASCADE
);
SELECT eduway_platform_fn_secure_table('eduway_platform_user_achievements');

-- Private per-student notes on a lesson (CAT-08/09).
CREATE TABLE IF NOT EXISTS eduway_platform_lesson_notes (
  id          uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  lesson_id   uuid NOT NULL,
  body        text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_lesson_notes_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_lesson_notes_user_lesson_key UNIQUE (user_id, lesson_id),
  CONSTRAINT eduway_platform_lesson_notes_user_fkey FOREIGN KEY (user_id) REFERENCES eduway_platform_users (id) ON DELETE CASCADE,
  CONSTRAINT eduway_platform_lesson_notes_lesson_fkey FOREIGN KEY (lesson_id) REFERENCES eduway_platform_lessons (id) ON DELETE CASCADE
);
SELECT eduway_platform_fn_secure_table('eduway_platform_lesson_notes');

-- "Today plan" items generated lazily per student per day.
CREATE TABLE IF NOT EXISTS eduway_platform_today_plan_items (
  id          uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  plan_date   date NOT NULL,
  kind        text NOT NULL,
  subject_id  uuid,
  lesson_id   uuid,
  ref_id      uuid,
  title_en    text NOT NULL,
  title_ar    text NOT NULL,
  meta_en     text NOT NULL DEFAULT '',
  meta_ar     text NOT NULL DEFAULT '',
  minutes     integer NOT NULL DEFAULT 0,
  target      jsonb NOT NULL DEFAULT '{}'::jsonb,
  done        boolean NOT NULL DEFAULT false,
  done_at     timestamptz,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_today_plan_items_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_today_plan_kind_check CHECK (kind IN ('lesson', 'quiz', 'practice', 'exam', 'mistakes', 'ai', 'review')),
  CONSTRAINT eduway_platform_today_plan_user_fkey FOREIGN KEY (user_id) REFERENCES eduway_platform_users (id) ON DELETE CASCADE,
  CONSTRAINT eduway_platform_today_plan_subject_fkey FOREIGN KEY (subject_id) REFERENCES eduway_platform_subjects (id) ON DELETE SET NULL,
  CONSTRAINT eduway_platform_today_plan_lesson_fkey FOREIGN KEY (lesson_id) REFERENCES eduway_platform_lessons (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_today_plan_user_date ON eduway_platform_today_plan_items (user_id, plan_date, sort_order);
SELECT eduway_platform_fn_secure_table('eduway_platform_today_plan_items');
