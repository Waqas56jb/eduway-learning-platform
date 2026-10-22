import { mobilePhone, studentPlatform } from '../../common/validation/schemas.js';
import { z } from '../../common/validation/zod.js';
import { personName } from '../users/schemas.js';

export const legalRef = z.object({ doc: z.enum(['terms', 'privacy']), version: z.string().min(1).max(20) });

export const registerDto = z
  .object({
    name: personName,
    governorateId: z.string().min(2).max(40),
    schoolId: z.string().uuid().nullable().optional(),
    schoolName: z.string().trim().max(80).nullable().optional(),
    referralCode: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9-]{4,20}$/, 'REFERRAL_CODE_INVALID')
      .transform((v) => v.toUpperCase())
      .nullable()
      .optional()
      .or(z.literal('').transform(() => null)),
    acceptTerms: z.literal(true, { errorMap: () => ({ message: 'TERMS_NOT_ACCEPTED' }) }),
    acceptedLegal: z.array(legalRef).max(2).default([]),
    language: z.enum(['en', 'ar']).optional(),
    email: z.string().email().max(200).nullable().optional(),
    gender: z.enum(['male', 'female']).nullable().optional(),
  })
  .openapi('RegisterDto');

export const sendOtpBody = z.object({
  phone: mobilePhone,
  purpose: z.enum(['login', 'register']).default('login'),
  channel: z.enum(['sms', 'whatsapp']).optional(),
});

export const verifyOtpBody = z.object({
  phone: mobilePhone,
  code: z.string().trim().regex(/^\d{4,6}$/),
  purpose: z.enum(['login', 'register']).default('login'),
  deviceId: z.string().min(6).max(128).optional(),
  platform: studentPlatform.optional(),
  deviceName: z.string().max(120).optional(),
  registration: registerDto.optional(),
  revokeSessionId: z.string().uuid().optional(),
});

export const refreshBody = z.object({ refreshToken: z.string().min(20).max(200) });
export const logoutBody = z.object({ refreshToken: z.string().max(200).optional() }).default({});
export const logoutAllBody = z.object({ keepCurrent: z.boolean().default(false) }).default({});
export const acceptLegalBody = z.object({ documents: z.array(legalRef).min(1).max(2) });

export const authTokensDto = z
  .object({ accessToken: z.string(), refreshToken: z.string(), expiresIn: z.number(), refreshExpiresAt: z.string() })
  .openapi('AuthTokens');

export const sendOtpDto = z.object({
  phone: z.string(),
  maskedPhone: z.string(),
  purpose: z.enum(['login', 'register']),
  isRegistered: z.boolean(),
  codeLength: z.number(),
  expiresInSeconds: z.number(),
  resendInSeconds: z.number(),
  resendsLeft: z.number(),
  channel: z.enum(['sms', 'whatsapp']),
});

// ── admin ──
/** 6-digit TOTP code, or a single-use recovery code `XXXXX-XXXXX` (dash optional, case-insensitive) — SEC-26. */
const secondFactor = z.string().trim().regex(/^(\d{6}|[A-Za-z0-9]{5}-?[A-Za-z0-9]{5})$/);
export const adminLoginBody = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
  totp: secondFactor.optional(),
  remember: z.boolean().optional(),
});
export const mfaVerifyBody = z.object({ mfaToken: z.string().min(20), code: secondFactor, remember: z.boolean().optional() });
export const mfaCodeBody = z.object({ code: z.string().regex(/^\d{6}$/) });
export const mfaDisableBody = z.object({ code: z.string().regex(/^\d{6}$/).optional(), password: z.string().max(200).optional() }).refine((b) => b.code || b.password, { message: 'code or password required' });
export const forgotBody = z.object({ email: z.string().email().max(200) });
export const resetBody = z.object({ token: z.string().min(20).max(200), newPassword: z.string().min(1).max(200) });
export const inviteTokenParam = z.object({ token: z.string().min(20).max(200) });
export const acceptInviteBody = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(1).max(200),
  name: z.object({ en: z.string().trim().min(2).max(80), ar: z.string().trim().min(2).max(80) }).optional(),
});
