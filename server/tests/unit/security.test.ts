/**
 * Security regression tests (docs/SECURITY.md). No database needed.
 *   - route coverage: every /admin route is permission-gated, every :param is zod-validated, public auth routes are
 *     rate limited (catches a future route that forgets its guard)
 *   - MFA challenge tokens are purpose-bound (SEC-01)
 *   - production env cross-checks (SEC-06), CSV formula neutralisation (SEC-15), sort whitelist (SEC-16),
 *     bulk error redaction (SEC-18)
 */
import jwt from 'jsonwebtoken';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { signAccessToken, signMfaChallengeToken, verifyAccessToken, verifyMfaChallengeToken } from '../../src/common/auth/tokens.js';
import { AppError, NotFoundError, bulkItemError } from '../../src/common/errors/index.js';
import { routeManifest } from '../../src/common/http/route.js';
import { csvCell, neutralizeFormula } from '../../src/common/services/exporter.js';
import { orderBy } from '../../src/common/utils/pagination.js';
import { AUDIENCE } from '../../src/config/constants.js';
import { closeDb } from '../../src/config/db.js';
import { env, envProblems } from '../../src/config/env.js';

createApp(); // registers every module's routes into the manifest
afterAll(() => closeDb());

/** Admin routes intentionally open to every signed-in admin (own profile/inbox, select lookups). */
const ADMIN_SELF_SERVICE = /^\/admin\/(me(\/|$)|lookups$)/;

describe('route coverage', () => {
  it('manifest is populated', () => {
    expect(routeManifest.length).toBeGreaterThan(300);
  });

  it('every /admin route requires an admin token', () => {
    const bad = routeManifest.filter((r) => r.path.startsWith('/admin') && r.auth !== 'admin');
    expect(bad.map((r) => `${r.method} ${r.path}`)).toEqual([]);
  });

  it('every /admin route (except self-service) is permission-gated', () => {
    const bad = routeManifest.filter((r) => r.path.startsWith('/admin') && !ADMIN_SELF_SERVICE.test(r.path) && !r.permissions.length && !r.anyPermissions.length);
    expect(bad.map((r) => `${r.method} ${r.path}`)).toEqual([]);
  });

  it('every route with a path parameter validates it with zod', () => {
    const bad = routeManifest.filter((r) => r.path.includes(':') && !r.hasParams);
    expect(bad.map((r) => `${r.method} ${r.path}`)).toEqual([]);
  });

  it('every public write endpoint is rate limited', () => {
    const bad = routeManifest.filter((r) => r.auth === 'public' && r.method !== 'get' && !r.rateLimited);
    expect(bad.map((r) => `${r.method} ${r.path}`)).toEqual([]);
  });
});

describe('MFA challenge tokens (SEC-01)', () => {
  const uid = '00000000-0000-4000-8000-000000000001';

  it('a login challenge cannot be used for enrolment and vice versa', () => {
    const login = signMfaChallengeToken(uid, 'login');
    const enroll = signMfaChallengeToken(uid, 'enroll');
    expect(verifyMfaChallengeToken(login, 'login').userId).toBe(uid);
    expect(verifyMfaChallengeToken(enroll, 'enroll').userId).toBe(uid);
    expect(() => verifyMfaChallengeToken(login, 'enroll')).toThrow(AppError);
    expect(() => verifyMfaChallengeToken(enroll, 'login')).toThrow(AppError);
  });

  it('a legacy challenge without a purpose is rejected', () => {
    const legacy = jwt.sign({ typ: 'mfa' }, env.JWT_ADMIN_SECRET, { algorithm: 'HS256', subject: uid, audience: AUDIENCE.mfa, issuer: env.JWT_ISSUER, expiresIn: 300 });
    expect(() => verifyMfaChallengeToken(legacy, 'enroll')).toThrow(AppError);
  });

  it('an MFA challenge is not an admin access token, and student tokens are not admin tokens', () => {
    expect(() => verifyAccessToken(signMfaChallengeToken(uid, 'login'), 'admin')).toThrow(AppError);
    const student = signAccessToken('student', uid, uid).token;
    expect(() => verifyAccessToken(student, 'admin')).toThrow(AppError);
  });

  it('alg=none tokens are rejected', () => {
    const none = jwt.sign({ sid: uid, typ: 'access' }, '', { algorithm: 'none', subject: uid, audience: 'eduway-admin', issuer: env.JWT_ISSUER });
    expect(() => verifyAccessToken(none, 'admin')).toThrow(AppError);
  });
});

describe('production env checks (SEC-06)', () => {
  const base = { ...env, NODE_ENV: 'production' as const, JWT_ACCESS_SECRET: 'a'.repeat(40), JWT_ADMIN_SECRET: 'b'.repeat(40), JWT_REFRESH_SECRET: 'c'.repeat(40), CORS_ORIGINS: ['https://eduway.iq'] };
  it('accepts distinct secrets', () => expect(envProblems(base)).toEqual([]));
  it('rejects shared JWT secrets in production', () => expect(envProblems({ ...base, JWT_ADMIN_SECRET: base.JWT_ACCESS_SECRET })).toHaveLength(1));
  it('rejects a CORS wildcard in production', () => expect(envProblems({ ...base, CORS_ORIGINS: ['*'] })).toHaveLength(1));
  it('does not apply in development', () => expect(envProblems({ ...base, NODE_ENV: 'development', JWT_ADMIN_SECRET: base.JWT_ACCESS_SECRET })).toEqual([]));
});

describe('CSV export formula injection (SEC-15)', () => {
  it('prefixes formula triggers', () => {
    for (const s of ['=HYPERLINK("http://x")', '+1+1', '-2+3', '@SUM(A1)', '\t=1', '\r=1']) expect(neutralizeFormula(s).startsWith("'")).toBe(true);
  });
  it('leaves plain values and signed numbers alone', () => {
    for (const s of ['Ali', '-5', '+12.5', '0770 123 4567', 'a=b']) expect(neutralizeFormula(s)).toBe(s);
    expect(csvCell(-5)).toBe('-5');
    expect(csvCell('=1,2')).toBe(`"'=1,2"`);
  });
});

describe('sort whitelist (SEC-16)', () => {
  const allowed = { createdAt: 'u.created_at', name: 'u.name_en' };
  it('maps allowed keys', () => expect(orderBy('-name', allowed, '-createdAt')).toBe('u.name_en DESC NULLS LAST'));
  it('ignores Object.prototype keys and unknown columns', () => {
    for (const s of ['constructor', '-toString', '__proto__', 'hasOwnProperty', 'id;DROP TABLE x']) expect(orderBy(s, allowed, '-createdAt')).toBe('u.created_at DESC NULLS LAST');
  });
});

describe('bulk error redaction (SEC-18)', () => {
  it('keeps AppError codes and hides raw driver errors', () => {
    expect(bulkItemError(new NotFoundError('lesson')).code).toBe('NOT_FOUND');
    const pgErr = Object.assign(new Error('duplicate key value violates unique constraint "eduway_platform_users_phone_key"'), { code: '23505' });
    expect(bulkItemError(pgErr)).toEqual({ code: 'INTERNAL', message: 'INTERNAL' });
  });
});
