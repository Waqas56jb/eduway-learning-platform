-- =====================================================================================================
-- 201_commerce_partners — Agent C (packages, promotions, subscriptions, payments, schools, marketers,
-- incentive rules, settlements, analytics, exports). Additive + idempotent; every object prefixed.
--   * settlements: paid_by, rule_version; yearly period key 'YYYY' accepted (API_CONTRACT §26)
--   * incentive_rules: activated_by / activated_at (ADM-INC-06)
--   * schools: code alias window after a code change (ADM-SCH-05 keeps the old code for 90 days)
--   * exports_log: source (exports_page | table), stored file bytes for re-download (ADM-EXP-02/03)
--   * analytics: prefixed views + eduway_platform_fn_daily_metrics / eduway_platform_fn_rollup_daily
-- =====================================================================================================

-- ── settlements ──────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE eduway_platform_settlements ADD COLUMN IF NOT EXISTS paid_by uuid;
ALTER TABLE eduway_platform_settlements ADD COLUMN IF NOT EXISTS rule_version integer;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eduway_platform_settlements_paid_by_fkey') THEN
    ALTER TABLE eduway_platform_settlements ADD CONSTRAINT eduway_platform_settlements_paid_by_fkey
      FOREIGN KEY (paid_by) REFERENCES eduway_platform_users (id) ON DELETE SET NULL;
  END IF;
  -- Widen the period key check: monthly YYYY-MM, quarterly YYYY-Qn, semester YYYY-Sn, yearly YYYY (or legacy YYYY-Y).
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eduway_platform_settlements_period_check'
              AND pg_get_constraintdef(oid) NOT LIKE '%{4}$|%') THEN
    ALTER TABLE eduway_platform_settlements DROP CONSTRAINT eduway_platform_settlements_period_check;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eduway_platform_settlements_period_check') THEN
    ALTER TABLE eduway_platform_settlements ADD CONSTRAINT eduway_platform_settlements_period_check
      CHECK (period ~ '^[0-9]{4}$|^[0-9]{4}-[0-9]{2}$|^[0-9]{4}-(Q[1-4]|S[12]|Y)$');
  END IF;
END
$$;
CREATE INDEX IF NOT EXISTS eduway_platform_idx_settlements_period ON eduway_platform_settlements (partner_type, period DESC);

-- ── incentive rules ──────────────────────────────────────────────────────────────────────────────────
ALTER TABLE eduway_platform_incentive_rules ADD COLUMN IF NOT EXISTS activated_by uuid;
ALTER TABLE eduway_platform_incentive_rules ADD COLUMN IF NOT EXISTS activated_at timestamptz;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eduway_platform_incentive_rules_act_fkey') THEN
    ALTER TABLE eduway_platform_incentive_rules ADD CONSTRAINT eduway_platform_incentive_rules_act_fkey
      FOREIGN KEY (activated_by) REFERENCES eduway_platform_users (id) ON DELETE SET NULL;
  END IF;
END
$$;
CREATE INDEX IF NOT EXISTS eduway_platform_idx_incentive_rules_type ON eduway_platform_incentive_rules (partner_type, status, effective_from DESC);

-- ── schools: old code stays usable as referral alias for 90 days after a code change ─────────────────
ALTER TABLE eduway_platform_schools ADD COLUMN IF NOT EXISTS code_alias_until timestamptz;

-- ── payments: analytics / reconciliation access paths ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS eduway_platform_idx_payments_paid_at ON eduway_platform_payments (paid_at) WHERE paid_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS eduway_platform_idx_payments_created ON eduway_platform_payments (created_at DESC);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_refunds_status ON eduway_platform_refunds (status, requested_at DESC);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_promo_redemptions_pay ON eduway_platform_promotion_redemptions (payment_id);

-- ── exports log: origin + stored file (re-download from the Exports history) ────────────────────────
ALTER TABLE eduway_platform_exports_log ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'table';
ALTER TABLE eduway_platform_exports_log ADD COLUMN IF NOT EXISTS file_data bytea;
ALTER TABLE eduway_platform_exports_log ADD COLUMN IF NOT EXISTS content_type text;
ALTER TABLE eduway_platform_exports_log ADD COLUMN IF NOT EXISTS expires_at timestamptz;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eduway_platform_exports_log_source_check') THEN
    ALTER TABLE eduway_platform_exports_log ADD CONSTRAINT eduway_platform_exports_log_source_check
      CHECK (source IN ('exports_page', 'table'));
  END IF;
END
$$;

-- ── analytics views ──────────────────────────────────────────────────────────────────────────────────
-- "Paid transaction" (business analytics): paid | partially_refunded | refunded (API_CONTRACT §29).
CREATE OR REPLACE VIEW eduway_platform_v_paid_transactions AS
  SELECT p.id, p.user_id, p.package_id, p.billing_cycle, p.total, p.discount, p.refunded_amount,
         (p.total - p.refunded_amount) AS net, p.provider, p.status, p.platform::text AS platform,
         p.school_id, p.marketer_id, p.promo_code, p.paid_at, p.created_at
    FROM eduway_platform_payments p
   WHERE p.status IN ('paid', 'partially_refunded', 'refunded') AND p.paid_at IS NOT NULL;

