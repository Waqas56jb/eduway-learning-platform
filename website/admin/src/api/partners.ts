/* Schools, incentive rules, settlements, marketers & milestone sets (contract §26, §27).
 * DTO → flat UI adapters keep the existing pages (`L(x, 'name')`) working. */
import { api, idempotency, type Query } from './client';
import { qk } from './keys';
import { useApiQuery } from './hooks';
import { en, flatLoc, flatRef } from './adapters';
import type {
  AdminRef,
  BulkResult,
  Currency,
  FileKey,
  GovernorateDto,
  ID,
  IQD,
  ISODate,
  Localized,
  MarketerRef,
  NoteDto,
  OkDto,
  Paged,
  SchoolRef,
  PackageRef,
} from './types';
import type { IncentiveTier, Marketer, School, Settlement, SupportNote } from '@/types';
import type { AdminStudentRow } from './students';

// ─── DTOs ────────────────────────────────────────────────────────────────────
export type SchoolStatus = 'active' | 'pending' | 'suspended';
export interface SchoolDto {
  id: ID;
  name: Localized;
  code: string;
  referralLink: string;
  city: Localized;
  governorateId: string;
  governorate: GovernorateDto;
  contactName: string;
  contactMobile: string;
  marketerId: ID | null;
  marketer: MarketerRef | null;
  contractStart: ISODate;
  contractEnd: ISODate;
  status: SchoolStatus;
  verifiedPaidStudents: number;
  periodPaidStudents: number;
  tier: string;
  pendingSettlement: IQD;
  estimatedReward: IQD;
  notesCount: number;
  createdAt: ISODate;
  updatedAt: ISODate;
}
export interface SchoolWriteDto {
  name: Localized;
  code: string;
  city: Localized;
  governorateId: string;
  contactName: string;
  contactMobile: string;
  contractStart: ISODate;
  contractEnd: ISODate;
  status: SchoolStatus;
}
export interface SchoolStatsDto {
  total: number;
  active: number;
  pending: number;
  suspended: number;
  verifiedPaidStudents: number;
  pendingSettlement: IQD;
  tiers: string[];
}
export interface IncentiveTierDto {
  id: ID;
  from: number;
  to: number | null;
  rewardType: 'per_student' | 'fixed';
  amount: IQD;
  label: string;
}
export type PartnerType = 'school' | 'marketer';
export type RulePeriod = 'monthly' | 'quarterly' | 'semester' | 'yearly';
export interface IncentiveRuleDto {
  id: ID;
  version: number;
  name: Localized;
  partnerType: PartnerType;
  qualificationThreshold: number;
  tiers: IncentiveTierDto[];
  period: RulePeriod;
  effectiveFrom: ISODate;
  effectiveTo: ISODate | null;
  status: 'active' | 'scheduled' | 'superseded' | 'draft';
  createdBy: AdminRef;
  createdAt: ISODate;
  activatedBy: AdminRef | null;
  activatedAt: ISODate | null;
}
export interface IncentiveResultDto {
  qualified: boolean;
  tier: IncentiveTierDto | null;
  amount: IQD;
  nextTier: IncentiveTierDto | null;
  studentsToNext: number | null;
  breakdown: 'not_qualified' | 'no_tier' | 'per_student' | 'fixed';
}
export interface IncentiveProgressDto {
  rule: IncentiveRuleDto | null;
  period: { key: string; from: ISODate; to: ISODate };
  paid: number;
  result: IncentiveResultDto;
  progressPct: number;
}
export interface SettlementDto {
  id: ID;
  partnerType: PartnerType;
  partnerId: ID;
  partner: SchoolRef | MarketerRef;
  period: string;
  ruleId: ID | null;
  ruleVersion: number | null;
  qualifiedStudents: number;
  amount: IQD;
  currency: Currency;
  status: 'pending' | 'approved' | 'paid';
  approvedBy: AdminRef | null;
  approvedAt: ISODate | null;
  paidAt: ISODate | null;
  paidBy: AdminRef | null;
  paymentReference: string | null;
  note: string | null;
  createdAt: ISODate;
}
export type SettlementStatus = SettlementDto['status'];
export interface SettlementsMeta {
  totals: Record<SettlementStatus, { amount: IQD; count: number }>;
  periods: string[];
}
export interface GenerateResult {
  created: number;
  updated: number;
  skipped: number;
  settlements: SettlementDto[];
}
/** Attributed student row (subset of AdminStudentRow used here). */
export interface AttributedStudentDto {
  id: ID;
  name: Localized;
  mobile: string;
  avatarUrl: string | null;
  package: PackageRef | null;
  subscriptionStatus: string;
  createdAt: ISODate;
}
export interface MarketerDto {
  id: ID;
  name: Localized;
  mobile: string;
  email: string;
  avatarUrl: string | null;
  code: string | null;
  governorateId: string;
  governorate: GovernorateDto;
  schoolIds: ID[];
  schoolsCount: number;
  paidStudents: number;
  milestonesHit: number;
  pendingReward: IQD;
  status: 'active' | 'inactive';
  joinedAt: ISODate;
}
export interface MarketerWriteDto {
  name: Localized;
  mobile: string;
  email: string;
  governorateId: string;
  status: 'active' | 'inactive';
  code?: string | null;
  avatarFileKey?: FileKey | null;
}
export interface MarketerStatsDto {
  total: number;
  active: number;
  schoolsAssigned: number;
  paidStudents: number;
  pendingRewards: IQD;
}
export interface MilestoneItemDto {
  id: ID;
  threshold: number;
  reward: IQD;
  label: Localized;
}
export interface MilestoneSetDto {
  id: ID;
  version: number;
  status: 'active' | 'draft' | 'superseded';
  effectiveFrom: ISODate;
  items: MilestoneItemDto[];
  reachedBy: Record<ID, MarketerRef[]>;
  createdBy: AdminRef;
  createdAt: ISODate;
}
export interface MarketerDetailDto extends MarketerDto {
  schools: SchoolDto[];
  milestones: { set: MilestoneSetDto | null; next: MilestoneItemDto | null; prevThreshold: number; progressPct: number; toNext: number | null };
}

