import { useMutation, useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { downloadFile, get, getPaged, post, qs } from './client';
import { keys } from './keys';
import type {
  BillingCycle,
  InitiatePaymentBody,
  InitiatePaymentDto,
  PaymentDetailDto,
  PriceQuote,
  PromoValidationDto,
  ReceiptDto,
  StudentPaymentDto,
} from './types';

/** Checkout: quote → promo → initiate (idempotent) → mock confirm / redirect → poll status → receipt (PAY-04…10). */
export const paymentsApi = {
  quote: (body: { packageId: string; cycle: BillingCycle; promoCode?: string }) => post<PriceQuote>('/payments/quote', body),
  validatePromo: (body: { code: string; packageId: string; cycle: BillingCycle }) => post<PromoValidationDto>('/promotions/validate', body),
  initiate: (body: InitiatePaymentBody, idempotencyKey: string) =>
    post<InitiatePaymentDto>('/payments/initiate', body, { headers: { 'Idempotency-Key': idempotencyKey } }),
  mockConfirm: (paymentId: string, outcome: 'success' | 'failure' | 'cancel') =>
    post<StudentPaymentDto>(`/payments/mock/${paymentId}/confirm`, { outcome }),
  get: (paymentId: string) => get<PaymentDetailDto>(`/payments/${paymentId}`),
  my: (page = 1, pageSize = 20) => getPaged<StudentPaymentDto>(`/payments/my${qs({ page, pageSize })}`),
  receipt: (paymentId: string) => get<ReceiptDto>(`/payments/${paymentId}/receipt?format=json`),
  receiptPdf: (paymentId: string, receiptNumber: string | null) =>
    downloadFile(`/payments/${paymentId}/receipt?format=pdf`, `receipt-${receiptNumber ?? paymentId}.pdf`),
};

const TERMINAL = new Set(['paid', 'failed', 'cancelled', 'refunded', 'partially_refunded']);

/** Polls PAY-08 every 2 s (max 60 s) until the payment settles. */
export async function waitForPayment(paymentId: string, signal?: AbortSignal): Promise<PaymentDetailDto> {
  const deadline = Date.now() + 60_000;
  for (;;) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const p = await paymentsApi.get(paymentId);
    if (TERMINAL.has(p.status) || Date.now() > deadline) return p;
    await new Promise((r) => setTimeout(r, 2000));
  }
}

export function useMyPayments() {
  const { isAuthenticated } = useAuth();
  return useQuery({ queryKey: keys.myPayments, queryFn: () => paymentsApi.my(1, 50), enabled: isAuthenticated });
}

export const useQuote = () => useMutation({ mutationFn: paymentsApi.quote, meta: { silent: true } });
export const useValidatePromo = () => useMutation({ mutationFn: paymentsApi.validatePromo });
export const useDownloadReceipt = () =>
  useMutation({ mutationFn: ({ id, receiptNumber }: { id: string; receiptNumber: string | null }) => paymentsApi.receiptPdf(id, receiptNumber) });
