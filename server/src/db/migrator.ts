/**
 * SQL migration runner.
 *  - Applies src/db/migrations/NNN_*.sql in order, each inside its own transaction.
 *  - Ledger: `eduway_platform_schema_migrations` (filename, checksum, status, applied_at, duration_ms).
 *  - Idempotent: applied files are skipped; a changed checksum is an error unless `reapplyChanged` is set
 *    (all our migrations are written idempotently, so re-applying is safe).
 *  - A migration that raises NOTICE containing `EDUWAY_SKIPPED` (e.g. pgvector missing) is recorded as
 *    `skipped` and retried on the next run.
 *  - TEST=1: every `eduway_platform_` identifier is rewritten to `eduway_platform_test_`.
 *  - Safety: refuses SQL containing DROP SCHEMA / TRUNCATE / CREATE EXTENSION or DROP of unprefixed objects.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { IS_TEST_PREFIX, PROD_PREFIX, TABLE_PREFIX, T } from '../config/constants.js';

export const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

export interface MigrationFile {
  name: string;
  sql: string;
  checksum: string;
}

export interface MigrationResult {
  name: string;
  status: 'applied' | 'skipped' | 'unchanged' | 'reapplied';
  ms: number;
  notices: string[];
}

export function listMigrations(dir = MIGRATIONS_DIR): MigrationFile[] {
  return readdirSync(dir)
    .filter((f) => /^\d{3}_[a-z0-9_]+\.sql$/.test(f))
    .sort()
    .map((name) => {
      const raw = readFileSync(path.join(dir, name), 'utf8');
      return { name, sql: raw, checksum: createHash('sha256').update(raw).digest('hex') };
    });
}

/** Rewrite prefix for the test schema. */
export function applyPrefix(sql: string): string {
  if (!IS_TEST_PREFIX) return sql;
  return sql.replace(/eduway_platform_(?!test_)/g, TABLE_PREFIX);
}