// ─── UI view models ──────────────────────────────────────────────────────────
export type SchoolVM = School & {
  referralLink: string;
  periodPaidStudents: number;
  estimatedReward: IQD;
  notesCount: number;
  governorateName_en: string;
  governorateName_ar: string;
  marketer: (MarketerRef & { name_en: string; name_ar: string }) | null;
};
export type MarketerVM = Marketer & { code: string | null; schoolsCount: number; governorateName_en: string; governorateName_ar: string };
export type IncentiveRuleVM = {
  id: ID;
  version: number;
  name_en: string;
  name_ar: string;
  partnerType: PartnerType;
  qualificationThreshold: number;
  tiers: IncentiveTier[];
  period: RulePeriod;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: IncentiveRuleDto['status'];
  createdBy: string;
  createdAt: string;
};
export type SettlementVM = Settlement & {
  partner_en: string;
  partner_ar: string;
  partnerCode: string | null;
  paymentReference: string | null;
  note: string | null;
  ruleVersion: number | null;
};
export type MilestoneItemVM = { id: ID; threshold: number; reward: IQD; label_en: string; label_ar: string };
export type MilestoneSetVM = Omit<MilestoneSetDto, 'items' | 'reachedBy' | 'createdBy'> & {
  items: MilestoneItemVM[];
  reachedBy: Record<ID, (MarketerRef & { name_en: string; name_ar: string })[]>;
  createdBy: string;
};

export const toSchool = (d: SchoolDto): SchoolVM => ({
  id: d.id,
  ...flatLoc('name', d.name),
  code: d.code,
  ...flatLoc('city', d.city),
  governorateId: d.governorateId,
  governorateName_en: d.governorate?.name.en ?? '',
  governorateName_ar: d.governorate?.name.ar ?? '',
  contactName: d.contactName,
  contactMobile: d.contactMobile,
  marketerId: d.marketerId,
  marketer: flatRef(d.marketer),
  contractStart: d.contractStart,
  contractEnd: d.contractEnd,
  status: d.status,
  verifiedPaidStudents: d.verifiedPaidStudents,
  tier: d.tier,
  pendingSettlement: d.pendingSettlement,
  notes: [] as SupportNote[],
  referralLink: d.referralLink,
  periodPaidStudents: d.periodPaidStudents,
  estimatedReward: d.estimatedReward,
  notesCount: d.notesCount,
});

