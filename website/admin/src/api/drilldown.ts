/* Single-entity / drill-down reads that power the detail screens (contract §23.1, §26.2, §26.3, §29, §30):
 *   ADM-QZR-06 effective quiz rule · ADM-CMP-02 campaign · ADM-INC-02 incentive rule · ADM-SET-02 settlement (+items) · ADM-ANL-03 daily metrics.
 * Mutations reuse the module APIs (notificationsApi.cancelCampaign, settlementsApi.approve/markPaid). */
import { api } from './client';
import { qk } from './keys';
import { useApiQuery } from './hooks';
import { toQuizRuleVM, type QuizRuleDto, type QuizRuleVM } from './assessments';
import { toCampaign, type CampaignDto, type CampaignVM } from './notifications';
import type { IncentiveRuleDto, SettlementDto } from './partners';
import type { DateOnly, ID, ISODate, Localized, Platform } from './types';

// ─── DTOs ────────────────────────────────────────────────────────────────────
/** ADM-QZR-06 — the rule a lesson's quiz actually runs with (lesson override wins over the subject default). */
export type EffectiveQuizRuleDto = QuizRuleDto & { source: 'subject' | 'lesson' };
export type EffectiveQuizRuleVM = QuizRuleVM & { source: 'subject' | 'lesson'; updatedAt: ISODate | null };

/** ADM-SET-02 item: one verified payment counted in the settlement. */
export interface SettlementItemDto {
  studentId: ID;
  studentName: Localized;
  paymentId: ID;
  ref: string;
  paidAt: ISODate;
  amount: number;
}
export type SettlementDetailDto = SettlementDto & { items?: SettlementItemDto[] };

/** ADM-ANL-03 numeric fields (contract order). */
export const DAILY_FIELDS = [
  'dau',
  'wau',
  'mau',
  'watchMinutes',
  'videoCompletionRate',
  'quizAttempts',
  'quizCompletionRate',
  'examAttempts',
  'aiQuestions',
  'aiActiveUsers',
  'aiTokens',
  'aiCostUsd',
  'errorRate',
  'registrations',
  'revenue',
] as const;
export type DailyField = (typeof DAILY_FIELDS)[number];
export type DailyRow = { date: DateOnly; aiBySubject?: Record<string, number> } & Partial<Record<DailyField, number>>;
export interface DailyParams {
  from: string;
  to: string;
  platform?: Platform | '';
}

// ─── endpoints ───────────────────────────────────────────────────────────────
export const drilldownApi = {
  effectiveQuizRule: async (lessonId: ID): Promise<EffectiveQuizRuleVM> => {
    const d = await api.get<EffectiveQuizRuleDto>('/admin/quiz-rules/effective', { lessonId });
    return { ...toQuizRuleVM(d), source: d.source, updatedAt: d.updatedAt ?? null };
  },
  campaign: async (id: ID): Promise<CampaignVM> => toCampaign(await api.get<CampaignDto>(`/admin/campaigns/${id}`)),
  incentiveRule: (id: ID) => api.get<IncentiveRuleDto>(`/admin/incentive-rules/${id}`),
  settlement: (id: ID) => api.get<SettlementDetailDto>(`/admin/settlements/${id}`),
  /** Every metric + the AI-by-subject breakdown; `platform` narrows the platform-dimensioned metrics. */
  daily: (p: DailyParams) =>
    api.get<DailyRow[]>('/admin/analytics/daily', { from: p.from, to: p.to, platform: p.platform || undefined, fields: [...DAILY_FIELDS, 'aiBySubject'] }),
};

// ─── hooks ───────────────────────────────────────────────────────────────────
export const useEffectiveQuizRule = (lessonId?: ID) =>
  useApiQuery(qk.quizRules.sub('effective', lessonId), () => drilldownApi.effectiveQuizRule(lessonId!), { enabled: !!lessonId });

/** Polls every 5 s while the campaign is still `sending`. */
export const useCampaign = (id?: ID) =>
  useApiQuery(qk.campaigns.detail(id), () => drilldownApi.campaign(id!), {
    enabled: !!id,
    refetchInterval: (query) => (query.state.data?.status === 'sending' ? 5000 : false),
  });

export const useIncentiveRule = (id?: ID) => useApiQuery(qk.incentiveRules.detail(id), () => drilldownApi.incentiveRule(id!), { enabled: !!id });

/** Lives under `qk.settlements` so every partner mutation (partnerKeys) refreshes it. */
export const useSettlement = (id?: ID) => useApiQuery(qk.settlements.detail(id), () => drilldownApi.settlement(id!), { enabled: !!id });

export const useDailyMetrics = (p: DailyParams) => useApiQuery(qk.analytics.sub('daily', p), () => drilldownApi.daily(p));
