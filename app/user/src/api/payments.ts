import { useQuery } from '@tanstack/react-query';
import { get, getPaged, idem, post } from './client';
import { qk } from './keys';
import type {
  BillingCycle,
  InitiatePaymentBody,
  InitiatePaymentDto,
  MySubscription,
  PackagePublic,
  PaymentDetailDto,
  PaymentMethodDto,
  PriceQuote,
  PromoValidateDto,
  ReceiptDto,
  StudentPaymentDto,
} from './types';

// PAY-01
export const usePackages = () =>
  useQuery({ queryKey: qk.payments.packages, queryFn: () => get<PackagePublic[]>('/packages'), staleTime: 5 * 60_000 });

// PAY-02
export const usePackage = (id: string | undefined) =>
  useQuery({
    queryKey: qk.payments.package(id ?? ''),
    queryFn: () => get<PackagePublic>(`/packages/${encodeURIComponent(id!)}`),
    enabled: !!id,
  });

// PAY-03
export const useMySubscription = (enabled = true) =>
  useQuery({
    queryKey: qk.payments.subscription,
    queryFn: () => get<MySubscription | null>('/subscriptions/my'),
    enabled,
    meta: { silent: true },
  });

// PAY-04
export const fetchQuote = (body: { packageId: string; cycle: BillingCycle; promoCode?: string }) =>
  post<PriceQuote>('/payments/quote', body);
export const useQuote = (packageId: string | undefined, cycle: BillingCycle, promoCode?: string) =>
  useQuery({
    queryKey: ['payments', 'quote', packageId ?? '', cycle, promoCode ?? ''] as const,
    queryFn: () => fetchQuote({ packageId: packageId!, cycle, promoCode: promoCode || undefined }),
    enabled: !!packageId,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });

// PAY-05
export const validatePromo = (body: { code: string; packageId: string; cycle: BillingCycle }) =>
  post<PromoValidateDto>('/promotions/validate', body);

// PAY-06 — one Idempotency-Key per checkout attempt.
export const initiatePayment = (body: InitiatePaymentBody, idempotencyKey: string) =>
  post<InitiatePaymentDto>('/payments/initiate', body, idem(idempotencyKey));

// PAY-07 (non-production MockGateway)
export const confirmMockPayment = (paymentId: string, outcome: 'success' | 'failure' | 'cancel') =>
  post<StudentPaymentDto>(`/payments/mock/${paymentId}/confirm`, { outcome });

// PAY-08
export const fetchPayment = (id: string) => get<PaymentDetailDto>(`/payments/${id}`);
export const usePayment = (id: string | undefined) =>
  useQuery({ queryKey: qk.payments.payment(id ?? ''), queryFn: () => fetchPayment(id!), enabled: !!id });

/** Poll PAY-08 every 2 s (max 60 s) until the payment is final. */
export async function waitForPayment(id: string, timeoutMs = 60_000): Promise<PaymentDetailDto> {
  const end = Date.now() + timeoutMs;
  let last = await fetchPayment(id);
  while (!['paid', 'failed', 'cancelled', 'refunded', 'partially_refunded'].includes(last.status) && Date.now() < end) {
    await new Promise((r) => setTimeout(r, 2000));
    last = await fetchPayment(id);
  }
  return last;
}

// PAY-09
export const useMyPayments = () =>
  useQuery({
    queryKey: qk.payments.my,
    queryFn: async () => (await getPaged<StudentPaymentDto>('/payments/my', { pageSize: 20 })).items,
    meta: { silent: true },
  });

// PAY-10
export const useReceipt = (paymentId: string | undefined) =>
  useQuery({
    queryKey: qk.payments.receipt(paymentId ?? ''),
    queryFn: () => get<ReceiptDto>(`/payments/${paymentId}/receipt`, { format: 'json' }),
    enabled: !!paymentId,
    staleTime: Infinity,
    meta: { silent: true },
  });

// PAY-11 (alias of PUB-09)
export const usePaymentMethodsForCheckout = () =>
  useQuery({ queryKey: qk.payments.methods, queryFn: () => get<PaymentMethodDto[]>('/payments/methods'), staleTime: 60 * 60_000 });
