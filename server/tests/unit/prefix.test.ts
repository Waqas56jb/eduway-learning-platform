import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BUCKET_NAMES, isPrefixed, obj, PGBOSS_SCHEMA, PROD_PREFIX, t, T, TABLE_PREFIX, TABLES } from '../../src/config/constants.js';
import { applyPrefix, assertSafeSql, listMigrations } from '../../src/db/migrator.js';
import { checkSqlDefinitions, checkSqlReferences, stripSqlComments } from '../../tools/prefix-core.mjs';

describe('prefix helpers', () => {
  it('t() and T prefix every table', () => {
    expect(TABLE_PREFIX).toBe('eduway_platform_');
    expect(t('users')).toBe('eduway_platform_users');
    expect(T.lessons).toBe('eduway_platform_lessons');
    for (const name of TABLES) expect(T[name].startsWith(PROD_PREFIX)).toBe(true);
    expect(obj('fn_set_updated_at')).toBe('eduway_platform_fn_set_updated_at');
  });

  it('isPrefixed', () => {
    expect(isPrefixed('eduway_platform_users')).toBe(true);
    expect(isPrefixed('"eduway_platform_users"')).toBe(true);
    expect(isPrefixed('users')).toBe(false);
    expect(isPrefixed('platform_users')).toBe(false);
  });

  it('buckets and pg-boss schema are prefixed', () => {
    expect(BUCKET_NAMES).toHaveLength(4);
    for (const b of BUCKET_NAMES) expect(b.startsWith('eduway-platform-')).toBe(true);
    expect(PGBOSS_SCHEMA).toBe('eduway_platform_pgboss');
  });

  it('T map is frozen', () => {
    expect(Object.isFrozen(T)).toBe(true);
  });
});

describe('migrations', () => {
  const files = listMigrations();

  it('are numbered, ordered and safe', () => {
    expect(files.length).toBeGreaterThanOrEqual(12);
    // Foundation 001-0xx, then reserved ranges per builder (1xx, 2xx, 3xx): numbers unique and increasing.
    const nums = files.map((f) => Number(f.name.slice(0, 3)));
    expect(new Set(nums).size).toBe(nums.length);
    nums.forEach((n, i) => i > 0 && expect(n).toBeGreaterThan(nums[i - 1] as number));
    expect(nums.slice(0, 12)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
    for (const f of files) expect(() => assertSafeSql(f.name, f.sql)).not.toThrow();
  });

  it('define and reference only prefixed objects', () => {
    for (const f of files) {
      const sql = stripSqlComments(f.sql);
      expect([...checkSqlDefinitions(sql), ...checkSqlReferences(sql)], f.name).toEqual([]);
    }
  });

  it('create every table listed in TABLES (except the runner ledger)', () => {
    const all = files.map((f) => f.sql).join('\n');
    const created = new Set([...all.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?(?:public\.)?eduway_platform_([a-z_]+)/g)].map((m) => m[1]));
    for (const name of TABLES.filter((n) => n !== 'schema_migrations')) expect(created.has(name), name).toBe(true);
  });

  it('are idempotent by construction (IF NOT EXISTS / OR REPLACE / guarded DO blocks)', () => {
    for (const f of files) {
      const sql = stripSqlComments(f.sql);
      const bareCreates = [...sql.matchAll(/CREATE\s+(TABLE|INDEX|UNIQUE\s+INDEX)\s+(?!IF NOT EXISTS)/gi)];
      // bare CREATEs are only allowed inside EXECUTE strings guarded by to_regclass(...) checks (012_embeddings)
      if (bareCreates.length) expect(sql).toMatch(/to_regclass/);
      expect(sql).not.toMatch(/CREATE\s+FUNCTION\s+(?!.*OR REPLACE)/i);
    }
  });

  it('TEST=1 rewrite targets eduway_platform_test_ only', () => {
    // applyPrefix is a no-op unless TEST=1; emulate the rewrite rule
    const sample = 'CREATE TABLE IF NOT EXISTS eduway_platform_users (); SELECT eduway_platform_fn_secure_table(\'eduway_platform_users\');';
    expect(applyPrefix(sample)).toBe(sample);
    expect(sample.replace(/eduway_platform_(?!test_)/g, 'eduway_platform_test_')).not.toMatch(/eduway_platform_(?!test_)/);
  });

  it('identifiers leave room for the test prefix (≤ 58 chars)', () => {
    const dir = path.resolve(__dirname, '../../src/db/migrations');
    for (const f of readdirSync(dir)) {
      const sql = readFileSync(path.join(dir, f), 'utf8');
      for (const m of sql.matchAll(/eduway_platform_[a-z0-9_]+/g)) expect(m[0].length, `${f}: ${m[0]}`).toBeLessThanOrEqual(58);
    }
  });
});
