-- =====================================================================================================
-- 402_security_hardening — docs/SECURITY.md SEC-03. Additive + idempotent; touches ONLY eduway_platform_ objects.
--   * Views run with the caller's rights (security_invoker) so the deny-all RLS of the underlying tables applies,
--     and the Supabase API roles (anon / authenticated) lose every privilege on them. Before this, the payment
--     views were readable with the public anon key through PostgREST (views bypass RLS as their owner).
--   * Our functions are not callable by the API roles (PostgREST exposes public-schema functions as RPC).
--   * Defence in depth: the API roles hold no table privileges on our tables (RLS deny-all already blocks them;
--     the backend connects as the owner / service role, which is unaffected).
-- =====================================================================================================

DO $$
DECLARE
  r record;
BEGIN
  -- Views / materialized views
  FOR r IN
    SELECT c.oid::regclass AS rel, c.relkind
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm') AND c.relname LIKE 'eduway\_platform\_%' ESCAPE '\'
  LOOP
    IF r.relkind = 'v' THEN
      EXECUTE format('ALTER VIEW %s SET (security_invoker = true)', r.rel);
    END IF;
    EXECUTE format('REVOKE ALL ON %s FROM PUBLIC', r.rel);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON %s FROM anon', r.rel);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL ON %s FROM authenticated', r.rel);
    END IF;
  END LOOP;

  -- Tables
  FOR r IN
    SELECT c.oid::regclass AS rel
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relname LIKE 'eduway\_platform\_%' ESCAPE '\'
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON %s FROM anon', r.rel);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL ON %s FROM authenticated', r.rel);
    END IF;
  END LOOP;

  -- Functions
  FOR r IN
    SELECT p.oid::regprocedure AS fn
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname LIKE 'eduway\_platform\_%' ESCAPE '\'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', r.fn);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.fn);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', r.fn);
    END IF;
  END LOOP;
END $$;
