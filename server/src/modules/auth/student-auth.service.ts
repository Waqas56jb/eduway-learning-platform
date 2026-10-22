/**
 * Student phone-OTP authentication (AUTH-01..08). Limits (expiry, resend, attempts, lockout, device limit,
 * session timeout) come from settings — never constants.
 */
import { T, type ClientPlatform, type StudentPlatform } from '../../config/constants.js';
import { db, tx, type TxClient } from '../../config/db.js';
import { devFlags } from '../../config/env.js';
import { invalidatePrincipal } from '../../common/auth/principal.js';
import { AppError, BusinessRuleError, ConflictError, ForbiddenError, NotFoundError, RateLimitError, UnauthorizedError } from '../../common/errors/index.js';
import { smsProvider } from '../../common/providers/sms.js';
import { mirrorAuthUser } from '../../common/services/auth-mirror.js';
import { resolveReferralCode } from '../../common/services/referrals.js';
import { securityEvents } from '../../common/services/security-events.js';
import { settingsStore } from '../../common/services/settings-store.js';
import { hashToken, randomNumericCode, safeEqual } from '../../common/utils/crypto.js';
import { maskPhone } from '../../common/utils/phone.js';
import type { StudentPrincipal } from '../../common/types/index.js';
import { firstWord, usersService } from '../users/service.js';
import type { MeStudentDto, StudentUser } from '../users/types.js';
import { onStudentEmailChanged } from '../users/email-verification.js';
import { authRepo, type OtpRow } from './repository.js';
import { sessions, toSessionDto, type AuthTokens } from './sessions.js';

export interface ClientMeta {
  ip: string | null;
  userAgent: string | null;
  platform: ClientPlatform | null;
  deviceId: string | null;
}

export interface RegisterDto {
  name: string;
  governorateId: string;
  schoolId?: string | null;
  schoolName?: string | null;
  referralCode?: string | null;
  acceptTerms: true;
  acceptedLegal: { doc: 'terms' | 'privacy'; version: string }[];
  language?: 'en' | 'ar';
  email?: string | null;
  gender?: 'male' | 'female' | null;
}

export const otpHash = (phone: string, code: string) => hashToken(`${phone}:${code}`, 'otp');
const secondsUntil = (d: Date) => Math.max(1, Math.ceil((d.getTime() - Date.now()) / 1000));

async function assertNotLocked(phone: string): Promise<void> {
  const lock = await authRepo.getLockout('otp', phone);
  if (lock?.locked_until && lock.locked_until.getTime() > Date.now()) {
    const s = secondsUntil(lock.locked_until);
    throw new RateLimitError(s, 'OTP_LOCKED', { minutes: Math.ceil(s / 60) });
  }
}

export function isDevBypass(otp: { devBypassCode: string | null; devBypassPhones: string[]; devBypassAllPhones: boolean }, phone: string, code: string): boolean {
  // SEC-21: explicit opt-in (DEV_OTP_BYPASS / explicit NODE_ENV=development), never in production.
  if (!devFlags.otpBypass || !otp.devBypassCode) return false;
  return code === otp.devBypassCode && (otp.devBypassAllPhones || otp.devBypassPhones.includes(phone));
}

/**
 * Pure resend rule (unit-tested): cooldown since the last send, then max sends per rolling window.
 * Returns null when a new code may be sent, else the 429 reason + seconds to wait.
 */
export function evaluateResend(input: {
  now: number;
  lastSentAt: Date | null;
  cooldownSeconds: number;
  sendsInWindow: number;
  oldestInWindow: Date | null;
  resendLimit: number;
  windowMinutes: number;
}): { reason: 'OTP_RESEND_COOLDOWN' | 'OTP_RESEND_LIMIT'; retryAfterSeconds: number } | null {
  if (input.lastSentAt) {
    const next = input.lastSentAt.getTime() + input.cooldownSeconds * 1000;
    if (next > input.now) return { reason: 'OTP_RESEND_COOLDOWN', retryAfterSeconds: Math.ceil((next - input.now) / 1000) };
  }
  if (input.sendsInWindow >= input.resendLimit) {
    const reset = (input.oldestInWindow?.getTime() ?? input.now) + input.windowMinutes * 60_000;
    return { reason: 'OTP_RESEND_LIMIT', retryAfterSeconds: Math.max(1, Math.ceil((reset - input.now) / 1000)) };
  }
  return null;
}

