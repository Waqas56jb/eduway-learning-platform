/**
 * JWT helpers. Two audiences with separate secrets:
 *   students → aud `eduway-student`, JWT_ACCESS_SECRET
 *   admins   → aud `eduway-admin`,   JWT_ADMIN_SECRET
 * Refresh tokens are opaque random strings stored hashed in eduway_platform_sessions (see hashToken).
 */
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { AUDIENCE } from '../../config/constants.js';
import { env } from '../../config/env.js';
import { TokenExpiredError, UnauthorizedError } from '../errors/index.js';

export type AccessAudience = 'student' | 'admin';

export interface AccessClaims {
  sub: string;
  sid: string;
  aud: string;
  typ: 'access';
  plt?: string;
  iat?: number;
  exp?: number;
}

const secretFor = (aud: AccessAudience) => (aud === 'admin' ? env.JWT_ADMIN_SECRET : env.JWT_ACCESS_SECRET);
const ttlFor = (aud: AccessAudience) => (aud === 'admin' ? env.ADMIN_ACCESS_TOKEN_TTL_SEC : env.ACCESS_TOKEN_TTL_SEC);

export function signAccessToken(aud: AccessAudience, userId: string, sessionId: string, platform?: string): { token: string; expiresIn: number } {
  const expiresIn = ttlFor(aud);
  const token = jwt.sign({ sid: sessionId, typ: 'access', plt: platform }, secretFor(aud), {
    algorithm: 'HS256',
    subject: userId,
    audience: AUDIENCE[aud],
    issuer: env.JWT_ISSUER,
    expiresIn,
  });
  return { token, expiresIn };
}

/** Which audience a bearer token claims (unverified) — used to pick the right secret. */
export function peekAudience(token: string): AccessAudience | null {
  const decoded = jwt.decode(token);
  if (!decoded || typeof decoded === 'string') return null;
  const aud = Array.isArray(decoded.aud) ? decoded.aud[0] : decoded.aud;
  if (aud === AUDIENCE.student) return 'student';
  if (aud === AUDIENCE.admin) return 'admin';
  return null;
}

export function verifyAccessToken(token: string, aud: AccessAudience): AccessClaims {
  try {
    const payload = jwt.verify(token, secretFor(aud), {
      algorithms: ['HS256'],
      audience: AUDIENCE[aud],
      issuer: env.JWT_ISSUER,
    }) as JwtPayload;
    if (payload.typ !== 'access' || typeof payload.sub !== 'string' || typeof payload.sid !== 'string') {
      throw new UnauthorizedError('TOKEN_INVALID');
    }
    return payload as AccessClaims;
  } catch (err) {
    if (err instanceof UnauthorizedError) throw err;
    if (err instanceof jwt.TokenExpiredError) throw new TokenExpiredError();
    throw new UnauthorizedError('TOKEN_INVALID');
  }
}

/**
 * Step-up token issued after a correct admin password when MFA is still required.
 * `purpose` binds the token to one flow:
 *   'login'  — the admin already has TOTP enabled; the token may ONLY be exchanged at /auth/admin/mfa/verify.
 *   'enroll' — MFA is mandatory but not yet enrolled; the token may ONLY be used for /mfa/setup + /mfa/enable.
 * (SECURITY.md SEC-01: an untyped token let a password-only attacker re-enrol TOTP on an MFA-protected account.)
 */
export type MfaPurpose = 'login' | 'enroll';

export function signMfaChallengeToken(userId: string, purpose: MfaPurpose, ttlSec = 5 * 60): string {
  return jwt.sign({ typ: 'mfa', pur: purpose }, env.JWT_ADMIN_SECRET, {
    algorithm: 'HS256',
    subject: userId,
    audience: AUDIENCE.mfa,
    issuer: env.JWT_ISSUER,
    expiresIn: ttlSec,
  });
}

export function verifyMfaChallengeToken(token: string, purpose: MfaPurpose): { userId: string } {
  try {
    const p = jwt.verify(token, env.JWT_ADMIN_SECRET, {
      algorithms: ['HS256'],
      audience: AUDIENCE.mfa,
      issuer: env.JWT_ISSUER,
    }) as JwtPayload;
    if (p.typ !== 'mfa' || p.pur !== purpose || typeof p.sub !== 'string') throw new Error('bad');
    return { userId: p.sub };
  } catch {
    throw new UnauthorizedError('MFA_INVALID');
  }
}

export function extractBearer(header: string | undefined): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m?.[1]?.trim() || null;
}
