-- =====================================================================================================
-- 403_security_followups — docs/SECURITY.md SEC-23, SEC-26, SEC-27. Additive + idempotent; touches ONLY
-- eduway_platform_ objects (no DROP / TRUNCATE).
--   * SEC-23: shared rate-limit counters (RATE_LIMIT_STORE=postgres). One row per limiter key with a fixed window.
--     UNLOGGED: the counters are disposable (a crash just resets the windows) and skip WAL on every request.
--   * SEC-26: last accepted TOTP time step per admin, so a code cannot be replayed inside its validity window.
--   * SEC-27: a short history of rotated refresh-token hashes per session (reuse detection beyond one rotation).
-- =====================================================================================================

CREATE UNLOGGED TABLE IF NOT EXISTS eduway_platform_rate_limits (
  key       text NOT NULL,
  hits      integer NOT NULL DEFAULT 0,
  reset_at  timestamptz NOT NULL,
  CONSTRAINT eduway_platform_rate_limits_pkey PRIMARY KEY (key)
);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_rate_limits_reset_at ON eduway_platform_rate_limits (reset_at);
SELECT eduway_platform_fn_secure_table('eduway_platform_rate_limits');

ALTER TABLE eduway_platform_admin_users ADD COLUMN IF NOT EXISTS mfa_last_used_step bigint;

ALTER TABLE eduway_platform_sessions ADD COLUMN IF NOT EXISTS previous_token_hashes text[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS eduway_platform_idx_sessions_previous_token_hashes ON eduway_platform_sessions USING gin (previous_token_hashes);
