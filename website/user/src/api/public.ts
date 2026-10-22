import { useMutation, useQuery } from '@tanstack/react-query';
import { get, post, qs } from './client';
import { keys } from './keys';
import type {
  ContactBody,
  FaqItem,
  Governorate,
  PaymentMethodDto,
  PublicSchool,
  PublicStatsDto,
  ReferralCheckDto,
  TeacherDto,
  Testimonial,
} from './types';

/** Public / CMS endpoints (PUB-02…10). All anonymous. */

const pub = { skipAuth: true } as const;
const HOUR = 60 * 60 * 1000;

export const publicApi = {
  governorates: () => get<Governorate[]>('/public/governorates', pub),
  schools: (p: { governorateId?: string; q?: string; limit?: number }) => get<PublicSchool[]>(`/public/schools${qs(p)}`, pub),
  referral: (code: string) => get<ReferralCheckDto>(`/public/referral-codes/${encodeURIComponent(code.trim())}`, pub),
  stats: () => get<PublicStatsDto>('/public/stats', pub),
  testimonials: (placement: 'landing' | 'auth' | 'app' = 'landing') => get<Testimonial[]>(`/public/testimonials${qs({ placement })}`, pub),
  faq: (placement: 'landing' | 'pricing' | 'subscription_app' | 'contact' = 'landing') => get<FaqItem[]>(`/public/faq${qs({ placement })}`, pub),
  teachers: () => get<TeacherDto[]>('/public/teachers', pub),
  paymentMethods: () => get<PaymentMethodDto[]>('/public/payment-methods', pub),
  contact: (body: ContactBody) => post<{ ticketId: string; createdAt: string }>('/public/contact', body, pub),
};

export const useGovernorates = () =>
  useQuery({ queryKey: keys.governorates, queryFn: publicApi.governorates, staleTime: 24 * HOUR });

export const useSchools = (governorateId?: string, q?: string, enabled = true) =>
  useQuery({
    queryKey: keys.schools(governorateId, q),
    queryFn: () => publicApi.schools({ governorateId, q: q || undefined, limit: 50 }),
    enabled,
    staleTime: HOUR,
  });

export const useReferralCheck = (code: string, enabled: boolean) =>
  useQuery({
    queryKey: keys.referral(code),
    queryFn: () => publicApi.referral(code),
    enabled,
    staleTime: HOUR,
    retry: false,
    meta: { silent: true },
  });

export const usePublicStats = () => useQuery({ queryKey: keys.stats, queryFn: publicApi.stats, staleTime: HOUR });

export const useTestimonials = (placement: 'landing' | 'auth' | 'app' = 'landing') =>
  useQuery({ queryKey: keys.testimonials(placement), queryFn: () => publicApi.testimonials(placement), staleTime: HOUR });

export const useFaq = (placement: 'landing' | 'pricing' | 'subscription_app' | 'contact' = 'landing') =>
  useQuery({ queryKey: keys.faq(placement), queryFn: () => publicApi.faq(placement), staleTime: HOUR });

export const useTeachers = () => useQuery({ queryKey: keys.teachers, queryFn: publicApi.teachers, staleTime: HOUR });

export const usePaymentMethods = () =>
  useQuery({ queryKey: keys.paymentMethods, queryFn: publicApi.paymentMethods, staleTime: HOUR });

export const useContactMutation = () => useMutation({ mutationFn: publicApi.contact, meta: { silent: true } });
