/**
 * Postgres access (direct connection through the Supabase pooler, service-level privileges).
 *
 *   import { db, tx } from '../../config/db.js';
 *   const user = await db.maybeOne<UserRow>(`SELECT * FROM ${T.users} WHERE id = $1`, [id]);
 *   await tx(async (c) => { await c.query(...); await c.query(...); });
 *
 * Every helper accepts an optional `Executor` so repositories work both standalone and inside `tx()`.
 * ALWAYS parameterize values ($1, $2 …) and reference tables via `T.<name>` / `t('<name>')`.
 */
import pg from 'pg';
import { env } from './env.js';
import { logger } from './logger.js';

const { Pool, types } = pg;

// Return BIGINT/NUMERIC as JS numbers (counts, money in IQD fit safely) and DATE as 'YYYY-MM-DD' strings.
types.setTypeParser(20, (v) => Number(v)); // int8
types.setTypeParser(1700, (v) => Number(v)); // numeric
types.setTypeParser(1082, (v) => v); // date

export const pool = new Pool({
  connectionString: env.SUPABASE_DB_URL,
  max: env.DB_POOL_MAX,
  ssl: env.DB_SSL ? { rejectUnauthorized: false } : undefined,
  connectionTimeoutMillis: env.DB_CONNECT_TIMEOUT_MS,
  idleTimeoutMillis: 30_000,
  statement_timeout: env.DB_STATEMENT_TIMEOUT_MS,
  application_name: 'eduway-server',
});

pool.on('error', (err) => {
  // Idle-client errors must never crash the process.
  logger.error({ err: { message: err.message, code: (err as { code?: string }).code } }, 'pg pool error');
});

export type QueryParams = readonly unknown[];

/** Anything that can run a query: the pool or a checked-out client inside a transaction. */
export interface Executor {
  query<R extends pg.QueryResultRow = pg.QueryResultRow>(text: string, values?: unknown[]): Promise<pg.QueryResult<R>>;
}

export type TxClient = pg.PoolClient;

/**
 * The Supabase pooler (session mode) caps clients per project; when it is momentarily full a NEW pool connection is
 * refused before any statement runs (EMAXCONNSESSION / 53300). Such failures are safe to retry, so standalone queries
 * (never statements inside a transaction client) wait briefly and retry instead of surfacing a 500.
 */
const CONNECT_RETRY_DELAYS_MS = [150, 400, 1000, 2000];
export function isPoolerSaturated(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  return !!e && (e.code === '53300' || /EMAXCONNSESSION|max clients reached|too many clients/i.test(e.message ?? ''));
}

async function run<R extends pg.QueryResultRow>(ex: Executor, text: string, params: QueryParams = []) {
  const started = Date.now();
  try {
    let res: pg.QueryResult<R>;
    for (let attempt = 0; ; attempt++) {
      try {
        res = await ex.query<R>(text, params as unknown[]);
        break;
      } catch (err) {
        if (ex !== pool || attempt >= CONNECT_RETRY_DELAYS_MS.length || !isPoolerSaturated(err)) throw err;
        await new Promise((r) => setTimeout(r, CONNECT_RETRY_DELAYS_MS[attempt]));
      }
    }
    const ms = Date.now() - started;
    if (ms > 1000) logger.warn({ ms, sql: text.slice(0, 200) }, 'slow query');
    return res;
  } catch (err) {
    const e = err as pg.DatabaseError;
    logger.debug({ code: e.code, message: e.message, sql: text.slice(0, 300) }, 'query failed');
    throw err;
  }
}

export const db = {
  /** Raw query → full pg result. */
  query<R extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params?: QueryParams, ex: Executor = pool) {
    return run<R>(ex, text, params);
  },
  /** All rows. */
  async many<R extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params?: QueryParams, ex: Executor = pool): Promise<R[]> {
    return (await run<R>(ex, text, params)).rows;
  },
  /** First row or null. */
  async maybeOne<R extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params?: QueryParams, ex: Executor = pool): Promise<R | null> {
    return (await run<R>(ex, text, params)).rows[0] ?? null;
  },
  /** Exactly one row (throws if none). */
  async one<R extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params?: QueryParams, ex: Executor = pool): Promise<R> {
    const row = (await run<R>(ex, text, params)).rows[0];
    if (!row) throw new Error('Expected one row, got none');
    return row;
  },
  /** Scalar from the first column of the first row. */
  async scalar<V = unknown>(text: string, params?: QueryParams, ex: Executor = pool): Promise<V | null> {
    const row = (await run(ex, text, params)).rows[0] as Record<string, unknown> | undefined;
    if (!row) return null;
    const first = Object.values(row)[0];
    return (first ?? null) as V | null;
  },
  /** Number of affected rows. */
  async exec(text: string, params?: QueryParams, ex: Executor = pool): Promise<number> {
    return (await run(ex, text, params)).rowCount ?? 0;
  },
};

/**
 * Run `fn` inside a transaction. Commits on success, rolls back on any error (and rethrows).
 * Nested calls with an existing client simply reuse it.
 */
export async function tx<R>(fn: (client: TxClient) => Promise<R>, existing?: TxClient): Promise<R> {
  if (existing) return fn(existing);
  let client: TxClient;
  for (let attempt = 0; ; attempt++) {
    try {
      client = await pool.connect();
      break;
    } catch (err) {
      if (attempt >= CONNECT_RETRY_DELAYS_MS.length || !isPoolerSaturated(err)) throw err;
      await new Promise((r) => setTimeout(r, CONNECT_RETRY_DELAYS_MS[attempt]));
    }
  }
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* connection already broken */
    }
    throw err;
  } finally {
    client.release();
  }
}

/** Cheap readiness probe used by /health/ready. Never throws. */
export async function pingDb(timeoutMs = 3000): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
  const started = Date.now();
  try {
    await Promise.race([
      pool.query('SELECT 1'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
    ]);
    return { ok: true, latencyMs: Date.now() - started };
  } catch (err) {
    return { ok: false, error: (err as Error).message.replace(/postgres(ql)?:\/\/\S+/gi, '[db-url]') };
  }
}

export async function closeDb(): Promise<void> {
  await pool.end().catch(() => undefined);
}

/** Postgres error codes we map to API errors. */
export const PG_ERR = {
  uniqueViolation: '23505',
  foreignKeyViolation: '23503',
  checkViolation: '23514',
  notNullViolation: '23502',
  invalidTextRepresentation: '22P02',
} as const;
