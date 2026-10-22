-- =====================================================================================================
-- 007_commerce — packages, promotions, payments, subscriptions, entitlements, settlements, idempotency.
-- All commercial values (prices, validity, quotas, discounts, rewards) live here — never in code.
-- Money: integer IQD amounts.
-- =====================================================================================================

CREATE TABLE IF NOT EXISTS eduway_platform_packages (
  id                 uuid NOT NULL DEFAULT gen_random_uuid(),
  slug               text NOT NULL,
  name_en            text NOT NULL,
  name_ar            text NOT NULL,
  tagline_en         text NOT NULL DEFAULT '',
  tagline_ar         text NOT NULL DEFAULT '',
  description_en     text NOT NULL DEFAULT '',
  description_ar     text NOT NULL DEFAULT '',
  -- base plan price (student "priceMonthly") valid for validity_type/value
  price              integer NOT NULL DEFAULT 0,
  -- optional long plan (student "priceYearly"); NULL = not offered
  yearly_price       integer,
  yearly_validity_days integer NOT NULL DEFAULT 365,
  currency_label_en  text NOT NULL DEFAULT 'IQD',
  currency_label_ar  text NOT NULL DEFAULT 'د.ع',
  comparison         jsonb NOT NULL DEFAULT '{}'::jsonb,
  currency           text NOT NULL DEFAULT 'IQD',
  tax_behavior       text NOT NULL DEFAULT 'inclusive',
  tax_rate           numeric(5,2) NOT NULL DEFAULT 0,
  validity_type      text NOT NULL DEFAULT 'months',
  validity_value     integer NOT NULL DEFAULT 1,
  valid_until        timestamptz,
  renewal            text NOT NULL DEFAULT 'manual',
  access_start       text NOT NULL DEFAULT 'immediate',
  access_start_date  timestamptz,
  -- NULL → ai_settings.monthly_allowance; 0 → no AI
  ai_quota           integer,
  is_featured        boolean NOT NULL DEFAULT false,
  sort_order         integer NOT NULL DEFAULT 0,
  status             text NOT NULL DEFAULT 'draft',
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  deleted_at         timestamptz,
  CONSTRAINT eduway_platform_packages_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_packages_slug_key UNIQUE (slug),
  CONSTRAINT eduway_platform_packages_currency_check CHECK (currency IN ('IQD', 'USD')),
  CONSTRAINT eduway_platform_packages_tax_check CHECK (tax_behavior IN ('inclusive', 'exclusive', 'exempt')),
  CONSTRAINT eduway_platform_packages_validity_check CHECK (validity_type IN ('days', 'months', 'until_date')),
  CONSTRAINT eduway_platform_packages_renewal_check CHECK (renewal IN ('manual', 'auto', 'none')),
  CONSTRAINT eduway_platform_packages_access_check CHECK (access_start IN ('immediate', 'from_date')),
  CONSTRAINT eduway_platform_packages_status_check CHECK (status IN ('active', 'draft', 'archived')),
  CONSTRAINT eduway_platform_packages_prices_check CHECK (price >= 0 AND COALESCE(yearly_price, 0) >= 0 AND yearly_validity_days > 0)
);
SELECT eduway_platform_fn_secure_table('eduway_platform_packages');

