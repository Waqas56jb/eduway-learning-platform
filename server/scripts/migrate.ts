/**
 * npm run migrate [-- --dry-run] [-- --reapply-changed] [-- --list-objects] [-- --only=012,405]
 * Applies src/db/migrations in order (see src/db/migrator.ts). Only prefixed objects are ever touched.
 */
import { closeDb, pool } from '../src/config/db.js';
import { env } from '../src/config/env.js';
import { maskConnectionString } from '../src/config/logger.js';
import { TABLE_PREFIX } from '../src/config/constants.js';
import { listOurObjects, runMigrations } from '../src/db/migrator.js';

const args = new Set(process.argv.slice(2));

async function main() {
  console.log(`EDUWAY migrate — prefix ${TABLE_PREFIX} — db ${maskConnectionString(env.SUPABASE_DB_URL)}`);
  const results = await runMigrations(pool, {
    dryRun: args.has('--dry-run'),
    reapplyChanged: args.has('--reapply-changed'),
    only: [...args].find((a) => a.startsWith('--only='))?.slice('--only='.length).split(',').filter(Boolean),
    log: (m) => console.log('  ' + m),
  });
  const applied = results.filter((r) => r.status === 'applied' || r.status === 'reapplied').length;
  const skipped = results.filter((r) => r.status === 'skipped');
  console.log(`Done: ${applied} applied, ${results.length - applied - skipped.length} unchanged, ${skipped.length} skipped.`);
  for (const s of skipped) console.log(`  NOTE ${s.name}: ${s.notices.join(' | ')}`);

  if (args.has('--list-objects')) {
    const objects = await listOurObjects(pool);
    const bad = objects.filter((o) => !o.name.startsWith(TABLE_PREFIX));
    for (const o of objects) console.log(`  ${o.kind.padEnd(10)} ${o.name}`);
    console.log(`${objects.length} objects; ${bad.length} unprefixed.`);
    if (bad.length) process.exitCode = 1;
  }
}

main()
  .catch((err: Error) => {
    console.error(`MIGRATION FAILED: ${err.message.replace(/postgres(ql)?:\/\/\S+/gi, '[db-url]')}`);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