export const toMarketer = (d: MarketerDto): MarketerVM => ({
  id: d.id,
  ...flatLoc('name', d.name),
  mobile: d.mobile,
  email: d.email,
  avatar: d.avatarUrl ?? '',
  governorateId: d.governorateId,
  governorateName_en: d.governorate?.name.en ?? '',
  governorateName_ar: d.governorate?.name.ar ?? '',
  schoolIds: d.schoolIds ?? [],
  schoolsCount: d.schoolsCount ?? d.schoolIds?.length ?? 0,
  paidStudents: d.paidStudents,
  milestonesHit: d.milestonesHit,
  pendingReward: d.pendingReward,
  status: d.status,
  joinedAt: d.joinedAt,
  code: d.code,
});

export const toRule = (d: IncentiveRuleDto): IncentiveRuleVM => ({
  id: d.id,
  version: d.version,
  ...flatLoc('name', d.name),
  partnerType: d.partnerType,
  qualificationThreshold: d.qualificationThreshold,
  tiers: d.tiers,
  period: d.period,
  effectiveFrom: d.effectiveFrom,
  effectiveTo: d.effectiveTo,
  status: d.status,
  createdBy: en(d.createdBy?.name),
  createdAt: d.createdAt,
});

export const toSettlement = (d: SettlementDto): SettlementVM => ({
  id: d.id,
  partnerType: d.partnerType,
  partnerId: d.partnerId,
  period: d.period,
  qualifiedStudents: d.qualifiedStudents,
  amount: d.amount,
  currency: d.currency,
  status: d.status,
  approvedBy: d.approvedBy ? en(d.approvedBy.name) : null,
  paidAt: d.paidAt,
  partner_en: d.partner?.name.en ?? '',
  partner_ar: d.partner?.name.ar ?? '',
  partnerCode: (d.partner as SchoolRef | undefined)?.code ?? null,
  paymentReference: d.paymentReference,
  note: d.note,
  ruleVersion: d.ruleVersion,
});

export const toMilestoneSet = (d: MilestoneSetDto): MilestoneSetVM => ({
  ...d,
  items: [...d.items].sort((a, b) => a.threshold - b.threshold).map((i) => ({ id: i.id, threshold: i.threshold, reward: i.reward, ...flatLoc('label', i.label) })),
  reachedBy: Object.fromEntries(Object.entries(d.reachedBy ?? {}).map(([k, v]) => [k, v.map((m) => flatRef(m))])),
  createdBy: en(d.createdBy?.name),
});

/** Client mirror of the server calculator (instant preview; server ADM-INC-07 is authoritative). */
export function calcIncentiveLocal(rule: { qualificationThreshold: number; tiers: IncentiveTier[] }, students: number) {
  if (students < rule.qualificationThreshold || students <= 0) return { qualified: false, tier: null as IncentiveTier | null, amount: 0 };
  const tier = rule.tiers.find((t) => students >= t.from && (t.to === null || students <= t.to)) ?? null;
  if (!tier) return { qualified: true, tier: null as IncentiveTier | null, amount: 0 };
  return { qualified: true, tier, amount: tier.rewardType === 'per_student' ? tier.amount * students : tier.amount };
}

// ─── API ─────────────────────────────────────────────────────────────────────
const partnerModule = (p: PartnerType) => (p === 'school' ? 'schools' : 'marketers');
export { partnerModule };

