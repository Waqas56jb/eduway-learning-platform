-- =====================================================================================================
-- 008_ai_tutor — AI tutor settings, conversations/messages, usage per allowance period, abuse flags.
-- Embeddings (pgvector) are created separately in 012_embeddings (only when the extension exists).
-- =====================================================================================================

-- Singleton (id = 1). Allowance per period; packages may override via packages.ai_quota.
CREATE TABLE IF NOT EXISTS eduway_platform_ai_settings (
  id                      smallint NOT NULL DEFAULT 1,
  enabled                 boolean NOT NULL DEFAULT true,
  monthly_allowance       integer NOT NULL DEFAULT 100,
  reset_cycle             text NOT NULL DEFAULT 'calendar',
  provider                text NOT NULL DEFAULT 'anthropic',
  model                   text NOT NULL DEFAULT 'claude-sonnet-5-5',
  temperature             numeric(3,2) NOT NULL DEFAULT 0.3,
  max_tokens              integer NOT NULL DEFAULT 1024,
  retrieval_transcripts   boolean NOT NULL DEFAULT true,
  retrieval_explanations  boolean NOT NULL DEFAULT true,
  retrieval_lesson_notes  boolean NOT NULL DEFAULT false,
  safety_rules            text NOT NULL DEFAULT '',
  rate_limit_per_minute   integer NOT NULL DEFAULT 6,
  rate_limit_per_hour     integer NOT NULL DEFAULT 40,
  blocked_keywords        text[] NOT NULL DEFAULT '{}',
  cost_per_1k_input_usd   numeric(10,6) NOT NULL DEFAULT 0.003,
  cost_per_1k_output_usd  numeric(10,6) NOT NULL DEFAULT 0.015,
  iqd_per_usd             integer NOT NULL DEFAULT 1310,
  updated_by              uuid,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_ai_settings_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_ai_settings_singleton_check CHECK (id = 1),
  CONSTRAINT eduway_platform_ai_settings_cycle_check CHECK (reset_cycle IN ('calendar', 'billing')),
  CONSTRAINT eduway_platform_ai_settings_provider_check CHECK (provider IN ('openai', 'anthropic', 'azure', 'mock')),
  CONSTRAINT eduway_platform_ai_settings_by_fkey FOREIGN KEY (updated_by) REFERENCES eduway_platform_users (id) ON DELETE SET NULL
);
SELECT eduway_platform_fn_secure_table('eduway_platform_ai_settings');

