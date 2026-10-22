/* Payments, refunds & reconciliation (contract §25 — ADM-PAY-*, ADM-REF-*, ADM-REC-*). */
import type { Refund, Transaction, TxnStatus } from '@/types';
import { api, download, idempotency, type Query } from './client';
import { qk } from './keys';
import { useApiMutation, useApiQuery } from './hooks';
import type { AdminRef, BulkResult, Currency, DateOnly, FileKey, GovernorateDto, ID, IQD, ISODate, Localized, MarketerRef, PackageRef, Platform, SchoolRef, StudentRef } from './types';

// ─── DTOs ────────────────────────────────────────────────────────────────────
export type GatewayId = 'zaincash' | 'fastpay' | 'qicard' | 'asiahawala' | 'visa' | 'mock';
export type BillingCycle = 'monthly' | 'yearly';

export interface TxnEventDto {
  id: ID;
  status: TxnStatus | 'webhook' | 'refund_requested';
  at: ISODate;
  note: string;
  actor: AdminRef | null;
}
export interface WebhookEventDto {
  id: ID;
  type: string;
  verified: boolean;
  duplicate: boolean;
  idempotencyKey: string;
  receivedAt: ISODate;
  payload: Record<string, unknown>;
}
export interface TransactionRowDto {
  id: ID;
  ref: string;
  receiptNumber: string | null;
  student: StudentRef;
  package: PackageRef;
  cycle: BillingCycle;
  amount: IQD;
  currency: Currency;
  discount: IQD;
  refundedAmount: IQD;
  refundable: IQD;
  gateway: GatewayId;
  status: TxnStatus;
  promoCode: string | null;
  school: SchoolRef | null;
  marketer: MarketerRef | null;
  source: 'school' | 'promo' | 'direct';
  platform: Platform | null;
  createdAt: ISODate;
  paidAt: ISODate | null;
}
export interface RefundDto {
  id: ID;
  transactionId: ID;
  ref: string;
  student: StudentRef;
  amount: IQD;
  currency: Currency;
  kind: 'full' | 'partial';
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedBy: AdminRef;
  requestedAt: ISODate;
  decidedBy: AdminRef | null;
  decidedAt: ISODate | null;
  decisionNote: string | null;
  gatewayRefundId: string | null;
}
export interface TransactionDetailDto extends Omit<TransactionRowDto, 'student' | 'package'> {
  student: StudentRef & { governorate: GovernorateDto };
  package: PackageRef & { listPrice: IQD };
  listPrice: IQD;
  timeline: TxnEventDto[];
  webhooks: WebhookEventDto[];
  pendingRefund: RefundDto | null;
  canRefund: boolean;
  canViewReceipt: boolean;
}
export interface ReceiptDto {
  receiptNumber: string;
  ref: string;
  issuedAt: ISODate;
  paidAt: ISODate;
  company: { name: Localized; address: Localized; email: string };
  billedTo: { name: Localized; mobile: string };
  gateway: GatewayId;
  gatewayName: Localized;
  lines: { description: Localized; amount: IQD }[];
  subtotal: IQD;
  discount: IQD;
  promoCode: string | null;
  total: IQD;
  refunded: IQD;
  currency: Currency;
  taxNote: Localized;
}
export interface PaymentsSummaryDto {
  gross: IQD;
  paidCount: number;
  failureRate: number;
  refunded: IQD;
  pendingRefunds: number;
  total: number;
}
export interface RefundsSummaryDto {
  pending: { count: number; amount: IQD };
  approved: { count: number; amount: IQD };
  rejected: { count: number };
}
export interface ReconciliationDayRow {
  day: DateOnly;
  count: number;
  gross: IQD;
  refunds: IQD;
  fees: IQD;
  net: IQD;
}
export interface ReconciliationRow {
  id: ID;
  day: DateOnly;
  gateway: GatewayId;
  count: number;
  systemAmount: IQD;
  reportedAmount: IQD | null;
  difference: IQD;
  state: 'matched' | 'mismatch' | 'reconciled' | 'unreported';
  resolvedBy: AdminRef | null;
  resolvedAt: ISODate | null;
  note: string | null;
}
export interface ReconciliationDto {
  summary: { gross: IQD; refunds: IQD; fees: IQD; net: IQD; txnCount: number; mismatches: number };
  chart: { date: DateOnly; gross: IQD; refunds: IQD }[];
  daily: ReconciliationDayRow[];
}

