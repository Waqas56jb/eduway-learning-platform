import { fileKey, localized } from '../../common/validation/schemas.js';
import { z } from '../../common/validation/zod.js';

/** Name: 3..60 letters (Latin/Arabic), spaces, ' . - */
export const personName = z
  .string()
  .trim()
  .min(3)
  .max(60)
  .regex(/^[\p{L}\p{M}' .-]+$/u, 'invalid name');

export const notificationPrefsDto = z
  .object({
    lessons: z.boolean(),
    exams: z.boolean(),
    payments: z.boolean(),
    progress: z.boolean(),
    weekly: z.boolean(),
    push: z.boolean(),
    sms: z.boolean(),
    whatsapp: z.boolean(),
    email: z.boolean(),
  })
  .openapi('NotificationPrefs');

export const updateMeBody = z.object({
  name: personName.optional(),
  governorateId: z.string().min(2).max(40).optional(),
  schoolId: z.string().uuid().nullable().optional(),
  schoolName: z.string().trim().max(80).nullable().optional(),
  avatarFileKey: fileKey.nullable().optional(),
  avatarPreset: z.string().max(500).optional(),
  language: z.enum(['en', 'ar']).optional(),
  dailyGoalMinutes: z.number().int().min(15).max(600).optional(),
  email: z.string().email().max(200).nullable().optional(),
  gender: z.enum(['male', 'female']).nullable().optional(),
});

export const sessionIdParam = z.object({ sessionId: z.string().uuid() });
export const revokeSessionsQuery = z.object({ scope: z.literal('others') });

export const pushTokenBody = z.object({
  token: z.string().min(10).max(300),
  provider: z.literal('expo').default('expo'),
  platform: z.enum(['ios', 'android']),
  deviceId: z.string().min(6).max(128),
});
export const pushTokenDeleteBody = z.object({ token: z.string().min(10).max(300) });

export const studentUserDto = z
  .object({
    id: z.string(),
    name: localized,
    firstName: localized,
    mobile: z.string(),
    email: z.string().nullable(),
    emailVerified: z.boolean(),
    gender: z.enum(['male', 'female']).nullable(),
    governorate: z.string(),
    governorateName: localized,
    schoolId: z.string().nullable(),
    school: localized.nullable(),
    avatar: z.string().nullable(),
    language: z.enum(['en', 'ar']),
    packageId: z.string().nullable(),
    subscriptionStatus: z.enum(['active', 'trial', 'expired', 'cancelled', 'none']),
    subscriptionStart: z.string().nullable(),
    subscriptionEnd: z.string().nullable(),
    daysRemaining: z.number(),
    aiUsed: z.number(),
    aiQuota: z.number(),
    streak: z.number(),
    lastLessonId: z.string().nullable(),
    dailyGoalMinutes: z.number(),
    memberSince: z.string(),
    profileComplete: z.boolean(),
    pendingLegal: z.array(z.object({ doc: z.enum(['terms', 'privacy']), version: z.string() })),
  })
  .openapi('StudentUser');

export const sessionDto = z
  .object({
    id: z.string(),
    device: z.string(),
    platform: z.string(),
    browser: z.string().nullable(),
    ip: z.string(),
    location: localized,
    countryCode: z.string().nullable(),
    createdAt: z.string(),
    lastActive: z.string(),
    current: z.boolean(),
  })
  .openapi('SessionDto');

export const meStudentDto = z
  .object({
    user: studentUserDto,
    entitlements: z.array(z.record(z.unknown())),
    subscription: z.record(z.unknown()).nullable(),
    aiAllowance: z.record(z.unknown()),
    unreadNotifications: z.number(),
    notificationPrefs: notificationPrefsDto,
  })
  .openapi('MeStudentDto');
