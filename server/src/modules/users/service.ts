import { T } from '../../config/constants.js';
import { db } from '../../config/db.js';
import { invalidatePrincipal } from '../../common/auth/principal.js';
import { entitlements } from '../../common/entitlements.js';
import { AppError, BusinessRuleError, NotFoundError } from '../../common/errors/index.js';
import { settingsStore } from '../../common/services/settings-store.js';
import { storage } from '../../common/services/storage.js';
import { aiAllowance, currentSubscriptionRow, mySubscription, unreadNotifications, type AiAllowance } from '../../common/services/student-summary.js';
import { businessDate, daysRemaining, addDays } from '../../common/utils/dates.js';
import type { StudentPrincipal } from '../../common/types/index.js';
import { sessions, toSessionDto } from '../auth/sessions.js';
import { onStudentEmailChanged } from './email-verification.js';
import { usersRepo } from './repository.js';
import { DEFAULT_NOTIFICATION_PREFS, type MeStudentDto, type NotificationPrefs, type StudentRow, type StudentUser } from './types.js';

export function firstWord(name: string): string {
  return name.trim().split(/\s+/)[0] ?? '';
}

/** Streak is only "current" when the last active day is today or yesterday (business TZ). */
export function effectiveStreak(current: number | null, lastActiveDate: string | null, now = new Date()): number {
  if (!current || !lastActiveDate) return 0;
  const today = businessDate(now);
  const yesterday = businessDate(addDays(now, -1));
  return lastActiveDate === today || lastActiveDate === yesterday ? current : 0;
}

export function prefsOf(raw: Partial<NotificationPrefs> | null | undefined): NotificationPrefs {
  return { ...DEFAULT_NOTIFICATION_PREFS, ...(raw ?? {}) };
}

type SubRow = Awaited<ReturnType<typeof currentSubscriptionRow>>;

/** `pre` shares an already-loaded subscription row / allowance with the caller (see usersService.me). */
async function toStudentUser(r: StudentRow, pre?: { sub: SubRow; ai: Promise<AiAllowance> }): Promise<StudentUser> {
  const [sub, ai, pending, learning] = await Promise.all([
    pre ? pre.sub : currentSubscriptionRow(r.id),
    pre ? pre.ai : aiAllowance(r.id),
    usersRepo.pendingLegal(r.id),
    settingsStore.get('learning'),
  ]);
  const active = sub && (sub.status === 'active' || sub.status === 'trial') && sub.ends_at > new Date();
  const status: StudentUser['subscriptionStatus'] = !sub ? 'none' : active ? (sub.status as 'active' | 'trial') : sub.status === 'cancelled' ? 'cancelled' : 'expired';
  const schoolName = r.school_name_en ? { en: r.school_name_en, ar: r.school_name_ar ?? r.school_name_en } : r.school_name ? { en: r.school_name, ar: r.school_name } : null;
  return {
    id: r.id,
    name: { en: r.name_en, ar: r.name_ar || r.name_en },
    firstName: { en: r.first_name_en || firstWord(r.name_en), ar: r.first_name_ar || firstWord(r.name_ar || r.name_en) },
    mobile: r.phone,
    email: r.email,
    emailVerified: !!r.email && !!r.email_verified_at,
    gender: r.gender,
    governorate: r.governorate_code ?? '',
    governorateName: { en: r.governorate_name_en ?? '', ar: r.governorate_name_ar ?? '' },
    schoolId: r.school_id,
    school: schoolName,
    avatar: await storage.resolveUrl(r.avatar_url),
    language: r.locale,
    packageId: active ? sub.package_id : null,
    subscriptionStatus: status,
    subscriptionStart: sub?.starts_at.toISOString() ?? null,
    subscriptionEnd: sub?.ends_at.toISOString() ?? null,
    daysRemaining: active ? daysRemaining(sub.ends_at) : 0,
    aiUsed: ai.used,
    aiQuota: ai.quota,
    streak: effectiveStreak(r.current_streak, r.last_active_date),
    lastLessonId: r.last_lesson_id,
    dailyGoalMinutes: r.daily_goal_minutes ?? learning.dailyGoalMinutes,
    memberSince: r.created_at.toISOString(),
    profileComplete: r.profile_completed === true,
    pendingLegal: pending,
  };
}

async function getRow(userId: string): Promise<StudentRow> {
  const r = await usersRepo.getStudent(userId);
  if (!r) throw new NotFoundError('student');
  return r;
}

export interface UpdateMeInput {
  name?: string;
  governorateId?: string;
  schoolId?: string | null;
  schoolName?: string | null;
  avatarFileKey?: string | null;
  avatarPreset?: string;
  language?: 'en' | 'ar';
  dailyGoalMinutes?: number;
  email?: string | null;
  gender?: 'male' | 'female' | null;
}

