/**
 * Rate-limit presets.
 *   route({ ..., rateLimit: rateLimits.otpSend })
 * Exceeding a limit → 429 RATE_LIMITED (localized) with Retry-After.
 * Disabled when NODE_ENV=test unless RATE_LIMIT_IN_TESTS=1.
 *
 * Counter store (SEC-23), RATE_LIMIT_STORE:
 *   memory   (default) per-process counters — fine for one API instance / local dev.
 *   postgres shared counters in `eduway_platform_rate_limits` (migration 403) — use when more than one API
 *            instance serves traffic, so a client cannot multiply its budget by hitting different instances.
 *            Costs one small upsert per limited request. A store failure lets the request through (logged):
 *            the DB being down already fails every authenticated path.
 */
import { createHash } from 'node:crypto';
import type { Request, RequestHandler } from 'express';
import { rateLimit, type IncrementResponse, type Options, type Store } from 'express-rate-limit';
import { T } from '../../config/constants.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { RateLimitError } from '../errors/index.js';

const skipInTests = () => process.env.NODE_ENV === 'test' && process.env.RATE_LIMIT_IN_TESTS !== '1';

/** Minimal query surface (the pg pool, or a fake in unit tests). */
export interface RateLimitDb {
  query<R extends Record<string, unknown>>(text: string, values?: unknown[]): Promise<{ rows: R[] }>;
}

/** Postgres-backed fixed-window store (one row per key; the window restarts once `reset_at` has passed). */
export class PostgresRateLimitStore implements Store {
  windowMs = 60_000;
  /** Counters are shared between processes. */
  localKeys = false;
  private static lastSweep = 0;

  constructor(
    private readonly getDb: () => RateLimitDb | Promise<RateLimitDb>,
    readonly prefix = 'rl:',
  ) {}

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  private key(k: string): string {
    return `${this.prefix}${k}`.slice(0, 500);
  }

  async increment(key: string): Promise<IncrementResponse> {
    const db = await this.getDb();
    const { rows } = await db.query<{ hits: number; reset_at: Date }>(
      `INSERT INTO ${T.rate_limits} AS r (key, hits, reset_at) VALUES ($1, 1, now() + make_interval(secs => $2::double precision / 1000))
       ON CONFLICT (key) DO UPDATE SET
         hits = CASE WHEN r.reset_at <= now() THEN 1 ELSE r.hits + 1 END,
         reset_at = CASE WHEN r.reset_at <= now() THEN now() + make_interval(secs => $2::double precision / 1000) ELSE r.reset_at END
       RETURNING hits, reset_at`,
      [this.key(key), this.windowMs],
    );
    this.maybeSweep(db);
    const row = rows[0];
    return { totalHits: Number(row?.hits ?? 1), resetTime: row?.reset_at ? new Date(row.reset_at) : new Date(Date.now() + this.windowMs) };
  }

  async decrement(key: string): Promise<void> {
    const db = await this.getDb();
    await db.query(`UPDATE ${T.rate_limits} SET hits = GREATEST(hits - 1, 0) WHERE key = $1 AND reset_at > now()`, [this.key(key)]);
  }

  async resetKey(key: string): Promise<void> {
    const db = await this.getDb();
    await db.query(`DELETE FROM ${T.rate_limits} WHERE key = $1`, [this.key(key)]);
  }

  /** Expired windows are deleted at most once a minute per process (fire-and-forget). */
  private maybeSweep(db: RateLimitDb): void {
    const now = Date.now();
    if (now - PostgresRateLimitStore.lastSweep < 60_000) return;
    PostgresRateLimitStore.lastSweep = now;
    db.query(`DELETE FROM ${T.rate_limits} WHERE reset_at < now() - interval '1 minute'`).catch((err: Error) => logger.warn({ err: err.message }, 'rate-limit sweep failed'));
  }
}