// ── AUTH-01 ─────────────────────────────────────────────────────────────────────────────────────────
export async function sendOtp(input: { phone: string; purpose: 'login' | 'register'; channel?: 'sms' | 'whatsapp'; locale?: 'en' | 'ar' }, meta: ClientMeta) {
  const { phone, purpose } = input;
  const user = await authRepo.findStudentByPhone(phone);
  const registered = !!user && user.profile_completed === true;
  if (purpose === 'login' && !user) throw new BusinessRuleError('ACCOUNT_NOT_FOUND');
  if (purpose === 'register' && registered) throw new ConflictError('ACCOUNT_EXISTS');
  if (user && user.status !== 'active') throw new ForbiddenError('ACCOUNT_LOCKED');
  await assertNotLocked(phone);

  const otp = await settingsStore.get('otp');
  const active = await authRepo.latestActiveOtp(phone);
  const window = await authRepo.sendsInWindow(phone, otp.resendWindowMinutes);
  const blocked = evaluateResend({
    now: Date.now(),
    lastSentAt: active?.last_sent_at ?? null,
    cooldownSeconds: otp.resendCooldownSeconds,
    sendsInWindow: window.sends,
    oldestInWindow: window.oldest,
    resendLimit: otp.resendLimit,
    windowMinutes: otp.resendWindowMinutes,
  });
  if (blocked) throw new RateLimitError(blocked.retryAfterSeconds, blocked.reason);

  const code = randomNumericCode(otp.codeLength);
  await authRepo.invalidateActive(phone);
  const provider = smsProvider();
  // No explicit channel → WhatsApp when the linked WhatsApp number (Baileys) is connected, else SMS.
  const channel = input.channel ?? (await provider.otpDefaultChannel());
  const row = await authRepo.insertOtp({
    phone,
    purpose,
    codeHash: otpHash(phone, code),
    maxAttempts: otp.maxAttempts,
    expiresAt: new Date(Date.now() + otp.expirySeconds * 1000),
    ip: meta.ip,
    ua: meta.userAgent,
    provider: provider.nameFor(channel),
    channel,
  });
  const minutes = Math.max(1, Math.round(otp.expirySeconds / 60));
  const tpl = await db.maybeOne<{ body_en: string; body_ar: string }>(
    `SELECT body_en, body_ar FROM ${T.notification_templates} WHERE type = 'otp' AND active ORDER BY (channel = $1) DESC LIMIT 1`,
    [channel],
  );
  const text = (tpl?.body_ar ?? 'إيدوواي: رمز التحقق الخاص بك هو {otp_code}. ينتهي خلال {minutes} دقائق.').replace('{otp_code}', code).replace('{minutes}', String(minutes));
  const locale = user?.locale === 'en' || user?.locale === 'ar' ? user.locale : (input.locale ?? 'ar');
  let sentChannel: 'sms' | 'whatsapp' = channel;
  try {
    const res = await provider.send({ to: phone, text, channel, devCode: code, locale, ttlSeconds: otp.expirySeconds, otpId: row.id });
    // A WhatsApp OTP may have fallen back to SMS (number not on WhatsApp / session disconnected): record + report it.
    if (res.channel && res.channel !== channel) {
      sentChannel = res.channel;
      await authRepo.setOtpChannel(row.id, res.channel, res.provider ?? provider.nameFor(res.channel));
    }
  } catch {
    await authRepo.deleteOtp(row.id);
    throw new AppError('INTERNAL', 502, { reason: 'OTP_SEND_FAILED' });
  }
  return {
    phone,
    maskedPhone: maskPhone(phone),
    purpose,
    isRegistered: registered,
    codeLength: otp.codeLength,
    expiresInSeconds: otp.expirySeconds,
    resendInSeconds: otp.resendCooldownSeconds,
    resendsLeft: Math.max(0, otp.resendLimit - window.sends - 1),
    channel: sentChannel,
  };
}

