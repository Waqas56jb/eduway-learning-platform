/**
 * Resolves verified access-token claims into request principals, checking that the session is still
 * active (not revoked/expired — so admin force-logout takes effect within the cache TTL) and that the user
 * is not locked. Results are cached for a few seconds; call `invalidatePrincipal(userId)` after changes.
 */
import { SUPER_ADMIN_ROLE, T, type ClientPlatform } from '../../config/constants.js';
import { db } from '../../config/db.js';
import { ForbiddenError, UnauthorizedError } from '../errors/index.js';
import type { AdminPrincipal, StudentPrincipal } from '../types/index.js';
import { TtlCache } from '../utils/cache.js';

const CACHE_TTL_MS = 15_000;
const studentCache = new TtlCache<StudentPrincipal>(CACHE_TTL_MS);
const adminCache = new TtlCache<AdminPrincipal>(CACHE_TTL_MS);

interface SessionRow {
  session_id: string;
  revoked_at: Date | null;
  expires_at: Date;
  device_id: string | null;
  platform: ClientPlatform;
  user_id: string;
  kind: 'student' | 'admin';
  status: string;
  phone: string | null;
  email: string | null;
  name_en: string;
  deleted_at: Date | null;
  profile_completed: boolean | null;
  pending_legal: number;
}

async function loadSession(sessionId: string, userId: string): Promise<SessionRow> {
  const row = await db.maybeOne<SessionRow>(
    `SELECT s.id AS session_id, s.revoked_at, s.expires_at, s.device_id, s.platform,
            u.id AS user_id, u.kind, u.status, u.phone, u.email, u.name_en, u.deleted_at,
            sp.profile_completed,
            CASE WHEN u.kind = 'student' THEN (
              SELECT count(*)::int FROM ${T.legal_documents} d
               WHERE d.status = 'published' AND d.requires_acceptance
                 AND NOT EXISTS (SELECT 1 FROM ${T.legal_acceptances} a WHERE a.user_id = u.id AND a.document_id = d.id)
            ) ELSE 0 END AS pending_legal
       FROM ${T.sessions} s
       JOIN ${T.users} u ON u.id = s.user_id
       LEFT JOIN ${T.student_profiles} sp ON sp.user_id = u.id
      WHERE s.id = $1 AND s.user_id = $2`,
    [sessionId, userId],
  );
  if (!row) throw new UnauthorizedError('SESSION_REVOKED');
  if (row.revoked_at || row.expires_at.getTime() < Date.now()) throw new UnauthorizedError('SESSION_REVOKED');
  if (row.deleted_at) throw new UnauthorizedError('SESSION_REVOKED');
  if (row.status === 'locked') throw new ForbiddenError('ACCOUNT_LOCKED');
  if (row.status === 'deactivated') throw new ForbiddenError('ACCOUNT_LOCKED');
  return row;
}

export async function resolveStudent(userId: string, sessionId: string): Promise<StudentPrincipal> {
  const key = `${userId}:${sessionId}`;
  const hit = studentCache.get(key);
  if (hit) return hit;
  const row = await loadSession(sessionId, userId);
  if (row.kind !== 'student') throw new UnauthorizedError('TOKEN_INVALID');
  const principal: StudentPrincipal = {
    kind: 'student',
    userId: row.user_id,
    sessionId: row.session_id,
    phone: row.phone,
    platform: row.platform,
    deviceId: row.device_id,
    profileComplete: row.profile_completed === true,
    pendingLegal: row.pending_legal,
  };
  studentCache.set(key, principal);
  return principal;
}

export interface AdminAccess {
  roles: { key: string; name_en: string }[];
  permissions: string[];
}

/** Role keys + permission keys for an admin user. */
export async function loadAdminAccess(userId: string): Promise<AdminAccess> {
  const roles = await db.many<{ key: string; name_en: string }>(
    `SELECT r.key, r.name_en FROM ${T.admin_roles} ar JOIN ${T.roles} r ON r.id = ar.role_id
      WHERE ar.user_id = $1 ORDER BY r.is_system DESC, r.key`,
    [userId],
  );
  const perms = await db.many<{ key: string }>(
    `SELECT DISTINCT p.key FROM ${T.admin_roles} ar
       JOIN ${T.role_permissions} rp ON rp.role_id = ar.role_id
       JOIN ${T.permissions} p ON p.id = rp.permission_id
      WHERE ar.user_id = $1 ORDER BY p.key`,
    [userId],
  );
  return { roles, permissions: perms.map((p) => p.key) };
}

export async function resolveAdmin(userId: string, sessionId: string): Promise<AdminPrincipal> {
  const key = `${userId}:${sessionId}`;
  const hit = adminCache.get(key);
  if (hit) return hit;
  const row = await loadSession(sessionId, userId);
  if (row.kind !== 'admin') throw new UnauthorizedError('TOKEN_INVALID');
  const access = await loadAdminAccess(userId);
  const mfa = await db.scalar<boolean>(`SELECT mfa_enabled FROM ${T.admin_users} WHERE user_id = $1`, [userId]);
  const roleKeys = access.roles.map((r) => r.key);
  const principal: AdminPrincipal = {
    kind: 'admin',
    userId: row.user_id,
    sessionId: row.session_id,
    email: row.email ?? '',
    name: row.name_en,
    roles: roleKeys,
    roleName: access.roles[0]?.name_en ?? '',
    permissions: new Set(access.permissions),
    isSuperAdmin: roleKeys.includes(SUPER_ADMIN_ROLE),
    mfaEnabled: mfa === true,
  };
  adminCache.set(key, principal);
  return principal;
}

/** Drop cached principals for a user (after lock, logout, role/permission change). Omit userId to clear all. */
export function invalidatePrincipal(userId?: string): void {
  if (!userId) {
    studentCache.clear();
    adminCache.clear();
    return;
  }
  studentCache.deletePrefix(`${userId}:`);
  adminCache.deletePrefix(`${userId}:`);
}
