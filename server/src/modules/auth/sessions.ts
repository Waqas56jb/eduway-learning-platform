/**
 * Session service (refresh-token sessions for students AND admins). Shared by auth, users (/me),
 * students (admin force-logout) and security (admin sessions) modules.
 */
import { T, type ClientPlatform } from '../../config/constants.js';
import { db, type Executor } from '../../config/db.js';
import { env } from '../../config/env.js';
import { signAccessToken } from '../../common/auth/tokens.js';
import { invalidatePrincipal } from '../../common/auth/principal.js';
import { hashToken, randomToken } from '../../common/utils/crypto.js';
import { parseUserAgent } from '../../common/utils/user-agent.js';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresAt: string;
}

export interface SessionRow {
  id: string;
  user_id: string;
  audience: 'student' | 'admin';
  family_id: string;
  device_id: string | null;
  device_name: string | null;
  platform: ClientPlatform;
  browser: string | null;
  device_type: string;
  ip: string | null;
  user_agent: string | null;
  location: string | null;
  country_code: string | null;
  remember: boolean;
  created_at: Date;
  last_seen_at: Date;
  expires_at: Date;
  revoked_at: Date | null;
}

export interface SessionDto {
  id: string;
  device: string;
  platform: ClientPlatform;
  browser: string | null;
  ip: string;
  location: { en: string; ar: string };
  countryCode: string | null;
  createdAt: string;
  lastActive: string;
  current: boolean;
  /** Additive (admin UI): device class, outside-Iraq flag, start time alias. */
  deviceType: 'desktop' | 'mobile' | 'tablet';
  abroad: boolean;
  startedAt: string;
}

export function toSessionDto(r: SessionRow, currentSessionId?: string | null): SessionDto {
  const loc = r.location ?? (r.country_code ? r.country_code : '—');
  return {
    id: r.id,
    device: r.device_name || parseUserAgent(r.user_agent).device,
    platform: r.platform,
    browser: r.browser,
    ip: r.ip ?? '',
    location: { en: loc, ar: loc },
    countryCode: r.country_code,
    createdAt: r.created_at.toISOString(),
    lastActive: r.last_seen_at.toISOString(),
    current: r.id === currentSessionId,
    deviceType: (r.device_type as SessionDto['deviceType']) ?? 'desktop',
    abroad: !!r.country_code && r.country_code !== 'IQ',
    startedAt: r.created_at.toISOString(),
  };
}

export interface AdminSessionDto {
  id: string;
  admin: { id: string; name: { en: string; ar: string }; avatarUrl: string | null; email: string };
  device: string;
  browser: string;
  deviceType: 'desktop' | 'mobile' | 'tablet';
  ip: string;
  location: string;
  countryCode: string | null;
  abroad: boolean;
  startedAt: string;
  lastActive: string;
  current: boolean;
}

export type AdminSessionRow = SessionRow & { a_id: string; a_name_en: string; a_name_ar: string; a_avatar_url: string | null; a_email: string };

export const ADMIN_SESSION_SELECT = `SELECT s.*, u.id AS a_id, u.name_en AS a_name_en, u.name_ar AS a_name_ar, u.avatar_url AS a_avatar_url, u.email AS a_email
  FROM ${T.sessions} s JOIN ${T.users} u ON u.id = s.user_id
 WHERE s.audience = 'admin' AND s.revoked_at IS NULL AND s.expires_at > now()`;

export function toAdminSessionDto(r: AdminSessionRow, currentSessionId?: string | null): AdminSessionDto {
  const ua = parseUserAgent(r.user_agent, r.device_name);
  return {
    id: r.id,
    admin: { id: r.a_id, name: { en: r.a_name_en, ar: r.a_name_ar || r.a_name_en }, avatarUrl: r.a_avatar_url, email: r.a_email },
    device: r.device_name || ua.device,
    browser: r.browser ?? ua.browser ?? '',
    deviceType: (r.device_type as AdminSessionDto['deviceType']) ?? ua.deviceType,
    ip: r.ip ?? '',
    location: r.location ?? '',
    countryCode: r.country_code,
    abroad: !!r.country_code && r.country_code !== 'IQ',
    startedAt: r.created_at.toISOString(),
    lastActive: r.last_seen_at.toISOString(),
    current: r.id === currentSessionId,
  };
}

export interface CreateSessionInput {
  userId: string;
  audience: 'student' | 'admin';
  platform: ClientPlatform;
  deviceId: string | null;
  deviceName?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  remember?: boolean;
  /** Admin short sessions (remember=false) */
  refreshTtlMs?: number;
}

function refreshTtlMs(input: CreateSessionInput): number {
  if (input.refreshTtlMs) return input.refreshTtlMs;
  const days = input.audience === 'admin' ? env.ADMIN_REFRESH_TOKEN_TTL_DAYS : env.REFRESH_TOKEN_TTL_DAYS;
  return days * 86_400_000;
}

