-- =====================================================================================================
-- 301_engagement — Agent D (AI tutor, notifications, jobs). Additive + idempotent; every object prefixed.
--   * ai_settings: kill-switch reason, suggested prompts, model catalogue
--   * ai_messages: client message id, request language, failure reason
--   * ai_flags: detection source + review note
--   * ai_usage: last use timestamp
--   * notification_deliveries: rendered payload (for retries), target platform, next attempt
--   * campaigns: cancellation + failure info
--   * student_profiles: when/by whom the AI tutor was disabled
-- =====================================================================================================

-- ── AI settings ──────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE eduway_platform_ai_settings ADD COLUMN IF NOT EXISTS suggested_prompts jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE eduway_platform_ai_settings ADD COLUMN IF NOT EXISTS models jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE eduway_platform_ai_settings ADD COLUMN IF NOT EXISTS disabled_reason text;
ALTER TABLE eduway_platform_ai_settings ADD COLUMN IF NOT EXISTS disabled_at timestamptz;
ALTER TABLE eduway_platform_ai_settings ADD COLUMN IF NOT EXISTS disabled_by uuid;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eduway_platform_ai_settings_disabled_by_fkey') THEN
    ALTER TABLE eduway_platform_ai_settings ADD CONSTRAINT eduway_platform_ai_settings_disabled_by_fkey
      FOREIGN KEY (disabled_by) REFERENCES eduway_platform_users (id) ON DELETE SET NULL;
  END IF;
END
$$;

-- ── AI messages ──────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE eduway_platform_ai_messages ADD COLUMN IF NOT EXISTS client_message_id text;
ALTER TABLE eduway_platform_ai_messages ADD COLUMN IF NOT EXISTS lang text;
ALTER TABLE eduway_platform_ai_messages ADD COLUMN IF NOT EXISTS error text;
ALTER TABLE eduway_platform_ai_messages ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS eduway_platform_idx_ai_messages_created ON eduway_platform_ai_messages (created_at DESC);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_ai_messages_client ON eduway_platform_ai_messages (conversation_id, client_message_id)
  WHERE client_message_id IS NOT NULL;

-- ── AI conversations ─────────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS eduway_platform_idx_ai_conversations_created ON eduway_platform_ai_conversations (created_at DESC);

-- ── AI flags ─────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE eduway_platform_ai_flags ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'auto';
ALTER TABLE eduway_platform_ai_flags ADD COLUMN IF NOT EXISTS note text;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eduway_platform_ai_flags_source_check') THEN
    ALTER TABLE eduway_platform_ai_flags ADD CONSTRAINT eduway_platform_ai_flags_source_check
      CHECK (source IN ('auto', 'keyword', 'rate_limit', 'manual'));
  END IF;
END
$$;
CREATE INDEX IF NOT EXISTS eduway_platform_idx_ai_flags_user ON eduway_platform_ai_flags (user_id, created_at DESC);

-- ── AI usage ─────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE eduway_platform_ai_usage ADD COLUMN IF NOT EXISTS last_used_at timestamptz;
CREATE INDEX IF NOT EXISTS eduway_platform_idx_ai_usage_period ON eduway_platform_ai_usage (period_start, questions_used DESC);

-- ── Student profile (per-user AI disable audit fields) ───────────────────────────────────────────────
ALTER TABLE eduway_platform_student_profiles ADD COLUMN IF NOT EXISTS ai_disabled_at timestamptz;
ALTER TABLE eduway_platform_student_profiles ADD COLUMN IF NOT EXISTS ai_disabled_by uuid;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eduway_platform_student_profiles_ai_by_fkey') THEN
    ALTER TABLE eduway_platform_student_profiles ADD CONSTRAINT eduway_platform_student_profiles_ai_by_fkey
      FOREIGN KEY (ai_disabled_by) REFERENCES eduway_platform_users (id) ON DELETE SET NULL;
  END IF;
END
$$;

-- ── Notification deliveries ──────────────────────────────────────────────────────────────────────────
ALTER TABLE eduway_platform_notification_deliveries ADD COLUMN IF NOT EXISTS platform text;
ALTER TABLE eduway_platform_notification_deliveries ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE eduway_platform_notification_deliveries ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eduway_platform_notif_deliveries_platform_check') THEN
    ALTER TABLE eduway_platform_notification_deliveries ADD CONSTRAINT eduway_platform_notif_deliveries_platform_check
      CHECK (platform IS NULL OR platform IN ('web', 'ios', 'android'));
  END IF;
END
$$;
CREATE INDEX IF NOT EXISTS eduway_platform_idx_notif_deliveries_campaign ON eduway_platform_notification_deliveries (campaign_id, status);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_notif_deliveries_user ON eduway_platform_notification_deliveries (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_notif_deliveries_provider_msg ON eduway_platform_notification_deliveries (provider_message_id)
  WHERE provider_message_id IS NOT NULL;

-- ── Campaigns ────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE eduway_platform_campaigns ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE eduway_platform_campaigns ADD COLUMN IF NOT EXISTS error text;
CREATE INDEX IF NOT EXISTS eduway_platform_idx_campaigns_created ON eduway_platform_campaigns (created_at DESC);

-- ── Notifications ────────────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS eduway_platform_idx_notifications_campaign ON eduway_platform_notifications (campaign_id);
