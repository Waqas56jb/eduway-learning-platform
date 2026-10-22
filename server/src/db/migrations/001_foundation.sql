-- =====================================================================================================
-- 001_foundation — preflight checks, shared helper functions and enum types.
-- PREFIX POLICY: every object in this repository starts with eduway_platform_ (see docs/ENGINEERING.md §1).
-- This database is SHARED with other products: never create/alter/drop unprefixed objects,
-- never CREATE EXTENSION (extensions are shared; the owner enables them in the dashboard).
-- =====================================================================================================

-- Preflight: gen_random_uuid() is built into PostgreSQL 13+ (no pgcrypto needed).
DO $$
BEGIN
  IF current_setting('server_version_num')::int < 130000 THEN
    RAISE EXCEPTION 'EDUWAY requires PostgreSQL 13+ (found %). gen_random_uuid() is unavailable.',
      current_setting('server_version');
  END IF;
END
$$;

-- updated_at maintenance -------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION eduway_platform_fn_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

-- Secures one of OUR tables: enables RLS, adds a prefixed RESTRICTIVE deny-all policy for the Supabase API
-- roles (anon, authenticated), revokes their privileges, and attaches the updated_at trigger when the table
-- has an updated_at column. Refuses to touch any table that is not prefixed. Idempotent.
CREATE OR REPLACE FUNCTION eduway_platform_fn_secure_table(p_table text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_prefix  text := substring(p_table from '^(eduway_platform_(?:test_)?)');
  v_base    text;
  v_policy  text;
  v_trigger text;
  v_api_roles boolean;
BEGIN
  IF v_prefix IS NULL THEN
    RAISE EXCEPTION 'eduway_platform_fn_secure_table: refusing to touch unprefixed table "%"', p_table;
  END IF;
  IF to_regclass(format('public.%I', p_table)) IS NULL THEN
    RAISE EXCEPTION 'eduway_platform_fn_secure_table: table public.% does not exist', p_table;
  END IF;

  v_base := substr(p_table, length(v_prefix) + 1);
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', p_table);

  SELECT count(*) = 2 INTO v_api_roles FROM pg_roles WHERE rolname IN ('anon', 'authenticated');
  IF v_api_roles THEN
    v_policy := v_prefix || 'pol_' || v_base || '_deny';
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = p_table AND policyname = v_policy
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)',
        v_policy, p_table
      );
    END IF;
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', p_table);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = p_table AND column_name = 'updated_at'
  ) THEN
    v_trigger := v_prefix || 'trg_' || v_base || '_updated_at';
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger WHERE tgname = v_trigger AND tgrelid = format('public.%I', p_table)::regclass
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.%I()',
        v_trigger, p_table, v_prefix || 'fn_set_updated_at'
      );
    END IF;
  END IF;
END
$$;

-- Enum types (stable value sets only; evolving sets use text + named CHECK constraints) -----------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'eduway_platform_enum_content_status') THEN
    CREATE TYPE eduway_platform_enum_content_status AS ENUM
      ('draft', 'in_review', 'approved', 'scheduled', 'published', 'archived');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'eduway_platform_enum_platform') THEN
    CREATE TYPE eduway_platform_enum_platform AS ENUM ('web', 'ios', 'android', 'admin');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'eduway_platform_enum_difficulty') THEN
    CREATE TYPE eduway_platform_enum_difficulty AS ENUM ('easy', 'medium', 'hard');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'eduway_platform_enum_user_kind') THEN
    CREATE TYPE eduway_platform_enum_user_kind AS ENUM ('student', 'admin');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'eduway_platform_enum_partner_type') THEN
    CREATE TYPE eduway_platform_enum_partner_type AS ENUM ('school', 'marketer');
  END IF;
END
$$;