export const sessions = {
  async create(input: CreateSessionInput, ex?: Executor): Promise<{ session: SessionRow; tokens: AuthTokens }> {
    const refreshToken = randomToken();
    const ua = parseUserAgent(input.userAgent, input.deviceName);
    const expiresAt = new Date(Date.now() + refreshTtlMs(input));
    const session = await db.one<SessionRow>(
      `INSERT INTO ${T.sessions} (user_id, audience, refresh_token_hash, device_id, device_name, platform, browser, device_type, ip, user_agent, remember, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [input.userId, input.audience, hashToken(refreshToken, 'refresh'), input.deviceId, ua.device, input.platform, ua.browser, ua.deviceType, input.ip ?? null, input.userAgent ?? null, input.remember ?? true, expiresAt],
      ex,
    );
    const access = signAccessToken(input.audience, input.userId, session.id, input.platform);
    return { session, tokens: { accessToken: access.token, refreshToken, expiresIn: access.expiresIn, refreshExpiresAt: expiresAt.toISOString() } };
  },

  async findByRefreshToken(token: string): Promise<{ row: SessionRow; reused: boolean } | null> {
    const h = hashToken(token, 'refresh');
    const row = await db.maybeOne<SessionRow>(`SELECT * FROM ${T.sessions} WHERE refresh_token_hash = $1`, [h]);
    if (row) return { row, reused: false };
    const old = await db.maybeOne<SessionRow>(`SELECT * FROM ${T.sessions} WHERE previous_token_hash = $1`, [h]);
    return old ? { row: old, reused: true } : null;
  },

  /** Rotate the refresh token in place (session id stays stable for `current` markers and access-token sid). */
  async rotate(row: SessionRow, meta: { ip?: string | null; userAgent?: string | null }): Promise<AuthTokens> {
    const refreshToken = randomToken();
    const ttl = row.audience === 'admin' && !row.remember ? 12 * 3600_000 : (row.audience === 'admin' ? env.ADMIN_REFRESH_TOKEN_TTL_DAYS : env.REFRESH_TOKEN_TTL_DAYS) * 86_400_000;
    const expiresAt = new Date(Date.now() + ttl);
    await db.query(
      `UPDATE ${T.sessions} SET previous_token_hash = refresh_token_hash, refresh_token_hash = $2, rotated_at = now(),
              last_seen_at = now(), expires_at = $3, ip = COALESCE($4, ip), user_agent = COALESCE($5, user_agent)
        WHERE id = $1`,
      [row.id, hashToken(refreshToken, 'refresh'), expiresAt, meta.ip ?? null, meta.userAgent ?? null],
    );
    const access = signAccessToken(row.audience, row.user_id, row.id, row.platform);
    return { accessToken: access.token, refreshToken, expiresIn: access.expiresIn, refreshExpiresAt: expiresAt.toISOString() };
  },

  async listActive(userId: string, ex?: Executor): Promise<SessionRow[]> {
    return db.many<SessionRow>(
      `SELECT * FROM ${T.sessions} WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now() ORDER BY last_seen_at DESC`,
      [userId],
      ex,
    );
  },

  async get(id: string): Promise<SessionRow | null> {
    return db.maybeOne<SessionRow>(`SELECT * FROM ${T.sessions} WHERE id = $1`, [id]);
  },

  /** Revoke one session (+ push tokens bound to its device). */
  async revoke(sessionId: string, reason: string, by?: string | null, ex?: Executor): Promise<boolean> {
    const row = await db.maybeOne<{ user_id: string; device_id: string | null }>(
      `UPDATE ${T.sessions} SET revoked_at = now(), revoked_reason = $2, revoked_by = $3
        WHERE id = $1 AND revoked_at IS NULL RETURNING user_id, device_id`,
      [sessionId, reason, by ?? null],
      ex,
    );
    if (!row) return false;
    if (row.device_id) {
      await db.query(`UPDATE ${T.push_tokens} SET revoked_at = now() WHERE user_id = $1 AND device_id = $2 AND revoked_at IS NULL`, [row.user_id, row.device_id], ex);
    }
    invalidatePrincipal(row.user_id);
    return true;
  },

  /** Revoke all sessions of a user, optionally keeping one. Returns the number revoked. */
  async revokeAll(userId: string, reason: string, opts: { exceptSessionId?: string | null; by?: string | null } = {}, ex?: Executor): Promise<number> {
    const rows = await db.many<{ id: string }>(
      `UPDATE ${T.sessions} SET revoked_at = now(), revoked_reason = $2, revoked_by = $3
        WHERE user_id = $1 AND revoked_at IS NULL AND ($4::uuid IS NULL OR id <> $4::uuid) RETURNING id`,
      [userId, reason, opts.by ?? null, opts.exceptSessionId ?? null],
      ex,
    );
    if (!opts.exceptSessionId) {
      await db.query(`UPDATE ${T.push_tokens} SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [userId], ex);
    }
    invalidatePrincipal(userId);
    return rows.length;
  },

  async revokeFamily(familyId: string, reason: string): Promise<void> {
    const rows = await db.many<{ user_id: string }>(
      `UPDATE ${T.sessions} SET revoked_at = now(), revoked_reason = $2 WHERE family_id = $1 AND revoked_at IS NULL RETURNING user_id`,
      [familyId, reason],
    );
    for (const r of rows) invalidatePrincipal(r.user_id);
  },

  async touch(sessionId: string): Promise<void> {
    await db.query(`UPDATE ${T.sessions} SET last_seen_at = now() WHERE id = $1`, [sessionId]);
  },
};
