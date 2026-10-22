import type { Request } from 'express';
import { STUDENT_PLATFORMS, type StudentPlatform } from '../../config/constants.js';
import { resolveAdmin } from '../../common/auth/principal.js';
import { extractBearer, peekAudience, verifyAccessToken, verifyMfaChallengeToken } from '../../common/auth/tokens.js';
import { AppError, UnauthorizedError } from '../../common/errors/index.js';
import { OK } from '../../common/dto/refs.js';
import type { AdminPrincipal, StudentPrincipal } from '../../common/types/index.js';
import type { z } from '../../common/validation/zod.js';
import * as auth from './service.js';
import type { ClientMeta } from './service.js';
import type { verifyOtpBody } from './schemas.js';

export function clientMeta(req: Request): ClientMeta {
  return { ip: req.ip ?? null, userAgent: req.get('user-agent') ?? null, platform: req.clientPlatform, deviceId: req.deviceId };
}

/** MFA setup/enable accept an admin access token OR the 5-minute mfaToken (forced enrolment). */
async function mfaActor(req: Request): Promise<{ userId: string; viaChallenge: boolean }> {
  const token = extractBearer(req.get('authorization'));
  if (!token) throw new UnauthorizedError();
  if (peekAudience(token) === 'admin') {
    const claims = verifyAccessToken(token, 'admin');
    req.admin = await resolveAdmin(claims.sub, claims.sid);
    return { userId: req.admin.userId, viaChallenge: false };
  }
  return { userId: verifyMfaChallengeToken(token, 'enroll').userId, viaChallenge: true };
}

export const authController = {
  sendOtp: (req: Request, body: { phone: string; purpose: 'login' | 'register'; channel?: 'sms' | 'whatsapp' }) => auth.sendOtp({ ...body, locale: req.locale }, clientMeta(req)),

  verifyOtp(req: Request, body: z.infer<typeof verifyOtpBody>) {
    const deviceId = body.deviceId ?? req.deviceId;
    const platform = (body.platform ?? req.clientPlatform) as StudentPlatform | null;
    if (!deviceId || !platform || !(STUDENT_PLATFORMS as readonly string[]).includes(platform)) {
      throw new AppError('VALIDATION_ERROR', 400, { details: { fields: { ...(deviceId ? {} : { deviceId: 'required' }), ...(platform ? {} : { platform: 'required' }) } } });
    }
    return auth.verifyOtp({ ...body, deviceId, platform }, { ...clientMeta(req), deviceId, platform });
  },

  register: (req: Request, student: StudentPrincipal, body: auth.RegisterDto) => auth.completeRegistration(student, body, clientMeta(req)),
  refresh: (req: Request, refreshToken: string) => auth.refresh(refreshToken, clientMeta(req)),

  async logout(req: Request, refreshToken?: string) {
    const principal = req.admin ?? req.student;
    if (!principal) throw new UnauthorizedError();
    await auth.logout(principal, refreshToken);
    if (req.admin) req.audit = { action: 'auth.logout', entity: 'session', entityId: req.admin.sessionId, summary: 'Signed out' };
    return OK;
  },

  logoutAll(req: Request, keepCurrent: boolean) {
    const principal = req.admin ?? req.student;
    if (!principal) throw new UnauthorizedError();
    return auth.logoutAll(principal, keepCurrent);
  },

  me: (req: Request) => auth.me({ student: req.student, admin: req.admin }),
  acceptLegal: (req: Request, student: StudentPrincipal, documents: { doc: 'terms' | 'privacy'; version: string }[]) => auth.acceptLegal(student, documents, clientMeta(req)),

  adminLogin: (req: Request, body: { email: string; password: string; totp?: string; remember?: boolean }) => auth.adminLogin(body, { ...clientMeta(req), platform: 'admin' }),
  adminMfaVerify: (req: Request, body: { mfaToken: string; code: string; remember?: boolean }) => auth.adminMfaVerify(body, { ...clientMeta(req), platform: 'admin' }),

  async mfaSetup(req: Request) {
    const actor = await mfaActor(req);
    return auth.mfaSetup(actor.userId, actor.viaChallenge);
  },

  async mfaEnable(req: Request, code: string) {
    const actor = await mfaActor(req);
    const res = await auth.mfaEnable(actor.userId, code, { ...clientMeta(req), platform: 'admin' }, actor.viaChallenge);
    if (req.admin) req.audit = { action: 'admin.enable_mfa', entity: 'admin_user', entityId: actor.userId, summary: 'Enabled two-factor authentication', before: { mfaEnabled: false }, after: { mfaEnabled: true } };
    return res;
  },

  async mfaDisable(req: Request, admin: AdminPrincipal, body: { code?: string; password?: string }) {
    const res = await auth.mfaDisable(admin.userId, body);
    req.audit = { action: 'admin.disable_mfa', entity: 'admin_user', entityId: admin.userId, summary: 'Disabled two-factor authentication', before: { mfaEnabled: true }, after: { mfaEnabled: false } };
    return res;
  },

  async forgotPassword(req: Request, email: string) {
    await auth.forgotPassword(email, clientMeta(req));
    return OK;
  },
  async resetPassword(req: Request, token: string, newPassword: string) {
    await auth.resetPassword(token, newPassword, clientMeta(req));
    return OK;
  },
  inviteInfo: (token: string) => auth.inviteInfo(token),
  acceptInvite: (req: Request, body: { token: string; password: string; name?: { en: string; ar: string } }) => auth.acceptInvite(body, { ...clientMeta(req), platform: 'admin' }),
};
