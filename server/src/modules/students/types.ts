import type { EntitlementDto } from '../../common/entitlements.js';
import type { AdminRef, Governorate, MarketerRef, PackageRef, SchoolRef, StudentRef, SubjectRef } from '../../common/dto/refs.js';
import type { Localized } from '../../common/i18n/index.js';
import type { AiAllowance } from '../../common/services/student-summary.js';

export type SubscriptionStatus = 'active' | 'expired' | 'trial' | 'none' | 'cancelled';
export type AcquisitionSource = 'organic' | 'school' | 'marketer' | 'referral' | 'campaign';

export interface AdminStudentRow {
  id: string;
  name: Localized;
  mobile: string;
  email: string | null;
  avatarUrl: string | null;
  gender: 'male' | 'female' | null;
  governorateId: string;
  governorate: Governorate;
  schoolId: string | null;
  school: SchoolRef | null;
  schoolName: string | null;
  packageId: string | null;
  package: PackageRef | null;
  subscriptionStatus: SubscriptionStatus;
  subscriptionExpiresAt: string | null;
  source: AcquisitionSource;
  referralCode: string | null;
  marketerId: string | null;
  marketer: MarketerRef | null;
  locked: boolean;
  lockedReason: string | null;
  platforms: ('web' | 'ios' | 'android')[];
  lastActive: string | null;
  createdAt: string;
}

export interface AdminStudentDetail extends AdminStudentRow {
  progress: number;
  avgScore: number;
  aiQuestionsUsed: number;
  aiAllowance: AiAllowance;
  aiDisabled: boolean;
  lifetimeValue: number;
  packageDetail: { id: string; name: Localized; subjectIds: string[]; validityType: 'days' | 'months' | 'until_date'; validityValue: number; validityDays: number } | null;
  entitlements: EntitlementDto[];
  otp: { failures: number; locked: boolean; lockedUntil: string | null };
  counts: { transactions: number; sessions: number; notes: number };
  memberSince: string;
}

export interface NoteDto {
  id: string;
  author: AdminRef;
  body: string;
  createdAt: string;
}

export interface EntitlementLogDto {
  id: string;
  action: 'grant' | 'revoke' | 'extend' | 'expire';
  subject: SubjectRef | null;
  source: 'package' | 'manual' | 'payment' | 'refund';
  days: number | null;
  reason: string | null;
  actor: AdminRef | null;
  at: string;
}

export interface TransactionRow {
  id: string;
  ref: string;
  receiptNumber: string | null;
  student: StudentRef;
  package: PackageRef;
  cycle: 'monthly' | 'yearly';
  amount: number;
  currency: 'IQD' | 'USD';
  discount: number;
  refundedAmount: number;
  refundable: number;
  gateway: string;
  status: string;
  promoCode: string | null;
  school: SchoolRef | null;
  marketer: MarketerRef | null;
  source: 'school' | 'promo' | 'direct';
  platform: 'web' | 'ios' | 'android' | null;
  createdAt: string;
  paidAt: string | null;
}

export interface SupportTicketDto {
  id: string;
  student: StudentRef | null;
  contact: { name: string; contact: string } | null;
  subject: Localized;
  message: string;
  category: 'payment' | 'access' | 'video' | 'content' | 'account';
  priority: 'low' | 'medium' | 'high';
  status: 'open' | 'pending' | 'resolved';
  assignee: AdminRef | null;
  source: 'contact_form' | 'app' | 'admin';
  createdAt: string;
  updatedAt: string;
}