CREATE TABLE IF NOT EXISTS eduway_platform_package_subjects (
  package_id  uuid NOT NULL,
  subject_id  uuid NOT NULL,
  CONSTRAINT eduway_platform_package_subjects_pkey PRIMARY KEY (package_id, subject_id),
  CONSTRAINT eduway_platform_package_subjects_pkg_fkey FOREIGN KEY (package_id) REFERENCES eduway_platform_packages (id) ON DELETE CASCADE,
  CONSTRAINT eduway_platform_package_subjects_subj_fkey FOREIGN KEY (subject_id) REFERENCES eduway_platform_subjects (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_package_subjects_subj ON eduway_platform_package_subjects (subject_id);
SELECT eduway_platform_fn_secure_table('eduway_platform_package_subjects');

CREATE TABLE IF NOT EXISTS eduway_platform_package_features (
  id          uuid NOT NULL DEFAULT gen_random_uuid(),
  package_id  uuid NOT NULL,
  text_en     text NOT NULL,
  text_ar     text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_package_features_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_package_features_pkg_order_key UNIQUE (package_id, sort_order),
  CONSTRAINT eduway_platform_package_features_pkg_fkey FOREIGN KEY (package_id) REFERENCES eduway_platform_packages (id) ON DELETE CASCADE
);
SELECT eduway_platform_fn_secure_table('eduway_platform_package_features');

CREATE TABLE IF NOT EXISTS eduway_platform_promotions (
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  code            text NOT NULL,
  type            text NOT NULL DEFAULT 'promo',
  discount_type   text NOT NULL,
  discount_value  integer NOT NULL,
  eligibility     text NOT NULL DEFAULT 'all',
  usage_limit     integer,
  per_user_limit  integer NOT NULL DEFAULT 1,
  used_count      integer NOT NULL DEFAULT 0,
  valid_from      timestamptz NOT NULL,
  valid_to        timestamptz,
  enabled         boolean NOT NULL DEFAULT true,
  school_id       uuid,
  marketer_id     uuid,
  description     text NOT NULL DEFAULT '',
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  CONSTRAINT eduway_platform_promotions_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_promotions_type_check CHECK (type IN ('promo', 'school', 'referral', 'campaign')),
  CONSTRAINT eduway_platform_promotions_discount_check CHECK (
    (discount_type = 'percent' AND discount_value BETWEEN 0 AND 100) OR (discount_type = 'fixed' AND discount_value >= 0)),
  CONSTRAINT eduway_platform_promotions_elig_check CHECK (eligibility IN ('all', 'new_users', 'renewals', 'school_students')),
  CONSTRAINT eduway_platform_promotions_school_fkey FOREIGN KEY (school_id) REFERENCES eduway_platform_schools (id) ON DELETE SET NULL,
  CONSTRAINT eduway_platform_promotions_mkt_fkey FOREIGN KEY (marketer_id) REFERENCES eduway_platform_marketers (id) ON DELETE SET NULL,
  CONSTRAINT eduway_platform_promotions_by_fkey FOREIGN KEY (created_by) REFERENCES eduway_platform_users (id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS eduway_platform_uq_promotions_code ON eduway_platform_promotions (upper(code)) WHERE deleted_at IS NULL;
SELECT eduway_platform_fn_secure_table('eduway_platform_promotions');

-- Empty set of rows = promotion applies to all packages.
CREATE TABLE IF NOT EXISTS eduway_platform_promotion_packages (
  promotion_id  uuid NOT NULL,
  package_id    uuid NOT NULL,
  CONSTRAINT eduway_platform_promotion_packages_pkey PRIMARY KEY (promotion_id, package_id),
  CONSTRAINT eduway_platform_promotion_packages_promo_fkey FOREIGN KEY (promotion_id) REFERENCES eduway_platform_promotions (id) ON DELETE CASCADE,
  CONSTRAINT eduway_platform_promotion_packages_pkg_fkey FOREIGN KEY (package_id) REFERENCES eduway_platform_packages (id) ON DELETE CASCADE
);
SELECT eduway_platform_fn_secure_table('eduway_platform_promotion_packages');

CREATE TABLE IF NOT EXISTS eduway_platform_payments (
  id                uuid NOT NULL DEFAULT gen_random_uuid(),
  ref               text NOT NULL,
  user_id           uuid NOT NULL,
  package_id        uuid NOT NULL,
  billing_cycle     text NOT NULL DEFAULT 'monthly',
  amount            integer NOT NULL,
  discount          integer NOT NULL DEFAULT 0,
  tax               integer NOT NULL DEFAULT 0,
  total             integer NOT NULL,
  currency          text NOT NULL DEFAULT 'IQD',
  provider          text NOT NULL,
  provider_ref      text,
  status            text NOT NULL DEFAULT 'initiated',
  refunded_amount   integer NOT NULL DEFAULT 0,
  promotion_id      uuid,
  promo_code        text,
  school_id         uuid,
  marketer_id       uuid,
  platform          eduway_platform_enum_platform,
  checkout_url      text,
  failure_reason    text,
  idempotency_key   text,
  metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
  paid_at           timestamptz,
  expires_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_payments_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_payments_ref_key UNIQUE (ref),
  CONSTRAINT eduway_platform_payments_cycle_check CHECK (billing_cycle IN ('monthly', 'yearly')),
  CONSTRAINT eduway_platform_payments_status_check CHECK (status IN ('initiated', 'pending', 'paid', 'failed', 'cancelled', 'refunded', 'partially_refunded')),
  CONSTRAINT eduway_platform_payments_amounts_check CHECK (amount >= 0 AND discount >= 0 AND total >= 0 AND refunded_amount >= 0 AND refunded_amount <= total),
  CONSTRAINT eduway_platform_payments_user_fkey FOREIGN KEY (user_id) REFERENCES eduway_platform_users (id) ON DELETE RESTRICT,
  CONSTRAINT eduway_platform_payments_pkg_fkey FOREIGN KEY (package_id) REFERENCES eduway_platform_packages (id) ON DELETE RESTRICT,
  CONSTRAINT eduway_platform_payments_promo_fkey FOREIGN KEY (promotion_id) REFERENCES eduway_platform_promotions (id) ON DELETE SET NULL,
  CONSTRAINT eduway_platform_payments_school_fkey FOREIGN KEY (school_id) REFERENCES eduway_platform_schools (id) ON DELETE SET NULL,
  CONSTRAINT eduway_platform_payments_mkt_fkey FOREIGN KEY (marketer_id) REFERENCES eduway_platform_marketers (id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS eduway_platform_uq_payments_provider_ref ON eduway_platform_payments (provider, provider_ref) WHERE provider_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS eduway_platform_idx_payments_user ON eduway_platform_payments (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_payments_status ON eduway_platform_payments (status, created_at DESC);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_payments_school ON eduway_platform_payments (school_id) WHERE school_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS eduway_platform_idx_payments_mkt ON eduway_platform_payments (marketer_id) WHERE marketer_id IS NOT NULL;
SELECT eduway_platform_fn_secure_table('eduway_platform_payments');

-- Timeline + raw webhooks. (provider, provider_event_id) unique → duplicate webhooks are ignored.
CREATE TABLE IF NOT EXISTS eduway_platform_payment_events (
  id                 uuid NOT NULL DEFAULT gen_random_uuid(),
  payment_id         uuid,
  kind               text NOT NULL,
  status             text,
  provider           text,
  provider_event_id  text,
  verified           boolean,
  payload            jsonb NOT NULL DEFAULT '{}'::jsonb,
  note               text NOT NULL DEFAULT '',
  actor_id           uuid,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_payment_events_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_payment_events_kind_check CHECK (kind IN ('status', 'webhook', 'refund_requested', 'refund', 'note')),
  CONSTRAINT eduway_platform_payment_events_pay_fkey FOREIGN KEY (payment_id) REFERENCES eduway_platform_payments (id) ON DELETE CASCADE,
  CONSTRAINT eduway_platform_payment_events_actor_fkey FOREIGN KEY (actor_id) REFERENCES eduway_platform_users (id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS eduway_platform_uq_payment_events_provider_evt ON eduway_platform_payment_events (provider, provider_event_id) WHERE provider_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS eduway_platform_idx_payment_events_pay ON eduway_platform_payment_events (payment_id, created_at);
SELECT eduway_platform_fn_secure_table('eduway_platform_payment_events');

CREATE TABLE IF NOT EXISTS eduway_platform_refunds (
  id            uuid NOT NULL DEFAULT gen_random_uuid(),
  payment_id    uuid NOT NULL,
  user_id       uuid NOT NULL,
  amount        integer NOT NULL,
  currency      text NOT NULL DEFAULT 'IQD',
  kind          text NOT NULL,
  reason        text NOT NULL DEFAULT '',
  status        text NOT NULL DEFAULT 'pending',
  provider_ref  text,
  decision_note text,
  revoke_access boolean NOT NULL DEFAULT true,
  requested_by  uuid,
  requested_at  timestamptz NOT NULL DEFAULT now(),
  decided_by    uuid,
  decided_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_refunds_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_refunds_kind_check CHECK (kind IN ('full', 'partial')),
  CONSTRAINT eduway_platform_refunds_status_check CHECK (status IN ('pending', 'approved', 'rejected', 'processed')),
  CONSTRAINT eduway_platform_refunds_amount_check CHECK (amount > 0),
  CONSTRAINT eduway_platform_refunds_pay_fkey FOREIGN KEY (payment_id) REFERENCES eduway_platform_payments (id) ON DELETE RESTRICT,
  CONSTRAINT eduway_platform_refunds_user_fkey FOREIGN KEY (user_id) REFERENCES eduway_platform_users (id) ON DELETE RESTRICT,
  CONSTRAINT eduway_platform_refunds_req_fkey FOREIGN KEY (requested_by) REFERENCES eduway_platform_users (id) ON DELETE SET NULL,
  CONSTRAINT eduway_platform_refunds_dec_fkey FOREIGN KEY (decided_by) REFERENCES eduway_platform_users (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_refunds_pay ON eduway_platform_refunds (payment_id);
SELECT eduway_platform_fn_secure_table('eduway_platform_refunds');

CREATE TABLE IF NOT EXISTS eduway_platform_receipts (
  id            uuid NOT NULL DEFAULT gen_random_uuid(),
  payment_id    uuid NOT NULL,
  number        text NOT NULL,
  issued_at     timestamptz NOT NULL DEFAULT now(),
  data          jsonb NOT NULL DEFAULT '{}'::jsonb,
  storage_path  text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_receipts_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_receipts_payment_key UNIQUE (payment_id),
  CONSTRAINT eduway_platform_receipts_number_key UNIQUE (number),
  CONSTRAINT eduway_platform_receipts_pay_fkey FOREIGN KEY (payment_id) REFERENCES eduway_platform_payments (id) ON DELETE CASCADE
);
SELECT eduway_platform_fn_secure_table('eduway_platform_receipts');

CREATE TABLE IF NOT EXISTS eduway_platform_subscriptions (
  id                        uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id                   uuid NOT NULL,
  package_id                uuid NOT NULL,
  billing_cycle             text NOT NULL DEFAULT 'monthly',
  status                    text NOT NULL DEFAULT 'pending',
  source                    text NOT NULL DEFAULT 'payment',
  starts_at                 timestamptz NOT NULL,
  ends_at                   timestamptz NOT NULL,
  ai_quota                  integer NOT NULL DEFAULT 0,
  auto_renew                boolean NOT NULL DEFAULT false,
  payment_id                uuid,
  previous_subscription_id  uuid,
  granted_by                uuid,
  grant_reason              text,
  cancelled_at              timestamptz,
  cancel_reason             text,
  reminders_sent            jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_subscriptions_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_subscriptions_cycle_check CHECK (billing_cycle IN ('monthly', 'yearly')),
  CONSTRAINT eduway_platform_subscriptions_status_check CHECK (status IN ('pending', 'trial', 'active', 'expired', 'cancelled')),
  CONSTRAINT eduway_platform_subscriptions_source_check CHECK (source IN ('payment', 'manual', 'promo', 'trial')),
  CONSTRAINT eduway_platform_subscriptions_dates_check CHECK (ends_at > starts_at),
  CONSTRAINT eduway_platform_subscriptions_user_fkey FOREIGN KEY (user_id) REFERENCES eduway_platform_users (id) ON DELETE CASCADE,
  CONSTRAINT eduway_platform_subscriptions_pkg_fkey FOREIGN KEY (package_id) REFERENCES eduway_platform_packages (id) ON DELETE RESTRICT,
  CONSTRAINT eduway_platform_subscriptions_pay_fkey FOREIGN KEY (payment_id) REFERENCES eduway_platform_payments (id) ON DELETE SET NULL,
  CONSTRAINT eduway_platform_subscriptions_prev_fkey FOREIGN KEY (previous_subscription_id) REFERENCES eduway_platform_subscriptions (id) ON DELETE SET NULL,
  CONSTRAINT eduway_platform_subscriptions_by_fkey FOREIGN KEY (granted_by) REFERENCES eduway_platform_users (id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS eduway_platform_uq_subscriptions_payment ON eduway_platform_subscriptions (payment_id) WHERE payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS eduway_platform_idx_subscriptions_user ON eduway_platform_subscriptions (user_id, ends_at DESC);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_subscriptions_expiry ON eduway_platform_subscriptions (ends_at) WHERE status = 'active';
SELECT eduway_platform_fn_secure_table('eduway_platform_subscriptions');

-- Access rights evaluated by the entitlement engine (src/common/entitlements.ts).
CREATE TABLE IF NOT EXISTS eduway_platform_entitlements (
  id               uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL,
  subject_id       uuid NOT NULL,
  source           text NOT NULL,
  subscription_id  uuid,
  starts_at        timestamptz NOT NULL DEFAULT now(),
  ends_at          timestamptz NOT NULL,
  revoked_at       timestamptz,
  revoked_reason   text,
  granted_by       uuid,
  reason           text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_entitlements_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_entitlements_source_check CHECK (source IN ('package', 'manual')),
  CONSTRAINT eduway_platform_entitlements_dates_check CHECK (ends_at > starts_at),
  CONSTRAINT eduway_platform_entitlements_user_fkey FOREIGN KEY (user_id) REFERENCES eduway_platform_users (id) ON DELETE CASCADE,
  CONSTRAINT eduway_platform_entitlements_subject_fkey FOREIGN KEY (subject_id) REFERENCES eduway_platform_subjects (id) ON DELETE CASCADE,
  CONSTRAINT eduway_platform_entitlements_sub_fkey FOREIGN KEY (subscription_id) REFERENCES eduway_platform_subscriptions (id) ON DELETE CASCADE,
  CONSTRAINT eduway_platform_entitlements_by_fkey FOREIGN KEY (granted_by) REFERENCES eduway_platform_users (id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS eduway_platform_uq_entitlements_sub_subject ON eduway_platform_entitlements (subscription_id, subject_id) WHERE subscription_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS eduway_platform_idx_entitlements_user ON eduway_platform_entitlements (user_id, subject_id, ends_at DESC) WHERE revoked_at IS NULL;
SELECT eduway_platform_fn_secure_table('eduway_platform_entitlements');

CREATE TABLE IF NOT EXISTS eduway_platform_entitlement_logs (
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL,
  entitlement_id  uuid,
  subject_id      uuid,
  action          text NOT NULL,
  source          text,
  days            integer,
  starts_at       timestamptz,
  ends_at         timestamptz,
  reason          text NOT NULL DEFAULT '',
  actor_id        uuid,
  actor_name      text NOT NULL DEFAULT '',
  meta            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_entitlement_logs_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_entitlement_logs_action_check CHECK (action IN ('grant', 'extend', 'revoke', 'expire')),
  CONSTRAINT eduway_platform_entitlement_logs_user_fkey FOREIGN KEY (user_id) REFERENCES eduway_platform_users (id) ON DELETE CASCADE,
  CONSTRAINT eduway_platform_entitlement_logs_ent_fkey FOREIGN KEY (entitlement_id) REFERENCES eduway_platform_entitlements (id) ON DELETE SET NULL,
  CONSTRAINT eduway_platform_entitlement_logs_subj_fkey FOREIGN KEY (subject_id) REFERENCES eduway_platform_subjects (id) ON DELETE SET NULL,
  CONSTRAINT eduway_platform_entitlement_logs_actor_fkey FOREIGN KEY (actor_id) REFERENCES eduway_platform_users (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_entitlement_logs_user ON eduway_platform_entitlement_logs (user_id, created_at DESC);
SELECT eduway_platform_fn_secure_table('eduway_platform_entitlement_logs');

CREATE TABLE IF NOT EXISTS eduway_platform_promotion_redemptions (
  id               uuid NOT NULL DEFAULT gen_random_uuid(),
  promotion_id     uuid NOT NULL,
  user_id          uuid NOT NULL,
  payment_id       uuid,
  discount_amount  integer NOT NULL DEFAULT 0,
  status           text NOT NULL DEFAULT 'reserved',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_promotion_redemptions_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_promotion_redemptions_pay_key UNIQUE (payment_id),
  CONSTRAINT eduway_platform_promotion_redemptions_status_check CHECK (status IN ('reserved', 'redeemed', 'released')),
  CONSTRAINT eduway_platform_promotion_redemptions_promo_fkey FOREIGN KEY (promotion_id) REFERENCES eduway_platform_promotions (id) ON DELETE CASCADE,
  CONSTRAINT eduway_platform_promotion_redemptions_user_fkey FOREIGN KEY (user_id) REFERENCES eduway_platform_users (id) ON DELETE CASCADE,
  CONSTRAINT eduway_platform_promotion_redemptions_pay_fkey FOREIGN KEY (payment_id) REFERENCES eduway_platform_payments (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_promo_redemptions_promo ON eduway_platform_promotion_redemptions (promotion_id, user_id);
SELECT eduway_platform_fn_secure_table('eduway_platform_promotion_redemptions');

-- Partner settlements (school OR marketer) per period.
CREATE TABLE IF NOT EXISTS eduway_platform_settlements (
  id                  uuid NOT NULL DEFAULT gen_random_uuid(),
  partner_type        eduway_platform_enum_partner_type NOT NULL,
  school_id           uuid,
  marketer_id         uuid,
  period              text NOT NULL,
  period_start        date NOT NULL,
  period_end          date NOT NULL,
  rule_id             uuid,
  qualified_students  integer NOT NULL DEFAULT 0,
  amount              integer NOT NULL DEFAULT 0,
  currency            text NOT NULL DEFAULT 'IQD',
  status              text NOT NULL DEFAULT 'pending',
  approved_by         uuid,
  approved_at         timestamptz,
  paid_at             timestamptz,
  paid_reference      text,
  notes               text NOT NULL DEFAULT '',
  breakdown           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_settlements_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_settlements_partner_check CHECK (
    (partner_type = 'school' AND school_id IS NOT NULL AND marketer_id IS NULL) OR
    (partner_type = 'marketer' AND marketer_id IS NOT NULL AND school_id IS NULL)),
  CONSTRAINT eduway_platform_settlements_status_check CHECK (status IN ('pending', 'approved', 'paid', 'cancelled')),
  CONSTRAINT eduway_platform_settlements_period_check CHECK (period ~ '^[0-9]{4}-[0-9]{2}$|^[0-9]{4}-(Q[1-4]|S[12]|Y)$'),
  CONSTRAINT eduway_platform_settlements_school_fkey FOREIGN KEY (school_id) REFERENCES eduway_platform_schools (id) ON DELETE RESTRICT,
  CONSTRAINT eduway_platform_settlements_mkt_fkey FOREIGN KEY (marketer_id) REFERENCES eduway_platform_marketers (id) ON DELETE RESTRICT,
  CONSTRAINT eduway_platform_settlements_rule_fkey FOREIGN KEY (rule_id) REFERENCES eduway_platform_incentive_rules (id) ON DELETE SET NULL,
  CONSTRAINT eduway_platform_settlements_by_fkey FOREIGN KEY (approved_by) REFERENCES eduway_platform_users (id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS eduway_platform_uq_settlements_school_period ON eduway_platform_settlements (school_id, period) WHERE school_id IS NOT NULL AND status <> 'cancelled';
CREATE UNIQUE INDEX IF NOT EXISTS eduway_platform_uq_settlements_mkt_period ON eduway_platform_settlements (marketer_id, period) WHERE marketer_id IS NOT NULL AND status <> 'cancelled';
SELECT eduway_platform_fn_secure_table('eduway_platform_settlements');

CREATE TABLE IF NOT EXISTS eduway_platform_settlement_items (
  id             uuid NOT NULL DEFAULT gen_random_uuid(),
  settlement_id  uuid NOT NULL,
  user_id        uuid NOT NULL,
  payment_id     uuid NOT NULL,
  amount         integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_settlement_items_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_settlement_items_set_pay_key UNIQUE (settlement_id, payment_id),
  CONSTRAINT eduway_platform_settlement_items_set_fkey FOREIGN KEY (settlement_id) REFERENCES eduway_platform_settlements (id) ON DELETE CASCADE,
  CONSTRAINT eduway_platform_settlement_items_user_fkey FOREIGN KEY (user_id) REFERENCES eduway_platform_users (id) ON DELETE RESTRICT,
  CONSTRAINT eduway_platform_settlement_items_pay_fkey FOREIGN KEY (payment_id) REFERENCES eduway_platform_payments (id) ON DELETE RESTRICT
);
SELECT eduway_platform_fn_secure_table('eduway_platform_settlement_items');

CREATE TABLE IF NOT EXISTS eduway_platform_marketer_milestone_awards (
  id                 uuid NOT NULL DEFAULT gen_random_uuid(),
  marketer_id        uuid NOT NULL,
  milestone_item_id  uuid NOT NULL,
  achieved_at        timestamptz NOT NULL DEFAULT now(),
  paid_students      integer NOT NULL DEFAULT 0,
  reward             integer NOT NULL DEFAULT 0,
  settlement_id      uuid,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_mkt_milestone_awards_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_mkt_milestone_awards_key UNIQUE (marketer_id, milestone_item_id),
  CONSTRAINT eduway_platform_mkt_milestone_awards_mkt_fkey FOREIGN KEY (marketer_id) REFERENCES eduway_platform_marketers (id) ON DELETE CASCADE,
  CONSTRAINT eduway_platform_mkt_milestone_awards_item_fkey FOREIGN KEY (milestone_item_id) REFERENCES eduway_platform_milestone_items (id) ON DELETE CASCADE,
  CONSTRAINT eduway_platform_mkt_milestone_awards_set_fkey FOREIGN KEY (settlement_id) REFERENCES eduway_platform_settlements (id) ON DELETE SET NULL
);
SELECT eduway_platform_fn_secure_table('eduway_platform_marketer_milestone_awards');

-- Idempotency-Key replay store (payments + critical mutations).
CREATE TABLE IF NOT EXISTS eduway_platform_idempotency_keys (
  id               uuid NOT NULL DEFAULT gen_random_uuid(),
  scope            text NOT NULL,
  key              text NOT NULL,
  user_id          uuid,
  request_hash     text NOT NULL,
  status           text NOT NULL DEFAULT 'processing',
  response_status  integer,
  response_body    jsonb,
  locked_at        timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_idempotency_keys_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_idempotency_keys_scope_key UNIQUE (scope, key),
  CONSTRAINT eduway_platform_idempotency_keys_status_check CHECK (status IN ('processing', 'completed'))
);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_idempotency_keys_exp ON eduway_platform_idempotency_keys (expires_at);
SELECT eduway_platform_fn_secure_table('eduway_platform_idempotency_keys');

-- Daily reconciliation per gateway: system totals vs gateway-reported settlement amounts.
CREATE TABLE IF NOT EXISTS eduway_platform_reconciliation_records (
  id               uuid NOT NULL DEFAULT gen_random_uuid(),
  day              date NOT NULL,
  gateway          text NOT NULL,
  tx_count         integer NOT NULL DEFAULT 0,
  system_amount    integer NOT NULL DEFAULT 0,
  reported_amount  integer,
  fees             integer NOT NULL DEFAULT 0,
  state            text NOT NULL DEFAULT 'unreported',
  import_file_key  text,
  raw              jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved_by      uuid,
  resolved_at      timestamptz,
  note             text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_reconciliation_records_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_recon_day_gateway_key UNIQUE (day, gateway),
  CONSTRAINT eduway_platform_recon_state_check CHECK (state IN ('matched', 'mismatch', 'reconciled', 'unreported')),
  CONSTRAINT eduway_platform_recon_resolver_fkey FOREIGN KEY (resolved_by) REFERENCES eduway_platform_users (id) ON DELETE SET NULL
);
SELECT eduway_platform_fn_secure_table('eduway_platform_reconciliation_records');

-- Payouts received from gateways (settlement batches), used by reconciliation.
CREATE TABLE IF NOT EXISTS eduway_platform_gateway_settlements (
  id            uuid NOT NULL DEFAULT gen_random_uuid(),
  gateway       text NOT NULL,
  period_start  date NOT NULL,
  period_end    date NOT NULL,
  gross         integer NOT NULL DEFAULT 0,
  fees          integer NOT NULL DEFAULT 0,
  net           integer NOT NULL DEFAULT 0,
  reference     text,
  status        text NOT NULL DEFAULT 'expected',
  received_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_gateway_settlements_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_gateway_settlements_key UNIQUE (gateway, period_start, period_end),
  CONSTRAINT eduway_platform_gateway_settlements_status_check CHECK (status IN ('expected', 'received', 'disputed'))
);
SELECT eduway_platform_fn_secure_table('eduway_platform_gateway_settlements');
