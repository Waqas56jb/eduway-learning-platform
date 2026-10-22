import bcrypt from 'bcryptjs';
import { T } from '../../config/constants.js';
import { db, tx } from '../../config/db.js';
import { env } from '../../config/env.js';
import { invalidatePrincipal, loadAdminAccess } from '../../common/auth/principal.js';
import { BusinessRuleError, ConflictError, ForbiddenError, NotFoundError, UnauthorizedError } from '../../common/errors/index.js';
import type { Localized } from '../../common/i18n/index.js';
import { mailer } from '../../common/providers/mail.js';
import { settingsStore } from '../../common/services/settings-store.js';
import { storage } from '../../common/services/storage.js';
import { mirrorAuthUser } from '../../common/services/auth-mirror.js';
import { hashToken, isStrongPassword, randomToken } from '../../common/utils/crypto.js';
import { normalizeIraqiPhone } from '../../common/utils/phone.js';
import type { AdminPrincipal } from '../../common/types/index.js';
import { ADMIN_SESSION_SELECT, sessions, toAdminSessionDto, type AdminSessionRow } from '../auth/sessions.js';
import { emptyMatrix, rolesService } from '../roles/service.js';
import { adminsRepo, type AdminListFilter } from './repository.js';
import type { AdminInboxNotification, AdminPreferences, AdminRow, AdminUserDto, MeAdminDto } from './types.js';

export const BCRYPT_ROUNDS = 12;

export async function toAdminDtos(rows: AdminRow[]): Promise<AdminUserDto[]> {
  const avatars = await storage.resolveMany(rows.map((r) => r.avatar_url));
  return rows.map((r, i) => ({
    id: r.id,
    name: { en: r.name_en, ar: r.name_ar || r.name_en },
    email: r.email,
    mobile: r.phone,
    roleId: r.role_id ?? '',
    role: { id: r.role_id ?? '', key: r.role_key ?? '', name: { en: r.role_name_en ?? '', ar: r.role_name_ar ?? '' } },
    avatarUrl: avatars[i] ?? null,
    mfaEnabled: r.mfa_enabled,
    status: r.status === 'locked' ? 'deactivated' : r.status,
    lastLogin: r.last_login_at?.toISOString() ?? null,
    createdAt: r.created_at.toISOString(),
  }));
}

export async function passwordPolicyCheck(pw: string): Promise<void> {
  const sec = await settingsStore.get('security');
  if (pw.length < sec.passwordMinLength || !isStrongPassword(pw)) throw new BusinessRuleError('PASSWORD_POLICY', { minLength: sec.passwordMinLength });
}

export const hashPassword = (pw: string) => bcrypt.hash(pw, BCRYPT_ROUNDS);

async function getRow(id: string): Promise<AdminRow> {
  const row = await adminsRepo.get(id);
  if (!row) throw new NotFoundError('admin');
  return row;
}

async function guardLastSuperAdmin(target: AdminRow): Promise<void> {
  if (target.role_key !== 'super_admin' || target.status !== 'active') return;
  if (((await adminsRepo.countActiveSuperAdmins()) ?? 0) <= 1) throw new BusinessRuleError('LAST_SUPER_ADMIN');
}

/** Create an invite token (7 days by default) and email the acceptance link. */
async function issueInvite(userId: string, roleId: string, email: string, by: string): Promise<void> {
  const token = randomToken(32);
  const hours = (await settingsStore.get('auth')).inviteExpiryHours;
  await db.query(`UPDATE ${T.admin_invites} SET revoked_at = now() WHERE user_id = $1 AND accepted_at IS NULL AND revoked_at IS NULL`, [userId]);
  await db.query(
    `INSERT INTO ${T.admin_invites} (user_id, role_id, token_hash, expires_at, created_by) VALUES ($1, $2, $3, now() + make_interval(hours => $4), $5)`,
    [userId, roleId, hashToken(token, 'invite'), hours, by],
  );
  const link = `${env.ADMIN_APP_URL}/accept-invite?token=${encodeURIComponent(token)}`;
  await mailer.send({
    to: email,
    subject: 'You are invited to the EDUWAY admin portal',
    text: `You have been invited to the EDUWAY admin portal.\n\nAccept the invitation and set your password:\n${link}\n\nThis link expires in ${hours} hours.`,
  });
}