// ── code verification (does not consume) ───────────────────────────────────────────────────────────
async function checkCode(phone: string, code: string, ip: string | null): Promise<OtpRow | null> {
  await assertNotLocked(phone);
  const otp = await settingsStore.get('otp');
  const row = await authRepo.latestActiveOtp(phone);
  if (isDevBypass(otp, phone, code)) return row;
  if (!row) throw new UnauthorizedError('OTP_EXPIRED');
  if (row.expires_at.getTime() <= Date.now()) throw new UnauthorizedError('OTP_EXPIRED');
  // A code whose attempt budget is spent is dead even if a parallel request has not invalidated it yet.
  if (row.attempts >= row.max_attempts) throw new UnauthorizedError('OTP_EXPIRED');
  if (safeEqual(row.code_hash, otpHash(phone, code))) return row;

  const updated = await authRepo.incrementOtpAttempts(row.id);
  const lock = await authRepo.registerFailure('otp', phone, otp.lockoutThreshold, otp.lockoutMinutes);
  const attemptsLeft = Math.max(0, updated.max_attempts - updated.attempts);
  if (attemptsLeft === 0 || lock.locked_until) {
    await authRepo.invalidateActive(phone);
    if (!lock.locked_until) await authRepo.lockNow('otp', phone, otp.lockoutMinutes);
    await securityEvents.record({
      kind: 'otp_bruteforce',
      severity: lock.failed_count >= otp.lockoutThreshold ? 'critical' : 'high',
      subjectLabel: maskPhone(phone),
      detail: `${lock.failed_count} failed OTP attempts. Mobile number temporarily locked for ${otp.lockoutMinutes} minutes.`,
      ip,
      meta: { phone: maskPhone(phone) },
    });
    throw new RateLimitError(otp.lockoutMinutes * 60, 'OTP_LOCKED', { minutes: otp.lockoutMinutes });
  }
  throw new UnauthorizedError('OTP_INVALID', { attemptsLeft });
}

// ── registration (shared by AUTH-02 register and AUTH-03) ───────────────────────────────────────────
async function applyRegistration(c: TxClient, userId: string, phone: string, reg: RegisterDto, meta: ClientMeta): Promise<void> {
  if (!reg.acceptTerms) throw new BusinessRuleError('TERMS_NOT_ACCEPTED');
  const gov = await db.maybeOne<{ id: string }>(`SELECT id FROM ${T.governorates} WHERE code = $1`, [reg.governorateId], c);
  if (!gov) throw new AppError('VALIDATION_ERROR', 400, { reason: 'GOVERNORATE_INVALID', details: { fields: { governorateId: 'invalid' } } });

  let schoolId = reg.schoolId ?? null;
  if (schoolId) {
    const ok = await db.scalar<number>(`SELECT count(*)::int FROM ${T.schools} WHERE id = $1 AND deleted_at IS NULL`, [schoolId], c);
    if (!ok) throw new NotFoundError('school');
  }
  let source: 'organic' | 'school' | 'marketer' | 'referral' | 'campaign' = schoolId ? 'school' : 'organic';
  let marketerId: string | null = null;
  let referral: string | null = null;
  if (reg.referralCode) {
    const ref = await resolveReferralCode(reg.referralCode, c);
    if (!ref) throw new BusinessRuleError('REFERRAL_CODE_INVALID');
    referral = ref.code;
    source = ref.kind;
    marketerId = ref.marketerId;
    if (ref.schoolId && !schoolId) schoolId = ref.schoolId;
  }
  if (schoolId && !marketerId) {
    marketerId = (await db.scalar<string>(`SELECT marketer_id FROM ${T.marketer_schools} WHERE school_id = $1 AND unassigned_at IS NULL`, [schoolId], c)) ?? null;
  }

  const name = reg.name.trim();
  await db.query(
    `UPDATE ${T.users} SET name_en = $2, name_ar = $2, locale = COALESCE($3, locale), email = COALESCE($4, email) WHERE id = $1`,
    [userId, name, reg.language ?? null, reg.email?.toLowerCase() ?? null],
    c,
  );
  await db.query(
    `INSERT INTO ${T.student_profiles} (user_id, first_name_en, first_name_ar, gender, governorate_id, school_id, school_name, source, referral_code, marketer_id, registered_platform, profile_completed)
     VALUES ($1,$2,$2,$3,$4,$5,$6,$7,$8,$9,$10,true)
     ON CONFLICT (user_id) DO UPDATE SET first_name_en = EXCLUDED.first_name_en, first_name_ar = EXCLUDED.first_name_ar, gender = EXCLUDED.gender,
       governorate_id = EXCLUDED.governorate_id, school_id = EXCLUDED.school_id, school_name = EXCLUDED.school_name, source = EXCLUDED.source,
       referral_code = EXCLUDED.referral_code, marketer_id = EXCLUDED.marketer_id, profile_completed = true`,
    [userId, firstWord(name), reg.gender ?? null, gov.id, schoolId, schoolId ? null : (reg.schoolName?.trim() || null), source, referral, marketerId, meta.platform === 'admin' ? null : meta.platform],
    c,
  );
  if (schoolId) {
    await db.query(
      `INSERT INTO ${T.school_students} (school_id, user_id, marketer_id, source, referral_code_used) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (user_id) DO UPDATE SET school_id = EXCLUDED.school_id, marketer_id = EXCLUDED.marketer_id`,
      [schoolId, userId, marketerId, referral ? 'code' : 'picker', referral],
      c,
    );
  }
  // Legal acceptance: the current published versions (the form showed them).
  const current = await authRepo.currentLegal(c);
  for (const doc of current) {
    const accepted = reg.acceptedLegal.find((a) => a.doc === doc.doc_type);
    if (accepted && accepted.version !== doc.version) throw new BusinessRuleError('LEGAL_VERSION_NOT_CURRENT', { doc: doc.doc_type, version: doc.version });
    await authRepo.acceptLegal(userId, doc.id, meta.ip, meta.platform === 'admin' ? null : meta.platform, c);
  }
  await db.query(`INSERT INTO ${T.streaks} (user_id) VALUES ($1) ON CONFLICT DO NOTHING`, [userId], c);
  void phone;
}

