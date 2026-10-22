-- =====================================================================================================
-- 011_platform — settings (key/value), feature flags, mobile app settings, exports log, analytics rollups,
-- landing CMS (testimonials, FAQ), support tickets.
-- =====================================================================================================

-- Grouped key/value settings: general, otp, support, payments, learning, marketing, security, auth (value = JSON object).
CREATE TABLE IF NOT EXISTS eduway_platform_settings (
  key          text NOT NULL,
  value        jsonb NOT NULL DEFAULT '{}'::jsonb,
  description  text NOT NULL DEFAULT '',
  is_public    boolean NOT NULL DEFAULT false,
  updated_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_settings_pkey PRIMARY KEY (key),
  CONSTRAINT eduway_platform_settings_by_fkey FOREIGN KEY (updated_by) REFERENCES eduway_platform_users (id) ON DELETE SET NULL
);
SELECT eduway_platform_fn_secure_table('eduway_platform_settings');

CREATE TABLE IF NOT EXISTS eduway_platform_feature_flags (
  id               uuid NOT NULL DEFAULT gen_random_uuid(),
  key              text NOT NULL,
  name_en          text NOT NULL,
  name_ar          text NOT NULL,
  description_en   text NOT NULL DEFAULT '',
  description_ar   text NOT NULL DEFAULT '',
  enabled          boolean NOT NULL DEFAULT false,
  environment      text NOT NULL DEFAULT 'production',
  rollout_percent  integer NOT NULL DEFAULT 100,
  platforms        text[] NOT NULL DEFAULT '{web,ios,android}',
  updated_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_feature_flags_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_feature_flags_key_key UNIQUE (key),
  CONSTRAINT eduway_platform_feature_flags_env_check CHECK (environment IN ('production', 'staging', 'beta')),
  CONSTRAINT eduway_platform_feature_flags_rollout_check CHECK (rollout_percent BETWEEN 0 AND 100),
  CONSTRAINT eduway_platform_feature_flags_by_fkey FOREIGN KEY (updated_by) REFERENCES eduway_platform_users (id) ON DELETE SET NULL
);
SELECT eduway_platform_fn_secure_table('eduway_platform_feature_flags');

-- Singleton (id = 1) controlling the clients: versions, force update, maintenance, device/session policy.
CREATE TABLE IF NOT EXISTS eduway_platform_app_settings (
  id                        smallint NOT NULL DEFAULT 1,
  min_version_ios           text NOT NULL DEFAULT '1.0.0',
  min_version_android       text NOT NULL DEFAULT '1.0.0',
  latest_version            text NOT NULL DEFAULT '1.0.0',
  force_update              boolean NOT NULL DEFAULT false,
  store_url_ios             text,
  store_url_android         text,
  maintenance_mode          boolean NOT NULL DEFAULT false,
  maintenance_message_en    text NOT NULL DEFAULT '',
  maintenance_message_ar    text NOT NULL DEFAULT '',
  maintenance_platforms     text[] NOT NULL DEFAULT '{web,ios,android}',
  device_limit              integer NOT NULL DEFAULT 2,
  session_timeout_minutes   integer NOT NULL DEFAULT 43200,
  updated_by                uuid,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_app_settings_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_app_settings_singleton_check CHECK (id = 1),
  CONSTRAINT eduway_platform_app_settings_limits_check CHECK (device_limit BETWEEN 1 AND 20 AND session_timeout_minutes > 0),
  CONSTRAINT eduway_platform_app_settings_by_fkey FOREIGN KEY (updated_by) REFERENCES eduway_platform_users (id) ON DELETE SET NULL
);
SELECT eduway_platform_fn_secure_table('eduway_platform_app_settings');

