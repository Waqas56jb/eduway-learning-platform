/* Packages, promotions & subscriptions (contract §24 — ADM-PKG-*, ADM-PRM-*, ADM-SBS-*). */
import type { Package, Promotion } from '@/types';
import { api, idempotency, type Query } from './client';
import { qk } from './keys';
import { useApiMutation, useApiQuery } from './hooks';
import { flatLoc, flatRef } from './adapters';
import type { ID, ISODate, Localized, MarketerRef, OkDto, PackageRef, SchoolRef, StudentRef, SubjectRef } from './types';

// ─── DTOs ────────────────────────────────────────────────────────────────────
export interface PackageComparison {
  subjectsCount: number;
  lessons: boolean;
  quizzes: boolean;
  questionBank: 'subject' | 'full' | 'unlimited';
  mistakes: boolean;
  examSimulator: boolean | 'unlimited';
  aiQuota: number;
  pdfResources: boolean;
  analytics: boolean;
  devices: number;
  prioritySupport: boolean;
}

export interface AdminPackageDto {
  id: ID;
  name: Localized;
  description: Localized;
  tagline: Localized;
  subjectIds: ID[];
  subjects: SubjectRef[];
  price: number;
  currency: Package['currency'];
  taxBehavior: Package['taxBehavior'];
  validityType: Package['validityType'];
  validityValue: number;
  validUntil: ISODate | null;
  yearlyPrice: number | null;
  yearlyValidityDays: number;
  renewal: Package['renewal'];
  accessStart: Package['accessStart'];
  accessStartDate: ISODate | null;
  status: Package['status'];
  featured: boolean;
  order: number;
  aiQuota: number | null;
  features: Localized[];
  comparison: PackageComparison;
  subscribers: number;
  createdAt: ISODate;
  updatedAt: ISODate;
}
export type PackageWriteDto = Omit<AdminPackageDto, 'id' | 'subjects' | 'subscribers' | 'createdAt' | 'updatedAt'>;

export type PromoPhase = 'live' | 'upcoming' | 'expired' | 'exhausted' | 'disabled';
export interface PromotionDto {
  id: ID;
  code: string;
  type: Promotion['type'];
  discountType: Promotion['discountType'];
  discountValue: number;
  packageIds: ID[];
  packages: PackageRef[];
  eligibility: Promotion['eligibility'];
  usageLimit: number;
  perUserLimit: number;
  used: number;
  validFrom: ISODate;
  validTo: ISODate;
  enabled: boolean;
  ownerType: 'school' | 'marketer' | null;
  ownerId: ID | null;
  owner: SchoolRef | MarketerRef | null;
  phase: PromoPhase;
  createdAt: ISODate;
  updatedAt: ISODate;
}
export type PromotionWriteDto = Omit<PromotionDto, 'id' | 'used' | 'phase' | 'packages' | 'owner' | 'createdAt' | 'updatedAt'>;

export interface RedemptionDto {
  id: ID;
  student: StudentRef;
  paymentId: ID;
  ref: string;
  discount: number;
  at: ISODate;
}

export type BillingCycle = 'monthly' | 'yearly';
export interface AdminSubscriptionDto {
  id: ID;
  student: StudentRef;
  package: PackageRef;
  cycle: BillingCycle;
  status: 'active' | 'trial' | 'expired' | 'cancelled';
  source: 'payment' | 'manual' | 'trial';
  startedAt: ISODate;
  endsAt: ISODate;
  cancelledAt: ISODate | null;
  lastPaymentId: ID | null;
}