async function enforceDeviceLimit(userId: string, deviceId: string | null, revokeSessionId: string | null | undefined, ip: string | null): Promise<void> {
  const app = await settingsStore.app();
  let active = await sessions.listActive(userId);
  // Same device signing in again replaces its previous session.
  if (deviceId) {
    for (const s of active.filter((x) => x.device_id === deviceId)) await sessions.revoke(s.id, 'replaced_same_device');
    active = active.filter((x) => x.device_id !== deviceId);
  }
  // Session inactivity timeout.
  const timeoutMs = app.sessionTimeoutMinutes * 60_000;
  for (const s of active.filter((x) => Date.now() - x.last_seen_at.getTime() > timeoutMs)) await sessions.revoke(s.id, 'inactive_timeout');
  active = active.filter((x) => Date.now() - x.last_seen_at.getTime() <= timeoutMs);
  if (active.length < app.deviceLimit) return;
  if (revokeSessionId && active.some((s) => s.id === revokeSessionId)) {
    await sessions.revoke(revokeSessionId, 'device_limit_swap', userId);
    if (active.length - 1 < app.deviceLimit) return;
  }
  await securityEvents.record({
    kind: 'multiple_devices',
    severity: 'medium',
    subjectLabel: userId,
    userId,
    ip,
    detail: `Sign-in attempt from a new device while ${active.length} devices are active (limit ${app.deviceLimit}).`,
  });
  throw new BusinessRuleError('DEVICE_LIMIT_REACHED', { limit: app.deviceLimit, sessions: active.map((s) => toSessionDto(s)) });
}

async function issueStudentSession(userId: string, platform: StudentPlatform, meta: ClientMeta & { deviceName?: string | null }): Promise<AuthTokens> {
  const deviceId = meta.deviceId;
  if (deviceId) {
    const blocked = await authRepo.isDeviceBlocked(userId, deviceId);
    if (blocked) throw new ForbiddenError('ACCOUNT_LOCKED', { device: 'blocked' });
  }
  const { session, tokens } = await sessions.create({ userId, audience: 'student', platform, deviceId, deviceName: meta.deviceName, ip: meta.ip, userAgent: meta.userAgent });
  if (deviceId) await authRepo.upsertDevice({ userId, deviceId, platform, name: session.device_name ?? 'Device', ip: meta.ip, ua: meta.userAgent });
  await authRepo.touchUser(userId);
  return tokens;
}

export interface VerifyOtpInput {
  phone: string;
  code: string;
  purpose: 'login' | 'register';
  deviceId: string;
  platform: StudentPlatform;
  deviceName?: string;
  registration?: RegisterDto;
  revokeSessionId?: string;
}

export interface VerifyOtpResult {
  tokens: AuthTokens;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: StudentUser;
  isNewUser: boolean;
  me: MeStudentDto;
}

