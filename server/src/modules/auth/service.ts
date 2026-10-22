/** Shared auth flows: refresh rotation, logout, /auth/me. Student/admin specifics live in *-auth.service.ts. */
import { T } from '../../config/constants.js';
import { db } from '../../config/db.js';
import { UnauthorizedError } from '../../common/errors/index.js';
import { securityEvents } from '../../common/services/security-events.js';
import { settingsStore } from '../../common/services/settings-store.js';
import { hashToken } from '../../common/utils/crypto.js';
import type { AdminPrincipal, StudentPrincipal } from '../../common/types/index.js';
import { adminsService } from '../admins/service.js';
import { usersService } from '../users/service.js';
import type { ClientMeta } from './student-auth.service.js';
import { sessions, type AuthTokens } from './sessions.js';

export * from './student-auth.service.js';
export * from './admin-auth.service.js';

export async function refresh(refreshToken: string, meta: ClientMeta): Promise<AuthTokens> {
  const found = await sessions.findByRefreshToken(refreshToken);
  if (!found) throw new UnauthorizedError('REFRESH_TOKEN_INVALID');
  const { row, reused } = found;
  if (reused) {
    // A rotated-out token was presented again → token theft suspected: kill the whole family.
    await sessions.revokeFamily(row.family_id, 'refresh_token_reuse');
    await securityEvents.record({ kind: 'multiple_devices', severity: 'high', subjectLabel: row.user_id, userId: row.user_id, ip: meta.ip, detail: 'A previously rotated refresh token was reused. All sessions of this device family were revoked.' });
    throw new UnauthorizedError('REFRESH_TOKEN_INVALID');
  }
  if (row.revoked_at || row.expires_at.getTime() <= Date.now()) throw new UnauthorizedError('SESSION_REVOKED');
  const user = await db.maybeOne<{ status: string; deleted_at: Date | null }>(`SELECT status, deleted_at FROM ${T.users} WHERE id = $1`, [row.user_id]);
  if (!user || user.deleted_at || user.status === 'locked' || user.status === 'deactivated') {
    await sessions.revoke(row.id, 'account_locked');
    throw new UnauthorizedError('SESSION_REVOKED');
  }
  if (row.audience === 'student') {
    const app = await settingsStore.app();
    if (Date.now() - row.last_seen_at.getTime() > app.sessionTimeoutMinutes * 60_000) {
      await sessions.revoke(row.id, 'inactive_timeout');
      throw new UnauthorizedError('SESSION_REVOKED');
    }
  }
  const tokens = await sessions.rotate(row, { ip: meta.ip, userAgent: meta.userAgent });
  if (!tokens) throw new UnauthorizedError('REFRESH_TOKEN_INVALID');
  await db.query(`UPDATE ${T.users} SET last_active_at = now() WHERE id = $1`, [row.user_id]);
  return tokens;
}

export async function logout(principal: StudentPrincipal | AdminPrincipal, refreshToken?: string): Promise<void> {
  if (refreshToken) {
    const s = await db.maybeOne<{ id: string; user_id: string }>(`SELECT id, user_id FROM ${T.sessions} WHERE refresh_token_hash = $1`, [hashToken(refreshToken, 'refresh')]);
    if (s && s.user_id === principal.userId && s.id !== principal.sessionId) await sessions.revoke(s.id, 'logout', principal.userId);
  }
  await sessions.revoke(principal.sessionId, 'logout', principal.userId);
}

export async function logoutAll(principal: StudentPrincipal | AdminPrincipal, keepCurrent: boolean): Promise<{ revoked: number }> {
  return { revoked: await sessions.revokeAll(principal.userId, 'logout_all', { exceptSessionId: keepCurrent ? principal.sessionId : null, by: principal.userId }) };
}

export async function me(principal: { student?: StudentPrincipal; admin?: AdminPrincipal }) {
  if (principal.admin) return adminsService.me(principal.admin.userId);
  if (principal.student) return usersService.me(principal.student.userId);
  throw new UnauthorizedError();
}
