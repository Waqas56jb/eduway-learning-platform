/* AI tutor admin (contract §28, ADM-AI-01..15) + student lock/unlock used by the abuse page (ADM-STU-07/08). */
import { api, type Query } from './client';
import { qk } from './keys';
import { useApiMutation, useApiQuery, usePagedList } from './hooks';
import type {
  AdminRef,
  ExportRequest,
  ID,
  ISODate,
  Kpi,
  Localized,
  Platform,
  StudentRef,
  SubjectRef,
  SubjectSlug,
} from './types';

// ─── DTOs ────────────────────────────────────────────────────────────────────
export type AiProvider = 'openai' | 'anthropic' | 'azure';
export interface AiSettingsDto {
  enabled: boolean;
  monthlyAllowance: number;
  resetCycle: 'calendar' | 'billing';
  provider: AiProvider;
  model: string;
  temperature: number;
  maxTokens: number;
  retrieval: { transcripts: boolean; explanations: boolean; lessonNotes: boolean };
  safetyRules: string;
  disabledUserIds: ID[];
  disabledUsers: StudentRef[];
  rateLimitPerMinute: number;
  rateLimitPerHour: number;
  blockedKeywords: string[];
  suggestedPrompts: Record<SubjectSlug, Localized[]>;
  updatedAt: ISODate;
  updatedBy: AdminRef | null;
}
export type AiSettingsPatch = Partial<
  Omit<AiSettingsDto, 'enabled' | 'disabledUsers' | 'updatedAt' | 'updatedBy'>
>;

export type AiFlagReason = 'off_topic' | 'abuse' | 'cheating' | 'prompt_injection' | 'self_harm';
export type AiSeverity = 'low' | 'medium' | 'high';
export type AiFlagStatus = 'open' | 'reviewed' | 'dismissed';
export interface AiFlagDto {
  id: ID;
  student: StudentRef;
  subject: SubjectRef;
  conversationId: ID;
  messageId: ID | null;
  excerpt: string;
  reason: AiFlagReason;
  severity: AiSeverity;
  status: AiFlagStatus;
  source: 'auto' | 'keyword' | 'rate_limit' | 'manual';
  reviewedBy: AdminRef | null;
  reviewedAt: ISODate | null;
  note: string | null;
  createdAt: ISODate;
}
export interface AiTranscriptLine {
  role: 'student' | 'tutor';
  text: string;
  at: ISODate;
  flagged: boolean;
}
export type AiFlagDetailDto = AiFlagDto & { transcript: AiTranscriptLine[] };

export interface FlaggedUserDto {
  student: StudentRef;
  flags: number;
  open: number;
  highest: AiSeverity;
  last: ISODate;
  aiDisabled: boolean;
  locked: boolean;
  warned: boolean;
  warnedAt: ISODate | null;
}

export interface AiUsageDto {
  kpis: {
    questions: Kpi;
    peakActiveUsers: Kpi;
    avgPerUser: Kpi;
    costUsd: Kpi;
    costIqd: number;
    tokens: Kpi;
  };
  daily: { date: string; questions: number; users: number; tokens: number; costUsd: number }[];
  bySubject: { subjectId: ID; slug: SubjectSlug; name: Localized; value: number; color: string }[];
  topUsers: { student: StudentRef; used: number; allowance: number; lastActive: ISODate | null }[];
  openFlags: AiFlagDto[];
  enabled: boolean;
  monthlyAllowance: number;
  iqdPerUsd: number;
}

export type AiModels = Record<AiProvider, { value: string; label: string }[]>;

export interface StudentSearchHit {
  id: ID;
  name: Localized;
  mobile: string;
  avatarUrl: string | null;
}