// ── AUTH-02 ─────────────────────────────────────────────────────────────────────────────────────────
export async function verifyOtp(input: VerifyOtpInput, meta: ClientMeta): Promise<VerifyOtpResult> {
  const { phone } = input;
  const otpRow = await checkCode(phone, input.code, meta.ip);
  let user = await authRepo.findStudentByPhone(phone);
  if (user && user.status !== 'active') throw new ForbiddenError('ACCOUNT_LOCKED');
  if (input.purpose === 'login' && !user) throw new BusinessRuleError('ACCOUNT_NOT_FOUND');
  if (input.purpose === 'register' && user?.profile_completed) throw new ConflictError('ACCOUNT_EXISTS');
  if (input.purpose === 'register' && !input.registration) {
    throw new AppError('VALIDATION_ERROR', 400, { details: { fields: { registration: 'required' } } });
  }
  const clientMeta = { ...meta, deviceId: input.deviceId, platform: input.platform };
  if (user) await enforceDeviceLimit(user.id, input.deviceId, input.revokeSessionId, meta.ip);

  let isNewUser = false;
  const registersEmail = !!input.registration?.email && !user?.profile_completed;
  const userId = await tx(async (c) => {
    // SEC-04: single-use under concurrency (dev-bypass logins may proceed without a code row).
    if (otpRow && !(await authRepo.consumeOtp(otpRow.id, c)) && !isDevBypass(await settingsStore.get('otp'), phone, input.code)) {
      throw new UnauthorizedError('OTP_EXPIRED');
    }
    let id = user?.id;
    if (!id) {
      const created = await db.one<{ id: string }>(
        `INSERT INTO ${T.users} (kind, phone, name_en, name_ar, locale, status) VALUES ('student', $1, '', '', $2, 'active') RETURNING id`,
        [phone, input.registration?.language ?? 'ar'],
        c,
      );
      id = created.id;
      isNewUser = true;
    }
    if (input.registration && !user?.profile_completed) await applyRegistration(c, id, phone, input.registration, clientMeta);
    return id;
  });
  await authRepo.clearLockout('otp', phone);
  if (isNewUser) void mirrorAuthUser({ userId, kind: 'student', phone });
  if (registersEmail) void onStudentEmailChanged(userId, meta.ip);
  user = await authRepo.findStudentByPhone(phone);

  const tokens = await issueStudentSession(userId, input.platform, { ...clientMeta, deviceName: input.deviceName });
  invalidatePrincipal(userId);
  const me = await usersService.me(userId);
  return { tokens, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, expiresIn: tokens.expiresIn, user: me.user, isNewUser, me };
}

// ── AUTH-03 ─────────────────────────────────────────────────────────────────────────────────────────
export async function completeRegistration(principal: StudentPrincipal, reg: RegisterDto, meta: ClientMeta): Promise<MeStudentDto> {
  const profile = await db.maybeOne<{ profile_completed: boolean; phone: string }>(
    `SELECT COALESCE(sp.profile_completed, false) AS profile_completed, u.phone FROM ${T.users} u LEFT JOIN ${T.student_profiles} sp ON sp.user_id = u.id WHERE u.id = $1`,
    [principal.userId],
  );
  if (!profile) throw new NotFoundError('student');
  if (profile.profile_completed) throw new ConflictError('PROFILE_ALREADY_COMPLETE');
  await tx((c) => applyRegistration(c, principal.userId, profile.phone, reg, meta));
  if (reg.email) void onStudentEmailChanged(principal.userId, meta.ip);
  invalidatePrincipal(principal.userId);
  return usersService.me(principal.userId);
}

// ── AUTH-08 ─────────────────────────────────────────────────────────────────────────────────────────
export async function acceptLegal(principal: StudentPrincipal, documents: { doc: 'terms' | 'privacy'; version: string }[], meta: ClientMeta) {
  const current = await authRepo.currentLegal();
  for (const d of documents) {
    const doc = current.find((c) => c.doc_type === d.doc);
    if (!doc || doc.version !== d.version) throw new BusinessRuleError('LEGAL_VERSION_NOT_CURRENT', { doc: d.doc, version: doc?.version ?? null });
    await authRepo.acceptLegal(principal.userId, doc.id, meta.ip, meta.platform === 'admin' ? null : meta.platform);
  }
  invalidatePrincipal(principal.userId);
  const pending = await db.many<{ doc: 'terms' | 'privacy'; version: string }>(
    `SELECT d.doc_type AS doc, d.version FROM ${T.legal_documents} d
      WHERE d.status = 'published' AND d.requires_acceptance
        AND NOT EXISTS (SELECT 1 FROM ${T.legal_acceptances} a WHERE a.user_id = $1 AND a.document_id = d.id)`,
    [principal.userId],
  );
  return { pendingLegal: pending };
}