// ─── UI view models ──────────────────────────────────────────────────────────
export interface TransactionVM extends Omit<Transaction, 'gateway' | 'timeline' | 'webhooks'> {
  gateway: GatewayId;
  receiptNumber: string | null;
  refundable: number;
  cycle: BillingCycle;
  source: 'school' | 'promo' | 'direct';
  platform: Platform | null;
  paidAt: string | null;
  studentName_en: string;
  studentName_ar: string;
  studentMobile: string;
  studentAvatar: string | null;
  packageName_en: string;
  packageName_ar: string;
  schoolCode: string | null;
  schoolName_en: string;
  schoolName_ar: string;
  timeline: TxnEventDto[];
  webhooks: WebhookEventDto[];
}

export interface TransactionDetailVM extends TransactionVM {
  governorateName_en: string;
  governorateName_ar: string;
  listPrice: number;
  packageListPrice: number;
  pendingRefund: RefundDto | null;
  canRefund: boolean;
  canViewReceipt: boolean;
}

export interface RefundVM extends Omit<Refund, 'requestedBy' | 'decidedBy'> {
  ref: string;
  studentName_en: string;
  studentName_ar: string;
  requestedBy: string;
  decidedBy: string | null;
  decisionNote: string | null;
}

const nm = (l: Localized | null | undefined) => ({ en: l?.en ?? '', ar: l?.ar ?? '' });

export function toTransactionVM(d: TransactionRowDto): TransactionVM {
  return {
    id: d.id,
    ref: d.ref,
    receiptNumber: d.receiptNumber,
    studentId: d.student?.id ?? '',
    packageId: d.package?.id ?? '',
    amount: d.amount,
    currency: d.currency,
    discount: d.discount,
    gateway: d.gateway,
    status: d.status,
    refundedAmount: d.refundedAmount,
    refundable: d.refundable,
    promoCode: d.promoCode,
    schoolId: d.school?.id ?? null,
    marketerId: d.marketer?.id ?? null,
    createdAt: d.createdAt,
    paidAt: d.paidAt,
    cycle: d.cycle,
    source: d.source,
    platform: d.platform,
    studentName_en: nm(d.student?.name).en,
    studentName_ar: nm(d.student?.name).ar,
    studentMobile: d.student?.mobile ?? '',
    studentAvatar: d.student?.avatarUrl ?? null,
    packageName_en: nm(d.package?.name).en,
    packageName_ar: nm(d.package?.name).ar,
    schoolCode: d.school?.code ?? null,
    schoolName_en: nm(d.school?.name).en,
    schoolName_ar: nm(d.school?.name).ar,
    timeline: [],
    webhooks: [],
  };
}

export function toTransactionDetailVM(d: TransactionDetailDto): TransactionDetailVM {
  return {
    ...toTransactionVM(d as unknown as TransactionRowDto),
    timeline: d.timeline ?? [],
    webhooks: d.webhooks ?? [],
    governorateName_en: d.student?.governorate?.name?.en ?? '',
    governorateName_ar: d.student?.governorate?.name?.ar ?? '',
    listPrice: d.listPrice ?? d.amount + d.discount,
    packageListPrice: d.package?.listPrice ?? d.listPrice ?? d.amount + d.discount,
    pendingRefund: d.pendingRefund,
    canRefund: d.canRefund,
    canViewReceipt: d.canViewReceipt,
  };
}

export function toRefundVM(d: RefundDto): RefundVM {
  return {
    id: d.id,
    transactionId: d.transactionId,
    ref: d.ref,
    studentId: d.student?.id ?? '',
    studentName_en: nm(d.student?.name).en,
    studentName_ar: nm(d.student?.name).ar,
    amount: d.amount,
    currency: d.currency,
    kind: d.kind,
    reason: d.reason,
    status: d.status,
    requestedBy: d.requestedBy?.name?.en ?? '—',
    requestedAt: d.requestedAt,
    decidedBy: d.decidedBy?.name?.en ?? null,
    decidedAt: d.decidedAt,
    decisionNote: d.decisionNote,
  };
}

