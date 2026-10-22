/* Analytics & exports (contract §29: ADM-ANL-01..05, ADM-EXP-01..04). */
import { api, download, idempotency, type Query } from './client';
import { qk } from './keys';
import { useApiMutation, useApiQuery, usePagedList } from './hooks';
import type {
  AdminRef,
  DateOnly,
  ExportFormat,
  Grain,
  ID,
  IQD,
  ISODate,
  Kpi,
  Localized,
  Platform,
  SubjectRef,
} from './types';

export type AcquisitionSource = 'organic' | 'school' | 'marketer' | 'referral' | 'campaign';

export interface AnalyticsParams {
  from: string;
  to: string;
  grain?: Grain;
  compare?: boolean;
  platform?: Platform | '';
  subjectId?: ID | '';
}

export interface BusinessAnalyticsDto {
  kpis: {
    registrations: Kpi;
    paidSubscriptions: Kpi;
    renewals: Kpi;
    grossRevenue: Kpi;
    refunds: Kpi & { count: number };
    netRevenue: Kpi;
  };
  timeline: {
    bucketStart: DateOnly;
    label: string;
    registrations: number;
    paid: number;
    renewals: number;
    revenue: IQD;
    refunds: IQD;
    net: IQD;
    prevRevenue: IQD | null;
    prevRegistrations: number | null;
  }[];
  funnel: {
    registrations: number;
    paid: number;
    renewals: number;
    conversionPct: number;
    prev: { registrations: number; paid: number; renewals: number; conversionPct: number } | null;
  };
  packages: {
    packageId: ID;
    name: Localized;
    color: string;
    count: number;
    prev: number | null;
    revenue: IQD;
  }[];
  sources: {
    source: AcquisitionSource;
    label: Localized;
    color: string;
    regs: number;
    prev: number | null;
    paid: number;
    conv: number;
    revenue: IQD;
  }[];
  schools: {
    id: ID;
    name: Localized;
    tier: string;
    paid: number;
    prev: number | null;
    revenue: IQD;
  }[];
  marketers: {
    id: ID;
    name: Localized;
    color: string;
    schools: number;
    paid: number;
    prev: number | null;
    revenue: IQD;
  }[];
  platforms: { platform: Platform; registrations: number; paid: number; revenue: IQD }[];
}

export interface LearningAnalyticsDto {
  kpis: {
    dau: Kpi & { wau: number; mau: number };
    watchHours: Kpi;
    videoCompletion: Kpi;
    quizCompletion: Kpi;
    examAttempts: Kpi;
    aiQuestions: Kpi;
  };
  timeline: {
    bucketStart: DateOnly;
    label: string;
    dau: number;
    wau: number;
    mau: number;
    watchHours: number;
    videoCompletion: number;
    quizCompletion: number;
    quizAttempts: number;
    examAttempts: number;
    aiQuestions: number;
    prevDau: number | null;
  }[];
  scoreBySubject: { subjectId: ID; name: Localized; score: number; color: string }[];
  weakTopics: TopicSignalDto[];
  questionAccuracy: { label: string; questions: number; color: string }[];
  examScores: { label: string; students: number }[];
  mistakeRecurrence: { topicId: ID; name: Localized; recurrence: number }[];
  platforms: { platform: Platform; dau: number; watchHours: number; quizAttempts: number }[];
}

export interface TopicSignalDto {
  topicId: ID;
  topic: Localized;
  unit: Localized;
  subject: SubjectRef;
  accuracy: number;
  mistakeRecurrence: number;
  attempts: number;
  avgTimeSec: number;
}

export interface PlatformSplitRow {
  platform: Platform;
  activeUsers: number;
  sessions: number;
  registrations: number;
  payments: number;
  revenue: IQD;
  watchMinutes: number;
  aiQuestions: number;
}

export type ReportKey =
  | 'students'
  | 'transactions'
  | 'refunds'
  | 'schools'
  | 'learning'
  | 'ai'
  | 'audit';

export interface ExportRecordDto {
  id: ID;
  report: string;
  format: ExportFormat;
  range: string;
  from: ISODate | null;
  to: ISODate | null;
  rows: number;
  by: AdminRef;
  at: ISODate;
  status: 'ready' | 'processing' | 'failed';
  source: 'exports_page' | 'table';
  downloadUrl: string | null;
  expiresAt: ISODate | null;
}

export const analyticsApi = {
  business: (p: AnalyticsParams) =>
    api.get<BusinessAnalyticsDto>('/admin/analytics/business', p as unknown as Query),
  learning: (p: AnalyticsParams) =>
    api.get<LearningAnalyticsDto>('/admin/analytics/learning', p as unknown as Query),
  topics: (p: { subjectId?: ID | ''; from?: string; to?: string; sort?: string; limit?: number }) =>
    api.get<TopicSignalDto[]>('/admin/analytics/topics', p),
  platformSplit: (p: { from: string; to: string }) =>
    api.get<PlatformSplitRow[]>('/admin/analytics/platform-split', p),
  createExport: (body: { report: ReportKey; from: string; to: string; format: ExportFormat }) =>
    api.post<ExportRecordDto>('/admin/exports', body, idempotency()),
  exports: (params: Query) => api.list<ExportRecordDto>('/admin/exports', params),
  preview: (p: { report: ReportKey; from: string; to: string }) =>
    api.get<{ rows: number }>('/admin/exports/preview', p),
  download: (r: Pick<ExportRecordDto, 'id' | 'report' | 'format'>) =>
    download(`/admin/exports/${r.id}/download`, { fallbackName: `eduway-${r.report}.${r.format}` }),
};

// ─── hooks ───────────────────────────────────────────────────────────────────
export const useBusinessAnalytics = (p: AnalyticsParams) =>
  useApiQuery(qk.analytics.sub('business', p), () => analyticsApi.business(p));

export const useLearningAnalytics = (p: AnalyticsParams) =>
  useApiQuery(qk.analytics.sub('learning', p), () => analyticsApi.learning(p));

export const useTopicSignals = (p: { subjectId?: ID | ''; from: string; to: string }) =>
  useApiQuery(qk.analytics.sub('topics', p), () => analyticsApi.topics({ ...p, sort: 'accuracy' }));

export const usePlatformSplit = (from: string, to: string) =>
  useApiQuery(qk.analytics.sub('platforms', { from, to }), () =>
    analyticsApi.platformSplit({ from, to }),
  );

export const useExportPreview = (
  p: { report: ReportKey; from: string; to: string },
  enabled = true,
) => useApiQuery(qk.exports.sub('preview', p), () => analyticsApi.preview(p), { enabled });

export function useExportHistory(filters: { report?: string }, pollWhileProcessing = false) {
  return usePagedList({
    key: (p) => qk.exports.list(p),
    fetcher: analyticsApi.exports,
    filters,
    initialSort: '-at',
    pageSize: 10,
    refetchInterval: pollWhileProcessing ? 3000 : undefined,
  });
}

export const useCreateExport = () =>
  useApiMutation(analyticsApi.createExport, { invalidate: [qk.exports.all], success: false });

export const useDownloadExport = () =>
  useApiMutation(
    (r: Pick<ExportRecordDto, 'id' | 'report' | 'format'>) => analyticsApi.download(r),
    { success: false },
  );