export const usersService = {
  async studentUser(userId: string): Promise<StudentUser> {
    return toStudentUser(await getRow(userId));
  },

  async me(userId: string): Promise<MeStudentDto> {
    // One subscription row + one allowance shared by every section (was 4 subscription and 3 allowance reads).
    const [row, sub] = await Promise.all([getRow(userId), currentSubscriptionRow(userId)]);
    const aiP = aiAllowance(userId, sub);
    const [user, ents, subscription, ai, unread] = await Promise.all([
      toStudentUser(row, { sub, ai: aiP }),
      entitlements.dtos(userId),
      mySubscription(userId, { sub, ai: aiP }),
      aiP,
      unreadNotifications(userId),
    ]);
    return { user, entitlements: ents, subscription, aiAllowance: ai, unreadNotifications: unread, notificationPrefs: prefsOf(row.notification_prefs) };
  },

  async update(userId: string, input: UpdateMeInput): Promise<StudentUser> {
    const userPatch: Record<string, unknown> = {};
    const profilePatch: Record<string, unknown> = {};
    if (input.name !== undefined) {
      userPatch.name_en = input.name;
      userPatch.name_ar = input.name;
      profilePatch.first_name_en = firstWord(input.name);
      profilePatch.first_name_ar = firstWord(input.name);
    }
    if (input.language) userPatch.locale = input.language;
    if (input.email !== undefined) userPatch.email = input.email?.toLowerCase() ?? null;
    if (input.gender !== undefined) profilePatch.gender = input.gender;
    if (input.dailyGoalMinutes !== undefined) profilePatch.daily_goal_minutes = input.dailyGoalMinutes;
    if (input.governorateId) {
      const gid = await usersRepo.governorateIdByCode(input.governorateId);
      if (!gid) throw new AppError('VALIDATION_ERROR', 400, { reason: 'GOVERNORATE_INVALID', details: { fields: { governorateId: 'invalid' } } });
      profilePatch.governorate_id = gid;
    }
    if (input.schoolId !== undefined) {
      if (input.schoolId) {
        const ok = await db.scalar<number>(`SELECT count(*)::int FROM ${T.schools} WHERE id = $1 AND deleted_at IS NULL`, [input.schoolId]);
        if (!ok) throw new NotFoundError('school');
      }
      profilePatch.school_id = input.schoolId;
      if (input.schoolId) profilePatch.school_name = null;
    }
    if (input.schoolName !== undefined && !input.schoolId) profilePatch.school_name = input.schoolName;
    if (input.avatarPreset !== undefined) {
      const presets = (await settingsStore.get('learning')).avatarPresets;
      // SEC-13: always a configured preset (contract ME-02) — an arbitrary string here was stored in avatar_url and
      // later signed by storage.resolveUrl (`storage://…` → signed URL to any private object) or loaded by admin browsers.
      if (!presets.includes(input.avatarPreset)) {
        throw new AppError('VALIDATION_ERROR', 400, { details: { fields: { avatarPreset: 'Choose one of the available avatars' } } });
      }
      userPatch.avatar_url = input.avatarPreset;
      profilePatch.avatar_preset = input.avatarPreset;
    }
    if (input.avatarFileKey !== undefined) {
      if (input.avatarFileKey === null) userPatch.avatar_url = null;
      else {
        const up = await storage.attachUpload(input.avatarFileKey, { purpose: 'student_avatar', entityType: 'student', entityId: userId, ownerId: userId });
        userPatch.avatar_url = storage.ref(up.bucket, up.path);
      }
    }
    const emailBefore = input.email !== undefined ? await db.scalar<string | null>(`SELECT email FROM ${T.users} WHERE id = $1`, [userId]) : undefined;
    await usersRepo.updateUser(userId, userPatch);
    await usersRepo.updateProfile(userId, profilePatch);
    if (input.email !== undefined && (emailBefore ?? null) !== (userPatch.email ?? null)) await onStudentEmailChanged(userId);
    return this.studentUser(userId);
  },

  async sessions(principal: StudentPrincipal) {
    const rows = await sessions.listActive(principal.userId);
    return rows.map((r) => toSessionDto(r, principal.sessionId)).sort((a, b) => Number(b.current) - Number(a.current));
  },

  async revokeSession(principal: StudentPrincipal, sessionId: string) {
    if (sessionId === principal.sessionId) throw new BusinessRuleError('SELF_ACTION');
    const s = await sessions.get(sessionId);
    if (!s || s.user_id !== principal.userId || s.revoked_at) throw new NotFoundError('session');
    await sessions.revoke(sessionId, 'user_revoked', principal.userId);
  },

  async revokeOthers(principal: StudentPrincipal) {
    return { revoked: await sessions.revokeAll(principal.userId, 'user_revoked_others', { exceptSessionId: principal.sessionId, by: principal.userId }) };
  },

  async devices(userId: string) {
    const rows = await usersRepo.devices(userId);
    return rows.map((d) => ({ id: d.id, deviceId: d.device_id, platform: d.platform, name: d.name ?? 'Device', pushEnabled: d.push, lastSeenAt: d.last_seen_at.toISOString() }));
  },

  async setPushToken(principal: StudentPrincipal, t: { token: string; provider: 'expo'; platform: 'ios' | 'android'; deviceId: string }) {
    await usersRepo.upsertPushToken(principal.userId, t);
  },

  async removePushToken(userId: string, token: string) {
    await usersRepo.revokePushToken(userId, token);
  },

  async getPrefs(userId: string): Promise<NotificationPrefs> {
    return prefsOf((await getRow(userId)).notification_prefs);
  },

  async setPrefs(userId: string, patch: Partial<NotificationPrefs>): Promise<NotificationPrefs> {
    const next = { ...(await this.getPrefs(userId)), ...patch };
    await usersRepo.updateUser(userId, { notification_prefs: JSON.stringify(next) });
    invalidatePrincipal(userId);
    return next;
  },
};
