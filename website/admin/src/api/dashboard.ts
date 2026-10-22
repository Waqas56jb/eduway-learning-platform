/* Admin dashboard (contract §19: ADM-DSH-01/02). */
import { api } from './client';
import type { Currency, DateOnly, ID, IQD, ISODate, Kpi, Localized, PackageRef, StudentRef, SubjectRef } from './types';

export type TxnStatus = 'initiated' | 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunded' | 'partially_refunded';

export interface AdminDashboardDto {
  kpis: {
    totalStudents: Kpi;
    activeSubscriptions: Kpi & { pctOfTotal: number };
    revenueThisMonth: Kpi;
    newRegistrations7d: Kpi;
    publishedLessons: Kpi & { totalLessons: number };
    quizAttempts7d: Kpi;
    aiQuestionsMonth: Kpi;
    openIssues: Kpi & { pending: number };
  } | null;
  monthly: { month: string; revenue: IQD; subs: number; regs: number }[] | null;
  packageDistribution: { packageId: ID | null; name: Localized; value: number; color: string }[] | null;
  dau: { date: DateOnly; dau: number }[] | null;
  registrationsByGovernorate: { governorateId: string; name: Localized; registrations: number }[] | null;
  weakestTopics: { topicId: ID; name: Localized; accuracy: number; color: string }[] | null;
  topSchools: { id: ID; name: Localized; tier: string; verifiedPaidStudents: number }[] | null;
  topMarketers: { id: ID; name: Localized; avatarUrl: string | null; paidStudents: number; pendingReward: IQD }[] | null;
  pendingReview: { id: ID; title: Localized; subject: SubjectRef; updatedAt: ISODate }[] | null;
  pendingReviewCount: number | null;
  recentPayments:
    | { id: ID; ref: string; student: StudentRef; package: PackageRef; amount: IQD; currency: Currency; status: TxnStatus; createdAt: ISODate }[]
    | null;
}

export type ServiceStatus = 'operational' | 'degraded' | 'down';
export interface SystemHealthDto {
  status: ServiceStatus;
  uptime30d: number;
  errorRate24h: number;
  apiP95Ms: number;
  lastBackup: ISODate | null;
  backupSizeGb: number | null;
  services: { key: string; name: Localized; status: ServiceStatus; latencyMs: number | null }[];
}

export const dashboardApi = {
  get: (range: { from: string; to: string }) => api.get<AdminDashboardDto>('/admin/dashboard', range),
  health: () => api.get<SystemHealthDto>('/admin/system/health'),
};