// ─── UI view models (flat bilingual fields, contract §0.7) ───────────────────
export interface PackageVM extends Package {
  tagline_en: string;
  tagline_ar: string;
  yearlyPrice: number | null;
  yearlyValidityDays: number;
  aiQuota: number | null;
  features: Localized[];
  comparison: PackageComparison;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface PromotionVM extends Promotion {
  phase: PromoPhase;
  perUserLimit: number;
  ownerType: 'school' | 'marketer' | null;
  ownerName_en: string;
  ownerName_ar: string;
  packages: (PackageRef & { name_en: string; name_ar: string })[];
}

export interface SubscriptionVM extends AdminSubscriptionDto {
  studentName_en: string;
  studentName_ar: string;
  packageName_en: string;
  packageName_ar: string;
}

export const DEFAULT_COMPARISON: PackageComparison = {
  subjectsCount: 0,
  lessons: true,
  quizzes: true,
  questionBank: 'subject',
  mistakes: true,
  examSimulator: true,
  aiQuota: 0,
  pdfResources: true,
  analytics: true,
  devices: 2,
  prioritySupport: false,
};

export function toPackageVM(d: AdminPackageDto): PackageVM {
  return {
    id: d.id,
    ...flatLoc('name', d.name),
    ...flatLoc('description', d.description),
    ...flatLoc('tagline', d.tagline),
    subjectIds: d.subjectIds ?? [],
    price: d.price,
    currency: d.currency,
    taxBehavior: d.taxBehavior,
    validityType: d.validityType,
    validityValue: d.validityValue,
    validUntil: d.validUntil,
    renewal: d.renewal,
    accessStart: d.accessStart,
    accessStartDate: d.accessStartDate,
    status: d.status,
    featured: d.featured,
    subscribers: d.subscribers ?? 0,
    yearlyPrice: d.yearlyPrice ?? null,
    yearlyValidityDays: d.yearlyValidityDays ?? 365,
    aiQuota: d.aiQuota ?? null,
    features: d.features ?? [],
    comparison: { ...DEFAULT_COMPARISON, ...(d.comparison ?? {}) },
    order: d.order ?? 0,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

/** Form values (flat) → write DTO. */
export type PackageFormInput = Omit<PackageVM, 'id' | 'subscribers' | 'createdAt' | 'updatedAt'>;
export function toPackageWrite(v: PackageFormInput): PackageWriteDto {
  return {
    name: { en: v.name_en.trim(), ar: v.name_ar.trim() },
    description: { en: v.description_en ?? '', ar: v.description_ar ?? '' },
    tagline: { en: v.tagline_en ?? '', ar: v.tagline_ar ?? '' },
    subjectIds: v.subjectIds,
    price: v.price,
    currency: v.currency,
    taxBehavior: v.taxBehavior,
    validityType: v.validityType,
    validityValue: v.validityValue,
    validUntil: v.validUntil,
    yearlyPrice: v.yearlyPrice,
    yearlyValidityDays: v.yearlyValidityDays,
    renewal: v.renewal,
    accessStart: v.accessStart,
    accessStartDate: v.accessStartDate,
    status: v.status,
    featured: v.featured,
    order: v.order,
    aiQuota: v.aiQuota,
    features: v.features.filter((f) => f.en.trim() || f.ar.trim()),
    comparison: v.comparison,
  };
}

export function toPromotionVM(d: PromotionDto): PromotionVM {
  const owner = d.owner ? flatRef(d.owner as { name: Localized }) : null;
  return {
    id: d.id,
    code: d.code,
    type: d.type,
    discountType: d.discountType,
    discountValue: d.discountValue,
    packageIds: d.packageIds ?? [],
    eligibility: d.eligibility,
    usageLimit: d.usageLimit,
    used: d.used,
    validFrom: d.validFrom,
    validTo: d.validTo,
    enabled: d.enabled,
    ownerId: d.ownerId,
    ownerType: d.ownerType,
    ownerName_en: owner?.name_en ?? '',
    ownerName_ar: owner?.name_ar ?? '',
    phase: d.phase,
    perUserLimit: d.perUserLimit ?? 1,
    packages: (d.packages ?? []).map((p) => flatRef(p)),
  };
}

export function toSubscriptionVM(d: AdminSubscriptionDto): SubscriptionVM {
  return {
    ...d,
    studentName_en: d.student?.name?.en ?? '',
    studentName_ar: d.student?.name?.ar ?? '',
    packageName_en: d.package?.name?.en ?? '',
    packageName_ar: d.package?.name?.ar ?? '',
  };
}

// ─── API ─────────────────────────────────────────────────────────────────────
export const packagesApi = {
  list: (params?: Query) => api.list<AdminPackageDto>('/admin/packages', params),
  get: (id: ID) => api.get<AdminPackageDto>(`/admin/packages/${id}`),
  create: (body: PackageWriteDto) => api.post<AdminPackageDto>('/admin/packages', body),
  update: (id: ID, body: Partial<PackageWriteDto>) => api.patch<AdminPackageDto>(`/admin/packages/${id}`, body),
  duplicate: (id: ID) => api.post<AdminPackageDto>(`/admin/packages/${id}/duplicate`),
  archive: (id: ID, reason?: string) => api.post<AdminPackageDto>(`/admin/packages/${id}/archive`, reason ? { reason } : {}),
  restore: (id: ID) => api.post<AdminPackageDto>(`/admin/packages/${id}/restore`),
  remove: (id: ID) => api.delete<OkDto>(`/admin/packages/${id}`),
  reorder: (ids: ID[]) => api.put<AdminPackageDto[]>('/admin/packages/order', { ids }),
};

export const promotionsApi = {
  list: (params?: Query) => api.list<PromotionDto>('/admin/promotions', params),
  stats: () => api.get<{ live: number; total: number; redemptions: number; nearLimit: number }>('/admin/promotions/stats'),
  create: (body: PromotionWriteDto) => api.post<PromotionDto>('/admin/promotions', body),
  update: (id: ID, body: Partial<PromotionWriteDto>) => api.patch<PromotionDto>(`/admin/promotions/${id}`, body),
  remove: (id: ID) => api.delete<OkDto>(`/admin/promotions/${id}`),
  checkCode: (code: string, excludeId?: ID) => api.get<{ available: boolean }>('/admin/promotions/check-code', { code, excludeId }),
  generateCode: (prefix = 'EDU-') => api.get<{ code: string }>('/admin/promotions/generate-code', { prefix }),
  redemptions: (id: ID, params?: Query) => api.list<RedemptionDto>(`/admin/promotions/${id}/redemptions`, params),
};

export const subscriptionsApi = {
  list: (params?: Query) => api.list<AdminSubscriptionDto>('/admin/subscriptions', params),
  grant: (body: { studentId: ID; packageId: ID; days?: number; startsAt?: ISODate; reason: string }, key?: string) =>
    api.post<AdminSubscriptionDto>('/admin/subscriptions/grant', body, idempotency(key)),
  changePackage: (id: ID, body: { packageId: ID; reason: string; keepEndDate?: boolean }) =>
    api.post<AdminSubscriptionDto>(`/admin/subscriptions/${id}/change-package`, body),
  extend: (id: ID, body: { days: number; reason: string }) => api.post<AdminSubscriptionDto>(`/admin/subscriptions/${id}/extend`, body),
  cancel: (id: ID, body: { reason: string; immediate?: boolean }) => api.post<AdminSubscriptionDto>(`/admin/subscriptions/${id}/cancel`, body),
};

/** Admin student search (SRC-01, scope students). */
export const searchStudents = (q: string) =>
  api.get<{ students?: StudentRef[] }>('/search', { q, scopes: ['students'], limit: 8 }).then((r) => r.students ?? []);

// ─── hooks ───────────────────────────────────────────────────────────────────
/** All packages (unpaged, small list) mapped to the flat UI shape. */
export function usePackagesList(params: Query = {}) {
  return useApiQuery(qk.packages.list(params), async () => (await packagesApi.list({ pageSize: 100, ...params })).items.map(toPackageVM));
}

export function usePromotionStats() {
  return useApiQuery(qk.promotions.sub('stats'), promotionsApi.stats);
}

const PKG_INVALIDATE = [qk.packages.all, qk.lookups];

export function usePackageMutations() {
  return {
    create: useApiMutation((v: PackageFormInput) => packagesApi.create(toPackageWrite(v)), {
      invalidate: PKG_INVALIDATE,
      success: 'packages.toastCreated',
    }),
    update: useApiMutation((v: { id: ID; values: PackageFormInput }) => packagesApi.update(v.id, toPackageWrite(v.values)), {
      invalidate: PKG_INVALIDATE,
      success: 'packages.toastUpdated',
    }),
    duplicate: useApiMutation((id: ID) => packagesApi.duplicate(id), { invalidate: PKG_INVALIDATE, success: 'packages.duplicated' }),
    archive: useApiMutation((id: ID) => packagesApi.archive(id), { invalidate: PKG_INVALIDATE, success: 'packages.archived' }),
    restore: useApiMutation((id: ID) => packagesApi.restore(id), { invalidate: PKG_INVALIDATE, success: 'packages.restored' }),
    remove: useApiMutation((id: ID) => packagesApi.remove(id), { invalidate: PKG_INVALIDATE, success: 'packages.deleted' }),
  };
}

const SUB_INVALIDATE = [qk.subscriptions.all, qk.packages.all, qk.students.all];

export function useSubscriptionMutations() {
  return {
    grant: useApiMutation((v: { studentId: ID; packageId: ID; days?: number; reason: string; key: string }) => subscriptionsApi.grant({ studentId: v.studentId, packageId: v.packageId, days: v.days, reason: v.reason }, v.key), {
      invalidate: SUB_INVALIDATE,
      success: 'packages.subs.granted',
    }),
    extend: useApiMutation((v: { id: ID; days: number; reason: string }) => subscriptionsApi.extend(v.id, { days: v.days, reason: v.reason }), {
      invalidate: SUB_INVALIDATE,
      success: 'packages.subs.extended',
    }),
    change: useApiMutation((v: { id: ID; packageId: ID; reason: string; keepEndDate: boolean }) => subscriptionsApi.changePackage(v.id, { packageId: v.packageId, reason: v.reason, keepEndDate: v.keepEndDate }), {
      invalidate: SUB_INVALIDATE,
      success: 'packages.subs.changed',
    }),
    cancel: useApiMutation((v: { id: ID; reason: string; immediate: boolean }) => subscriptionsApi.cancel(v.id, { reason: v.reason, immediate: v.immediate }), {
      invalidate: SUB_INVALIDATE,
      success: 'packages.subs.cancelled',
    }),
  };
}