// ─── API ─────────────────────────────────────────────────────────────────────
export const paymentsApi = {
  list: (params?: Query) => api.list<TransactionRowDto>('/admin/payments', params),
  summary: (params?: Query) => api.get<PaymentsSummaryDto>('/admin/payments/summary', params),
  get: (id: ID) => api.get<TransactionDetailDto>(`/admin/payments/${id}`),
  receipt: (id: ID) => api.get<ReceiptDto>(`/admin/payments/${id}/receipt`, { format: 'json' }),
  receiptPdf: (id: ID, ref: string) => download(`/admin/payments/${id}/receipt`, { params: { format: 'pdf' }, fallbackName: `receipt-${ref}.pdf` }),
  refund: (id: ID, body: { kind: 'full' | 'partial'; amount?: IQD; reason: string; processNow?: boolean }, key?: string) =>
    api.post<{ refund: RefundDto; transaction: TransactionDetailDto }>(`/admin/payments/${id}/refunds`, body, idempotency(key)),
};

export const refundsApi = {
  list: (params?: Query) => api.list<RefundDto>('/admin/refunds', params),
  summary: () => api.get<RefundsSummaryDto>('/admin/refunds/summary'),
  approve: (id: ID, note?: string, key?: string) =>
    api.post<{ refund: RefundDto; transaction: TransactionRowDto }>(`/admin/refunds/${id}/approve`, note ? { note } : {}, idempotency(key)),
  reject: (id: ID, reason: string) => api.post<RefundDto>(`/admin/refunds/${id}/reject`, { reason }),
  bulkApprove: (ids: ID[], key?: string) => api.post<BulkResult>('/admin/refunds/bulk/approve', { ids }, idempotency(key)),
};

export const reconciliationApi = {
  get: (params: Query) => api.get<ReconciliationDto>('/admin/reconciliation', params),
  comparison: (params: Query) => api.list<ReconciliationRow>('/admin/reconciliation/comparison', params),
  resolve: (body: { day: DateOnly; gateway: GatewayId; reason: string }) => api.post<ReconciliationRow>('/admin/reconciliation/resolve', body),
  import: (body: { gateway: GatewayId; fileKey: FileKey }) => api.post<{ days: number; matched: number; mismatches: number }>('/admin/reconciliation/import', body),
};

// ─── hooks ───────────────────────────────────────────────────────────────────
export function usePaymentsSummary(params: Query) {
  return useApiQuery(qk.payments.sub('summary', params), () => paymentsApi.summary(params));
}

export function useTransaction(id: ID | undefined) {
  return useApiQuery(qk.payments.detail(id), async () => toTransactionDetailVM(await paymentsApi.get(id!)), { enabled: !!id });
}

export function useReceipt(id: ID | undefined, enabled: boolean) {
  return useApiQuery(qk.payments.sub('receipt', id), () => paymentsApi.receipt(id!), { enabled: !!id && enabled });
}

export function useRefundsSummary() {
  return useApiQuery(qk.refunds.sub('summary'), refundsApi.summary);
}

const MONEY_INVALIDATE = [qk.payments.all, qk.refunds.all, qk.reconciliation.all, qk.students.all, qk.dashboard.all];

export function useRefundMutations() {
  return {
    approve: useApiMutation((v: { id: ID; key: string }) => refundsApi.approve(v.id, undefined, v.key), {
      invalidate: MONEY_INVALIDATE,
      success: 'payments.refunds.approved',
    }),
    reject: useApiMutation((v: { id: ID; reason: string }) => refundsApi.reject(v.id, v.reason), {
      invalidate: MONEY_INVALIDATE,
      success: 'payments.refunds.rejected',
    }),
    bulkApprove: useApiMutation((v: { ids: ID[]; key: string }) => refundsApi.bulkApprove(v.ids, v.key), { invalidate: MONEY_INVALIDATE }),
  };
}

export function useRequestRefund(txnId: ID) {
  return useApiMutation(
    (v: { kind: 'full' | 'partial'; amount?: IQD; reason: string; processNow: boolean; key: string }) =>
      paymentsApi.refund(txnId, { kind: v.kind, amount: v.amount, reason: v.reason, processNow: v.processNow }, v.key),
    { invalidate: MONEY_INVALIDATE, silentError: true },
  );
}

export const RECON_INVALIDATE = [qk.reconciliation.all];
