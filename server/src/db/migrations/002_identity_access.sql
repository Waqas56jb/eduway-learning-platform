-- =====================================================================================================
-- 002_identity_access — users, admins, RBAC, sessions/devices, OTP, legal documents, audit & security.
-- =====================================================================================================

CREATE TABLE IF NOT EXISTS eduway_platform_governorates (
  id          uuid NOT NULL DEFAULT gen_random_uuid(),
  code        text NOT NULL,
  name_en     text NOT NULL,
  name_ar     text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_governorates_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_governorates_code_key UNIQUE (code)
);
SELECT eduway_platform_fn_secure_table('eduway_platform_governorates');

-- Every human (student or admin). Supabase Auth mirror id in auth_user_id (app_metadata.app = eduway_platform).
CREATE TABLE IF NOT EXISTS eduway_platform_users (
  id                  uuid NOT NULL DEFAULT gen_random_uuid(),
  auth_user_id        uuid,
  kind                eduway_platform_enum_user_kind NOT NULL,
  phone               text,
  email               text,
  name_en             text NOT NULL DEFAULT '',
  name_ar             text NOT NULL DEFAULT '',
  avatar_url          text,
  locale              text NOT NULL DEFAULT 'ar',
  status              text NOT NULL DEFAULT 'active',
  locked_at           timestamptz,
  locked_reason       text,
  last_active_at      timestamptz,
  notification_prefs  jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz,
  CONSTRAINT eduway_platform_users_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_users_auth_user_id_key UNIQUE (auth_user_id),
  CONSTRAINT eduway_platform_users_locale_check CHECK (locale IN ('en', 'ar')),
  CONSTRAINT eduway_platform_users_status_check CHECK (status IN ('active', 'locked', 'invited', 'deactivated')),
  CONSTRAINT eduway_platform_users_contact_check CHECK (phone IS NOT NULL OR email IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS eduway_platform_uq_users_phone ON eduway_platform_users (phone) WHERE phone IS NOT NULL AND kind = 'student';
CREATE UNIQUE INDEX IF NOT EXISTS eduway_platform_uq_users_email ON eduway_platform_users (lower(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS eduway_platform_idx_users_kind_created ON eduway_platform_users (kind, created_at DESC);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_users_last_active ON eduway_platform_users (last_active_at DESC);
SELECT eduway_platform_fn_secure_table('eduway_platform_users');

CREATE TABLE IF NOT EXISTS eduway_platform_admin_users (
  id                  uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL,
  password_hash       text,
  mfa_enabled         boolean NOT NULL DEFAULT false,
  mfa_secret          text,
  mfa_pending_secret  text,
  mfa_enrolled_at     timestamptz,
  failed_login_count  integer NOT NULL DEFAULT 0,
  locked_until        timestamptz,
  last_login_at       timestamptz,
  last_login_ip       text,
  password_changed_at timestamptz,
  invited_by          uuid,
  invited_at          timestamptz,
  mfa_recovery_codes  text[] NOT NULL DEFAULT '{}',
  preferences         jsonb NOT NULL DEFAULT '{"language":"en","theme":"system"}'::jsonb,
  deactivated_at      timestamptz,
  deactivated_reason  text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_admin_users_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_admin_users_user_id_key UNIQUE (user_id),
  CONSTRAINT eduway_platform_admin_users_user_id_fkey FOREIGN KEY (user_id) REFERENCES eduway_platform_users (id) ON DELETE CASCADE,
  CONSTRAINT eduway_platform_admin_users_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES eduway_platform_users (id) ON DELETE SET NULL
);
SELECT eduway_platform_fn_secure_table('eduway_platform_admin_users');

CREATE TABLE IF NOT EXISTS eduway_platform_roles (
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  key             text NOT NULL,
  name_en         text NOT NULL,
  name_ar         text NOT NULL,
  description_en  text NOT NULL DEFAULT '',
  description_ar  text NOT NULL DEFAULT '',
  is_system       boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_roles_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_roles_key_key UNIQUE (key)
);
SELECT eduway_platform_fn_secure_table('eduway_platform_roles');

CREATE TABLE IF NOT EXISTS eduway_platform_permissions (
  id           uuid NOT NULL DEFAULT gen_random_uuid(),
  key          text NOT NULL,
  module       text NOT NULL,
  action       text NOT NULL,
  description  text NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_permissions_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_permissions_key_key UNIQUE (key),
  CONSTRAINT eduway_platform_permissions_action_check CHECK (action IN ('view', 'create', 'edit', 'delete', 'approve', 'export'))
);
SELECT eduway_platform_fn_secure_table('eduway_platform_permissions');

CREATE TABLE IF NOT EXISTS eduway_platform_role_permissions (
  role_id        uuid NOT NULL,
  permission_id  uuid NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_role_permissions_pkey PRIMARY KEY (role_id, permission_id),
  CONSTRAINT eduway_platform_role_permissions_role_fkey FOREIGN KEY (role_id) REFERENCES eduway_platform_roles (id) ON DELETE CASCADE,
  CONSTRAINT eduway_platform_role_permissions_perm_fkey FOREIGN KEY (permission_id) REFERENCES eduway_platform_permissions (id) ON DELETE CASCADE
);
SELECT eduway_platform_fn_secure_table('eduway_platform_role_permissions');

CREATE TABLE IF NOT EXISTS eduway_platform_admin_roles (
  user_id     uuid NOT NULL,
  role_id     uuid NOT NULL,
  granted_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_admin_roles_pkey PRIMARY KEY (user_id, role_id),
  CONSTRAINT eduway_platform_admin_roles_user_fkey FOREIGN KEY (user_id) REFERENCES eduway_platform_users (id) ON DELETE CASCADE,
  CONSTRAINT eduway_platform_admin_roles_role_fkey FOREIGN KEY (role_id) REFERENCES eduway_platform_roles (id) ON DELETE RESTRICT,
  CONSTRAINT eduway_platform_admin_roles_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES eduway_platform_users (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_admin_roles_role ON eduway_platform_admin_roles (role_id);
SELECT eduway_platform_fn_secure_table('eduway_platform_admin_roles');

-- Refresh-token sessions (students AND admins). Refresh tokens are stored as HMAC hashes only.
CREATE TABLE IF NOT EXISTS eduway_platform_sessions (
  id                  uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL,
  audience            eduway_platform_enum_user_kind NOT NULL,
  refresh_token_hash  text NOT NULL,
  previous_token_hash text,
  family_id           uuid NOT NULL DEFAULT gen_random_uuid(),
  device_id           text,
  device_name         text,
  platform            eduway_platform_enum_platform NOT NULL DEFAULT 'web',
  browser             text,
  device_type         text NOT NULL DEFAULT 'desktop',
  ip                  text,
  user_agent          text,
  location            text,
  country_code        text,
  remember            boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  last_seen_at        timestamptz NOT NULL DEFAULT now(),
  expires_at          timestamptz NOT NULL,
  rotated_at          timestamptz,
  revoked_at          timestamptz,
  revoked_reason      text,
  revoked_by          uuid,
  CONSTRAINT eduway_platform_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_sessions_token_key UNIQUE (refresh_token_hash),
  CONSTRAINT eduway_platform_sessions_user_fkey FOREIGN KEY (user_id) REFERENCES eduway_platform_users (id) ON DELETE CASCADE,
  CONSTRAINT eduway_platform_sessions_revoked_by_fkey FOREIGN KEY (revoked_by) REFERENCES eduway_platform_users (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_sessions_user_active ON eduway_platform_sessions (user_id, last_seen_at DESC) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS eduway_platform_idx_sessions_family ON eduway_platform_sessions (family_id);
SELECT eduway_platform_fn_secure_table('eduway_platform_sessions');

CREATE TABLE IF NOT EXISTS eduway_platform_devices (
  id            uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL,
  device_id     text NOT NULL,
  platform      eduway_platform_enum_platform NOT NULL DEFAULT 'web',
  name          text,
  os_version    text,
  app_version   text,
  last_ip       text,
  user_agent    text,
  blocked       boolean NOT NULL DEFAULT false,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_devices_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_devices_user_device_key UNIQUE (user_id, device_id),
  CONSTRAINT eduway_platform_devices_user_fkey FOREIGN KEY (user_id) REFERENCES eduway_platform_users (id) ON DELETE CASCADE
);
SELECT eduway_platform_fn_secure_table('eduway_platform_devices');

-- One row per issued OTP. Codes are stored hashed. Limits come from settings (otp.*).
CREATE TABLE IF NOT EXISTS eduway_platform_otp_codes (
  id            uuid NOT NULL DEFAULT gen_random_uuid(),
  phone         text NOT NULL,
  purpose       text NOT NULL DEFAULT 'login',
  code_hash     text NOT NULL,
  attempts      integer NOT NULL DEFAULT 0,
  max_attempts  integer NOT NULL,
  send_count    integer NOT NULL DEFAULT 1,
  last_sent_at  timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  consumed_at   timestamptz,
  invalidated_at timestamptz,
  ip            text,
  user_agent    text,
  provider      text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_otp_codes_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_otp_codes_purpose_check CHECK (purpose IN ('login', 'register', 'change_phone'))
);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_otp_codes_phone ON eduway_platform_otp_codes (phone, created_at DESC);
SELECT eduway_platform_fn_secure_table('eduway_platform_otp_codes');

-- Lockouts after too many failures (OTP per phone, admin login per email).
CREATE TABLE IF NOT EXISTS eduway_platform_auth_lockouts (
  id            uuid NOT NULL DEFAULT gen_random_uuid(),
  kind          text NOT NULL,
  identifier    text NOT NULL,
  failed_count  integer NOT NULL DEFAULT 0,
  window_start  timestamptz NOT NULL DEFAULT now(),
  locked_until  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_auth_lockouts_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_auth_lockouts_kind_ident_key UNIQUE (kind, identifier),
  CONSTRAINT eduway_platform_auth_lockouts_kind_check CHECK (kind IN ('otp', 'admin_login', 'admin_mfa'))
);
SELECT eduway_platform_fn_secure_table('eduway_platform_auth_lockouts');

-- Admin invitations (hashed token, 7-day validity by default).
CREATE TABLE IF NOT EXISTS eduway_platform_admin_invites (
  id           uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL,
  role_id      uuid,
  token_hash   text NOT NULL,
  expires_at   timestamptz NOT NULL,
  accepted_at  timestamptz,
  revoked_at   timestamptz,
  created_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_admin_invites_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_admin_invites_hash_key UNIQUE (token_hash),
  CONSTRAINT eduway_platform_admin_invites_user_fkey FOREIGN KEY (user_id) REFERENCES eduway_platform_users (id) ON DELETE CASCADE,
  CONSTRAINT eduway_platform_admin_invites_role_fkey FOREIGN KEY (role_id) REFERENCES eduway_platform_roles (id) ON DELETE SET NULL,
  CONSTRAINT eduway_platform_admin_invites_by_fkey FOREIGN KEY (created_by) REFERENCES eduway_platform_users (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_admin_invites_user ON eduway_platform_admin_invites (user_id);
SELECT eduway_platform_fn_secure_table('eduway_platform_admin_invites');

-- Admin password-reset tokens (hashed, single use).
CREATE TABLE IF NOT EXISTS eduway_platform_password_resets (
  id          uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  token_hash  text NOT NULL,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  ip          text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_password_resets_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_password_resets_hash_key UNIQUE (token_hash),
  CONSTRAINT eduway_platform_password_resets_user_fkey FOREIGN KEY (user_id) REFERENCES eduway_platform_users (id) ON DELETE CASCADE
);
SELECT eduway_platform_fn_secure_table('eduway_platform_password_resets');

CREATE TABLE IF NOT EXISTS eduway_platform_legal_documents (
  id            uuid NOT NULL DEFAULT gen_random_uuid(),
  doc_type      text NOT NULL,
  version       text NOT NULL,
  title_en      text NOT NULL DEFAULT '',
  title_ar      text NOT NULL DEFAULT '',
  subtitle_en   text NOT NULL DEFAULT '',
  subtitle_ar   text NOT NULL DEFAULT '',
  -- Markdown: intro paragraph(s), then one "## <title>" heading per section (parsed into LegalDocumentDto.sections).
  body_en       text NOT NULL,
  body_ar       text NOT NULL,
  change_summary_en text,
  change_summary_ar text,
  status        text NOT NULL DEFAULT 'draft',
  requires_acceptance boolean NOT NULL DEFAULT true,
  published_at  timestamptz,
  retired_at    timestamptz,
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_legal_documents_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_legal_documents_type_version_key UNIQUE (doc_type, version),
  CONSTRAINT eduway_platform_legal_documents_type_check CHECK (doc_type IN ('terms', 'privacy')),
  CONSTRAINT eduway_platform_legal_documents_status_check CHECK (status IN ('draft', 'published', 'retired')),
  CONSTRAINT eduway_platform_legal_documents_created_by_fkey FOREIGN KEY (created_by) REFERENCES eduway_platform_users (id) ON DELETE SET NULL
);
-- At most one published version per document type.
CREATE UNIQUE INDEX IF NOT EXISTS eduway_platform_uq_legal_documents_published ON eduway_platform_legal_documents (doc_type) WHERE status = 'published';
SELECT eduway_platform_fn_secure_table('eduway_platform_legal_documents');

CREATE TABLE IF NOT EXISTS eduway_platform_legal_acceptances (
  id           uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL,
  document_id  uuid NOT NULL,
  accepted_at  timestamptz NOT NULL DEFAULT now(),
  ip           text,
  platform     eduway_platform_enum_platform,
  CONSTRAINT eduway_platform_legal_acceptances_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_legal_acceptances_user_doc_key UNIQUE (user_id, document_id),
  CONSTRAINT eduway_platform_legal_acceptances_user_fkey FOREIGN KEY (user_id) REFERENCES eduway_platform_users (id) ON DELETE CASCADE,
  CONSTRAINT eduway_platform_legal_acceptances_doc_fkey FOREIGN KEY (document_id) REFERENCES eduway_platform_legal_documents (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_legal_acceptances_doc ON eduway_platform_legal_acceptances (document_id);
SELECT eduway_platform_fn_secure_table('eduway_platform_legal_acceptances');

-- Free-form admin notes attached to students, schools, marketers, payments…
CREATE TABLE IF NOT EXISTS eduway_platform_entity_notes (
  id           uuid NOT NULL DEFAULT gen_random_uuid(),
  entity_type  text NOT NULL,
  entity_id    uuid NOT NULL,
  author_id    uuid,
  author_name  text NOT NULL DEFAULT '',
  body         text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_entity_notes_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_entity_notes_type_check CHECK (entity_type IN ('student', 'school', 'marketer', 'payment', 'admin')),
  CONSTRAINT eduway_platform_entity_notes_author_fkey FOREIGN KEY (author_id) REFERENCES eduway_platform_users (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_entity_notes_entity ON eduway_platform_entity_notes (entity_type, entity_id, created_at DESC);
SELECT eduway_platform_fn_secure_table('eduway_platform_entity_notes');

-- Admin mutation trail (written by the audit middleware / auditService).
CREATE TABLE IF NOT EXISTS eduway_platform_audit_logs (
  id           uuid NOT NULL DEFAULT gen_random_uuid(),
  actor_id     uuid,
  actor_name   text NOT NULL DEFAULT '',
  actor_role   text NOT NULL DEFAULT '',
  action       text NOT NULL,
  entity       text NOT NULL,
  entity_id    text,
  summary      text NOT NULL DEFAULT '',
  before       jsonb,
  after        jsonb,
  ip           text,
  user_agent   text,
  device       text,
  request_id   text,
  method       text,
  path         text,
  status_code  integer,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_audit_logs_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_audit_logs_actor_fkey FOREIGN KEY (actor_id) REFERENCES eduway_platform_users (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_audit_logs_created ON eduway_platform_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_audit_logs_actor ON eduway_platform_audit_logs (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_audit_logs_entity ON eduway_platform_audit_logs (entity, entity_id);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_audit_logs_action ON eduway_platform_audit_logs (action);
SELECT eduway_platform_fn_secure_table('eduway_platform_audit_logs');

CREATE TABLE IF NOT EXISTS eduway_platform_suspicious_events (
  id             uuid NOT NULL DEFAULT gen_random_uuid(),
  kind           text NOT NULL,
  severity       text NOT NULL DEFAULT 'medium',
  subject_label  text NOT NULL DEFAULT '',
  subject_type   text,
  user_id        uuid,
  detail         text NOT NULL DEFAULT '',
  meta           jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip             text,
  status         text NOT NULL DEFAULT 'open',
  resolved_by    uuid,
  resolved_at    timestamptz,
  resolution_note text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_suspicious_events_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_suspicious_events_kind_check CHECK (kind IN ('multiple_devices', 'otp_bruteforce', 'unusual_location', 'payment_fraud', 'admin_login_failure', 'refresh_token_reuse', 'other')),
  CONSTRAINT eduway_platform_suspicious_events_sev_check CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  CONSTRAINT eduway_platform_suspicious_events_status_check CHECK (status IN ('open', 'resolved', 'blocked')),
  CONSTRAINT eduway_platform_suspicious_events_user_fkey FOREIGN KEY (user_id) REFERENCES eduway_platform_users (id) ON DELETE SET NULL,
  CONSTRAINT eduway_platform_suspicious_events_resolver_fkey FOREIGN KEY (resolved_by) REFERENCES eduway_platform_users (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_suspicious_events_status ON eduway_platform_suspicious_events (status, created_at DESC);
SELECT eduway_platform_fn_secure_table('eduway_platform_suspicious_events');

-- Admin inbox (Topbar bell). One row per recipient admin; generated server-side per permission.
CREATE TABLE IF NOT EXISTS eduway_platform_admin_notifications (
  id          uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  kind        text NOT NULL DEFAULT 'info',
  category    text NOT NULL DEFAULT 'general',
  title_en    text NOT NULL,
  title_ar    text NOT NULL,
  body_en     text NOT NULL DEFAULT '',
  body_ar     text NOT NULL DEFAULT '',
  href        text NOT NULL DEFAULT '/',
  dedupe_key  text,
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_admin_notifications_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_admin_notif_kind_check CHECK (kind IN ('info', 'warning', 'success', 'danger')),
  CONSTRAINT eduway_platform_admin_notif_user_fkey FOREIGN KEY (user_id) REFERENCES eduway_platform_users (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_admin_notif_user ON eduway_platform_admin_notifications (user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS eduway_platform_uq_admin_notif_dedupe ON eduway_platform_admin_notifications (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
SELECT eduway_platform_fn_secure_table('eduway_platform_admin_notifications');
