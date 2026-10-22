-- =====================================================================================================
-- 406_transactional_email — real email (nodemailer) for students and admins. Additive + idempotent; touches
-- ONLY eduway_platform_ objects (no DROP / TRUNCATE).
--   * users.email_verified_at — a student's email receives receipts / subscription / support emails only once
--     it has been confirmed (nobody can point another person's mailbox at an account).
--   * email_verifications — single-use, hashed, expiring confirmation tokens (one live token per user).
--   * an expression index on delivery payload->>'dedupeKey' so once-per-event emails (subscription expired, ...)
--     are not sent twice.
-- =====================================================================================================

ALTER TABLE eduway_platform_users ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;

CREATE TABLE IF NOT EXISTS eduway_platform_email_verifications (
  id          uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  email       text NOT NULL,
  token_hash  text NOT NULL,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  ip          text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_email_verifications_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_email_verifications_hash_key UNIQUE (token_hash),
  CONSTRAINT eduway_platform_email_verifications_user_fkey FOREIGN KEY (user_id) REFERENCES eduway_platform_users (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_email_verifications_user ON eduway_platform_email_verifications (user_id) WHERE used_at IS NULL;
SELECT eduway_platform_fn_secure_table('eduway_platform_email_verifications');

CREATE INDEX IF NOT EXISTS eduway_platform_idx_notif_deliveries_email_dedupe
  ON eduway_platform_notification_deliveries ((payload->>'dedupeKey'))
  WHERE channel = 'email' AND payload ? 'dedupeKey';
