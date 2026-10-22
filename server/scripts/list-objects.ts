/**
 * npm run db:objects — prints every eduway_platform_* object in the database (tables, views, materialized views,
 * sequences, indexes, constraints, triggers, policies, functions, types, schemas) straight from the Postgres catalogs,
 * and asserts the shared-database prefix policy against reality:
 *
 *   1. every object ATTACHED to one of our tables (index, constraint, trigger, policy, owned sequence) is prefixed;
 *   2. every object name DEFINED in src/db/migrations/*.sql (CREATE … / CONSTRAINT …) is prefixed, and any unprefixed
 *      object in the catalog whose name matches a migration definition is flagged as ours-but-unprefixed;
 *   3. every prefixed object defined by a migration exists in the catalog (missing ones are reported as warnings —
 *      e.g. 012_embeddings is skipped until the `vector` extension is enabled).
 *
 * Exit code 1 on any violation of (1) or (2). Read-only: it only runs SELECTs against the catalogs.
 * Objects under the integration-test prefix (eduway_platform_test_) are counted separately (created by
 * `npm run test:integration`; isolated from production objects).
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { PGBOSS_SCHEMA, PROD_PREFIX, TEST_PREFIX } from '../src/config/constants.js';
import { closeDb, pool } from '../src/config/db.js';
import { MIGRATIONS_DIR } from '../src/db/migrator.js';
import { stripSqlComments } from '../tools/prefix-core.mjs';

type Obj = { kind: string; name: string; owner_table: string | null };

const like = `${PROD_PREFIX.replace(/_/g, '\\_')}%`;

/** Every prefixed object in schema public (+ our pg-boss schema), and every object attached to a prefixed table. */
const CATALOG_SQL = `
WITH our_tables AS (
  SELECT c.oid, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relname LIKE $1
)
SELECT CASE c.relkind WHEN 'r' THEN 'table' WHEN 'p' THEN 'table' WHEN 'v' THEN 'view' WHEN 'm' THEN 'matview'
                      WHEN 'S' THEN 'sequence' WHEN 'i' THEN 'index' WHEN 'I' THEN 'index' ELSE 'relation:' || c.relkind::text END AS kind,
       c.relname AS name, NULL::text AS owner_table
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'i', 'I') AND c.relname LIKE $1
UNION ALL
SELECT 'index', i.relname, t.relname FROM pg_index x JOIN our_tables t ON t.oid = x.indrelid JOIN pg_class i ON i.oid = x.indexrelid
 WHERE i.relname NOT LIKE $1
UNION ALL
SELECT 'constraint', co.conname, t.relname FROM pg_constraint co JOIN our_tables t ON t.oid = co.conrelid
UNION ALL
SELECT 'trigger', tg.tgname, t.relname FROM pg_trigger tg JOIN our_tables t ON t.oid = tg.tgrelid WHERE NOT tg.tgisinternal
UNION ALL
SELECT 'policy', p.polname, t.relname FROM pg_policy p JOIN our_tables t ON t.oid = p.polrelid
UNION ALL
SELECT 'sequence', s.relname, t.relname FROM pg_depend d JOIN pg_class s ON s.oid = d.objid AND s.relkind = 'S'
  JOIN our_tables t ON t.oid = d.refobjid WHERE d.deptype IN ('a', 'i') AND s.relname NOT LIKE $1
UNION ALL
SELECT 'function', p.proname, NULL FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname LIKE $1
UNION ALL
SELECT CASE t.typtype WHEN 'e' THEN 'type:enum' WHEN 'd' THEN 'type:domain' ELSE 'type:composite' END, t.typname, NULL
  FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
 WHERE n.nspname = 'public' AND t.typname LIKE $1 AND t.typcategory <> 'A'
   AND (t.typtype IN ('e', 'd') OR (t.typtype = 'c' AND (SELECT relkind FROM pg_class WHERE oid = t.typrelid) = 'c'))
UNION ALL
SELECT 'schema', nspname, NULL FROM pg_namespace WHERE nspname LIKE $1
ORDER BY 1, 2`;

/** Unprefixed objects in public that could collide with a name defined by our migrations. */
const UNPREFIXED_PUBLIC_SQL = `
SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname NOT LIKE $1
UNION SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname NOT LIKE $1
UNION SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typname NOT LIKE $1
UNION SELECT tg.tgname FROM pg_trigger tg WHERE NOT tg.tgisinternal AND tg.tgname NOT LIKE $1
UNION SELECT polname FROM pg_policy WHERE polname NOT LIKE $1
UNION SELECT conname FROM pg_constraint co JOIN pg_namespace n ON n.oid = co.connamespace WHERE n.nspname = 'public' AND conname NOT LIKE $1`;

