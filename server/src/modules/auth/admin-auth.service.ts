/**
 * Admin authentication (AUTH-10..18): email + bcrypt password + optional/mandatory TOTP (otplib),
 * invites and password resets. Separate JWT audience `eduway-admin`.
 */
import bcrypt from 'bcryptjs';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { T } from '../../config/constants.js';
import { db } from '../../config/db.js';
import { env } from '../../config/env.js';
import { invalidatePrincipal } from '../../common/auth/principal.js';
import { signMfaChallengeToken, verifyMfaChallengeToken } from '../../common/auth/tokens.js';
import { BusinessRuleError, ForbiddenError, RateLimitError, UnauthorizedError } from '../../common/errors/index.js';
import { auditService } from '../../common/services/audit.js';
import { securityEvents } from '../../common/services/security-events.js';
import { settingsStore } from '../../common/services/settings-store.js';
import { hashToken, randomCode, randomToken } from '../../common/utils/crypto.js';
import { adminsRepo } from '../admins/repository.js';
import { adminUrl, emailAdmin } from '../notifications/email/recipients.js';
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

/**
 * New-device sign-in alert: the admin has signed in before, but never from this device id (or, without a device
 * id, this browser user agent). Checked before the new session row exists. Never throws.
 */
async function isNewAdminDevice(userId: string, meta: ClientMeta): Promise<boolean> {
  try {
    const r = await db.maybeOne<{ total: number; known: number }>(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE ($2::text IS NOT NULL AND device_id = $2) OR ($2::text IS NULL AND $3::text IS NOT NULL AND user_agent = $3))::int AS known
         FROM ${T.sessions} WHERE user_id = $1 AND audience = 'admin'`,
      [userId, meta.deviceId ?? null, meta.userAgent ?? null],
    );
    return !!r && r.total > 0 && r.known === 0;
  } catch {
    return false;
  }
}

/** Short device label from a user agent ("Chrome on Windows"). */
export function deviceLabel(ua: string | null | undefined): string {
  if (!ua) return '';
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad|iOS/.test(ua) ? 'iOS' : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return browser && os ? `${browser} on ${os}` : browser || os || ua.slice(0, 80);
}

async function issueAdminSession(row: AdminRow, meta: ClientMeta, remember: boolean): Promise<{ tokens: AuthTokens; me: MeAdminDto }> {
  const sec = await settingsStore.get('auth');
  const newDevice = await isNewAdminDevice(row.id, meta);
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
  if (newDevice) {
    void emailAdmin(row.id, 'admin_new_device_login', { at: new Date().toISOString(), ip: meta.ip, device: deviceLabel(meta.userAgent), sessionsLink: adminUrl('/profile') });
  }
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

const TOTP_STEP_SEC = 30;

/** The 30-s time step a valid TOTP code belongs to (window ±1), or null when the code is wrong. */
export function totpStep(secret: string | null, code: string, nowMs = Date.now()): number | null {
  if (!secret) return null;
  try {
    const checker = authenticator.clone(); // same window/step/digits, own clock
    checker.options = { epoch: nowMs };
    const delta = checker.checkDelta(code.replace(/\s/g, ''), secret);
    return delta === null ? null : Math.floor(nowMs / 1000 / TOTP_STEP_SEC) + delta;
  } catch {
    return null;
  }
}

/** SEC-26: a step is accepted only when it is newer than the last accepted one (no replay inside the window). */
export function totpStepAcceptable(lastUsedStep: number | string | null | undefined, step: number | null): boolean {
  if (step === null) return false;
  return lastUsedStep === null || lastUsedStep === undefined || step > Number(lastUsedStep);
}

/** Valid TOTP code AND its step was not used before — recorded atomically (two parallel logins cannot share it). */
async function consumeTotp(userId: string, secret: string | null, code: string): Promise<boolean> {
  const step = totpStep(secret, code);
  if (step === null) return false;
  const n = await db.exec(
    `UPDATE ${T.admin_users} SET mfa_last_used_step = $2 WHERE user_id = $1 AND (mfa_last_used_step IS NULL OR mfa_last_used_step < $2)`,
    [userId, step],
  );
  return n > 0;
}

/** Recovery codes are issued as `XXXXX-XXXXX` (no ambiguous characters); input is case/dash-insensitive. */
export function normalizeRecoveryCode(code: string): string | null {
  const c = code.replace(/[\s-]/g, '').toUpperCase();
  return /^[A-HJ-NP-Z2-9]{10}$/.test(c) ? `${c.slice(0, 5)}-${c.slice(5)}` : null;
}
export const recoveryCodeHash = (normalized: string): string => hashToken(normalized, 'mfa-recovery');

/** SEC-26: single-use recovery code — removed from the stored (hashed) list in the same statement that checks it. */
async function consumeRecoveryCode(userId: string, code: string): Promise<{ remaining: number } | null> {
  const norm = normalizeRecoveryCode(code);
  if (!norm) return null;
  const row = await db.maybeOne<{ remaining: number }>(
    `UPDATE ${T.admin_users} SET mfa_recovery_codes = array_remove(mfa_recovery_codes, $2)
      WHERE user_id = $1 AND $2 = ANY(mfa_recovery_codes) RETURNING cardinality(mfa_recovery_codes) AS remaining`,
    [userId, recoveryCodeHash(norm)],
  );
  return row ? { remaining: Number(row.remaining) } : null;
}

/** Second factor at login: a fresh TOTP code, or an unused recovery code. */
async function consumeSecondFactor(row: AdminRow, code: string): Promise<'totp' | 'recovery' | null> {
  if (/^\d{6}$/.test(code.replace(/\s/g, ''))) return (await consumeTotp(row.id, row.mfa_secret, code)) ? 'totp' : null;
  return (await consumeRecoveryCode(row.id, code)) ? 'recovery' : null;
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
    if (!input.totp) return { mfaRequired: true, mfaToken: signMfaChallengeToken(row.id, 'login'), mfaEnrollmentRequired: false };
    const method = await consumeSecondFactor(row, input.totp);
    if (!method) {
      await failLogin(email, meta, row);
    }
    const res = await issueAdminSession(row, meta, input.remember ?? true);
    await auditLogin(row, meta, method === 'recovery' ? 'Signed in with a 2FA recovery code' : 'Signed in with 2FA');
    return { mfaRequired: false, ...res };
  }
  if (security.adminMfaMandatory) return { mfaRequired: true, mfaToken: signMfaChallengeToken(row.id, 'enroll'), mfaEnrollmentRequired: true };
  const res = await issueAdminSession(row, meta, input.remember ?? true);
  await auditLogin(row, meta, 'Signed in');
  return { mfaRequired: false, ...res };
}

export async function adminMfaVerify(input: { mfaToken: string; code: string; remember?: boolean }, meta: ClientMeta) {
  const { userId } = verifyMfaChallengeToken(input.mfaToken, 'login');
  const row = await adminsService.getRow(userId);
  if (row.status !== 'active') throw new ForbiddenError('ACCOUNT_LOCKED');
  if (!row.mfa_enabled) throw new BusinessRuleError('MFA_NOT_PENDING');
  const mfaKey = row.email.toLowerCase();
  // SEC-02: the TOTP step-up has its own lockout (it was counted but never enforced → unlimited guessing
  // across IPs by anyone holding the password).
  await assertMfaNotLocked(mfaKey);
  const method = await consumeSecondFactor(row, input.code);
  if (!method) {
    const pol = await settingsStore.get('auth');
    const lock = await authRepo.registerFailure('admin_mfa', mfaKey, MFA_LOCKOUT_ATTEMPTS, pol.adminLockoutMinutes);
    if (lock.locked_until) {
      await securityEvents.record({ kind: 'admin_login_failure', severity: 'high', subjectLabel: row.name_en || row.email, userId: row.id, ip: meta.ip, detail: `${lock.failed_count} failed 2FA codes for ${row.email} — 2FA temporarily locked.` });
    }
    throw new UnauthorizedError('MFA_INVALID');
  }
  await authRepo.clearLockout('admin_mfa', mfaKey);
  const res = await issueAdminSession(row, meta, input.remember ?? true);
  await auditLogin(row, meta, method === 'recovery' ? 'Signed in with a 2FA recovery code' : 'Signed in with 2FA');
  return res;
}

/** Failed TOTP codes allowed before the step-up is locked for `adminLockoutMinutes`. */
export const MFA_LOCKOUT_ATTEMPTS = 5;

async function assertMfaNotLocked(key: string): Promise<void> {
  const lock = await authRepo.getLockout('admin_mfa', key);
  if (lock?.locked_until && lock.locked_until.getTime() > Date.now()) {
    const s = Math.ceil((lock.locked_until.getTime() - Date.now()) / 1000);
    throw new RateLimitError(s, 'ADMIN_LOCKED', { minutes: Math.ceil(s / 60) });
  }
}

export async function mfaSetup(userId: string, viaChallenge = false) {
  const row = await adminsService.getRow(userId);
  // SEC-01: the enrolment challenge token only proves the password — never let it replace an existing factor.
  if (viaChallenge && (row.mfa_enabled || row.status !== 'active')) throw new UnauthorizedError('MFA_INVALID');
  const secret = authenticator.generateSecret(20);
  await adminsRepo.updateAdminUser(userId, { mfa_pending_secret: secret });
  const otpauthUrl = authenticator.keyuri(row.email, 'EDUWAY Admin', secret);
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 240 });
  return { secret, otpauthUrl, qrDataUrl };
}

export async function mfaEnable(userId: string, code: string, meta?: ClientMeta, viaChallenge = false) {
  const row = await adminsService.getRow(userId);
  if (viaChallenge && (row.mfa_enabled || row.status !== 'active')) throw new UnauthorizedError('MFA_INVALID');
  if (!row.mfa_pending_secret) throw new BusinessRuleError('MFA_NOT_PENDING');
  await assertMfaNotLocked(row.email.toLowerCase());
  if (totpStep(row.mfa_pending_secret, code) === null) {
    await authRepo.registerFailure('admin_mfa', row.email.toLowerCase(), MFA_LOCKOUT_ATTEMPTS, (await settingsStore.get('auth')).adminLockoutMinutes);
    throw new UnauthorizedError('MFA_INVALID');
  }
  const recoveryCodes = Array.from({ length: 10 }, () => `${randomCode(5)}-${randomCode(5)}`);
  await adminsRepo.updateAdminUser(userId, {
    mfa_enabled: true,
    mfa_secret: row.mfa_pending_secret,
    mfa_pending_secret: null,
    mfa_enrolled_at: new Date(),
    mfa_last_used_step: null, // fresh factor; the finish-sign-in step may use the code currently shown
    mfa_recovery_codes: recoveryCodes.map((c) => recoveryCodeHash(c)),
  });
  void emailAdmin(userId, 'admin_mfa_enabled', { at: new Date().toISOString() });
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
  const okCode = input.code ? await consumeTotp(row.id, row.mfa_secret, input.code) : false;
  const okPw = input.password && row.password_hash ? await bcrypt.compare(input.password, row.password_hash) : false;
  if (!okCode && !okPw) throw new UnauthorizedError(input.code ? 'MFA_INVALID' : 'PASSWORD_INCORRECT');
  await adminsRepo.updateAdminUser(userId, { mfa_enabled: false, mfa_secret: null, mfa_pending_secret: null, mfa_recovery_codes: [], mfa_last_used_step: null });
  if (row.mfa_enabled) void emailAdmin(userId, 'admin_mfa_disabled', { at: new Date().toISOString() });
  return { mfaEnabled: false as const };
}

export async function forgotPassword(email: string, meta: ClientMeta): Promise<void> {
  const row = await adminsRepo.getByEmail(email.trim());
  if (!row || row.status !== 'active') return; // enumeration-safe
  const token = randomToken(32);
  const minutes = (await settingsStore.get('auth')).passwordResetExpiryMinutes;
  // Only the newest link works: earlier unused links are retired before the new one is issued.
  await authRepo.retireResets(row.id);
  await authRepo.insertReset(row.id, hashToken(token, 'reset'), minutes, meta.ip);
  const link = `${env.ADMIN_APP_URL.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(token)}`;
  await emailAdmin(row.id, 'admin_password_reset', { link, minutes });
}

export async function resetPassword(token: string, newPassword: string, meta?: ClientMeta): Promise<void> {
  const reset = await authRepo.findReset(hashToken(token, 'reset'));
  if (!reset) throw new BusinessRuleError('RESET_TOKEN_INVALID');
  await passwordPolicyCheck(newPassword);
  if (!(await authRepo.useReset(reset.id))) throw new BusinessRuleError('RESET_TOKEN_INVALID');
  await adminsRepo.updateAdminUser(reset.user_id, { password_hash: await hashPassword(newPassword), password_changed_at: new Date(), failed_login_count: 0 });
  await sessions.revokeAll(reset.user_id, 'password_reset');
  await authRepo.retireResets(reset.user_id);
  void emailAdmin(reset.user_id, 'admin_password_changed', { via: 'reset', at: new Date().toISOString(), ip: meta?.ip ?? null });
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
  if (!(await authRepo.acceptInvite(inv.id))) throw new BusinessRuleError('INVITE_INVALID');
  await adminsRepo.updateAdminUser(inv.user_id, { password_hash: await hashPassword(input.password), password_changed_at: new Date() });
  await adminsRepo.updateUser(inv.user_id, { status: 'active', ...(input.name ? { name_en: input.name.en, name_ar: input.name.ar } : {}) });
  const row = await adminsService.getRow(inv.user_id);
  await auditService.record({ actorId: row.id, actorName: row.name_en, actorRole: row.role_name_en ?? '', action: 'admin.accept_invite', entity: 'admin_user', entityId: row.id, summary: `${row.email} accepted the invitation`, ip: meta.ip, userAgent: meta.userAgent });
  const security = await settingsStore.get('security');
  const res = await issueAdminSession(row, meta, true);
  return { ...res, mfaEnrollmentRequired: security.adminMfaMandatory && !row.mfa_enabled };
}
