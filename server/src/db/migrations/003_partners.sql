-- =====================================================================================================
-- 003_partners — schools, marketers, assignments (double-attribution guard), incentive & milestone rules.
-- Settlements live in 007_commerce (they reference payments).
-- =====================================================================================================

CREATE TABLE IF NOT EXISTS eduway_platform_marketers (
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  code            text NOT NULL,
  referral_code   text NOT NULL,
  name_en         text NOT NULL,
  name_ar         text NOT NULL,
  mobile          text,
  email           text,
  avatar_url      text,
  governorate_id  uuid,
  status          text NOT NULL DEFAULT 'active',
  joined_at       timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  CONSTRAINT eduway_platform_marketers_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_marketers_code_key UNIQUE (code),
  CONSTRAINT eduway_platform_marketers_referral_key UNIQUE (referral_code),
  CONSTRAINT eduway_platform_marketers_status_check CHECK (status IN ('active', 'inactive')),
  CONSTRAINT eduway_platform_marketers_gov_fkey FOREIGN KEY (governorate_id) REFERENCES eduway_platform_governorates (id) ON DELETE SET NULL
);
SELECT eduway_platform_fn_secure_table('eduway_platform_marketers');

CREATE TABLE IF NOT EXISTS eduway_platform_schools (
  id               uuid NOT NULL DEFAULT gen_random_uuid(),
  code             text NOT NULL,
  slug             text NOT NULL,
  referral_code    text NOT NULL,
  name_en          text NOT NULL,
  name_ar          text NOT NULL,
  city_en          text NOT NULL DEFAULT '',
  city_ar          text NOT NULL DEFAULT '',
  governorate_id   uuid,
  contact_name     text,
  contact_mobile   text,
  contract_start   date,
  contract_end     date,
  status           text NOT NULL DEFAULT 'active',
  is_partner       boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz,
  CONSTRAINT eduway_platform_schools_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_schools_code_key UNIQUE (code),
  CONSTRAINT eduway_platform_schools_slug_key UNIQUE (slug),
  CONSTRAINT eduway_platform_schools_referral_key UNIQUE (referral_code),
  CONSTRAINT eduway_platform_schools_status_check CHECK (status IN ('active', 'pending', 'suspended')),
  CONSTRAINT eduway_platform_schools_gov_fkey FOREIGN KEY (governorate_id) REFERENCES eduway_platform_governorates (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_schools_gov ON eduway_platform_schools (governorate_id);
SELECT eduway_platform_fn_secure_table('eduway_platform_schools');

-- Assignment history. Only ONE active marketer per school (double-attribution guard).
CREATE TABLE IF NOT EXISTS eduway_platform_marketer_schools (
  id               uuid NOT NULL DEFAULT gen_random_uuid(),
  marketer_id      uuid NOT NULL,
  school_id        uuid NOT NULL,
  assigned_at      timestamptz NOT NULL DEFAULT now(),
  unassigned_at    timestamptz,
  assigned_by      uuid,
  override_reason  text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_marketer_schools_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_marketer_schools_mkt_fkey FOREIGN KEY (marketer_id) REFERENCES eduway_platform_marketers (id) ON DELETE CASCADE,
  CONSTRAINT eduway_platform_marketer_schools_sch_fkey FOREIGN KEY (school_id) REFERENCES eduway_platform_schools (id) ON DELETE CASCADE,
  CONSTRAINT eduway_platform_marketer_schools_by_fkey FOREIGN KEY (assigned_by) REFERENCES eduway_platform_users (id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS eduway_platform_uq_marketer_schools_active ON eduway_platform_marketer_schools (school_id) WHERE unassigned_at IS NULL;
CREATE INDEX IF NOT EXISTS eduway_platform_idx_marketer_schools_mkt ON eduway_platform_marketer_schools (marketer_id) WHERE unassigned_at IS NULL;
SELECT eduway_platform_fn_secure_table('eduway_platform_marketer_schools');

-- Versioned incentive rules: rule_group groups versions; tiers in incentive_rule_tiers.
CREATE TABLE IF NOT EXISTS eduway_platform_incentive_rules (
  id                       uuid NOT NULL DEFAULT gen_random_uuid(),
  rule_group               text NOT NULL,
  version                  integer NOT NULL,
  name_en                  text NOT NULL,
  name_ar                  text NOT NULL,
  partner_type             eduway_platform_enum_partner_type NOT NULL,
  qualification_threshold  integer NOT NULL DEFAULT 1,
  period                   text NOT NULL DEFAULT 'monthly',
  effective_from           timestamptz NOT NULL,
  effective_to             timestamptz,
  status                   text NOT NULL DEFAULT 'draft',
  created_by               uuid,
  created_by_name          text NOT NULL DEFAULT '',
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_incentive_rules_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_incentive_rules_group_ver_key UNIQUE (rule_group, version),
  CONSTRAINT eduway_platform_incentive_rules_period_check CHECK (period IN ('monthly', 'quarterly', 'semester', 'yearly')),
  CONSTRAINT eduway_platform_incentive_rules_status_check CHECK (status IN ('draft', 'scheduled', 'active', 'superseded')),
  CONSTRAINT eduway_platform_incentive_rules_threshold_check CHECK (qualification_threshold >= 0),
  CONSTRAINT eduway_platform_incentive_rules_by_fkey FOREIGN KEY (created_by) REFERENCES eduway_platform_users (id) ON DELETE SET NULL
);
SELECT eduway_platform_fn_secure_table('eduway_platform_incentive_rules');

CREATE TABLE IF NOT EXISTS eduway_platform_incentive_rule_tiers (
  id           uuid NOT NULL DEFAULT gen_random_uuid(),
  rule_id      uuid NOT NULL,
  from_count   integer NOT NULL,
  to_count     integer,
  reward_type  text NOT NULL DEFAULT 'per_student',
  amount       integer NOT NULL,
  label_en     text NOT NULL DEFAULT '',
  label_ar     text NOT NULL DEFAULT '',
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_incentive_rule_tiers_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_incentive_rule_tiers_rule_fkey FOREIGN KEY (rule_id) REFERENCES eduway_platform_incentive_rules (id) ON DELETE CASCADE,
  CONSTRAINT eduway_platform_incentive_rule_tiers_type_check CHECK (reward_type IN ('per_student', 'fixed')),
  CONSTRAINT eduway_platform_incentive_rule_tiers_range_check CHECK (from_count >= 0 AND (to_count IS NULL OR to_count >= from_count)),
  CONSTRAINT eduway_platform_incentive_rule_tiers_amount_check CHECK (amount >= 0)
);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_incentive_rule_tiers_rule ON eduway_platform_incentive_rule_tiers (rule_id, from_count);
SELECT eduway_platform_fn_secure_table('eduway_platform_incentive_rule_tiers');

-- Marketer milestone bonuses: versioned sets of items (threshold → reward).
CREATE TABLE IF NOT EXISTS eduway_platform_milestone_sets (
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  version         integer NOT NULL,
  status          text NOT NULL DEFAULT 'draft',
  effective_from  timestamptz NOT NULL DEFAULT now(),
  effective_to    timestamptz,
  created_by      uuid,
  created_by_name text NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_milestone_sets_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_milestone_sets_version_key UNIQUE (version),
  CONSTRAINT eduway_platform_milestone_sets_status_check CHECK (status IN ('draft', 'active', 'superseded')),
  CONSTRAINT eduway_platform_milestone_sets_by_fkey FOREIGN KEY (created_by) REFERENCES eduway_platform_users (id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS eduway_platform_uq_milestone_sets_active ON eduway_platform_milestone_sets (status) WHERE status = 'active';
SELECT eduway_platform_fn_secure_table('eduway_platform_milestone_sets');

CREATE TABLE IF NOT EXISTS eduway_platform_milestone_items (
  id          uuid NOT NULL DEFAULT gen_random_uuid(),
  set_id      uuid NOT NULL,
  threshold   integer NOT NULL,
  reward      integer NOT NULL,
  label_en    text NOT NULL,
  label_ar    text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_milestone_items_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_milestone_items_set_thr_key UNIQUE (set_id, threshold),
  CONSTRAINT eduway_platform_milestone_items_values_check CHECK (threshold > 0 AND reward >= 0),
  CONSTRAINT eduway_platform_milestone_items_set_fkey FOREIGN KEY (set_id) REFERENCES eduway_platform_milestone_sets (id) ON DELETE CASCADE
);
SELECT eduway_platform_fn_secure_table('eduway_platform_milestone_items');