export const adminsService = {
  getRow,

  async get(id: string): Promise<AdminUserDto> {
    return (await toAdminDtos([await getRow(id)]))[0] as AdminUserDto;
  },

  async me(userId: string): Promise<MeAdminDto> {
    const row = await getRow(userId);
    const [admin] = await toAdminDtos([row]);
    const role = row.role_id ? await rolesService.get(row.role_id) : null;
    const access = await loadAdminAccess(userId);
    const isSuper = row.role_key === 'super_admin';
    const permissions = isSuper && role ? Object.entries(role.permissions).flatMap(([m, acts]) => Object.entries(acts).filter(([, v]) => v).map(([a]) => `${m}.${a}`)) : access.permissions;
    return {
      admin: admin as AdminUserDto,
      role: role ?? {
        id: '',
        key: '',
        name: { en: '', ar: '' },
        description: { en: '', ar: '' },
        system: false,
        permissions: emptyMatrix(),
        createdAt: row.created_at.toISOString(),
        updatedAt: row.created_at.toISOString(),
        assignedAdmins: [],
        assignedCount: 0,
        grantedCount: 0,
      },
      permissions,
      roles: row.role_key ? [row.role_key] : [],
      preferences: { language: row.preferences.language ?? 'en', theme: row.preferences.theme ?? 'system' },
      unreadNotifications: await adminsRepo.unreadCount(userId),
    };
  },

  async list(f: AdminListFilter) {
    const { rows, total } = await adminsRepo.list(f);
    const s = await adminsRepo.stats();
    return { items: await toAdminDtos(rows), total, stats: { total: s.total, active: s.active, invited: s.invited, mfaPct: s.active ? Math.round((s.mfa / s.active) * 1000) / 10 : 0 } };
  },

  async invite(input: { name: Localized; email: string; roleId: string; mobile?: string | null }, by: AdminPrincipal): Promise<AdminUserDto> {
    if ((await adminsRepo.emailTaken(input.email)) ?? 0) throw new ConflictError('ALREADY_EXISTS', { field: 'email' });
    await rolesService.get(input.roleId);
    const mobile = input.mobile ? normalizeIraqiPhone(input.mobile) : null;
    const id = await tx((c) =>
      adminsRepo.insertAdmin({ nameEn: input.name.en, nameAr: input.name.ar || input.name.en, email: input.email, mobile, status: 'invited', passwordHash: null, invitedBy: by.userId, roleId: input.roleId }, c),
    );
    await issueInvite(id, input.roleId, input.email, by.userId);
    return this.get(id);
  },

  async resendInvite(id: string, by: AdminPrincipal): Promise<void> {
    const row = await getRow(id);
    if (row.status !== 'invited') throw new BusinessRuleError('INVALID_TRANSITION', { from: row.status, to: 'invited' });
    await issueInvite(id, row.role_id ?? '', row.email, by.userId);
  },

  async changeRole(id: string, roleId: string, by: AdminPrincipal): Promise<AdminUserDto> {
    const row = await getRow(id);
    if (row.status === 'deactivated') throw new BusinessRuleError('ADMIN_DEACTIVATED');
    const role = await rolesService.get(roleId);
    if (row.role_key === 'super_admin' && role.key !== 'super_admin') await guardLastSuperAdmin(row);
    await tx((c) => adminsRepo.setRole(id, roleId, by.userId, c));
    invalidatePrincipal(id);
    return this.get(id);
  },

  async resetMfa(id: string): Promise<AdminUserDto> {
    await getRow(id);
    await adminsRepo.updateAdminUser(id, { mfa_enabled: false, mfa_secret: null, mfa_pending_secret: null, mfa_recovery_codes: [] });
    return this.get(id);
  },

  async deactivate(id: string, reason: string, by: AdminPrincipal): Promise<AdminUserDto> {
    if (id === by.userId) throw new BusinessRuleError('SELF_ACTION');
    const row = await getRow(id);
    await guardLastSuperAdmin(row);
    await adminsRepo.setStatus(id, 'deactivated', reason);
    await sessions.revokeAll(id, 'admin_deactivated', { by: by.userId });
    return this.get(id);
  },

  async activate(id: string): Promise<AdminUserDto> {
    const row = await getRow(id);
    await adminsRepo.setStatus(id, row.password_hash ? 'active' : 'invited', null);
    invalidatePrincipal(id);
    return this.get(id);
  },

  // ── self-service (ADM-ME-*) ──
  async updateMe(userId: string, input: { name?: Localized; email?: string; mobile?: string; avatarFileKey?: string | null }): Promise<AdminUserDto> {
    const patch: Record<string, unknown> = {};
    if (input.name) {
      patch.name_en = input.name.en;
      patch.name_ar = input.name.ar;
    }
    if (input.email) {
      if ((await adminsRepo.emailTaken(input.email, userId)) ?? 0) throw new ConflictError('ALREADY_EXISTS', { field: 'email' });
      patch.email = input.email.toLowerCase();
    }
    if (input.mobile) patch.phone = normalizeIraqiPhone(input.mobile) ?? input.mobile.replace(/\s/g, '');
    if (input.avatarFileKey !== undefined) {
      if (input.avatarFileKey === null) patch.avatar_url = null;
      else {
        const up = await storage.attachUpload(input.avatarFileKey, { purpose: 'admin_avatar', entityType: 'admin', entityId: userId, ownerId: userId });
        patch.avatar_url = storage.ref(up.bucket, up.path);
      }
    }
    await adminsRepo.updateUser(userId, patch);
    invalidatePrincipal(userId);
    return this.get(userId);
  },

  async changePassword(principal: AdminPrincipal, current: string, next: string): Promise<void> {
    const row = await getRow(principal.userId);
    if (!row.password_hash || !(await bcrypt.compare(current, row.password_hash))) throw new UnauthorizedError('PASSWORD_INCORRECT');
    if (current === next) throw new BusinessRuleError('PASSWORD_REUSED');
    await passwordPolicyCheck(next);
    await adminsRepo.updateAdminUser(principal.userId, { password_hash: await hashPassword(next), password_changed_at: new Date() });
    await sessions.revokeAll(principal.userId, 'password_changed', { exceptSessionId: principal.sessionId, by: principal.userId });
  },

  async setPreferences(userId: string, prefs: Partial<AdminPreferences>): Promise<AdminPreferences> {
    const row = await getRow(userId);
    const next: AdminPreferences = { language: prefs.language ?? row.preferences.language ?? 'en', theme: prefs.theme ?? row.preferences.theme ?? 'system' };
    await adminsRepo.updateAdminUser(userId, { preferences: JSON.stringify(next) });
    return next;
  },

  async mySessions(principal: AdminPrincipal) {
    const rows = await db.many<AdminSessionRow>(`${ADMIN_SESSION_SELECT} AND s.user_id = $1 ORDER BY s.last_seen_at DESC`, [principal.userId]);
    return rows.map((r) => toAdminSessionDto(r, principal.sessionId));
  },

  async inbox(userId: string, opts: { unread?: boolean; limit: number; cursor?: string }) {
    let before: { at: string; id: string } | null = null;
    if (opts.cursor) {
      try {
        before = JSON.parse(Buffer.from(opts.cursor, 'base64url').toString('utf8')) as { at: string; id: string };
      } catch {
        before = null;
      }
    }
    const rows = await adminsRepo.inbox(userId, { unread: opts.unread, limit: opts.limit, before });
    const hasMore = rows.length > opts.limit;
    const page = rows.slice(0, opts.limit);
    const last = page[page.length - 1];
    const items: AdminInboxNotification[] = page.map((r) => ({
      id: r.id,
      title: { en: r.title_en, ar: r.title_ar },
      body: { en: r.body_en, ar: r.body_ar },
      at: r.created_at.toISOString(),
      read: !!r.read_at,
      href: r.href,
      kind: r.kind as AdminInboxNotification['kind'],
    }));
    return {
      items,
      nextCursor: hasMore && last ? Buffer.from(JSON.stringify({ at: last.created_at.toISOString(), id: last.id })).toString('base64url') : null,
      unreadCount: await adminsRepo.unreadCount(userId),
    };
  },

  async markRead(userId: string, id: string) {
    await adminsRepo.markRead(userId, id);
    return { unreadCount: await adminsRepo.unreadCount(userId) };
  },

  async markAllRead(userId: string) {
    await adminsRepo.markAllRead(userId);
    return { unreadCount: 0 as const };
  },

  /** Create an active admin directly (seed / create-admin script). Returns the user id. */
  async createActive(input: { name: Localized; email: string; password: string; roleKey: string; mobile?: string | null }): Promise<string> {
    const role = await db.maybeOne<{ id: string }>(`SELECT id FROM ${T.roles} WHERE key = $1`, [input.roleKey]);
    if (!role) throw new NotFoundError('role');
    const existing = await adminsRepo.getByEmail(input.email);
    const hash = await hashPassword(input.password);
    if (existing) {
      await adminsRepo.updateAdminUser(existing.id, { password_hash: hash, password_changed_at: new Date() });
      await adminsRepo.setStatus(existing.id, 'active', null);
      await tx((c) => adminsRepo.setRole(existing.id, role.id, existing.id, c));
      return existing.id;
    }
    const id = await tx((c) =>
      adminsRepo.insertAdmin({ nameEn: input.name.en, nameAr: input.name.ar, email: input.email, mobile: input.mobile ?? null, status: 'active', passwordHash: hash, invitedBy: null, roleId: role.id }, c),
    );
    void mirrorAuthUser({ userId: id, kind: 'admin', email: input.email });
    return id;
  },

  assertNotSelf(id: string, principal: AdminPrincipal): void {
    if (id === principal.userId) throw new ForbiddenError('SELF_ACTION');
  },
};
