import type { Request, Response } from 'express';
import { ForbiddenError } from '../../common/errors/index.js';
import { hasPermission } from '../../common/middleware/rbac.js';
import type { ExportColumn, ExportRequest } from '../../common/services/exporter.js';
import type { AdminPrincipal } from '../../common/types/index.js';
import { toPagination } from '../../common/utils/pagination.js';
import { paged } from '../../common/utils/response.js';
import { publicService } from '../public/service.js';
import type { TransactionRow } from '../students/index.js';
import { sendFile, sendTableExport } from '../commerce/lib.js';
import { adminPayments, type RefundDto } from './admin.service.js';
import { buildReceipt, renderReceiptPdf } from './receipt.js';
import { reconciliation, type ReconciliationRow } from './reconciliation.service.js';
import type { PaymentFilter } from './repository.js';
import type { PaymentListQuery, RefundListQuery } from './schemas.js';
import { studentPayments } from './student.service.js';

const TX_COLUMNS: ExportColumn<TransactionRow>[] = [
  { key: 'ref', header: 'ref', value: (r) => r.ref },
  { key: 'student', header: 'student', value: (r) => r.student.name.en },
  { key: 'mobile', header: 'mobile', value: (r) => r.student.mobile },
  { key: 'package', header: 'package', value: (r) => r.package.name.en },
  { key: 'amount', header: 'amount', value: (r) => r.amount },
  { key: 'discount', header: 'discount', value: (r) => r.discount },
  { key: 'currency', header: 'currency', value: (r) => r.currency },
  { key: 'gateway', header: 'gateway', value: (r) => r.gateway },
  { key: 'status', header: 'status', value: (r) => r.status },
  { key: 'refunded', header: 'refunded', value: (r) => r.refundedAmount },
  { key: 'promo', header: 'promo', value: (r) => r.promoCode },
  { key: 'school', header: 'school', value: (r) => r.school?.name.en },
  { key: 'marketer', header: 'marketer', value: (r) => r.marketer?.name.en },
  { key: 'platform', header: 'platform', value: (r) => r.platform },
  { key: 'created', header: 'created', value: (r) => r.createdAt },
];
const REFUND_COLUMNS: ExportColumn<RefundDto>[] = [
  { key: 'id', header: 'id', value: (r) => r.id },
  { key: 'transaction', header: 'transaction', value: (r) => r.ref },
  { key: 'student', header: 'student', value: (r) => r.student.name.en },
  { key: 'amount', header: 'amount', value: (r) => r.amount },
  { key: 'kind', header: 'kind', value: (r) => r.kind },
  { key: 'reason', header: 'reason', value: (r) => r.reason },
  { key: 'status', header: 'status', value: (r) => r.status },
  { key: 'requested_by', header: 'requested_by', value: (r) => r.requestedBy?.name.en },
  { key: 'requested_at', header: 'requested_at', value: (r) => r.requestedAt },
  { key: 'decided_by', header: 'decided_by', value: (r) => r.decidedBy?.name.en },
  { key: 'decided_at', header: 'decided_at', value: (r) => r.decidedAt },
];
type DayRow = { day: string; count: number; gross: number; refunds: number; fees: number; net: number };
const DAILY_COLUMNS: ExportColumn<DayRow>[] = ['day', 'count', 'gross', 'refunds', 'fees', 'net'].map((k) => ({ key: k, header: k, value: (r: DayRow) => r[k as keyof DayRow] }));
const COMPARISON_COLUMNS: ExportColumn<ReconciliationRow>[] = [
  { key: 'day', header: 'day', value: (r) => r.day },
  { key: 'gateway', header: 'gateway', value: (r) => r.gateway },
  { key: 'count', header: 'count', value: (r) => r.count },
  { key: 'systemAmount', header: 'system_amount', value: (r) => r.systemAmount },
  { key: 'reportedAmount', header: 'reported_amount', value: (r) => r.reportedAmount },
  { key: 'difference', header: 'difference', value: (r) => r.difference },
  { key: 'state', header: 'state', value: (r) => r.state },
  { key: 'note', header: 'note', value: (r) => r.note },
];

const filterOf = (q: Partial<PaymentListQuery>): PaymentFilter => ({
  from: q.from, to: q.to, status: q.status, gateway: q.gateway, packageId: q.packageId, source: q.source, schoolId: q.schoolId,
  marketerId: q.marketerId, studentId: q.studentId, platform: q.platform, q: q.q,
});