export const schoolsApi = {
  list: async (p: Query): Promise<Paged<SchoolVM>> => {
    const r = await api.list<SchoolDto>('/admin/schools', p);
    return { items: r.items.map(toSchool), meta: r.meta };
  },
  stats: () => api.get<SchoolStatsDto>('/admin/schools/stats'),
  get: async (id: ID) => toSchool(await api.get<SchoolDto>(`/admin/schools/${id}`)),
  create: (body: SchoolWriteDto & { marketerId?: ID | null }) => api.post<SchoolDto>('/admin/schools', body),
  update: (id: ID, body: Partial<SchoolWriteDto>) => api.patch<SchoolDto>(`/admin/schools/${id}`, body),
  remove: (id: ID) => api.delete<OkDto>(`/admin/schools/${id}`),
  bulkStatus: (body: { ids: ID[]; status: 'active' | 'suspended'; reason?: string }) => api.post<BulkResult>('/admin/schools/bulk/status', body),
  students: (id: ID, p: Query) => api.list<AttributedStudentDto>(`/admin/schools/${id}/students`, p),
  setMarketer: (id: ID, body: { marketerId: ID | null; overrideReason?: string }) => api.put<SchoolDto>(`/admin/schools/${id}/marketer`, body),
  progress: (id: ID, period?: string) => api.get<IncentiveProgressDto>(`/admin/schools/${id}/incentive-progress`, { period }),
  notes: (id: ID) => api.get<NoteDto[]>(`/admin/schools/${id}/notes`),
  addNote: (id: ID, body: string) => api.post<NoteDto>(`/admin/schools/${id}/notes`, { body }),
};

export const incentiveApi = {
  list: async (partnerType: PartnerType) => (await api.get<IncentiveRuleDto[]>('/admin/incentive-rules', { partnerType })).map(toRule),
  createVersion: (partnerType: PartnerType, cloneFromId?: ID) => api.post<IncentiveRuleDto>('/admin/incentive-rules', { partnerType, cloneFromId }),
  update: (
    id: ID,
    body: { name?: Localized; qualificationThreshold?: number; period?: RulePeriod; effectiveFrom?: ISODate; effectiveTo?: ISODate | null; tiers?: Omit<IncentiveTierDto, 'id'>[] },
  ) => api.patch<IncentiveRuleDto>(`/admin/incentive-rules/${id}`, body),
  remove: (id: ID) => api.delete<OkDto>(`/admin/incentive-rules/${id}`),
  activate: (id: ID) => api.post<{ activated: IncentiveRuleDto; superseded: IncentiveRuleDto | null }>(`/admin/incentive-rules/${id}/activate`),
  preview: (body: { qualificationThreshold: number; tiers: Omit<IncentiveTierDto, 'id'>[]; students: number }) =>
    api.post<IncentiveResultDto>('/admin/incentive-rules/preview', body),
};

export const settlementsApi = {
  list: async (p: Query): Promise<Paged<SettlementVM> & { totals: SettlementsMeta['totals'] | null; periods: string[] }> => {
    const r = await api.list<SettlementDto>('/admin/settlements', p);
    const m = r.meta as unknown as Partial<SettlementsMeta>;
    return { items: r.items.map(toSettlement), meta: r.meta, totals: m.totals ?? null, periods: m.periods ?? [] };
  },
  generate: (body: { partnerType: PartnerType; period: string; partnerIds?: ID[] }) => api.post<GenerateResult>('/admin/settlements/generate', body, idempotency()),
  approve: (id: ID) => api.post<SettlementDto>(`/admin/settlements/${id}/approve`),
  markPaid: (id: ID, body: { paymentReference?: string; note?: string; paidAt?: ISODate }) =>
    api.post<SettlementDto>(`/admin/settlements/${id}/mark-paid`, body, idempotency()),
  bulkApprove: (ids: ID[]) => api.post<BulkResult>('/admin/settlements/bulk/approve', { ids }),
  bulkMarkPaid: (ids: ID[], paymentReference?: string) => api.post<BulkResult>('/admin/settlements/bulk/mark-paid', { ids, paymentReference }, idempotency()),
};

