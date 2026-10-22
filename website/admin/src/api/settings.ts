/* Settings module (contract §31): settings sections, feature flags, legal documents, CMS (testimonials/FAQ).
 * DTOs use `Localized`; the settings pages keep their flat `<field>_en` / `<field>_ar` UI shapes, mapped here. */
import { useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { qk } from './keys';
import { useApiMutation, useApiQuery } from './hooks';
import { flatLoc, toLoc } from './adapters';
import type { AdminRef, FileKey, ID, ISODate, Lang, Localized, OkDto, Paged, Platform, StudentRef } from './types';

// ─── DTOs (§31) ──────────────────────────────────────────────────────────────
export type SettingsSection = 'general' | 'otp' | 'app' | 'support' | 'payments' | 'learning' | 'marketing' | 'security';
export type Timezone = 'Asia/Baghdad' | 'Asia/Dubai' | 'Asia/Riyadh' | 'Europe/Istanbul' | 'UTC';
export type DateFormat = 'd MMM yyyy' | 'dd/MM/yyyy' | 'yyyy-MM-dd';
export type GatewayId = 'zaincash' | 'fastpay' | 'qicard' | 'asiahawala' | 'visa' | 'mock';
export type OtpProvider = 'korek' | 'twilio' | 'whatsapp';

export interface GeneralSettingsDto {
  platformName: Localized;
  logoUrl: string | null;
  logoFileKey?: FileKey | null;
  defaultLanguage: Lang;
  currency: 'IQD' | 'USD';
  timezone: Timezone;
  dateFormat: DateFormat;
  academicYear: string;
}
export interface OtpSettingsDto {
  expirySeconds: number;
  codeLength: 4 | 6;
  resendLimit: number;
  resendCooldownSeconds: number;
  maxAttempts: number;
  lockoutMinutes: number;
  provider: OtpProvider;
  fallbackProvider: 'none' | OtpProvider;
  devBypassCode: string | null;
}
export interface AppSettingsDto {
  minVersionIos: string;
  minVersionAndroid: string;
  latestVersion: string;
  forceUpdate: boolean;
  maintenanceMode: boolean;
  maintenanceMessage: Localized;
  deviceLimit: number;
  sessionTimeoutMinutes: number;
  storeUrls: { ios: string | null; android: string | null };
  maintenanceAppliesTo: Platform[];
}
export interface SupportContactsDto {
  phone: string;
  whatsapp: string;
  email: string;
  hours: Localized;
  address: Localized;
  facebook: string;
  instagram: string;
  telegram: string;
  youtube: string;
  tiktok: string;
}
export interface PaymentSettingsDto {
  gateways: { id: GatewayId; enabled: boolean; feeRatePct: number; name: Localized; color: string; displayOrder: number }[];
  mockGatewayEnabled: boolean;
  receiptCompany: { name: Localized; address: Localized; email: string };
  taxNote: Localized;
}
export interface LearningSettingsDto {
  quizQuestionCount: number;
  quizPassMark: number;
  examDefaultPassMark: number;
  practiceSessionSizes: number[];
  practiceMaxSize: number;
  dailyGoalMinutes: number;
  watchHeartbeatSeconds: number;
  examAutosaveSeconds: number;
  examGraceSeconds: number;
  gradeBands: { key: string; min: number }[];
  heatmapLevels: number[];
}
export interface MarketingSettingsDto {
  stats: { satisfactionPct: number; passRatePct: number; rating: number; ratingCount: number };
  displayOverrides: Partial<Record<'students' | 'lessons' | 'questions', string>>;
  appLinks: { appStore: string | null; googlePlay: string | null };
}
export interface SecuritySettingsDto {
  adminMfaMandatory: boolean;
  adminSessionHours: number;
  passwordMinLength: number;
}

// ─── UI shapes (flat bilingual fields) ───────────────────────────────────────
export interface GeneralSettings {
  platformName: string;
  platformName_ar: string;
  logo: string | null;
  /** Set when a new logo was uploaded (sent as `logoFileKey`); `null` with `logo: null` clears it. */
  logoFileKey?: FileKey | null;
  defaultLanguage: Lang;
  currency: 'IQD' | 'USD';
  timezone: string;
  dateFormat: DateFormat;
  academicYear: string;
}
export type OtpSettings = OtpSettingsDto;
export interface AppSettings {
  minVersionIos: string;
  minVersionAndroid: string;
  latestVersion: string;
  forceUpdate: boolean;
  maintenanceMode: boolean;
  maintenanceMessage_en: string;
  maintenanceMessage_ar: string;
  deviceLimit: number;
  sessionTimeoutMinutes: number;
  storeUrlIos: string;
  storeUrlAndroid: string;
  maintenanceAppliesTo: Platform[];
}
export interface SupportContacts {
  phone: string;
  whatsapp: string;
  email: string;
  hours_en: string;
  hours_ar: string;
  address_en: string;
  address_ar: string;
  facebook: string;
  instagram: string;
  telegram: string;
  youtube: string;
  tiktok: string;
}
export interface PaymentGatewayUi {
  id: GatewayId;
  enabled: boolean;
  feeRatePct: number;
  name_en: string;
  name_ar: string;
  color: string;
  displayOrder: number;
}
export interface PaymentSettings {
  gateways: PaymentGatewayUi[];
  mockGatewayEnabled: boolean;
  companyName_en: string;
  companyName_ar: string;
  companyAddress_en: string;
  companyAddress_ar: string;
  companyEmail: string;
  taxNote_en: string;
  taxNote_ar: string;
}
export type LearningSettings = LearningSettingsDto;
export type MarketingSettings = MarketingSettingsDto;
export type SecuritySettings = SecuritySettingsDto;

interface SectionMap {
  general: [GeneralSettingsDto, GeneralSettings];
  otp: [OtpSettingsDto, OtpSettings];
  app: [AppSettingsDto, AppSettings];
  support: [SupportContactsDto, SupportContacts];
  payments: [PaymentSettingsDto, PaymentSettings];
  learning: [LearningSettingsDto, LearningSettings];
  marketing: [MarketingSettingsDto, MarketingSettings];
  security: [SecuritySettingsDto, SecuritySettings];
}
type Dto<S extends SettingsSection> = SectionMap[S][0];
type Ui<S extends SettingsSection> = SectionMap[S][1];

// ─── adapters ────────────────────────────────────────────────────────────────
const identity = <T,>(x: T) => x;

const adapters: { [S in SettingsSection]: { toUi: (d: Dto<S>) => Ui<S>; toDto: (u: Ui<S>) => Partial<Dto<S>> } } = {
  general: {
    toUi: (d) => ({
      platformName: d.platformName?.en ?? '',
      platformName_ar: d.platformName?.ar ?? '',
      logo: d.logoUrl ?? null,
      defaultLanguage: d.defaultLanguage,
      currency: d.currency,
      timezone: d.timezone,
      dateFormat: d.dateFormat,
      academicYear: d.academicYear ?? '',
    }),
    toDto: (u) => ({
      platformName: { en: u.platformName.trim(), ar: u.platformName_ar.trim() },
      ...(u.logoFileKey !== undefined ? { logoFileKey: u.logoFileKey } : u.logo === null ? { logoFileKey: null } : {}),
      defaultLanguage: u.defaultLanguage,
      currency: u.currency,
      timezone: u.timezone as Timezone,
      dateFormat: u.dateFormat,
      academicYear: u.academicYear,
    }),
  },
  otp: { toUi: (d) => ({ ...d, devBypassCode: d.devBypassCode ?? null }), toDto: (u) => ({ ...u, devBypassCode: u.devBypassCode?.trim() ? u.devBypassCode.trim() : null }) },
  app: {
    toUi: (d) => ({
      minVersionIos: d.minVersionIos,
      minVersionAndroid: d.minVersionAndroid,
      latestVersion: d.latestVersion,
      forceUpdate: d.forceUpdate,
      maintenanceMode: d.maintenanceMode,
      ...flatLoc('maintenanceMessage', d.maintenanceMessage),
      deviceLimit: d.deviceLimit,
      sessionTimeoutMinutes: d.sessionTimeoutMinutes,
      storeUrlIos: d.storeUrls?.ios ?? '',
      storeUrlAndroid: d.storeUrls?.android ?? '',
      maintenanceAppliesTo: d.maintenanceAppliesTo ?? ['web', 'ios', 'android'],
    }),
    toDto: (u) => ({
      minVersionIos: u.minVersionIos.trim(),
      minVersionAndroid: u.minVersionAndroid.trim(),
      latestVersion: u.latestVersion.trim(),
      forceUpdate: u.forceUpdate,
      maintenanceMode: u.maintenanceMode,
      maintenanceMessage: toLoc(u, 'maintenanceMessage'),
      deviceLimit: u.deviceLimit,
      sessionTimeoutMinutes: u.sessionTimeoutMinutes,
      storeUrls: { ios: u.storeUrlIos.trim() || null, android: u.storeUrlAndroid.trim() || null },
      maintenanceAppliesTo: u.maintenanceAppliesTo,
    }),
  },
  support: {
    toUi: (d) => ({
      phone: d.phone ?? '',
      whatsapp: d.whatsapp ?? '',
      email: d.email ?? '',
      ...flatLoc('hours', d.hours),
      ...flatLoc('address', d.address),
      facebook: d.facebook ?? '',
      instagram: d.instagram ?? '',
      telegram: d.telegram ?? '',
      youtube: d.youtube ?? '',
      tiktok: d.tiktok ?? '',
    }),
    toDto: (u) => ({
      phone: u.phone.trim(),
      whatsapp: u.whatsapp.trim(),
      email: u.email.trim(),
      hours: toLoc(u, 'hours'),
      address: toLoc(u, 'address'),
      facebook: u.facebook.trim(),
      instagram: u.instagram.trim(),
      telegram: u.telegram.trim(),
      youtube: u.youtube.trim(),
      tiktok: u.tiktok.trim(),
    }),
  },
  payments: {
    toUi: (d) => ({
      gateways: [...(d.gateways ?? [])]
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map((g) => ({ id: g.id, enabled: g.enabled, feeRatePct: g.feeRatePct, ...flatLoc('name', g.name), color: g.color, displayOrder: g.displayOrder })),
      mockGatewayEnabled: d.mockGatewayEnabled,
      ...flatLoc('companyName', d.receiptCompany?.name),
      ...flatLoc('companyAddress', d.receiptCompany?.address),
      companyEmail: d.receiptCompany?.email ?? '',
      ...flatLoc('taxNote', d.taxNote),
    }),
    toDto: (u) => ({
      gateways: u.gateways.map((g, i) => ({ id: g.id, enabled: g.enabled, feeRatePct: g.feeRatePct, name: toLoc(g, 'name'), color: g.color, displayOrder: i + 1 })),
      mockGatewayEnabled: u.mockGatewayEnabled,
      receiptCompany: { name: toLoc(u, 'companyName'), address: toLoc(u, 'companyAddress'), email: u.companyEmail.trim() },
      taxNote: toLoc(u, 'taxNote'),
    }),
  },
  learning: { toUi: identity, toDto: identity },
  marketing: { toUi: identity, toDto: identity },
  security: { toUi: identity, toDto: identity },
};

// ─── settings sections (ADM-CFG-01/02) ───────────────────────────────────────
export const settingsApi = {
  get: <S extends SettingsSection>(section: S) => api.get<Dto<S>>(`/admin/settings/${section}`),
  put: <S extends SettingsSection>(section: S, body: Partial<Dto<S>>) => api.put<Dto<S>>(`/admin/settings/${section}`, body),
};

/** Read one settings section mapped to its UI shape. */
export function useSettingsSection<S extends SettingsSection>(section: S, enabled = true) {
  return useApiQuery(qk.settings.sub(section), async () => adapters[section].toUi((await settingsApi.get(section)) as Dto<S>) as Ui<S>, { enabled });
}

/** Save (PUT, server merges + audits changed keys) a settings section. */
export function useSaveSettings<S extends SettingsSection>(section: S) {
  const qc = useQueryClient();
  return useApiMutation(async (value: Ui<S>) => adapters[section].toUi((await settingsApi.put(section, adapters[section].toDto(value))) as Dto<S>) as Ui<S>, {
    success: 'toast.saved',
    onSuccess: (data) => {
      qc.setQueryData(qk.settings.sub(section), data);
    },
    invalidate: [qk.settings.sub(section), ...(section === 'payments' ? [qk.lookups] : [])],
  });
}

// ─── feature flags (ADM-FLG-01..04) ──────────────────────────────────────────
export type FlagEnvironment = 'production' | 'staging' | 'beta';
export interface FeatureFlagDto {
  id: ID;
  key: string;
  name: Localized;
  description: Localized;
  enabled: boolean;
  environment: FlagEnvironment;
  platforms: Platform[];
  rolloutPct: number;
  updatedAt: ISODate;
  updatedBy: AdminRef | null;
}
export interface FeatureFlagUi {
  id: ID;
  key: string;
  name_en: string;
  name_ar: string;
  description_en: string;
  description_ar: string;
  enabled: boolean;
  environment: FlagEnvironment;
  platforms: Platform[];
  rolloutPct: number;
  updatedAt: ISODate;
  updatedBy: AdminRef | null;
}
export interface FlagCounts {
  total: number;
  enabled: number;
  production: number;
  betaStaging: number;
}
export const flagFromDto = (f: FeatureFlagDto): FeatureFlagUi => ({
  id: f.id,
  key: f.key,
  ...flatLoc('name', f.name),
  ...flatLoc('description', f.description),
  enabled: f.enabled,
  environment: f.environment,
  platforms: f.platforms?.length ? f.platforms : ['web', 'ios', 'android'],
  rolloutPct: f.rolloutPct ?? 100,
  updatedAt: f.updatedAt,
  updatedBy: f.updatedBy ?? null,
});

export interface FlagCreateInput {
  key: string;
  name: Localized;
  description: Localized;
  environment: FlagEnvironment;
  enabled: boolean;
}

export const flagsApi = {
  list: async (params?: { environment?: string; q?: string }) => {
    const r = await api.list<FeatureFlagDto>('/admin/feature-flags', params);
    const counts = (r.meta.counts as FlagCounts | undefined) ?? null;
    return { items: r.items.map(flagFromDto), counts };
  },
  patch: (id: ID, body: { enabled?: boolean; platforms?: Platform[]; rolloutPct?: number }) => api.patch<FeatureFlagDto>(`/admin/feature-flags/${id}`, body).then(flagFromDto),
  create: (body: FlagCreateInput) => api.post<FeatureFlagDto>('/admin/feature-flags', body).then(flagFromDto),
  remove: (id: ID) => api.delete<OkDto>(`/admin/feature-flags/${id}`),
};

export function useFeatureFlags(params: { environment?: string; q?: string }) {
  return useApiQuery(qk.featureFlags.list(params), () => flagsApi.list(params));
}

// ─── legal documents (ADM-LGL-01..07) ────────────────────────────────────────
export type LegalDoc = 'terms' | 'privacy';
export interface LegalVersionDto {
  id: ID;
  doc: LegalDoc;
  version: string;
  title: Localized;
  body: Localized;
  status: 'draft' | 'published' | 'retired';
  publishedAt: ISODate | null;
  acceptances: number;
  changeSummary: Localized | null;
  createdBy: AdminRef;
  createdAt: ISODate;
  updatedAt: ISODate;
}
export interface LegalVersionUi {
  id: ID;
  doc: LegalDoc;
  version: string;
  title_en: string;
  title_ar: string;
  body_en: string;
  body_ar: string;
  changeSummary_en: string;
  changeSummary_ar: string;
  status: 'draft' | 'published' | 'retired';
  publishedAt: ISODate | null;
  acceptances: number;
  createdBy: AdminRef | null;
  createdAt: ISODate;
  updatedAt: ISODate;
}
export interface LegalStatsDto {
  currentVersion: string | null;
  publishedAt: ISODate | null;
  acceptances: number;
  totalStudents: number;
  rate: number;
  pendingReacceptance: number;
  byVersion: { version: string; acceptances: number }[];
}
export interface LegalAcceptanceDto {
  student: StudentRef;
  acceptedAt: ISODate;
  platform: Platform;
  ip: string;
}
export interface LegalDraftInput {
  version?: string;
  title?: Localized;
  body?: Localized;
  changeSummary?: Localized | null;
}

export const legalFromDto = (v: LegalVersionDto): LegalVersionUi => ({
  id: v.id,
  doc: v.doc,
  version: v.version,
  ...flatLoc('title', v.title),
  ...flatLoc('body', v.body),
  ...flatLoc('changeSummary', v.changeSummary),
  status: v.status,
  publishedAt: v.publishedAt,
  acceptances: v.acceptances ?? 0,
  createdBy: v.createdBy ?? null,
  createdAt: v.createdAt,
  updatedAt: v.updatedAt,
});

export const legalApi = {
  versions: (doc: LegalDoc) => api.get<LegalVersionDto[]>(`/admin/legal/${doc}/versions`).then((r) => r.map(legalFromDto)),
  createDraft: (doc: LegalDoc, body: { version?: string; cloneFromId?: ID }) => api.post<LegalVersionDto>(`/admin/legal/${doc}/versions`, body).then(legalFromDto),
  update: (id: ID, body: LegalDraftInput) => api.patch<LegalVersionDto>(`/admin/legal/versions/${id}`, body).then(legalFromDto),
  publish: (id: ID, requireReacceptance: boolean) =>
    api.post<{ published: LegalVersionDto; retired: LegalVersionDto | null }>(`/admin/legal/versions/${id}/publish`, { requireReacceptance }),
  remove: (id: ID) => api.delete<OkDto>(`/admin/legal/versions/${id}`),
  stats: (doc: LegalDoc) => api.get<LegalStatsDto>(`/admin/legal/${doc}/stats`),
  acceptances: (id: ID, params: { q?: string; page: number; pageSize: number }): Promise<Paged<LegalAcceptanceDto>> =>
    api.list<LegalAcceptanceDto>(`/admin/legal/versions/${id}/acceptances`, params),
};

export const useLegalVersions = (doc: LegalDoc) => useApiQuery(qk.legal.sub('versions', doc), () => legalApi.versions(doc));
export const useLegalStats = (doc: LegalDoc) => useApiQuery(qk.legal.sub('stats', doc), () => legalApi.stats(doc));

// ─── CMS (ADM-CMS-01..09) ────────────────────────────────────────────────────
export type TestimonialPlacement = 'landing' | 'auth' | 'app';
export type FaqPlacement = 'landing' | 'pricing' | 'subscription_app' | 'contact';
export interface TestimonialDto {
  id: ID;
  name: Localized;
  city: Localized;
  role: Localized;
  quote: Localized;
  avatar: string | null;
  rating: number;
  order: number;
  active: boolean;
  placements: TestimonialPlacement[];
}
export interface FaqDto {
  id: ID;
  q: Localized;
  a: Localized;
  order: number;
  active: boolean;
  placements: FaqPlacement[];
}
export interface TestimonialInput {
  name: Localized;
  city: Localized;
  role: Localized;
  quote: Localized;
  avatarFileKey?: FileKey | null;
  rating: number;
  placements: TestimonialPlacement[];
  order: number;
  active: boolean;
}
export interface FaqInput {
  q: Localized;
  a: Localized;
  placements: FaqPlacement[];
  order: number;
  active: boolean;
}

const byOrder = <T extends { order: number }>(a: T, b: T) => a.order - b.order;

export const cmsApi = {
  testimonials: () => api.get<TestimonialDto[]>('/admin/cms/testimonials').then((r) => [...r].sort(byOrder)),
  createTestimonial: (body: TestimonialInput) => api.post<TestimonialDto>('/admin/cms/testimonials', body),
  updateTestimonial: (id: ID, body: Partial<TestimonialInput>) => api.patch<TestimonialDto>(`/admin/cms/testimonials/${id}`, body),
  removeTestimonial: (id: ID) => api.delete<OkDto>(`/admin/cms/testimonials/${id}`),
  faq: () => api.get<FaqDto[]>('/admin/cms/faq').then((r) => [...r].sort(byOrder)),
  createFaq: (body: FaqInput) => api.post<FaqDto>('/admin/cms/faq', body),
  updateFaq: (id: ID, body: Partial<FaqInput>) => api.patch<FaqDto>(`/admin/cms/faq/${id}`, body),
  removeFaq: (id: ID) => api.delete<OkDto>(`/admin/cms/faq/${id}`),
  reorder: (kind: 'testimonials' | 'faq', ids: ID[]) => api.put<OkDto>('/admin/cms/order', { kind, ids }),
};

export const useTestimonials = () => useApiQuery(qk.cms.sub('testimonials'), cmsApi.testimonials);
export const useFaq = () => useApiQuery(qk.cms.sub('faq'), cmsApi.faq);
