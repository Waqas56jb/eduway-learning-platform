/**
 * Unit-test environment: no real secrets needed. Values are only defaulted when absent so a developer's
 * server/.env still works; nothing here touches the database.
 */
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'silent';
const defaults: Record<string, string> = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'test-anon-key-0000000000000000',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key-000000000000',
  SUPABASE_DB_URL: 'postgresql://user:pass@127.0.0.1:1/eduway_unit',
  JWT_ACCESS_SECRET: 'unit-test-access-secret-0123456789abcdef',
  JWT_REFRESH_SECRET: 'unit-test-refresh-secret-0123456789abcdef',
  JWT_ADMIN_SECRET: 'unit-test-admin-secret-0123456789abcdef',
  JOBS_ENABLED: 'false',
  SUPABASE_AUTH_MIRROR: 'false',
};
for (const [k, v] of Object.entries(defaults)) if (!process.env[k]) process.env[k] = v;

// Tests never call real payment gateways (docs/PROVIDERS.md): blank the gateway credentials so a developer's
// sandbox credentials in server/.env (dotenv never overrides an already-set variable) keep the gateways as dev stubs.
for (const k of ['ZAINCASH_MERCHANT_ID', 'ZAINCASH_SECRET', 'ZAINCASH_MSISDN', 'FASTPAY_STORE_ID', 'FASTPAY_SECRET', 'QICARD_TERMINAL_ID', 'QICARD_USERNAME', 'QICARD_SECRET']) process.env[k] = '';
