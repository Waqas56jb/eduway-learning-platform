-- =====================================================================================================
-- 404_whatsapp_session — WhatsApp (Baileys / WhatsApp Web multi-device) session linked by an admin via QR.
-- Additive + idempotent; touches ONLY eduway_platform_ objects (no DROP / TRUNCATE).
--   * whatsapp_auth: Baileys auth state (creds + signal keys), one row per key, value AES-256-GCM encrypted by the
--     API with a key derived from WHATSAPP_SESSION_SECRET (the database never sees plaintext keys).
--   * whatsapp_sessions: one row per logical session ('default'): status shown in the admin portal, the current QR,
--     the linked number, and a lease (owner + expiry) so only ONE API instance holds the WhatsApp socket.
--   * otp_codes.channel: the channel an OTP was actually delivered on (whatsapp, or sms after a fallback).
-- =====================================================================================================

CREATE TABLE IF NOT EXISTS eduway_platform_whatsapp_auth (
  session_id  text NOT NULL DEFAULT 'default',
  key         text NOT NULL,
  value       text NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_whatsapp_auth_pkey PRIMARY KEY (session_id, key)
);
SELECT eduway_platform_fn_secure_table('eduway_platform_whatsapp_auth');

CREATE TABLE IF NOT EXISTS eduway_platform_whatsapp_sessions (
  id                text NOT NULL DEFAULT 'default',
  status            text NOT NULL DEFAULT 'disconnected',
  -- what the admin asked for: 'connected' (keep the socket up, auto-reconnect) or 'disconnected'
  desired           text NOT NULL DEFAULT 'disconnected',
  status_since      timestamptz NOT NULL DEFAULT now(),
  phone             text,
  jid               text,
  display_name      text,
  connected_at      timestamptz,
  qr                text,
  qr_updated_at     timestamptz,
  last_error        text,
  lease_owner       text,
  lease_expires_at  timestamptz,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_whatsapp_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_whatsapp_sessions_status_check CHECK (status IN ('disconnected', 'qr_pending', 'connecting', 'connected')),
  CONSTRAINT eduway_platform_whatsapp_sessions_desired_check CHECK (desired IN ('connected', 'disconnected'))
);
SELECT eduway_platform_fn_secure_table('eduway_platform_whatsapp_sessions');

ALTER TABLE eduway_platform_otp_codes ADD COLUMN IF NOT EXISTS channel text;