export const marketersApi = {
  list: async (p: Query): Promise<Paged<MarketerVM>> => {
    const r = await api.list<MarketerDto>('/admin/marketers', p);
    return { items: r.items.map(toMarketer), meta: r.meta };
  },
  stats: () => api.get<MarketerStatsDto>('/admin/marketers/stats'),
  get: async (id: ID) => {
    const d = await api.get<MarketerDetailDto>(`/admin/marketers/${id}`);
    return {
      marketer: toMarketer(d),
      schools: (d.schools ?? []).map(toSchool),
      milestones: {
        set: d.milestones?.set ? toMilestoneSet(d.milestones.set) : null,
        next: d.milestones?.next ? { id: d.milestones.next.id, threshold: d.milestones.next.threshold, reward: d.milestones.next.reward, ...flatLoc('label', d.milestones.next.label) } : null,
        prevThreshold: d.milestones?.prevThreshold ?? 0,
        progressPct: d.milestones?.progressPct ?? 0,
        toNext: d.milestones?.toNext ?? null,
      },
    };
  },
  performance: (id: ID, months = 12) => api.get<{ month: string; students: number }[]>(`/admin/marketers/${id}/performance`, { months }),
  create: (body: MarketerWriteDto) => api.post<MarketerDto>('/admin/marketers', body),
  update: (id: ID, body: Partial<MarketerWriteDto>) => api.patch<MarketerDto>(`/admin/marketers/${id}`, body),
  remove: (id: ID) => api.delete<OkDto>(`/admin/marketers/${id}`),
  bulkStatus: (ids: ID[], status: 'active' | 'inactive') => api.post<BulkResult>('/admin/marketers/bulk/status', { ids, status }),
  assignSchool: (id: ID, schoolId: ID, overrideReason?: string) => api.post<MarketerDto>(`/admin/marketers/${id}/schools`, { schoolId, overrideReason }),
  unassignSchool: (id: ID, schoolId: ID) => api.delete<MarketerDto>(`/admin/marketers/${id}/schools/${schoolId}`),
  /** ADM-MKT-11 — students attributed to the marketer (own referral code + assigned schools). Sort name|createdAt|lastActive. */
  students: (id: ID, p: Query) => api.list<AdminStudentRow>(`/admin/marketers/${id}/students`, p),
  /** ADM-MKT-13 — progress under the marketer incentive rule for `period` (default current). */
  progress: (id: ID, period?: string) => api.get<IncentiveProgressDto>(`/admin/marketers/${id}/incentive-progress`, { period }),
};

export const milestonesApi = {
  list: async () => (await api.get<MilestoneSetDto[]>('/admin/milestone-sets')).map(toMilestoneSet),
  createDraft: (cloneFromId?: ID) => api.post<MilestoneSetDto>('/admin/milestone-sets', { cloneFromId }),
  saveDraft: (id: ID, body: { items: { id?: ID; threshold: number; reward: IQD; label: Localized }[]; effectiveFrom?: ISODate }) =>
    api.put<MilestoneSetDto>(`/admin/milestone-sets/${id}`, body),
  remove: (id: ID) => api.delete<OkDto>(`/admin/milestone-sets/${id}`),
  activate: (id: ID) => api.post<{ activated: MilestoneSetDto; superseded: MilestoneSetDto | null }>(`/admin/milestone-sets/${id}/activate`),
};

// ─── hooks ───────────────────────────────────────────────────────────────────
export const useSchoolStats = () => useApiQuery(qk.schools.sub('stats'), schoolsApi.stats);
export const useSchool = (id?: ID) => useApiQuery(qk.schools.detail(id), () => schoolsApi.get(id!), { enabled: !!id });
export const useSchoolProgress = (id?: ID) => useApiQuery(qk.schools.sub('progress', id), () => schoolsApi.progress(id!), { enabled: !!id });
export const useSchoolNotes = (id?: ID) => useApiQuery(qk.schools.sub('notes', id), () => schoolsApi.notes(id!), { enabled: !!id });
export const useIncentiveRules = (partnerType: PartnerType) => useApiQuery(qk.incentiveRules.list({ partnerType }), () => incentiveApi.list(partnerType));
export const useMarketerStats = () => useApiQuery(qk.marketers.sub('stats'), marketersApi.stats);
export const useMarketer = (id?: ID) => useApiQuery(qk.marketers.detail(id), () => marketersApi.get(id!), { enabled: !!id });
export const useMarketerProgress = (id?: ID) => useApiQuery(qk.marketers.sub('progress', id), () => marketersApi.progress(id!), { enabled: !!id });
export const useMarketerPerformance = (id?: ID) => useApiQuery(qk.marketers.sub('performance', id), () => marketersApi.performance(id!), { enabled: !!id });
export const useMilestoneSets = () => useApiQuery(qk.milestones.list(), milestonesApi.list);

/** Keys a partner mutation should refresh (lists, stats, lookups, analytics consumers). */
export const partnerKeys = [qk.schools.all, qk.marketers.all, qk.settlements.all, qk.lookups] as const;

