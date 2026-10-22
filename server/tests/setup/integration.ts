/**
 * Integration tests run against the REAL database with the `eduway_platform_test_` prefix (TEST=1) so production
 * tables are never touched. Migrations are applied by tests/integration/globalSetup-like helpers in each suite.
 */
process.env.NODE_ENV = 'test';
process.env.TEST = '1';
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'silent';
process.env.JOBS_ENABLED = 'false';
process.env.SUPABASE_AUTH_MIRROR = 'false';

// Tests never call real payment gateways (docs/PROVIDERS.md): blank the gateway credentials so a developer's
// sandbox credentials in server/.env (dotenv never overrides an already-set variable) keep the gateways as dev stubs.
for (const k of ['ZAINCASH_MERCHANT_ID', 'ZAINCASH_SECRET', 'ZAINCASH_MSISDN', 'FASTPAY_STORE_ID', 'FASTPAY_SECRET', 'QICARD_TERMINAL_ID', 'QICARD_USERNAME', 'QICARD_SECRET']) process.env[k] = '';
