/**
 * Applies every migration to the real database under the TEST prefix (`eduway_platform_test_`), asserts via
 * the system catalogs that EVERY object created on our tables is prefixed, exercises a few HTTP routes against
 * that schema, then drops the test objects (prefixed only — production tables are never touched).
 */
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TABLE_PREFIX, TEST_PREFIX } from '../../src/config/constants.js';
import { closeDb, pingDb, pool } from '../../src/config/db.js';
import { listOurObjects, runMigrations } from '../../src/db/migrator.js';

const dbUp = (await pingDb(8000)).ok;

async function dropTestObjects(): Promise<void> {
  if (!TABLE_PREFIX.startsWith(TEST_PREFIX)) throw new Error('refusing to clean: not running with the test prefix');
  const like = `${TEST_PREFIX.replace(/_/g, '\\_')}%`;
  const tables = await pool.query<{ name: string }>(`SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE $1`, [like]);
  for (const t of tables.rows) await pool.query(`DROP TABLE IF EXISTS public."${t.name}" CASCADE`);
  const fns = await pool.query<{ sig: string }>(`SELECT p.oid::regprocedure::text AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname LIKE $1`, [like]);
  for (const f of fns.rows) await pool.query(`DROP FUNCTION IF EXISTS ${f.sig} CASCADE`);
  const types = await pool.query<{ name: string }>(`SELECT t.typname AS name FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typtype = 'e' AND t.typname LIKE $1`, [like]);
  for (const t of types.rows) await pool.query(`DROP TYPE IF EXISTS public."${t.name}" CASCADE`);
}

describe.skipIf(!dbUp)('schema under the test prefix', () => {
  beforeAll(async () => {
    expect(TABLE_PREFIX).toBe(TEST_PREFIX);
    await dropTestObjects();
    await runMigrations(pool);
  }, 180_000);

  afterAll(async () => {
    await dropTestObjects();
    await closeDb();
  }, 120_000);

  it('migrations are idempotent (second run applies nothing)', async () => {
    const second = await runMigrations(pool);
    expect(second.filter((r) => r.status === 'applied' || r.status === 'reapplied')).toEqual([]);
  }, 120_000);

  it('every table/index/constraint/trigger/policy/function/type we created is prefixed', async () => {
    const objects = await listOurObjects(pool);
    expect(objects.length).toBeGreaterThan(500);
    const bad = objects.filter((o) => !o.name.startsWith(TEST_PREFIX));
    expect(bad).toEqual([]);
    const kinds = new Set(objects.map((o) => o.kind));
    for (const k of ['table', 'index', 'constraint', 'trigger', 'policy', 'function', 'type']) expect(kinds.has(k), k).toBe(true);
  });

  it('RLS is enabled on every table', async () => {
    const like = `${TEST_PREFIX.replace(/_/g, '\\_')}%`;
    const r = await pool.query<{ relname: string }>(
      `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE $1 AND NOT c.relrowsecurity`,
      [like],
    );
    expect(r.rows).toEqual([]);
  });

  it('the API answers against the test schema', async () => {
    const { createApp } = await import('../../src/app.js');
    const app = createApp();
    const ready = await request(app).get('/api/v1/health/ready');
    expect([200]).toContain(ready.status);
    const gov = await request(app).get('/api/v1/public/governorates');
    expect(gov.status).toBe(200);
    expect(gov.body.data).toEqual([]); // test schema is not seeded
  });
});