CREATE TABLE IF NOT EXISTS eduway_platform_ai_conversations (
  id               uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL,
  subject_id       uuid,
  lesson_id        uuid,
  title            text NOT NULL DEFAULT '',
  status           text NOT NULL DEFAULT 'active',
  flagged          boolean NOT NULL DEFAULT false,
  message_count    integer NOT NULL DEFAULT 0,
  last_message_at  timestamptz,
  platform         eduway_platform_enum_platform,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz,
  CONSTRAINT eduway_platform_ai_conversations_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_ai_conversations_status_check CHECK (status IN ('active', 'archived', 'blocked')),
  CONSTRAINT eduway_platform_ai_conversations_user_fkey FOREIGN KEY (user_id) REFERENCES eduway_platform_users (id) ON DELETE CASCADE,
  CONSTRAINT eduway_platform_ai_conversations_subj_fkey FOREIGN KEY (subject_id) REFERENCES eduway_platform_subjects (id) ON DELETE SET NULL,
  CONSTRAINT eduway_platform_ai_conversations_lesson_fkey FOREIGN KEY (lesson_id) REFERENCES eduway_platform_lessons (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_ai_conversations_user ON eduway_platform_ai_conversations (user_id, last_message_at DESC);
SELECT eduway_platform_fn_secure_table('eduway_platform_ai_conversations');

CREATE TABLE IF NOT EXISTS eduway_platform_ai_messages (
  id               uuid NOT NULL DEFAULT gen_random_uuid(),
  conversation_id  uuid NOT NULL,
  role             text NOT NULL,
  content          text NOT NULL,
  tokens_in        integer NOT NULL DEFAULT 0,
  tokens_out       integer NOT NULL DEFAULT 0,
  cost_usd         numeric(12,6) NOT NULL DEFAULT 0,
  model            text,
  citations        jsonb NOT NULL DEFAULT '[]'::jsonb,
  counted          boolean NOT NULL DEFAULT false,
  attachment_file_key text,
  feedback         text,
  feedback_comment text,
  feedback_at      timestamptz,
  status           text NOT NULL DEFAULT 'complete',
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_ai_messages_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_ai_messages_role_check CHECK (role IN ('user', 'assistant', 'system')),
  CONSTRAINT eduway_platform_ai_messages_feedback_check CHECK (feedback IS NULL OR feedback IN ('up', 'down')),
  CONSTRAINT eduway_platform_ai_messages_status_check CHECK (status IN ('pending', 'streaming', 'complete', 'failed', 'blocked')),
  CONSTRAINT eduway_platform_ai_messages_conv_fkey FOREIGN KEY (conversation_id) REFERENCES eduway_platform_ai_conversations (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_ai_messages_conv ON eduway_platform_ai_messages (conversation_id, created_at);
SELECT eduway_platform_fn_secure_table('eduway_platform_ai_messages');

-- Usage per user per allowance period (calendar month or billing cycle).
CREATE TABLE IF NOT EXISTS eduway_platform_ai_usage (
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL,
  period_start    timestamptz NOT NULL,
  period_end      timestamptz NOT NULL,
  allowance       integer NOT NULL DEFAULT 0,
  questions_used  integer NOT NULL DEFAULT 0,
  bonus_questions integer NOT NULL DEFAULT 0,
  tokens_in       integer NOT NULL DEFAULT 0,
  tokens_out      integer NOT NULL DEFAULT 0,
  cost_usd        numeric(12,6) NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_ai_usage_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_ai_usage_user_period_key UNIQUE (user_id, period_start),
  CONSTRAINT eduway_platform_ai_usage_used_check CHECK (questions_used >= 0),
  CONSTRAINT eduway_platform_ai_usage_user_fkey FOREIGN KEY (user_id) REFERENCES eduway_platform_users (id) ON DELETE CASCADE
);
SELECT eduway_platform_fn_secure_table('eduway_platform_ai_usage');

CREATE TABLE IF NOT EXISTS eduway_platform_ai_flags (
  id               uuid NOT NULL DEFAULT gen_random_uuid(),
  conversation_id  uuid,
  message_id       uuid,
  user_id          uuid NOT NULL,
  subject_id       uuid,
  reason           text NOT NULL,
  severity         text NOT NULL DEFAULT 'low',
  status           text NOT NULL DEFAULT 'open',
  excerpt          text NOT NULL DEFAULT '',
  auto_detected    boolean NOT NULL DEFAULT true,
  reviewed_by      uuid,
  reviewed_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_ai_flags_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_ai_flags_reason_check CHECK (reason IN ('off_topic', 'abuse', 'cheating', 'prompt_injection', 'self_harm')),
  CONSTRAINT eduway_platform_ai_flags_sev_check CHECK (severity IN ('low', 'medium', 'high')),
  CONSTRAINT eduway_platform_ai_flags_status_check CHECK (status IN ('open', 'reviewed', 'dismissed')),
  CONSTRAINT eduway_platform_ai_flags_conv_fkey FOREIGN KEY (conversation_id) REFERENCES eduway_platform_ai_conversations (id) ON DELETE CASCADE,
  CONSTRAINT eduway_platform_ai_flags_msg_fkey FOREIGN KEY (message_id) REFERENCES eduway_platform_ai_messages (id) ON DELETE SET NULL,
  CONSTRAINT eduway_platform_ai_flags_user_fkey FOREIGN KEY (user_id) REFERENCES eduway_platform_users (id) ON DELETE CASCADE,
  CONSTRAINT eduway_platform_ai_flags_subj_fkey FOREIGN KEY (subject_id) REFERENCES eduway_platform_subjects (id) ON DELETE SET NULL,
  CONSTRAINT eduway_platform_ai_flags_rev_fkey FOREIGN KEY (reviewed_by) REFERENCES eduway_platform_users (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_ai_flags_status ON eduway_platform_ai_flags (status, created_at DESC);
SELECT eduway_platform_fn_secure_table('eduway_platform_ai_flags');

-- Warnings issued to students from the AI abuse console.
CREATE TABLE IF NOT EXISTS eduway_platform_ai_warnings (
  id          uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  flag_id     uuid,
  message_en  text NOT NULL DEFAULT '',
  message_ar  text NOT NULL DEFAULT '',
  issued_by   uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_ai_warnings_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_ai_warnings_user_fkey FOREIGN KEY (user_id) REFERENCES eduway_platform_users (id) ON DELETE CASCADE,
  CONSTRAINT eduway_platform_ai_warnings_flag_fkey FOREIGN KEY (flag_id) REFERENCES eduway_platform_ai_flags (id) ON DELETE SET NULL,
  CONSTRAINT eduway_platform_ai_warnings_by_fkey FOREIGN KEY (issued_by) REFERENCES eduway_platform_users (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_ai_warnings_user ON eduway_platform_ai_warnings (user_id, created_at DESC);
SELECT eduway_platform_fn_secure_table('eduway_platform_ai_warnings');
