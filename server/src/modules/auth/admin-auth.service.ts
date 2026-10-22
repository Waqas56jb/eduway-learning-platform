/**
 * Admin authentication (AUTH-10..18): email + bcrypt password + optional/mandatory TOTP (otplib),
 * invites and password resets. Separate JWT audience `eduway-admin`.
 */
import bcrypt from 'bcryptjs';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { env } from '../../config/env.js';
import { invalidatePrincipal } from '../../common/auth/principal.js';
import { signMfaChallengeToken, verifyMfaChallengeToken } from '../../common/auth/tokens.js';
import { BusinessRuleError, ForbiddenError, RateLimitError, UnauthorizedError } from '../../common/errors/index.js';
import { mailer } from '../../common/providers/mail.js';
import { auditService } from '../../common/services/audit.js';
import { securityEvents } from '../../common/services/security-events.js';
import { settingsStore } from '../../common/services/settings-store.js';
import { hashToken, randomCode, randomToken } from '../../common/utils/crypto.js';
import { adminsRepo } from '../admins/repository.js';
import { adminsService, hashPassword, passwordPolicyCheck } from '../admins/service.js';
import type { AdminRow, MeAdminDto } from '../admins/types.js';
import type { ClientMeta } from './student-auth.service.js';
import { authRepo } from './repository.js';
import { sessions, type AuthTokens } from './sessions.js';

authenticator.options = { window: 1, step: 30, digits: 6 };

// Dummy hash so unknown emails take the same time as wrong passwords (timing-safe enumeration defence).
let dummyHash: string | null = null;
const getDummyHash = async () => (dummyHash ??= await bcrypt.hash(randomToken(16), 12));

export type AdminLoginResult =
  | { mfaRequired: true; mfaToken: string; mfaEnrollmentRequired: boolean }
  | { mfaRequired: false; tokens: AuthTokens; me: MeAdminDto };

async function issueAdminSession(row: AdminRow, meta: ClientMeta, remember: boolean): Promise<{ tokens: AuthTokens; me: MeAdminDto }> {
  const sec = await settingsStore.get('auth');
  const { tokens } = await sessions.create({
    userId: row.id,
    audience: 'admin',
    platform: 'admin',
    deviceId: meta.deviceId,
    ip: meta.ip,
    userAgent: meta.userAgent,
    remember,
    refreshTtlMs: remember ? sec.rememberRefreshDays * 86_400_000 : sec.shortRefreshHours * 3600_000,
  });
  await adminsRepo.updateAdminUser(row.id, { last_login_at: new Date(), last_login_ip: meta.ip, failed_login_count: 0 });
  await authRepo.clearLockout('admin_login', row.email.toLowerCase());
  invalidatePrincipal(row.id);
  return { tokens, me: await adminsService.me(row.id) };
}

