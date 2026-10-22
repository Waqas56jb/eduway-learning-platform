-- 401_performance — indexes found missing by the load test / EXPLAIN review (docs/PERFORMANCE.md).
-- Idempotent (IF NOT EXISTS); every object carries the eduway_platform_ prefix. Tables are small today, so plain
-- CREATE INDEX (not CONCURRENTLY — the migrator runs files inside a transaction) is safe; on a large production table
-- create the same index manually with CONCURRENTLY first and this file becomes a no-op.

-- Entitlement engine: entitlements.list() / grants / admin student detail read ALL of a user's rows
-- (`WHERE user_id = $1`, revoked included). The existing eduway_platform_idx_entitlements_user is partial
-- (revoked_at IS NULL) and therefore unusable for that predicate → sequential scan of the whole table.
CREATE INDEX IF NOT EXISTS eduway_platform_idx_entitlements_user_all
  ON eduway_platform_entitlements (user_id);

-- Admin subscriptions list (ADM-SBS-01): default sort `endsAt`, also `-createdAt`; LIMIT/OFFSET pages need an
-- ordered index instead of sorting the whole table (eduway_platform_idx_subscriptions_expiry is partial: active only).
CREATE INDEX IF NOT EXISTS eduway_platform_idx_subscriptions_ends_all
  ON eduway_platform_subscriptions (ends_at, id);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_subscriptions_created
  ON eduway_platform_subscriptions (created_at DESC);

-- Catalog subject stats (exams_count sub-select on every /subjects call) and /exams/available:
-- published, non-deleted blueprints by subject.
CREATE INDEX IF NOT EXISTS eduway_platform_idx_exam_blueprints_subject_live
  ON eduway_platform_exam_blueprints (subject_id, status)
  WHERE deleted_at IS NULL;

-- Exam blueprint sections are joined by subject for multi-subject papers (exams_count, available exams).
CREATE INDEX IF NOT EXISTS eduway_platform_idx_exam_bp_sections_subject
  ON eduway_platform_exam_blueprint_sections (subject_id);