/** Object names defined by our migrations (static names only; %I / format() names are covered by the catalog check). */
function migrationDefinitions(): Map<string, string> {
  const defs = new Map<string, string>();
  const res = [
    /\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:UNIQUE\s+)?(?:TABLE|INDEX|VIEW|MATERIALIZED\s+VIEW|FUNCTION|PROCEDURE|TRIGGER|TYPE|SEQUENCE|POLICY|SCHEMA|DOMAIN)\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:CONCURRENTLY\s+)?(?:public\.)?"?([A-Za-z_][\w]*)"?/gi,
    /\bCONSTRAINT\s+"?([A-Za-z_][\w]*)"?/gi,
  ];
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = stripSqlComments(readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
    for (const re of res) for (const m of sql.matchAll(re)) defs.set((m[1] as string).toLowerCase(), file);
  }
  for (const k of ['public', 'anon', 'authenticated', 'if']) defs.delete(k);
  return defs;
}

async function main() {
  const { rows } = await pool.query<Obj>(CATALOG_SQL, [like]);
  const isOurs = (n: string) => n.startsWith(PROD_PREFIX);
  const prod = rows.filter((o) => isOurs(o.name) && !o.name.startsWith(TEST_PREFIX));
  const test = rows.filter((o) => o.name.startsWith(TEST_PREFIX));
  const attachedUnprefixed = rows.filter((o) => !isOurs(o.name));

  const byKind = new Map<string, string[]>();
  for (const o of prod) byKind.set(o.kind, [...(byKind.get(o.kind) ?? []), o.name]);
  for (const [kind, names] of [...byKind].sort()) {
    console.log(`\n${kind} (${names.length})`);
    for (const n of [...new Set(names)]) console.log(`  ${n}`);
  }

  // ── migration ⇄ catalog comparison ──
  const defs = migrationDefinitions();
  const definedUnprefixed = [...defs].filter(([n]) => !isOurs(n));
  const unprefixedInDb = new Set((await pool.query<{ name: string }>(UNPREFIXED_PUBLIC_SQL, [like])).rows.map((r) => r.name.toLowerCase()));
  const collisions = [...defs.keys()].filter((n) => !isOurs(n) && unprefixedInDb.has(n));
  const catalogNames = new Set(rows.map((o) => o.name.toLowerCase()));
  const missing = [...defs].filter(([n]) => isOurs(n) && !catalogNames.has(n));

  console.log('\n── summary ──');
  for (const [kind, names] of [...byKind].sort()) console.log(`  ${kind.padEnd(15)} ${new Set(names).size}`);
  console.log(`  ${'total'.padEnd(15)} ${new Set(prod.map((o) => `${o.kind}:${o.name}`)).size}  (pg-boss schema ${PGBOSS_SCHEMA}: ${byKind.get('schema')?.includes(PGBOSS_SCHEMA) ? 'present' : 'not created yet'})`);
  console.log(`  migration-defined names: ${defs.size} (${missing.length} not in catalog)`);
  if (test.length) console.log(`  NOTE ${new Set(test.map((o) => `${o.kind}:${o.name}`)).size} ${TEST_PREFIX}* objects present — the isolated integration-test schema (TEST=1), not used by the app`);
  for (const [n, f] of missing) console.log(`  WARN ${f}: ${n} defined but not present (skipped migration?)`);

  const problems = [
    ...attachedUnprefixed.map((o) => `${o.kind} "${o.name}" on ${o.owner_table} is not prefixed`),
    ...definedUnprefixed.map(([n, f]) => `${f} defines unprefixed object "${n}"`),
    ...collisions.map((n) => `unprefixed object "${n}" in the database matches a migration definition`),
  ];
  if (problems.length) {
    console.error(`\ndb:objects: FAIL — ${problems.length} problem(s)\n${problems.map((p) => `  ✗ ${p}`).join('\n')}`);
    process.exitCode = 1;
  } else {
    console.log(`\ndb:objects: OK — every object created by this project starts with ${PROD_PREFIX}`);
  }
}

main()
  .catch((err: Error) => {
    console.error(`db:objects FAILED: ${err.message.replace(/postgres(ql)?:\/\/\S+/gi, '[db-url]')}`);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