CREATE TABLE IF NOT EXISTS eduway_platform_exports_log (
  id          uuid NOT NULL DEFAULT gen_random_uuid(),
  report      text NOT NULL,
  format      text NOT NULL,
  range_from  date,
  range_to    date,
  filters     jsonb NOT NULL DEFAULT '{}'::jsonb,
  row_count   integer NOT NULL DEFAULT 0,
  columns     text[] NOT NULL DEFAULT '{}',
  status      text NOT NULL DEFAULT 'ready',
  file_key    text,
  file_name   text,
  error       text,
  completed_at timestamptz,
  actor_id    uuid,
  actor_name  text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_exports_log_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_exports_log_format_check CHECK (format IN ('csv', 'xlsx')),
  CONSTRAINT eduway_platform_exports_log_status_check CHECK (status IN ('queued', 'processing', 'ready', 'failed')),
  CONSTRAINT eduway_platform_exports_log_actor_fkey FOREIGN KEY (actor_id) REFERENCES eduway_platform_users (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_exports_log_created ON eduway_platform_exports_log (created_at DESC);
SELECT eduway_platform_fn_secure_table('eduway_platform_exports_log');

-- Pre-aggregated metrics (filled by the daily rollup job). dimension '' / platform 'all' = totals.
CREATE TABLE IF NOT EXISTS eduway_platform_analytics_daily_rollups (
  id               uuid NOT NULL DEFAULT gen_random_uuid(),
  day              date NOT NULL,
  metric           text NOT NULL,
  dimension        text NOT NULL DEFAULT '',
  dimension_value  text NOT NULL DEFAULT '',
  platform         text NOT NULL DEFAULT 'all',
  value            numeric(18,4) NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_analytics_daily_rollups_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_analytics_rollups_key UNIQUE (day, metric, dimension, dimension_value, platform)
);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_analytics_rollups_metric ON eduway_platform_analytics_daily_rollups (metric, day);
SELECT eduway_platform_fn_secure_table('eduway_platform_analytics_daily_rollups');

CREATE TABLE IF NOT EXISTS eduway_platform_cms_testimonials (
  id          uuid NOT NULL DEFAULT gen_random_uuid(),
  slug        text NOT NULL,
  name_en     text NOT NULL,
  name_ar     text NOT NULL,
  city_en     text NOT NULL DEFAULT '',
  city_ar     text NOT NULL DEFAULT '',
  role_en     text NOT NULL DEFAULT '',
  role_ar     text NOT NULL DEFAULT '',
  quote_en    text NOT NULL,
  quote_ar    text NOT NULL,
  avatar_url  text,
  rating      integer NOT NULL DEFAULT 5,
  placements  text[] NOT NULL DEFAULT '{landing}',
  sort_order  integer NOT NULL DEFAULT 0,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_cms_testimonials_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_cms_testimonials_slug_key UNIQUE (slug),
  CONSTRAINT eduway_platform_cms_testimonials_rating_check CHECK (rating BETWEEN 1 AND 5)
);
SELECT eduway_platform_fn_secure_table('eduway_platform_cms_testimonials');

CREATE TABLE IF NOT EXISTS eduway_platform_cms_faq (
  id           uuid NOT NULL DEFAULT gen_random_uuid(),
  slug         text NOT NULL,
  question_en  text NOT NULL,
  question_ar  text NOT NULL,
  answer_en    text NOT NULL,
  answer_ar    text NOT NULL,
  placements   text[] NOT NULL DEFAULT '{landing}',
  sort_order   integer NOT NULL DEFAULT 0,
  active       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_cms_faq_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_cms_faq_slug_key UNIQUE (slug)
);
SELECT eduway_platform_fn_secure_table('eduway_platform_cms_faq');

CREATE TABLE IF NOT EXISTS eduway_platform_support_tickets (
  id           uuid NOT NULL DEFAULT gen_random_uuid(),
  number       text NOT NULL,
  user_id      uuid,
  subject_en   text NOT NULL,
  subject_ar   text NOT NULL DEFAULT '',
  message      text NOT NULL DEFAULT '',
  contact_name text,
  contact_value text,
  source       text NOT NULL DEFAULT 'app',
  locale       text NOT NULL DEFAULT 'ar',
  category     text NOT NULL DEFAULT 'account',
  priority     text NOT NULL DEFAULT 'medium',
  status       text NOT NULL DEFAULT 'open',
  assignee_id  uuid,
  assignee_name text NOT NULL DEFAULT '',
  channel      text NOT NULL DEFAULT 'in_app',
  resolved_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_support_tickets_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_support_tickets_number_key UNIQUE (number),
  CONSTRAINT eduway_platform_support_tickets_cat_check CHECK (category IN ('payment', 'access', 'video', 'content', 'account', 'other')),
  CONSTRAINT eduway_platform_support_tickets_prio_check CHECK (priority IN ('low', 'medium', 'high')),
  CONSTRAINT eduway_platform_support_tickets_status_check CHECK (status IN ('open', 'pending', 'resolved')),
  CONSTRAINT eduway_platform_support_tickets_source_check CHECK (source IN ('contact_form', 'app', 'admin')),
  CONSTRAINT eduway_platform_support_tickets_user_fkey FOREIGN KEY (user_id) REFERENCES eduway_platform_users (id) ON DELETE SET NULL,
  CONSTRAINT eduway_platform_support_tickets_asg_fkey FOREIGN KEY (assignee_id) REFERENCES eduway_platform_users (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_support_tickets_status ON eduway_platform_support_tickets (status, created_at DESC);
SELECT eduway_platform_fn_secure_table('eduway_platform_support_tickets');

CREATE TABLE IF NOT EXISTS eduway_platform_support_ticket_messages (
  id          uuid NOT NULL DEFAULT gen_random_uuid(),
  ticket_id   uuid NOT NULL,
  author_id   uuid,
  author_kind text NOT NULL DEFAULT 'student',
  body        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_support_ticket_messages_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_support_msgs_kind_check CHECK (author_kind IN ('student', 'admin', 'system')),
  CONSTRAINT eduway_platform_support_msgs_ticket_fkey FOREIGN KEY (ticket_id) REFERENCES eduway_platform_support_tickets (id) ON DELETE CASCADE,
  CONSTRAINT eduway_platform_support_msgs_author_fkey FOREIGN KEY (author_id) REFERENCES eduway_platform_users (id) ON DELETE SET NULL
);
SELECT eduway_platform_fn_secure_table('eduway_platform_support_ticket_messages');

-- Upload registry: opaque fileKey ("upl_<uuid>") → prefixed bucket + path. Raw paths are never exposed.
CREATE TABLE IF NOT EXISTS eduway_platform_uploads (
  id            uuid NOT NULL DEFAULT gen_random_uuid(),
  file_key      text NOT NULL,
  purpose       text NOT NULL,
  bucket        text NOT NULL,
  path          text NOT NULL,
  file_name     text NOT NULL,
  content_type  text NOT NULL,
  size_bytes    bigint NOT NULL DEFAULT 0,
  owner_id      uuid,
  owner_kind    eduway_platform_enum_user_kind,
  status        text NOT NULL DEFAULT 'pending',
  entity_type   text,
  entity_id     uuid,
  expires_at    timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  uploaded_at   timestamptz,
  attached_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_uploads_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_uploads_file_key_key UNIQUE (file_key),
  CONSTRAINT eduway_platform_uploads_bucket_path_key UNIQUE (bucket, path),
  CONSTRAINT eduway_platform_uploads_bucket_check CHECK (bucket LIKE 'eduway-platform-%'),
  CONSTRAINT eduway_platform_uploads_status_check CHECK (status IN ('pending', 'uploaded', 'attached', 'deleted')),
  CONSTRAINT eduway_platform_uploads_owner_fkey FOREIGN KEY (owner_id) REFERENCES eduway_platform_users (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_uploads_entity ON eduway_platform_uploads (entity_type, entity_id);
SELECT eduway_platform_fn_secure_table('eduway_platform_uploads');