// ─── raw calls ───────────────────────────────────────────────────────────────
export const aiApi = {
  usage: (params: { from: string; to: string; platform?: Platform | '' }) =>
    api.get<AiUsageDto>('/admin/ai/usage', params),
  settings: () => api.get<AiSettingsDto>('/admin/ai/settings'),
  patchSettings: (body: AiSettingsPatch) => api.patch<AiSettingsDto>('/admin/ai/settings', body),
  enable: () => api.post<AiSettingsDto>('/admin/ai/settings/enable'),
  disable: (reason: string) => api.post<AiSettingsDto>('/admin/ai/settings/disable', { reason }),
  disableUser: (studentId: ID, reason?: string) =>
    api.put<AiSettingsDto>(`/admin/ai/disabled-users/${studentId}`, reason ? { reason } : {}),
  enableUser: (studentId: ID) => api.delete<AiSettingsDto>(`/admin/ai/disabled-users/${studentId}`),
  flags: (params: Query) => api.list<AiFlagDto>('/admin/ai/flags', params),
  flag: (id: ID) => api.get<AiFlagDetailDto>(`/admin/ai/flags/${id}`),
  setFlag: (id: ID, body: { status: AiFlagStatus; note?: string }) =>
    api.patch<AiFlagDto>(`/admin/ai/flags/${id}`, body),
  flaggedUsers: (params: Query) => api.list<FlaggedUserDto>('/admin/ai/flagged-users', params),
  warn: (studentId: ID, message?: Localized) =>
    api.post<FlaggedUserDto>(
      `/admin/ai/flagged-users/${studentId}/warn`,
      message ? { message } : {},
    ),
  models: () => api.get<AiModels>('/admin/ai/models'),
  lockStudent: (id: ID, reason: string) => api.post(`/admin/students/${id}/lock`, { reason }),
  unlockStudent: (id: ID, reason?: string) =>
    api.post(`/admin/students/${id}/unlock`, reason ? { reason } : {}),
  searchStudents: async (q: string): Promise<StudentSearchHit[]> => {
    const r = await api.get<{ students?: StudentSearchHit[] }>('/search', {
      q,
      scopes: 'students',
      limit: 8,
    });
    return r.students ?? [];
  },
};

export const AI_EXPORT = {
  flags: '/admin/ai/flags/export',
  users: '/admin/ai/flagged-users/export',
} as const;
export type { ExportRequest };

// ─── hooks ───────────────────────────────────────────────────────────────────
export const useAiUsage = (from: string, to: string, platform: Platform | '' = '') =>
  useApiQuery(qk.ai.sub('usage', { from, to, platform }), () =>
    aiApi.usage({ from, to, platform }),
  );

export const useAiSettings = () => useApiQuery(qk.ai.sub('settings'), aiApi.settings);

export const useAiModels = () =>
  useApiQuery(qk.ai.sub('models'), aiApi.models, { staleTime: 10 * 60_000 });

export const useAiFlagDetail = (id: ID | null) =>
  useApiQuery(qk.ai.sub('flag', id), () => aiApi.flag(id as ID), { enabled: !!id });

export function useAiFlags(filters: { status?: string; severity?: string; reason?: string }) {
  return usePagedList({
    key: (p) => qk.ai.sub('flags', p),
    fetcher: aiApi.flags,
    filters,
    initialSort: '-createdAt',
    pageSize: 10,
  });
}

export function useFlaggedUsers() {
  return usePagedList({
    key: (p) => qk.ai.sub('flaggedUsers', p),
    fetcher: aiApi.flaggedUsers,
    pageSize: 5,
  });
}

/** All AI mutations invalidate the whole `ai` module (settings, usage, flags, flagged users). */
const inv = { invalidate: [qk.ai.all] };

export const useSaveAiSettings = (success: string | false = 'toast.saved') =>
  useApiMutation((body: AiSettingsPatch) => aiApi.patchSettings(body), { ...inv, success });

export const useToggleAi = () =>
  useApiMutation(
    (v: { enabled: boolean; reason?: string }) =>
      v.enabled ? aiApi.enable() : aiApi.disable(v.reason ?? ''),
    {
      ...inv,
      success: (_d, v) =>
        v.enabled ? 'aitutor.settings.enabledToast' : 'aitutor.settings.disabledToast',
    },
  );

export const useToggleUserAi = () =>
  useApiMutation(
    (v: { studentId: ID; disable: boolean; reason?: string }) =>
      v.disable ? aiApi.disableUser(v.studentId, v.reason) : aiApi.enableUser(v.studentId),
    {
      ...inv,
      success: false,
    },
  );

export const useSetFlagStatus = () =>
  useApiMutation(
    (v: { id: ID; status: AiFlagStatus; note?: string }) =>
      aiApi.setFlag(v.id, { status: v.status, note: v.note }),
    { ...inv, success: false },
  );

export const useWarnUser = () =>
  useApiMutation((studentId: ID) => aiApi.warn(studentId), { ...inv, success: false });

export const useBlockStudent = () =>
  useApiMutation(
    (v: { id: ID; block: boolean; reason?: string }) =>
      v.block ? aiApi.lockStudent(v.id, v.reason ?? '') : aiApi.unlockStudent(v.id, v.reason),
    {
      invalidate: [qk.ai.all, qk.students.all],
      success: false,
    },
  );