async function auditLogin(row: AdminRow, meta: ClientMeta, summary: string): Promise<void> {
  await auditService.record({
    actorId: row.id,
    actorName: row.name_en,
    actorRole: row.role_name_en ?? '',
    action: 'auth.login',
    entity: 'session',
    entityId: row.id,
    summary,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
}

function verifyTotp(secret: string | null, code: string): boolean {
  if (!secret) return false;
  try {
    return authenticator.verify({ token: code.replace(/\s/g, ''), secret });
  } catch {
    return false;
  }
}

async function failLogin(email: string, meta: ClientMeta, row: AdminRow | null): Promise<never> {
  const pol = await settingsStore.get('auth');
  const lock = await authRepo.registerFailure('admin_login', email.toLowerCase(), pol.adminLockoutAttempts, pol.adminLockoutMinutes);
  if (lock.failed_count >= Math.max(3, pol.adminLockoutAttempts - 1)) {
    await securityEvents.record({
      kind: 'admin_login_failure',
      severity: lock.locked_until ? 'high' : 'medium',
      subjectLabel: row?.name_en || email,
      userId: row?.id ?? null,
      ip: meta.ip,
      detail: `${lock.failed_count} failed admin sign-in attempts for ${email}${lock.locked_until ? ' — account temporarily locked' : ''}.`,
    });
  }
  throw new UnauthorizedError('INVALID_CREDENTIALS');
}

export async function adminLogin(input: { email: string; password: string; totp?: string; remember?: boolean }, meta: ClientMeta): Promise<AdminLoginResult> {
  const email = input.email.trim().toLowerCase();
  const lock = await authRepo.getLockout('admin_login', email);
  if (lock?.locked_until && lock.locked_until.getTime() > Date.now()) {
    const s = Math.ceil((lock.locked_until.getTime() - Date.now()) / 1000);
    throw new RateLimitError(s, 'ADMIN_LOCKED', { minutes: Math.ceil(s / 60) });
  }
  const row = await adminsRepo.getByEmail(email);
  const ok = await bcrypt.compare(input.password, row?.password_hash ?? (await getDummyHash()));
  if (!row || !row.password_hash || !ok) return failLogin(email, meta, row);
  if (row.status === 'deactivated' || row.status === 'locked') throw new ForbiddenError('ACCOUNT_LOCKED');

  const security = await settingsStore.get('security');
  if (row.mfa_enabled) {
    if (!input.totp) return { mfaRequired: true, mfaToken: signMfaChallengeToken(row.id), mfaEnrollmentRequired: false };
    if (!verifyTotp(row.mfa_secret, input.totp)) {
      await failLogin(email, meta, row);
    }
    const res = await issueAdminSession(row, meta, input.remember ?? true);
    await auditLogin(row, meta, 'Signed in with 2FA');
    return { mfaRequired: false, ...res };
  }
  if (security.adminMfaMandatory) return { mfaRequired: true, mfaToken: signMfaChallengeToken(row.id), mfaEnrollmentRequired: true };
  const res = await issueAdminSession(row, meta, input.remember ?? true);
  await auditLogin(row, meta, 'Signed in');
  return { mfaRequired: false, ...res };
}

export async function adminMfaVerify(input: { mfaToken: string; code: string; remember?: boolean }, meta: ClientMeta) {
  const { userId } = verifyMfaChallengeToken(input.mfaToken);
  const row = await adminsService.getRow(userId);
  if (row.status !== 'active') throw new ForbiddenError('ACCOUNT_LOCKED');
  if (!row.mfa_enabled) throw new BusinessRuleError('MFA_NOT_PENDING');
  if (!verifyTotp(row.mfa_secret, input.code)) {
    await authRepo.registerFailure('admin_mfa', row.email.toLowerCase(), 10, 15);
    throw new UnauthorizedError('MFA_INVALID');
  }
  const res = await issueAdminSession(row, meta, input.remember ?? true);
  await auditLogin(row, meta, 'Signed in with 2FA');
  return res;
}

export async function mfaSetup(userId: string) {
  const row = await adminsService.getRow(userId);
  const secret = authenticator.generateSecret(20);
  await adminsRepo.updateAdminUser(userId, { mfa_pending_secret: secret });
  const otpauthUrl = authenticator.keyuri(row.email, 'EDUWAY Admin', secret);
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 240 });
  return { secret, otpauthUrl, qrDataUrl };
}

export async function mfaEnable(userId: string, code: string, meta?: ClientMeta, viaChallenge = false) {
  const row = await adminsService.getRow(userId);
  if (!row.mfa_pending_secret) throw new BusinessRuleError('MFA_NOT_PENDING');
  if (!verifyTotp(row.mfa_pending_secret, code)) throw new UnauthorizedError('MFA_INVALID');
  const recoveryCodes = Array.from({ length: 10 }, () => `${randomCode(5)}-${randomCode(5)}`);
  await adminsRepo.updateAdminUser(userId, {
    mfa_enabled: true,
    mfa_secret: row.mfa_pending_secret,
    mfa_pending_secret: null,
    mfa_enrolled_at: new Date(),
    mfa_recovery_codes: recoveryCodes.map((c) => hashToken(c, 'mfa-recovery')),
  });
  const result: { mfaEnabled: true; recoveryCodes: string[]; tokens?: AuthTokens; me?: MeAdminDto } = { mfaEnabled: true, recoveryCodes };
  if (viaChallenge && meta) {
    const fresh = await adminsService.getRow(userId);
    Object.assign(result, await issueAdminSession(fresh, meta, true));
  }
  return result;
}

