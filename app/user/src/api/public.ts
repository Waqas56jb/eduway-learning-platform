import { useQuery } from '@tanstack/react-query';
import { get } from './client';
import { qk } from './keys';
import type {
  AppConfigDto,
  FaqItem,
  Governorate,
  LegalDoc,
  LegalDocumentDto,
  PaymentMethodDto,
  PublicSchool,
  PublicStatsDto,
  ReferralCheckDto,
  TeacherDto,
} from './types';

const HOUR = 60 * 60_000;

// PUB-01
export const fetchAppConfig = () => get<AppConfigDto>('/public/app-config', undefined, { skipAuth: true });
export const useAppConfig = () =>
  useQuery({ queryKey: qk.public.appConfig, queryFn: fetchAppConfig, staleTime: 5 * 60_000, meta: { silent: true } });

// PUB-02
export const useGovernorates = () =>
  useQuery({
    queryKey: qk.public.governorates,
    queryFn: () => get<Governorate[]>('/public/governorates', undefined, { skipAuth: true }),
    staleTime: 24 * HOUR,
  });

// PUB-03
export const useSchools = (governorateId?: string, q?: string, enabled = true) =>
  useQuery({
    queryKey: qk.public.schools(governorateId, q),
    queryFn: () => get<PublicSchool[]>('/public/schools', { governorateId, q: q || undefined, limit: 200 }, { skipAuth: true }),
    staleTime: HOUR,
    enabled,
    placeholderData: (prev) => prev,
  });

// PUB-04
export const checkReferralCode = (code: string) =>
  get<ReferralCheckDto>(`/public/referral-codes/${encodeURIComponent(code)}`, undefined, { skipAuth: true });

// PUB-05
export const usePublicStats = () =>
  useQuery({
    queryKey: qk.public.stats,
    queryFn: () => get<PublicStatsDto>('/public/stats', undefined, { skipAuth: true }),
    staleTime: HOUR,
    meta: { silent: true },
  });

// PUB-07
export const useFaq = (placement: 'landing' | 'pricing' | 'subscription_app' | 'contact') =>
  useQuery({
    queryKey: qk.public.faq(placement),
    queryFn: () => get<FaqItem[]>('/public/faq', { placement }, { skipAuth: true }),
    staleTime: HOUR,
    meta: { silent: true },
  });

// PUB-08
export const useTeachers = () =>
  useQuery({
    queryKey: qk.public.teachers,
    queryFn: () => get<TeacherDto[]>('/public/teachers', undefined, { skipAuth: true }),
    staleTime: HOUR,
    meta: { silent: true },
  });

// PUB-09 / PAY-11
export const usePaymentMethods = () =>
  useQuery({
    queryKey: qk.public.paymentMethods,
    queryFn: () => get<PaymentMethodDto[]>('/public/payment-methods', undefined, { skipAuth: true }),
    staleTime: HOUR,
  });

// PUB-11
export const fetchLegalDoc = (doc: LegalDoc, version?: string) =>
  get<LegalDocumentDto>(`/legal/${doc}`, version ? { version } : undefined, { skipAuth: true });
export const useLegalDoc = (doc: LegalDoc, version?: string) =>
  useQuery({ queryKey: qk.public.legal(doc, version), queryFn: () => fetchLegalDoc(doc, version), staleTime: HOUR });