-- "Verified paid student" (partner attribution): ≥1 payment in paid | partially_refunded.
CREATE OR REPLACE VIEW eduway_platform_v_verified_payments AS
  SELECT p.id, p.user_id, p.total, p.school_id, p.marketer_id, p.paid_at, p.platform::text AS platform
    FROM eduway_platform_payments p
   WHERE p.status IN ('paid', 'partially_refunded') AND p.paid_at IS NOT NULL;

-- ── daily metrics (live) ─────────────────────────────────────────────────────────────────────────────
-- One row per (day, metric, dimension, dimension_value, platform). platform 'all' = totals.
CREATE OR REPLACE FUNCTION eduway_platform_fn_daily_metrics(p_from date, p_to date, p_tz text DEFAULT 'Asia/Baghdad')
RETURNS TABLE (o_day date, o_metric text, o_dimension text, o_dimension_value text, o_platform text, o_value numeric)
LANGUAGE sql
STABLE
AS $fn$
  WITH bounds AS (
    SELECT (p_from::timestamp AT TIME ZONE p_tz) AS t0, ((p_to + 1)::timestamp AT TIME ZONE p_tz) AS t1
  ),
  regs AS (
    SELECT (u.created_at AT TIME ZONE p_tz)::date AS d, COALESCE(sp.registered_platform::text, 'web') AS pf
      FROM bounds b
      JOIN eduway_platform_users u ON u.created_at >= b.t0 AND u.created_at < b.t1
      LEFT JOIN eduway_platform_student_profiles sp ON sp.user_id = u.id
     WHERE u.kind = 'student' AND u.deleted_at IS NULL
  ),
  act AS (
    SELECT a.activity_date AS d, a.user_id, a.watch_seconds, a.ai_questions,
           COALESCE(a.platforms[1], 'web') AS pf, a.platforms
      FROM eduway_platform_daily_activity a
     WHERE a.activity_date BETWEEN p_from AND p_to
  ),
  act_pf AS (
    SELECT act.d, act.user_id, x.pf
      FROM act, unnest(CASE WHEN cardinality(act.platforms) = 0 THEN ARRAY['web'] ELSE act.platforms END) AS x(pf)
  ),
  watched AS (
    SELECT (w.updated_at AT TIME ZONE p_tz)::date AS d, COALESCE(w.platform::text, 'web') AS pf
      FROM bounds b JOIN eduway_platform_watch_progress w ON w.updated_at >= b.t0 AND w.updated_at < b.t1
  ),
  completions AS (
    SELECT (c.completed_at AT TIME ZONE p_tz)::date AS d
      FROM bounds b JOIN eduway_platform_lesson_completions c ON c.completed_at >= b.t0 AND c.completed_at < b.t1
  ),
  quizzes AS (
    SELECT (q.started_at AT TIME ZONE p_tz)::date AS d, COALESCE(q.platform::text, 'web') AS pf,
           (q.status IN ('passed', 'failed')) AS done
      FROM bounds b JOIN eduway_platform_quiz_attempts q ON q.started_at >= b.t0 AND q.started_at < b.t1
  ),
  exams AS (
    SELECT (e.started_at AT TIME ZONE p_tz)::date AS d, COALESCE(e.platform::text, 'web') AS pf
      FROM bounds b JOIN eduway_platform_exam_attempts e ON e.started_at >= b.t0 AND e.started_at < b.t1
  ),
  ai AS (
    SELECT (m.created_at AT TIME ZONE p_tz)::date AS d, COALESCE(cv.platform::text, 'web') AS pf, cv.user_id,
           m.role, (m.tokens_in + m.tokens_out) AS tokens, m.cost_usd, COALESCE(s.slug, '') AS subject
      FROM bounds b
      JOIN eduway_platform_ai_messages m ON m.created_at >= b.t0 AND m.created_at < b.t1
      JOIN eduway_platform_ai_conversations cv ON cv.id = m.conversation_id
      LEFT JOIN eduway_platform_subjects s ON s.id = cv.subject_id
  ),
  pay AS (
    SELECT (v.paid_at AT TIME ZONE p_tz)::date AS d, COALESCE(v.platform, 'web') AS pf, v.total
      FROM bounds b JOIN eduway_platform_v_paid_transactions v ON v.paid_at >= b.t0 AND v.paid_at < b.t1
  ),
  refs AS (
    SELECT (r.decided_at AT TIME ZONE p_tz)::date AS d, r.amount
      FROM bounds b JOIN eduway_platform_refunds r ON r.decided_at >= b.t0 AND r.decided_at < b.t1
     WHERE r.status IN ('approved', 'processed')
  ),
  sess AS (
    SELECT (s.created_at AT TIME ZONE p_tz)::date AS d, s.platform::text AS pf
      FROM bounds b JOIN eduway_platform_sessions s ON s.created_at >= b.t0 AND s.created_at < b.t1
     WHERE s.audience = 'student'
  )
  SELECT d, 'registrations', '', '', pf, count(*)::numeric FROM regs GROUP BY d, pf
  UNION ALL SELECT d, 'registrations', '', '', 'all', count(*)::numeric FROM regs GROUP BY d
  UNION ALL SELECT d, 'dau', '', '', 'all', count(DISTINCT user_id)::numeric FROM act GROUP BY d
  UNION ALL SELECT d, 'dau', '', '', pf, count(DISTINCT user_id)::numeric FROM act_pf GROUP BY d, pf
  UNION ALL SELECT d, 'watch_minutes', '', '', 'all', round(sum(watch_seconds) / 60.0, 2) FROM act GROUP BY d
  UNION ALL SELECT d, 'watch_minutes', '', '', pf, round(sum(watch_seconds) / 60.0, 2) FROM act GROUP BY d, pf
  UNION ALL SELECT d, 'videos_watched', '', '', 'all', count(*)::numeric FROM watched GROUP BY d
  UNION ALL SELECT d, 'lessons_completed', '', '', 'all', count(*)::numeric FROM completions GROUP BY d
  UNION ALL SELECT d, 'quiz_attempts', '', '', 'all', count(*)::numeric FROM quizzes GROUP BY d
  UNION ALL SELECT d, 'quiz_attempts', '', '', pf, count(*)::numeric FROM quizzes GROUP BY d, pf
  UNION ALL SELECT d, 'quiz_completed', '', '', 'all', count(*) FILTER (WHERE done)::numeric FROM quizzes GROUP BY d
  UNION ALL SELECT d, 'exam_attempts', '', '', 'all', count(*)::numeric FROM exams GROUP BY d
  UNION ALL SELECT d, 'exam_attempts', '', '', pf, count(*)::numeric FROM exams GROUP BY d, pf
  UNION ALL SELECT d, 'ai_questions', '', '', 'all', count(*)::numeric FROM ai WHERE role = 'user' GROUP BY d
  UNION ALL SELECT d, 'ai_questions', '', '', pf, count(*)::numeric FROM ai WHERE role = 'user' GROUP BY d, pf
  UNION ALL SELECT d, 'ai_questions', 'subject', subject, 'all', count(*)::numeric FROM ai WHERE role = 'user' AND subject <> '' GROUP BY d, subject
  UNION ALL SELECT d, 'ai_active_users', '', '', 'all', count(DISTINCT user_id)::numeric FROM ai WHERE role = 'user' GROUP BY d
  UNION ALL SELECT d, 'ai_tokens', '', '', 'all', sum(tokens)::numeric FROM ai GROUP BY d
  UNION ALL SELECT d, 'ai_cost_usd', '', '', 'all', round(sum(cost_usd), 4) FROM ai GROUP BY d
  UNION ALL SELECT d, 'revenue', '', '', 'all', sum(total)::numeric FROM pay GROUP BY d
  UNION ALL SELECT d, 'revenue', '', '', pf, sum(total)::numeric FROM pay GROUP BY d, pf
  UNION ALL SELECT d, 'payments', '', '', 'all', count(*)::numeric FROM pay GROUP BY d
  UNION ALL SELECT d, 'payments', '', '', pf, count(*)::numeric FROM pay GROUP BY d, pf
  UNION ALL SELECT d, 'refunds', '', '', 'all', sum(amount)::numeric FROM refs GROUP BY d
  UNION ALL SELECT d, 'sessions', '', '', pf, count(*)::numeric FROM sess GROUP BY d, pf
  UNION ALL SELECT d, 'sessions', '', '', 'all', count(*)::numeric FROM sess GROUP BY d
$fn$;

-- Persist one day of metrics into the rollup table (called by the analytics-daily-rollup job). Returns rows written.
CREATE OR REPLACE FUNCTION eduway_platform_fn_rollup_daily(p_day date, p_tz text DEFAULT 'Asia/Baghdad')
RETURNS integer
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_rows integer;
BEGIN
  DELETE FROM eduway_platform_analytics_daily_rollups WHERE day = p_day;
  INSERT INTO eduway_platform_analytics_daily_rollups (day, metric, dimension, dimension_value, platform, value)
  SELECT m.o_day, m.o_metric, m.o_dimension, m.o_dimension_value, m.o_platform, m.o_value
    FROM eduway_platform_fn_daily_metrics(p_day, p_day, p_tz) AS m
  ON CONFLICT (day, metric, dimension, dimension_value, platform) DO UPDATE SET value = EXCLUDED.value;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END
$fn$;