const FORBIDDEN: { re: RegExp; why: string }[] = [
  { re: /\bDROP\s+SCHEMA\b/i, why: 'DROP SCHEMA is forbidden on the shared database' },
  { re: /\bTRUNCATE\b/i, why: 'truncate statements are forbidden in migrations' },
  { re: /\bCREATE\s+EXTENSION\b/i, why: 'extensions are shared — enable them in the dashboard, never create them from migrations' },
  { re: /\bDROP\s+(TABLE|VIEW|FUNCTION|TYPE|INDEX|TRIGGER|POLICY|SEQUENCE)\s+(IF\s+EXISTS\s+)?(?!eduway_platform_)[a-z_"]/i, why: 'DROP of an unprefixed object' },
];

export function assertSafeSql(name: string, sql: string): void {
  const code = sql.replace(/--.*$/gm, '');
  for (const f of FORBIDDEN) {
    if (f.re.test(code)) throw new Error(`Migration ${name} rejected: ${f.why}`);
  }
}

async function ensureLedger(client: pg.PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${T.schema_migrations} (
      name         text NOT NULL,
      checksum     text NOT NULL,
      status       text NOT NULL DEFAULT 'applied',
      applied_at   timestamptz NOT NULL DEFAULT now(),
      duration_ms  integer NOT NULL DEFAULT 0,
      CONSTRAINT ${TABLE_PREFIX}schema_migrations_pkey PRIMARY KEY (name),
      CONSTRAINT ${TABLE_PREFIX}schema_migrations_status_check CHECK (status IN ('applied', 'skipped'))
    )`);
  await client.query(`ALTER TABLE ${T.schema_migrations} ENABLE ROW LEVEL SECURITY`);
}

export interface RunOptions {
  reapplyChanged?: boolean;
  dryRun?: boolean;
  log?: (msg: string) => void;
  /** Only run migrations whose file name starts with one of these (e.g. ['012', '405']). Default: all. */
  only?: string[];
}

export async function runMigrations(pool: pg.Pool, opts: RunOptions = {}): Promise<MigrationResult[]> {
  const log = opts.log ?? (() => undefined);
  const files = listMigrations().filter((f) => !opts.only?.length || opts.only.some((o) => f.name.startsWith(o)));
  for (const f of files) assertSafeSql(f.name, f.sql);
  if (!PROD_PREFIX.startsWith('eduway_platform_')) throw new Error('prefix misconfigured');

  const client = await pool.connect();
  const results: MigrationResult[] = [];
  const notices: string[] = [];
  const onNotice = (n: { message?: string }) => notices.push(n.message ?? '');
  client.on('notice', onNotice);
  try {
    await ensureLedger(client);
    // Serialize concurrent runners (lock id derived from our prefix; not a database object).
    await client.query(`SELECT pg_advisory_lock(hashtext($1))`, [`${TABLE_PREFIX}migrations`]);

    const { rows } = await client.query<{ name: string; checksum: string; status: string }>(
      `SELECT name, checksum, status FROM ${T.schema_migrations}`,
    );
    const ledger = new Map(rows.map((r) => [r.name, r]));

    for (const file of files) {
      const prev = ledger.get(file.name);
      const changed = prev && prev.checksum !== file.checksum;
      if (prev && prev.status === 'applied' && !changed) {
        results.push({ name: file.name, status: 'unchanged', ms: 0, notices: [] });
        continue;
      }
      if (changed && prev.status === 'applied' && !opts.reapplyChanged) {
        throw new Error(
          `Checksum mismatch for already-applied migration ${file.name}. Add a NEW migration instead of editing ` +
            `an applied one, or run \`npm run migrate -- --reapply-changed\` (migrations are idempotent).`,
        );
      }
      if (opts.dryRun) {
        log(`would apply ${file.name}`);
        continue;
      }
      notices.length = 0;
      const started = Date.now();
      await client.query('BEGIN');
      try {
        await client.query(applyPrefix(file.sql));
        const skipped = notices.some((n) => n.includes('EDUWAY_SKIPPED'));
        await client.query(
          `INSERT INTO ${T.schema_migrations} (name, checksum, status, duration_ms) VALUES ($1, $2, $3, $4)
           ON CONFLICT (name) DO UPDATE SET checksum = EXCLUDED.checksum, status = EXCLUDED.status,
             applied_at = now(), duration_ms = EXCLUDED.duration_ms`,
          [file.name, file.checksum, skipped ? 'skipped' : 'applied', Date.now() - started],
        );
        await client.query('COMMIT');
        const status: MigrationResult['status'] = skipped ? 'skipped' : prev ? 'reapplied' : 'applied';
        results.push({ name: file.name, status, ms: Date.now() - started, notices: [...notices] });
        log(`${status.padEnd(9)} ${file.name} (${Date.now() - started} ms)`);
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw new Error(`Migration ${file.name} failed: ${(err as Error).message}`);
      }
    }
    // Secure the ledger like every other table (RLS deny policy + revoke API roles) once the helper exists.
    if (!opts.dryRun) {
      await client.query(
        `DO $$ BEGIN
           IF to_regprocedure('${TABLE_PREFIX}fn_secure_table(text)') IS NOT NULL THEN
             PERFORM ${TABLE_PREFIX}fn_secure_table('${T.schema_migrations}');
           END IF;
         END $$`,
      );
    }
    return results;
  } finally {
    await client.query(`SELECT pg_advisory_unlock(hashtext($1))`, [`${TABLE_PREFIX}migrations`]).catch(() => undefined);
    client.off('notice', onNotice);
    client.release();
  }
}

/** Every object in the database that belongs to us (used by prefix tests and the final verification). */
export async function listOurObjects(pool: pg.Pool): Promise<{ kind: string; name: string }[]> {
  const like = `${TABLE_PREFIX.replace(/_/g, '\\_')}%`;
  const { rows } = await pool.query<{ kind: string; name: string }>(
    `SELECT 'table' AS kind, table_name AS name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE $1
     UNION ALL SELECT 'index', indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename LIKE $1
     UNION ALL SELECT 'constraint', conname FROM pg_constraint c JOIN pg_class r ON r.oid = c.conrelid
               JOIN pg_namespace n ON n.oid = r.relnamespace WHERE n.nspname = 'public' AND r.relname LIKE $1
     UNION ALL SELECT 'trigger', tgname FROM pg_trigger t JOIN pg_class r ON r.oid = t.tgrelid
               WHERE NOT t.tgisinternal AND r.relname LIKE $1
     UNION ALL SELECT 'policy', policyname FROM pg_policies WHERE schemaname = 'public' AND tablename LIKE $1
     UNION ALL SELECT 'function', p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
               WHERE n.nspname = 'public' AND p.proname LIKE $1
     UNION ALL SELECT 'type', t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
               WHERE n.nspname = 'public' AND t.typname LIKE $1 AND t.typtype = 'e'
     ORDER BY 1, 2`,
    [like],
  );
  return rows;
}
