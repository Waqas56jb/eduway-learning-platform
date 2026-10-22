/**
 * Rate-limit presets (in-memory store; use a shared store if the API is scaled horizontally).
 *   route({ ..., rateLimit: rateLimits.otpSend })
 * Exceeding a limit → 429 RATE_LIMITED (localized) with Retry-After.
 * Disabled when NODE_ENV=test unless RATE_LIMIT_IN_TESTS=1.
 */
import { createHash } from 'node:crypto';
import type { Request, RequestHandler } from 'express';
import { rateLimit, type Options } from 'express-rate-limit';
import { RateLimitError } from '../errors/index.js';

const skipInTests = () => process.env.NODE_ENV === 'test' && process.env.RATE_LIMIT_IN_TESTS !== '1';

export function createRateLimit(opts: { windowMs: number; limit: number; key?: (req: Request) => string; name: string }): RequestHandler {
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
