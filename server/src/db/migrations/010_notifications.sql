-- =====================================================================================================
-- 010_notifications — templates (EN/AR + variables), in-app notifications, deliveries, campaigns, push tokens.
-- =====================================================================================================

CREATE TABLE IF NOT EXISTS eduway_platform_notification_templates (
  id          uuid NOT NULL DEFAULT gen_random_uuid(),
  key         text NOT NULL,
  name        text NOT NULL,
  type        text NOT NULL,
  channel     text NOT NULL,
  subject_en  text NOT NULL DEFAULT '',
  subject_ar  text NOT NULL DEFAULT '',
  body_en     text NOT NULL,
  body_ar     text NOT NULL,
  variables   text[] NOT NULL DEFAULT '{}',
  active      boolean NOT NULL DEFAULT true,
  updated_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_notification_templates_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_notification_templates_key_key UNIQUE (key),
  CONSTRAINT eduway_platform_notif_templates_type_check CHECK (type IN ('otp', 'payment_confirmation', 'subscription_expiry', 'new_lesson', 'unfinished_lesson', 'exam_reminder', 'progress_reminder', 'support_message', 'general')),
  CONSTRAINT eduway_platform_notif_templates_channel_check CHECK (channel IN ('push', 'in_app', 'sms', 'whatsapp', 'email')),
  CONSTRAINT eduway_platform_notif_templates_by_fkey FOREIGN KEY (updated_by) REFERENCES eduway_platform_users (id) ON DELETE SET NULL
);
SELECT eduway_platform_fn_secure_table('eduway_platform_notification_templates');

CREATE TABLE IF NOT EXISTS eduway_platform_campaigns (
  id                uuid NOT NULL DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  channel           text NOT NULL,
  template_id       uuid,
  title_en          text NOT NULL DEFAULT '',
  title_ar          text NOT NULL DEFAULT '',
  body_en           text NOT NULL DEFAULT '',
  body_ar           text NOT NULL DEFAULT '',
  link              text,
  platforms         text[] NOT NULL DEFAULT '{web,ios,android}',
  audience_filters  jsonb NOT NULL DEFAULT '{}'::jsonb,
  audience_count    integer NOT NULL DEFAULT 0,
  status            text NOT NULL DEFAULT 'draft',
  scheduled_at      timestamptz,
  sent_at           timestamptz,
  stats             jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by        uuid,
  created_by_name   text NOT NULL DEFAULT '',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_campaigns_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_campaigns_channel_check CHECK (channel IN ('push', 'in_app', 'sms', 'whatsapp', 'email')),
  CONSTRAINT eduway_platform_campaigns_status_check CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'cancelled', 'failed')),
  CONSTRAINT eduway_platform_campaigns_tpl_fkey FOREIGN KEY (template_id) REFERENCES eduway_platform_notification_templates (id) ON DELETE SET NULL,
  CONSTRAINT eduway_platform_campaigns_by_fkey FOREIGN KEY (created_by) REFERENCES eduway_platform_users (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_campaigns_status ON eduway_platform_campaigns (status, scheduled_at);
SELECT eduway_platform_fn_secure_table('eduway_platform_campaigns');

-- In-app inbox for students (and admins: kind info|warning|success|danger lives in data->>'kind').
CREATE TABLE IF NOT EXISTS eduway_platform_notifications (
  id           uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL,
  type         text NOT NULL DEFAULT 'system',
  title_en     text NOT NULL,
  title_ar     text NOT NULL,
  body_en      text NOT NULL DEFAULT '',
  body_ar      text NOT NULL DEFAULT '',
  link         text,
  data         jsonb NOT NULL DEFAULT '{}'::jsonb,
  campaign_id  uuid,
  template_id  uuid,
  read_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_notifications_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_notifications_type_check CHECK (type IN ('lesson', 'exam', 'payment', 'subscription', 'system', 'ai', 'support', 'admin')),
  CONSTRAINT eduway_platform_notifications_user_fkey FOREIGN KEY (user_id) REFERENCES eduway_platform_users (id) ON DELETE CASCADE,
  CONSTRAINT eduway_platform_notifications_camp_fkey FOREIGN KEY (campaign_id) REFERENCES eduway_platform_campaigns (id) ON DELETE SET NULL,
  CONSTRAINT eduway_platform_notifications_tpl_fkey FOREIGN KEY (template_id) REFERENCES eduway_platform_notification_templates (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_notifications_user ON eduway_platform_notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_notifications_unread ON eduway_platform_notifications (user_id) WHERE read_at IS NULL;
SELECT eduway_platform_fn_secure_table('eduway_platform_notifications');

CREATE TABLE IF NOT EXISTS eduway_platform_notification_deliveries (
  id                   uuid NOT NULL DEFAULT gen_random_uuid(),
  notification_id      uuid,
  campaign_id          uuid,
  template_id          uuid,
  user_id              uuid,
  channel              text NOT NULL,
  provider             text NOT NULL DEFAULT '',
  recipient            text,
  status               text NOT NULL DEFAULT 'queued',
  error                text,
  attempts             integer NOT NULL DEFAULT 0,
  provider_message_id  text,
  sent_at              timestamptz,
  delivered_at         timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_notification_deliveries_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_notif_deliveries_channel_check CHECK (channel IN ('push', 'in_app', 'sms', 'whatsapp', 'email')),
  CONSTRAINT eduway_platform_notif_deliveries_status_check CHECK (status IN ('queued', 'sent', 'delivered', 'failed')),
  CONSTRAINT eduway_platform_notif_deliveries_notif_fkey FOREIGN KEY (notification_id) REFERENCES eduway_platform_notifications (id) ON DELETE SET NULL,
  CONSTRAINT eduway_platform_notif_deliveries_camp_fkey FOREIGN KEY (campaign_id) REFERENCES eduway_platform_campaigns (id) ON DELETE SET NULL,
  CONSTRAINT eduway_platform_notif_deliveries_tpl_fkey FOREIGN KEY (template_id) REFERENCES eduway_platform_notification_templates (id) ON DELETE SET NULL,
  CONSTRAINT eduway_platform_notif_deliveries_user_fkey FOREIGN KEY (user_id) REFERENCES eduway_platform_users (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_notif_deliveries_created ON eduway_platform_notification_deliveries (created_at DESC);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_notif_deliveries_status ON eduway_platform_notification_deliveries (status) WHERE status IN ('queued', 'failed');
SELECT eduway_platform_fn_secure_table('eduway_platform_notification_deliveries');

CREATE TABLE IF NOT EXISTS eduway_platform_push_tokens (
  id            uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL,
  token         text NOT NULL,
  provider      text NOT NULL DEFAULT 'expo',
  platform      eduway_platform_enum_platform NOT NULL,
  device_id     text,
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_push_tokens_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_push_tokens_token_key UNIQUE (token),
  CONSTRAINT eduway_platform_push_tokens_provider_check CHECK (provider IN ('expo', 'fcm', 'apns', 'webpush')),
  CONSTRAINT eduway_platform_push_tokens_user_fkey FOREIGN KEY (user_id) REFERENCES eduway_platform_users (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_push_tokens_user ON eduway_platform_push_tokens (user_id) WHERE revoked_at IS NULL;
SELECT eduway_platform_fn_secure_table('eduway_platform_push_tokens');