export const paymentsController = {
  // ── student ──
  methods: () => publicService.paymentMethods(),
  async my(userId: string, q: { page: number; pageSize: number }) {
    const p = toPagination(q);
    const r = await studentPayments.my(userId, p.limit, p.offset);
    return paged(r.items, { page: p.page, pageSize: p.pageSize, total: r.total, nextCursor: null });
  },
  /** PAY-10 / ADM-PAY-04 — student (own) or admin with payments.view. */
  async receipt(req: Request, res: Response, paymentId: string, format: 'json' | 'pdf') {
    if (req.admin && !hasPermission(req.admin, 'payments.view')) throw new ForbiddenError(undefined, { permission: 'payments.view' });
    const dto = await buildReceipt(paymentId, req.admin ? undefined : req.student?.userId);
    if (format === 'pdf') return sendFile(res, renderReceiptPdf(dto, req.locale), `receipt-${dto.receiptNumber}.pdf`, 'application/pdf');
    res.status(200).json({ success: true, data: dto });
  },

  // ── admin payments ──
  async list(q: PaymentListQuery) {
    const p = toPagination(q);
    const r = await adminPayments.list(filterOf(q), q.sort, p.limit, p.offset);
    return paged(r.items, { page: p.page, pageSize: p.pageSize, total: r.total, nextCursor: null });
  },
  summary: (q: PaymentListQuery) => adminPayments.summary(filterOf(q)),
  detail: (id: string, admin: AdminPrincipal) => adminPayments.detail(id, admin),
  async refund(req: Request, admin: AdminPrincipal, id: string, body: { kind: 'full' | 'partial'; amount?: number; reason: string; processNow: boolean }) {
    const r = await adminPayments.requestRefund(id, body, admin);
    req.audit = {
      action: body.processNow ? 'refund.process' : 'refund.request',
      entity: 'refund',
      entityId: r.refund.id,
      summary: `${body.processNow ? 'Processed' : 'Requested'} ${r.refund.kind} refund of ${r.refund.amount} ${r.refund.currency} on ${r.transaction.ref}: ${body.reason}`,
      before: null,
      after: r.refund,
    };
    return r;
  },
  async export(req: Request, res: Response, body: ExportRequest) {
    const f = filterOf((body.filters ?? {}) as Partial<PaymentListQuery>);
    if (body.ids?.length) f.ids = body.ids;
    const r = await adminPayments.list(f, (body.filters as { sort?: string } | undefined)?.sort, 50_000, 0);
    await sendTableExport(req, res, { report: 'transactions', format: body.format, columns: TX_COLUMNS, selected: body.columns, rows: r.items, filters: body.filters, from: f.from, to: f.to });
  },

  // ── refunds ──
  async refunds(q: RefundListQuery) {
    const p = toPagination(q);
    const r = await adminPayments.listRefunds(q, q.sort, p.limit, p.offset);
    return paged(r.items, { page: p.page, pageSize: p.pageSize, total: r.total, nextCursor: null, counts: r.counts });
  },
  refundSummary: () => adminPayments.refundSummary(),
  async approve(req: Request, admin: AdminPrincipal, id: string, note?: string) {
    const r = await adminPayments.approveRefund(id, admin, note ?? null);
    req.audit = { action: 'refund.approve', entity: 'refund', entityId: id, summary: `Approved refund ${r.refund.amount} ${r.refund.currency} on ${r.refund.ref} (transaction.refund)`, before: { status: 'pending' }, after: { status: 'approved', transactionStatus: r.transaction.status } };
    return r;
  },
  async reject(req: Request, admin: AdminPrincipal, id: string, reason: string) {
    const r = await adminPayments.rejectRefund(id, admin, reason);
    req.audit = { action: 'refund.reject', entity: 'refund', entityId: id, summary: `Rejected refund on ${r.ref}: ${reason}`, before: { status: 'pending' }, after: { status: 'rejected', decisionNote: reason } };
    return r;
  },
  async bulkApprove(req: Request, admin: AdminPrincipal, ids: string[]) {
    const r = await adminPayments.bulkApprove(ids, admin);
    req.audit = { action: 'refund.bulk_approve', entity: 'refund', entityId: null, summary: `Approved ${r.succeeded.length}/${ids.length} refunds`, after: r };
    return r;
  },
  async exportRefunds(req: Request, res: Response, body: ExportRequest) {
    const f = (body.filters ?? {}) as Partial<RefundListQuery>;
    const r = await adminPayments.listRefunds({ status: f.status, q: f.q, from: f.from, to: f.to, ids: body.ids }, f.sort, 50_000, 0);
    await sendTableExport(req, res, { report: 'refunds', format: body.format, columns: REFUND_COLUMNS, selected: body.columns, rows: r.items, filters: body.filters, from: f.from, to: f.to });
  },

  // ── reconciliation ──
  async resolve(req: Request, admin: AdminPrincipal, body: { day: string; gateway: string; reason: string }) {
    const row = await reconciliation.resolve(body, admin);
    req.audit = { action: 'reconciliation.mark_reconciled', entity: 'reconciliation', entityId: `${body.day}:${body.gateway}`, summary: `Marked ${body.gateway} ${body.day} reconciled: ${body.reason}`, after: row };
    return row;
  },
  async import(req: Request, admin: AdminPrincipal, body: { gateway: string; fileKey: string }) {
    const r = await reconciliation.import(body, admin);
    req.audit = { action: 'reconciliation.import', entity: 'reconciliation', entityId: body.gateway, summary: `Imported ${r.days} settlement days for ${body.gateway} (${r.mismatches} mismatches)`, after: r };
    return r;
  },
  async exportReconciliation(req: Request, res: Response, body: ExportRequest & { table: 'daily' | 'comparison' }) {
    const f = (body.filters ?? {}) as { from?: string; to?: string; gateway?: string; onlyMismatches?: boolean | string; q?: string; sort?: string };
    if (body.table === 'daily') {
      const s = await reconciliation.summary(f);
      await sendTableExport(req, res, { report: 'reconciliation-daily', format: body.format, columns: DAILY_COLUMNS, selected: body.columns, rows: s.daily, filters: body.filters, from: f.from, to: f.to });
      return;
    }
    let rows = await reconciliation.comparisonRows({ ...f, onlyMismatches: f.onlyMismatches === true || f.onlyMismatches === 'true' });
    if (body.ids?.length) rows = rows.filter((r) => body.ids?.includes(r.id));
    await sendTableExport(req, res, { report: 'reconciliation-comparison', format: body.format, columns: COMPARISON_COLUMNS, selected: body.columns, rows, filters: body.filters, from: f.from, to: f.to });
  },
};
