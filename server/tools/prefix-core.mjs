// Shared prefix-policy checks used by the ESLint rule (eslint-rules/no-unprefixed-sql) and scripts/check-prefix.ts.
// Plain JS (ESM) so ESLint can load it without a TypeScript loader.

export const PREFIX = 'eduway_platform_';
export const BUCKET_PREFIX = 'eduway-platform-';
/** Placeholder substituted for `${…}` template expressions (T.users, t('x'), variables) — always allowed. */
export const EXPR = '__EDUWAY_EXPR__';
/** Max length of a prefixed identifier so that the `eduway_platform_test_` variant still fits in 63 bytes. */
export const MAX_IDENT = 58;

const READ_ONLY_SYSTEM = /^(pg_|information_schema\.|extensions\.)/i;
const SQL_KEYWORDS_AFTER = new Set(['LATERAL', 'ONLY', 'SELECT', 'VALUES', 'ROWS', 'WITH', 'DUAL', 'ON', 'OF']);
/** Role names that legitimately follow FROM in REVOKE … FROM anon, authenticated. */
const ROLE_NAMES = new Set(['anon', 'authenticated', 'public', 'service_role']);
const NON_OBJECT_WORDS = new Set(['CONFLICT', 'COMMIT', 'DELETE', 'UPDATE', 'INSERT', 'CASCADE']);

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

function cteNames(text) {
  const names = new Set();
  const re = /(?:\bWITH\s+(?:RECURSIVE\s+)?|,\s*)([a-z_][a-z0-9_]*)\s+AS\s*(?:MATERIALIZED\s+|NOT\s+MATERIALIZED\s+)?\(/gi;
  let m;
  while ((m = re.exec(text))) names.add(m[1].toLowerCase());
  return names;
}

const stripQuotes = (s) => s.replace(/"/g, '');
const unqualified = (s) => stripQuotes(s).replace(/^public\./i, '');

/**
 * Data-access statements (FROM / JOIN / INSERT INTO / UPDATE / DELETE FROM / TRUNCATE / ALTER TABLE / REFERENCES / ON)
 * must target prefixed tables. Returns [{ index, line, message }].
 */
export function checkSqlReferences(text, { allowSystemReads = true } = {}) {
  const out = [];
  const ctes = cteNames(text);
  // Uppercase keywords only: our SQL style is uppercase; avoids matching English prose ("signed in from …").
  const re = /\b(FROM|JOIN|INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?|ALTER\s+TABLE(?:\s+IF\s+EXISTS)?|REFERENCES)\s+(?!\()([A-Za-z_"][\w."]*)(\s*\()?/g;
  let m;
  while ((m = re.exec(text))) {
    const kw = m[1].replace(/\s+/g, ' ');
    const raw = m[2];
    const isCall = Boolean(m[3]);
    const name = unqualified(raw);
    if (name.startsWith(EXPR)) continue;
    if (raw.endsWith('.') || text[m.index + m[0].length] === '%') continue; // format('… %I') placeholders
    if (name.toLowerCase().startsWith(PREFIX)) continue;
    if (kw === 'FROM' && ROLE_NAMES.has(name.toLowerCase())) continue;
    if (SQL_KEYWORDS_AFTER.has(name.toUpperCase())) continue;
    if (isCall && (kw === 'FROM' || kw === 'JOIN')) continue; // set-returning function: unnest(…), generate_series(…)
    if (ctes.has(name.toLowerCase())) continue;
    if (allowSystemReads && (kw === 'FROM' || kw === 'JOIN') && READ_ONLY_SYSTEM.test(stripQuotes(raw))) continue;
    if (kw === 'UPDATE' && /^(SET|OF)$/i.test(name)) continue; // "ON CONFLICT … DO UPDATE SET", "FOR UPDATE OF"
    if (kw === 'FROM' && /^(now|current_date|current_timestamp)$/i.test(name)) continue; // EXTRACT(x FROM now())
    if (/^(EXCLUDED)$/i.test(name)) continue;
    out.push({ index: m.index, line: lineOf(text, m.index), message: `${kw} targets unprefixed object "${raw}" (must start with ${PREFIX})` });
  }
  return out;
}

/** DDL object names created by migrations must be prefixed (and short enough for the test prefix). */
export function checkSqlDefinitions(text) {
  const out = [];
  const defs = [
    /\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:UNIQUE\s+)?(?:TABLE|INDEX|VIEW|MATERIALIZED\s+VIEW|FUNCTION|PROCEDURE|TRIGGER|TYPE|SEQUENCE|POLICY|SCHEMA|DOMAIN)\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:CONCURRENTLY\s+)?([A-Za-z_"][\w."]*)/gi,
    /\bCONSTRAINT\s+([A-Za-z_"][\w."]*)/gi,
    /\bON\s+([A-Za-z_"][\w."]*)\s*(?:USING|\(|FOR|AS)/g,
  ];
  for (const re of defs) {
    let m;
    while ((m = re.exec(text))) {
      const name = unqualified(m[1]);
      if (name.startsWith(EXPR) || /^%I$/.test(name)) continue;
      if (/^(public|anon|authenticated)$/i.test(name) || NON_OBJECT_WORDS.has(name.toUpperCase())) continue;
      if (!name.toLowerCase().startsWith(PREFIX)) {
        out.push({ index: m.index, line: lineOf(text, m.index), message: `object "${name}" is not prefixed with ${PREFIX}` });
      } else if (name.length > MAX_IDENT) {
        out.push({ index: m.index, line: lineOf(text, m.index), message: `identifier "${name}" is ${name.length} chars (max ${MAX_IDENT} so the ${PREFIX}test_ variant fits in 63)` });
      }
    }
  }
  const forbidden = [
    [/\bDROP\s+SCHEMA\b/i, 'DROP SCHEMA is forbidden on the shared database'],
    [/\bCREATE\s+EXTENSION\b/i, 'CREATE EXTENSION is forbidden (extensions are shared — enable them in the dashboard)'],
    [/\bDROP\s+(?:TABLE|VIEW|FUNCTION|TYPE|INDEX|TRIGGER|POLICY|SEQUENCE)\s+(?:IF\s+EXISTS\s+)?(?!eduway_platform_)[A-Za-z_"]/i, 'DROP of an unprefixed object'],
  ];
  for (const [re, msg] of forbidden) {
    const m = re.exec(text);
    if (m) out.push({ index: m.index, line: lineOf(text, m.index), message: msg });
  }
  return out;
}

/** supabase-js `.from('x')`: tables must be prefixed; Storage buckets must start with eduway-platform-. */
export function checkFromArgument(value) {
  if (value.startsWith(PREFIX) || value.startsWith(BUCKET_PREFIX)) return null;
  return `.from('${value}') must reference a prefixed table (${PREFIX}…) or bucket (${BUCKET_PREFIX}…) — use T.<name> / BUCKETS.<name>`;
}

/** Remove SQL comments (keeps offsets roughly stable by replacing with spaces). */
export function stripSqlComments(sql) {
  return sql.replace(/--[^\n]*/g, (s) => ' '.repeat(s.length)).replace(/\/\*[\s\S]*?\*\//g, (s) => s.replace(/[^\n]/g, ' '));
}
