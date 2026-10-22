/**
 * npm run check-env — validates server/.env (names only, never values), then probes connectivity:
 * Postgres (SUPABASE_DB_URL), Supabase Storage API, and lists which prefixed buckets exist.
 */
import { EnvSchema } from '../src/config/env.js';

async function main() {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('✗ environment invalid:');
    for (const i of parsed.error.issues) console.error(`   - ${i.path.join('.')}: ${i.message}`);
    process.exit(1);
  }
  console.log('✓ environment variables valid');
  const { pingDb, closeDb } = await import('../src/config/db.js');
  const { maskConnectionString } = await import('../src/config/logger.js');
  const { supabaseService } = await import('../src/config/supabase.js');
  const { BUCKET_NAMES } = await import('../src/config/constants.js');

  const db = await pingDb(8000);
  console.log(db.ok ? `✓ database reachable (${db.latencyMs} ms) ${maskConnectionString(parsed.data.SUPABASE_DB_URL)}` : `✗ database NOT reachable: ${db.error}`);
  for (const b of BUCKET_NAMES) {
    const { error } = await supabaseService.storage.getBucket(b);
    console.log(error ? `✗ bucket ${b}: ${error.message} (run npm run buckets)` : `✓ bucket ${b}`);
  }
  await closeDb();
  if (!db.ok) process.exitCode = 1;
}

void main();
