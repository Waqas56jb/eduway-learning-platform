import type { EntitlementDto } from '../../common/entitlements.js';
import type { Localized } from '../../common/i18n/index.js';
import type { AiAllowance, MySubscription } from '../../common/services/student-summary.js';

export interface NotificationPrefs {
  lessons: boolean;
  exams: boolean;
  payments: boolean;
  progress: boolean;
  weekly: boolean;
  push: boolean;
  sms: boolean;
  whatsapp: boolean;
  email: boolean;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  lessons: true,
  exams: true,
  payments: true,
  progress: true,
  weekly: true,
  push: true,
  sms: true,
  whatsapp: false,
  email: false,
};

export interface StudentUser {
  id: string;
  name: Localized;
  firstName: Localized;
  mobile: string;
  email: string | null;
  /** The email was confirmed through the link we sent (receipts / support replies are emailed only then). */
  emailVerified: boolean;
  gender: 'male' | 'female' | null;
  governorate: string;
  governorateName: Localized;
  schoolId: string | null;
  school: Localized | null;
  avatar: string | null;
  language: 'en' | 'ar';
  packageId: string | null;
  subscriptionStatus: 'active' | 'trial' | 'expired' | 'cancelled' | 'none';
  subscriptionStart: string | null;
  subscriptionEnd: string | null;
  daysRemaining: number;
  aiUsed: number;
  aiQuota: number;
  streak: number;
  lastLessonId: string | null;
  dailyGoalMinutes: number;
  memberSince: string;
  profileComplete: boolean;
  pendingLegal: { doc: 'terms' | 'privacy'; version: string }[];
}

export interface MeStudentDto {
  user: StudentUser;
  entitlements: EntitlementDto[];
  subscription: MySubscription | null;
  aiAllowance: AiAllowance;
  unreadNotifications: number;
  notificationPrefs: NotificationPrefs;
}

export interface StudentRow {
  id: string;
  phone: string;
  email: string | null;
  email_verified_at: Date | null;
  name_en: string;
  name_ar: string;
  avatar_url: string | null;
  locale: 'en' | 'ar';
  status: string;
  notification_prefs: Partial<NotificationPrefs>;
  created_at: Date;
  gender: 'male' | 'female' | null;
  first_name_en: string | null;
  first_name_ar: string | null;
  governorate_code: string | null;
  governorate_name_en: string | null;
  governorate_name_ar: string | null;
  school_id: string | null;
  school_name: string | null;
  school_name_en: string | null;
  school_name_ar: string | null;
  profile_completed: boolean | null;
  daily_goal_minutes: number | null;
  last_lesson_id: string | null;
  current_streak: number | null;
  last_active_date: string | null;
}
