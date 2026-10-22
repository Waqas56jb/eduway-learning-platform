/**
 * Integration tests run against the REAL database with the `eduway_platform_test_` prefix (TEST=1) so production
 * tables are never touched. Migrations are applied by tests/integration/globalSetup-like helpers in each suite.
 */
process.env.NODE_ENV = 'test';
process.env.TEST = '1';
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'silent';
process.env.JOBS_ENABLED = 'false';
process.env.SUPABASE_AUTH_MIRROR = 'false';
