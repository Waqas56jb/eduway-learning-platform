/**
 * npm run check-prefix — fails (exit 1) on any unprefixed database object:
 *   - src/db/migrations/*.sql and src/db/sql/*.sql: object definitions + data references, forbidden statements,
 *     identifier length (test-prefix headroom);
 *   - every .ts file under src/ and scripts/: SQL in string/template literals and supabase from() calls;
 *   - constants: TABLE list ⇄ migrations consistency; buckets prefixed; pg-boss schema prefixed.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUCKET_NAMES, PGBOSS_SCHEMA, PROD_PREFIX, TABLES } from '../src/config/constants.js';
import { checkFromArgument, checkSqlDefinitions, checkSqlReferences, EXPR, stripSqlComments } from '../tools/prefix-core.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems: string[] = [];
const rel = (p: string) => path.relative(root, p).replace(/\\/g, '/');

function walk(dir: string, ext: string[]): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (name === 'node_modules' || name === 'dist') continue;
    if (statSync(full).isDirectory()) out.push(...walk(full, ext));
    else if (ext.some((e) => name.endsWith(e))) out.push(full);
  }
  return out;
}

// ── SQL files ──
const sqlFiles = [...walk(path.join(root, 'src/db/migrations'), ['.sql']), ...(safeExists(path.join(root, 'src/db/sql')) ? walk(path.join(root, 'src/db/sql'), ['.sql']) : [])];
const createdTables = new Set<string>();
for (const file of sqlFiles) {
  const sql = stripSqlComments(readFileSync(file, 'utf8'));
  for (const v of [...checkSqlDefinitions(sql), ...checkSqlReferences(sql)]) problems.push(`${rel(file)}:${v.line}  ${v.message}`);
  for (const m of sql.matchAll(/CREATE (?:UNLOGGED )?TABLE (?:IF NOT EXISTS )?(?:public\.)?eduway_platform_([a-z_]+)/g)) createdTables.add(m[1] as string);
}

// ── TypeScript sources: extract string + template literals and check them ──
const tsFiles = [...walk(path.join(root, 'src'), ['.ts']), ...walk(path.join(root, 'scripts'), ['.ts'])];
const LITERAL = /`(?:\\[\s\S]|\$\{(?:[^{}]|\{[^{}]*\})*\}|[^`\\])*`|'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"/g;
for (const file of tsFiles) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(LITERAL)) {
    const lit = m[0];
    if (!/\b(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|FROM|JOIN|TRUNCATE|REFERENCES)\b/.test(lit)) continue;
    const text = lit.startsWith('`') ? lit.slice(1, -1).replace(/\$\{(?:[^{}]|\{[^{}]*\})*\}/g, EXPR) : lit.slice(1, -1);
    const line = src.slice(0, m.index).split('\n').length;
    for (const v of [...checkSqlReferences(text), ...checkSqlDefinitions(text)]) problems.push(`${rel(file)}:${line + v.line - 1}  ${v.message}`);
  }
  for (const m of src.matchAll(/\.from\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    const msg = checkFromArgument(m[1] as string);
    if (msg) problems.push(`${rel(file)}:${src.slice(0, m.index).split('\n').length}  ${msg}`);
  }
}

// ── constants consistency ──
const declared = new Set<string>(TABLES.filter((n) => n !== 'schema_migrations'));
for (const t of createdTables) if (!declared.has(t)) problems.push(`src/config/constants.ts  table "${t}" is created by a migration but missing from TABLES`);
for (const t of declared) if (!createdTables.has(t)) problems.push(`src/config/constants.ts  TABLES lists "${t}" but no migration creates it`);
for (const b of BUCKET_NAMES) if (!b.startsWith('eduway-platform-')) problems.push(`bucket "${b}" is not prefixed`);
if (!PGBOSS_SCHEMA.startsWith(PROD_PREFIX)) problems.push(`pg-boss schema "${PGBOSS_SCHEMA}" is not prefixed`);

function safeExists(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

if (problems.length) {
  console.error(`check-prefix: ${problems.length} problem(s)\n${problems.map((p) => `  ✗ ${p}`).join('\n')}`);
  process.exit(1);
}
console.log(`check-prefix: OK — ${sqlFiles.length} SQL files, ${tsFiles.length} TS files, ${createdTables.size} tables, all objects prefixed with ${PROD_PREFIX}`);
