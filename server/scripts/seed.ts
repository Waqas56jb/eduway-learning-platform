/**
 * npm run seed [-- --no-demo]
 * Idempotent: safe to run repeatedly. Super admin email/password from SEED_SUPER_ADMIN_EMAIL / SEED_SUPER_ADMIN_PASSWORD;
 * when no password is configured, a strong one is generated and printed ONCE (only on first creation).
 */
import { closeDb, pool } from '../src/config/db.js';
import { env, isProd } from '../src/config/env.js';
import { TABLE_PREFIX } from '../src/config/constants.js';
import { runSeed } from '../src/db/seed/seed.js';

async function main() {
  console.log(`EDUWAY seed — prefix ${TABLE_PREFIX}`);
  const result = await runSeed(pool, {
    superAdminEmail: env.SEED_SUPER_ADMIN_EMAIL,
    superAdminPassword: env.SEED_SUPER_ADMIN_PASSWORD,
    skipDemoPopulation: process.argv.includes('--no-demo') || isProd,
    log: (m) => console.log(m),
  });
  console.log('\nSeed complete.');
  console.log(`  Super admin: ${env.SEED_SUPER_ADMIN_EMAIL}`);
  if (result.generatedSuperAdminPassword) {
    console.log(`  Generated super-admin password (shown ONCE — store it in a password manager, or set SEED_SUPER_ADMIN_PASSWORD):`);
    console.log(`    ${result.generatedSuperAdminPassword}`);
  } else {
    console.log('  Super-admin password: from SEED_SUPER_ADMIN_PASSWORD (or unchanged from the first seed).');
  }
  console.log('  Demo student: +9647701234567 — dev OTP 123456 (non-production only)');
}

main()
  .catch((err: Error) => {
    console.error(`SEED FAILED: ${err.message.replace(/postgres(ql)?:\/\/\S+/gi, '[db-url]')}`);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