export async function mfaDisable(userId: string, input: { code?: string; password?: string }) {
  const security = await settingsStore.get('security');
  if (security.adminMfaMandatory) throw new BusinessRuleError('MFA_REQUIRED');
  const row = await adminsService.getRow(userId);
  const okCode = input.code ? verifyTotp(row.mfa_secret, input.code) : false;
  const okPw = input.password && row.password_hash ? await bcrypt.compare(input.password, row.password_hash) : false;
  if (!okCode && !okPw) throw new UnauthorizedError(input.code ? 'MFA_INVALID' : 'PASSWORD_INCORRECT');
  await adminsRepo.updateAdminUser(userId, { mfa_enabled: false, mfa_secret: null, mfa_pending_secret: null, mfa_recovery_codes: [] });
  return { mfaEnabled: false as const };
}

export async function forgotPassword(email: string, meta: ClientMeta): Promise<void> {
  const row = await adminsRepo.getByEmail(email.trim());
  if (!row || row.status !== 'active') return; // enumeration-safe
  const token = randomToken(32);
  const minutes = (await settingsStore.get('auth')).passwordResetExpiryMinutes;
  await authRepo.insertReset(row.id, hashToken(token, 'reset'), minutes, meta.ip);
  const link = `${env.ADMIN_APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
  await mailer.send({
    to: row.email,
    subject: 'Reset your EDUWAY admin password',
    text: `A password reset was requested for your EDUWAY admin account.\n\nReset it here (valid ${minutes} minutes):\n${link}\n\nIf you did not request this, ignore this email.`,
  });
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const reset = await authRepo.findReset(hashToken(token, 'reset'));
  if (!reset) throw new BusinessRuleError('RESET_TOKEN_INVALID');
  await passwordPolicyCheck(newPassword);
  await authRepo.useReset(reset.id);
  await adminsRepo.updateAdminUser(reset.user_id, { password_hash: await hashPassword(newPassword), password_changed_at: new Date(), failed_login_count: 0 });
  await sessions.revokeAll(reset.user_id, 'password_reset');
}

export async function inviteInfo(token: string) {
  const inv = await authRepo.findInvite(hashToken(token, 'invite'));
  if (!inv) throw new BusinessRuleError('INVITE_INVALID');
  const row = await adminsService.getRow(inv.user_id);
  return { email: row.email, name: { en: row.name_en, ar: row.name_ar || row.name_en }, roleName: { en: row.role_name_en ?? '', ar: row.role_name_ar ?? '' }, expiresAt: inv.expires_at.toISOString() };
}

export async function acceptInvite(input: { token: string; password: string; name?: { en: string; ar: string } }, meta: ClientMeta) {
  const inv = await authRepo.findInvite(hashToken(input.token, 'invite'));
  if (!inv) throw new BusinessRuleError('INVITE_INVALID');
  await passwordPolicyCheck(input.password);
  await authRepo.acceptInvite(inv.id);
  await adminsRepo.updateAdminUser(inv.user_id, { password_hash: await hashPassword(input.password), password_changed_at: new Date() });
  await adminsRepo.updateUser(inv.user_id, { status: 'active', ...(input.name ? { name_en: input.name.en, name_ar: input.name.ar } : {}) });
  const row = await adminsService.getRow(inv.user_id);
  await auditService.record({ actorId: row.id, actorName: row.name_en, actorRole: row.role_name_en ?? '', action: 'admin.accept_invite', entity: 'admin_user', entityId: row.id, summary: `${row.email} accepted the invitation`, ip: meta.ip, userAgent: meta.userAgent });
  const security = await settingsStore.get('security');
  const res = await issueAdminSession(row, meta, true);
  return { ...res, mfaEnrollmentRequired: security.adminMfaMandatory && !row.mfa_enabled };
}