/** Lazy pool import so the memory store never loads the DB module. */
const poolDb = async (): Promise<RateLimitDb> => (await import('../../config/db.js')).pool as unknown as RateLimitDb;

/** Store for one limiter (keys already start with the limiter name). undefined → built-in MemoryStore. */
export function rateLimitStore(kind: 'memory' | 'postgres' = env.RATE_LIMIT_STORE): Store | undefined {
  return kind === 'postgres' ? new PostgresRateLimitStore(poolDb) : undefined;
}

export function createRateLimit(opts: { windowMs: number; limit: number; key?: (req: Request) => string; name: string; store?: Store }): RequestHandler {
  const store = opts.store ?? rateLimitStore(env.RATE_LIMIT_STORE);
  const options: Partial<Options> = {
    windowMs: opts.windowMs,
    limit: opts.limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: skipInTests,
    keyGenerator: (req) => `${opts.name}:${opts.key ? opts.key(req) : (req.ip ?? 'unknown')}`,
    handler: (_req, _res, next, o) => {
      next(new RateLimitError(Math.ceil(o.windowMs / 1000)));
    },
    ...(store ? { store, passOnStoreError: true } : {}),
  };
  return rateLimit(options);
}

const bodyField = (req: Request, field: string) => {
  const v = (req.body as Record<string, unknown> | undefined)?.[field];
  return typeof v === 'string' ? v.replace(/\D/g, '').slice(-10) : '';
};

/** Per refresh token (hashed): every page load / new tab of the web apps rotates the session, so a per-IP
 *  budget is exhausted by one busy NAT (school network) — and by any user reloading a few dozen times. */
const refreshKey = (req: Request) => {
  const t = (req.body as Record<string, unknown> | undefined)?.refreshToken;
  return typeof t === 'string' && t ? createHash('sha256').update(t).digest('base64url').slice(0, 32) : `ip:${req.ip ?? 'unknown'}`;
};

const userKey = (req: Request) => req.student?.userId ?? req.admin?.userId ?? req.ip ?? 'anon';

export const rateLimits = {
  /** Whole API safety net per IP. */
  global: createRateLimit({ name: 'global', windowMs: 60_000, limit: 600 }),
  /** Generic auth endpoints (register, MFA, invites…). */
  auth: createRateLimit({ name: 'auth', windowMs: 15 * 60_000, limit: 60 }),
  /** Token refresh, per refresh token (a rotated token is single-use; repeats only come from retries/replays). The
   *  per-IP `global` limiter still bounds guessing — tokens are random 256-bit values. */
  refresh: createRateLimit({ name: 'refresh', windowMs: 15 * 60_000, limit: 20, key: refreshKey }),
  /** OTP send: per phone+IP (the business resend limit from settings is enforced in the service too). */
  otpSend: createRateLimit({ name: 'otp-send', windowMs: 10 * 60_000, limit: 6, key: (r) => `${bodyField(r, 'phone')}:${r.ip}` }),
  otpVerify: createRateLimit({ name: 'otp-verify', windowMs: 10 * 60_000, limit: 15, key: (r) => `${bodyField(r, 'phone')}:${r.ip}` }),
  adminLogin: createRateLimit({ name: 'admin-login', windowMs: 15 * 60_000, limit: 20 }),
  passwordReset: createRateLimit({ name: 'pw-reset', windowMs: 60 * 60_000, limit: 5 }),
  /** AI tutor messages per user (per-minute; the per-hour/allowance rules live in the AI service). */
  ai: createRateLimit({ name: 'ai', windowMs: 60_000, limit: 20, key: userKey }),
  search: createRateLimit({ name: 'search', windowMs: 60_000, limit: 60, key: userKey }),
  webhook: createRateLimit({ name: 'webhook', windowMs: 60_000, limit: 300 }),
  upload: createRateLimit({ name: 'upload', windowMs: 60_000, limit: 30, key: userKey }),
  export: createRateLimit({ name: 'export', windowMs: 60_000, limit: 10, key: userKey }),
};
