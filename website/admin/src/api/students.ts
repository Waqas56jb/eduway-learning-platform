/* Admin students — users module (contract §20, ADM-STU-01..21). */
import { api, idempotency, type Query } from './client';
import { useApiMutation } from './hooks';
import { qk } from './keys';
import type {
  AiAllowance,
  AdminRef,
  BulkResult,
  Currency,
  DateOnly,
  EntitlementDto,
  GovernorateDto,
  ID,
  IQD,
  ISODate,
  Localized,
  MarketerRef,
  NoteDto,
  OkDto,
  PackageRef,
  Platform,
  SchoolRef,
  SessionDto,
  StudentRef,
  SubjectRef,
} from './types';

export type SubscriptionStatus = 'active' | 'expired' | 'trial' | 'none' | 'cancelled';
export type AcquisitionSource = 'organic' | 'school' | 'marketer' | 'referral' | 'campaign';

export interface AdminStudentRow {
  id: ID;
  name: Localized;
  mobile: string;
  email: string | null;
  avatarUrl: string | null;
  gender: 'male' | 'female' | null;
  governorateId: string;
  governorate: GovernorateDto | null;
  schoolId: ID | null;
  school: SchoolRef | null;
  schoolName: string | null;
  packageId: ID | null;
  package: PackageRef | null;
  subscriptionStatus: SubscriptionStatus;
  subscriptionExpiresAt: ISODate | null;
  source: AcquisitionSource;
  referralCode: string | null;
  marketerId: ID | null;
  marketer: MarketerRef | null;
  locked: boolean;
  lockedReason: string | null;
  platforms: Platform[];
  lastActive: ISODate | null;
  createdAt: ISODate;
}

export interface AdminStudentDetail extends AdminStudentRow {
  progress: number;
  avgScore: number;
  aiQuestionsUsed: number;
  aiAllowance: AiAllowance;
  aiDisabled: boolean;
  lifetimeValue: IQD;
  packageDetail: {
    id: ID;
    name: Localized;
    subjectIds: ID[];
    validityType: 'days' | 'months' | 'until_date';
    validityValue: number;
    validityDays: number;
  } | null;
  entitlements: EntitlementDto[];
  otp: { failures: number; locked: boolean; lockedUntil: ISODate | null };
  counts: { transactions: number; sessions: number; notes: number };
  memberSince: ISODate;
}

export interface StudentStats {
  total: number;
  active: number;
  trial: number;
  expired: number;
  cancelled: number;
  none: number;
  locked: number;
  byPlatform: Record<Platform, number>;
}

export interface StudentActivityDto {
  watch: { id: ID; lessonId: ID; lessonTitle: Localized; subject: SubjectRef; watchedSec: number; durationSec: number; completed: boolean; at: ISODate }[];
  quizzes: { id: ID; lessonId: ID; lessonTitle: Localized; correct: number; total: number; score: number; passed: boolean; at: ISODate }[];
  exams: { id: ID; title: Localized; score: number; durationMin: number; status: 'passed' | 'failed' | 'abandoned' | 'in_progress'; at: ISODate }[];
  aiDaily: { date: DateOnly; questions: number }[];
  aiRecent: { id: ID; subject: SubjectRef; text: Localized; at: ISODate }[];
}

export interface EntitlementLogDto {
  id: ID;
  action: 'grant' | 'revoke' | 'extend' | 'expire';
  subject: SubjectRef;
  source: 'package' | 'manual' | 'payment' | 'refund';
  days: number | null;
  reason: string | null;
  actor: AdminRef | null;
  at: ISODate;
}

/** Contract §25 TransactionRow (fields used by the student payments tab). */
export interface StudentTransactionRow {
  id: ID;
  ref: string;
  student: StudentRef;
  package: PackageRef;
  amount: IQD;
  currency: Currency;
  gateway: string;
  status: string;
  createdAt: ISODate;
}

const base = (id: ID) => `/admin/students/${id}`;

export const studentsApi = {
  list: (params: Query) => api.list<AdminStudentRow>('/admin/students', params),
  stats: () => api.get<StudentStats>('/admin/students/stats'),
  bulkLock: (ids: ID[], reason: string) => api.post<BulkResult>('/admin/students/bulk/lock', { ids, reason }),
  bulkUnlock: (ids: ID[], reason?: string) => api.post<BulkResult>('/admin/students/bulk/unlock', { ids, reason: reason || undefined }),
  get: (id: ID) => api.get<AdminStudentDetail>(base(id)),
  update: (id: ID, body: { name?: Localized; email?: string | null; gender?: 'male' | 'female' | null; governorateId?: string; schoolName?: string | null }) =>
    api.patch<AdminStudentDetail>(base(id), body),
  lock: (id: ID, reason: string) => api.post<AdminStudentDetail>(`${base(id)}/lock`, { reason }),
  unlock: (id: ID, reason?: string) => api.post<AdminStudentDetail>(`${base(id)}/unlock`, { reason: reason || undefined }),
  sessions: (id: ID) => api.get<SessionDto[]>(`${base(id)}/sessions`),
  revokeSession: (id: ID, sessionId: ID) => api.delete<OkDto>(`${base(id)}/sessions/${sessionId}`),
  revokeAllSessions: (id: ID, reason?: string) => api.delete<{ revoked: number }>(`${base(id)}/sessions`, { data: { reason } }),
  notes: (id: ID) => api.get<NoteDto[]>(`${base(id)}/notes`),
  addNote: (id: ID, body: string) => api.post<NoteDto>(`${base(id)}/notes`, { body }),
  grantAccess: (id: ID, body: { subjectId: ID; days: number; reason: string }) =>
    api.post<EntitlementDto[]>(`${base(id)}/entitlements`, body, idempotency()),
  revokeAccess: (id: ID, entitlementId: ID, reason?: string) =>
    api.delete<EntitlementDto[]>(`${base(id)}/entitlements/${entitlementId}`, { data: { reason } }),
  entitlementLogs: (id: ID) => api.get<EntitlementLogDto[]>(`${base(id)}/entitlement-logs`),
  attribution: (id: ID, body: { schoolId: ID | null; referralCode: string | null; reason: string }) =>
    api.patch<AdminStudentDetail>(`${base(id)}/attribution`, body),
  resetOtp: (id: ID) => api.post<{ failures: 0; locked: false }>(`${base(id)}/otp/reset`),
  activity: (id: ID, params?: { limit?: number; days?: number }) => api.get<StudentActivityDto>(`${base(id)}/activity`, params),
  transactions: (id: ID, params: Query) => api.list<StudentTransactionRow>(`${base(id)}/transactions`, params),
};

/** Lock / unlock with reason (ADM-STU-07/08) — shared by the header and the Actions tab. */
export function useToggleLock(id: string) {
  return useApiMutation(
    (v: { lock: boolean; reason: string }) => (v.lock ? studentsApi.lock(id, v.reason) : studentsApi.unlock(id, v.reason)),
    {
      invalidate: [qk.students.all],
      success: (_d, v) => (v.lock ? 'users.actions.lockedToast' : 'users.actions.unlockedToast'),
    },
  );
}

