import type { Request, Response } from 'express';
import { Router } from 'express';
import { defineRoute } from '../../common/http/route.js';
import { assertPermission } from '../../common/middleware/rbac.js';
import { rateLimits } from '../../common/middleware/rateLimit.js';
import { exportRequest, type ExportColumn, type ExportRequest } from '../../common/services/exporter.js';
import type { AdminPrincipal } from '../../common/types/index.js';
import { paginationQuery, toPagination } from '../../common/utils/pagination.js';
import { paged } from '../../common/utils/response.js';
import { idParam, isoDate } from '../../common/validation/schemas.js';
import { z } from '../../common/validation/zod.js';
import { sendTableExport } from '../commerce/lib.js';
import { modulePerm, type PartnerType } from '../incentives/service.js';
import { settlements, type SettlementDto } from './service.js';

export const router = Router();
const tags = ['Admin · Settlements'];
const A = 'admin' as const;
const partnerType = z.enum(['school', 'marketer']);
const listQuery = paginationQuery.extend({ partnerType, partnerId: z.string().uuid().optional(), period: z.string().max(10).optional(), status: z.enum(['pending', 'approved', 'paid']).optional() });
type ListQuery = z.infer<typeof listQuery>;
const generateBody = z.object({ partnerType, period: z.string().regex(/^\d{4}(-(\d{2}|Q[1-4]|S[12]|Y))?$/), partnerIds: z.array(z.string().uuid()).max(1000).optional() });
const markPaidBody = z.object({ paymentReference: z.string().trim().max(120).optional(), note: z.string().trim().max(1000).optional(), paidAt: isoDate.optional() });
const bulkBody = z.object({ ids: z.array(z.string().uuid()).min(1).max(500), paymentReference: z.string().trim().max(120).optional() });
const exportBody = exportRequest.extend({ filters: z.object({ partnerType }).passthrough() });
const settlementDto = z.record(z.unknown()).openapi('SettlementDto');

const COLUMNS: ExportColumn<SettlementDto>[] = [
  { key: 'partner', header: 'partner', value: (r) => r.partner.name.en },
  { key: 'partnerType', header: 'partner_type', value: (r) => r.partnerType },
  { key: 'period', header: 'period', value: (r) => r.period },
  { key: 'ruleVersion', header: 'rule_version', value: (r) => r.ruleVersion },
  { key: 'qualifiedStudents', header: 'qualified_students', value: (r) => r.qualifiedStudents },
  { key: 'amount', header: 'amount', value: (r) => r.amount },
  { key: 'currency', header: 'currency', value: (r) => r.currency },
  { key: 'status', header: 'status', value: (r) => r.status },
  { key: 'approvedBy', header: 'approved_by', value: (r) => r.approvedBy?.name.en },
  { key: 'paidAt', header: 'paid_at', value: (r) => r.paidAt },
  { key: 'paymentReference', header: 'payment_reference', value: (r) => r.paymentReference },
];

async function checked(admin: AdminPrincipal, id: string, action: 'view' | 'approve'): Promise<PartnerType> {
  const t = await settlements.partnerTypeOf(id);
  assertPermission(admin, modulePerm(t, action));
  return t;
}

async function bulk(req: Request, admin: AdminPrincipal, ids: string[], op: 'approve' | 'mark-paid', reference?: string) {
  const succeeded: string[] = [];
  const failed: { id: string; code: string; reason?: string; message: string }[] = [];
  for (const id of ids) {
    try {
      await checked(admin, id, 'approve');
      if (op === 'approve') await settlements.approve(id, admin.userId);
      else await settlements.markPaid(id, admin.userId, { paymentReference: reference });
      succeeded.push(id);
    } catch (e) {
      const err = e as { code?: string; reason?: string; message: string };
      failed.push({ id, code: err.code ?? 'INTERNAL', reason: err.reason, message: err.message });
    }
  }
  req.audit = { action: op === 'approve' ? 'settlement.bulk_approve' : 'settlement.bulk_mark_paid', entity: 'settlement', entityId: null, summary: `${op} ${succeeded.length}/${ids.length} settlements${reference ? ` (ref ${reference})` : ''}`, after: { succeeded, failed } };
  return { succeeded, failed };
}

const VIEW = ['schools.view', 'marketers.view'] as const;
const APPROVE = ['schools.approve', 'marketers.approve'] as const;

defineRoute(router, { method: 'get', path: '/admin/settlements', tags, summary: 'Settlements (ADM-SET-01) — sort period|qualifiedStudents|amount|status|paidAt|createdAt', auth: A, anyPermission: [...VIEW], query: listQuery, response: z.array(settlementDto) }, async ({ admin, query }) => {
  assertPermission(admin, modulePerm(query.partnerType, 'view'));
  const p = toPagination(query);
  const r = await settlements.list(query, query.sort, p.limit, p.offset);
  return paged(r.items, { page: p.page, pageSize: p.pageSize, total: r.total, nextCursor: null, totals: r.totals, periods: r.periods });
});
defineRoute(router, { method: 'post', path: '/admin/settlements/generate', tags, summary: 'Generate for period (ADM-SET-03)', auth: A, anyPermission: [...APPROVE], idempotency: 'required', body: generateBody }, async ({ req, admin, body }) => {
  assertPermission(admin, modulePerm(body.partnerType, 'approve'));
  const r = await settlements.generate(body);
  req.audit = { action: 'settlement.generate', entity: 'settlement', entityId: body.period, summary: `Generated ${body.partnerType} settlements ${body.period}: ${r.created} created, ${r.updated} updated, ${r.skipped} skipped`, after: { created: r.created, updated: r.updated, skipped: r.skipped } };
  return r;
});
defineRoute(router, { method: 'post', path: '/admin/settlements/bulk/approve', tags, summary: 'Bulk approve (ADM-SET-06)', auth: A, anyPermission: [...APPROVE], body: bulkBody }, ({ req, admin, body }) => bulk(req, admin, body.ids, 'approve'));
defineRoute(router, { method: 'post', path: '/admin/settlements/bulk/mark-paid', tags, summary: 'Bulk mark paid (ADM-SET-07)', auth: A, anyPermission: [...APPROVE], idempotency: 'required', body: bulkBody }, ({ req, admin, body }) => bulk(req, admin, body.ids, 'mark-paid', body.paymentReference));
defineRoute(
  router,
  { method: 'post', path: '/admin/settlements/export', tags, summary: 'Export settlements (ADM-SET-08) — filters.partnerType required', auth: A, anyPermission: ['schools.export', 'marketers.export'], body: exportBody, raw: true, rawContentType: 'text/csv', rateLimit: rateLimits.export },
  async ({ req, res, admin, body }) => exportSettlements(req, res, admin, body),
);
defineRoute(router, { method: 'get', path: '/admin/settlements/:id', tags, summary: 'Settlement with items (ADM-SET-02)', auth: A, anyPermission: [...VIEW], params: idParam, response: settlementDto }, async ({ admin, params }) => {
  await checked(admin, params.id, 'view');
  return settlements.get(params.id);
});
defineRoute(router, { method: 'post', path: '/admin/settlements/:id/approve', tags, summary: 'Approve (ADM-SET-04)', auth: A, anyPermission: [...APPROVE], params: idParam, response: settlementDto }, async ({ req, admin, params }) => {
  await checked(admin, params.id, 'approve');
  const r = await settlements.approve(params.id, admin.userId);
  req.audit = { action: 'settlement.approve', entity: 'settlement', entityId: params.id, summary: `Approved ${r.partner.name.en} ${r.period}: ${r.amount} IQD`, before: { status: 'pending' }, after: { status: 'approved' } };
  return r;
});
defineRoute(router, { method: 'post', path: '/admin/settlements/:id/mark-paid', tags, summary: 'Mark paid with reference (ADM-SET-05)', auth: A, anyPermission: [...APPROVE], idempotency: 'required', params: idParam, body: markPaidBody, response: settlementDto }, async ({ req, admin, params, body }) => {
  await checked(admin, params.id, 'approve');
  const r = await settlements.markPaid(params.id, admin.userId, body);
  req.audit = { action: 'settlement.mark_paid', entity: 'settlement', entityId: params.id, summary: `Paid ${r.partner.name.en} ${r.period}: ${r.amount} IQD${r.paymentReference ? ` (ref ${r.paymentReference})` : ''}`, before: { status: 'approved' }, after: { status: 'paid', paymentReference: r.paymentReference } };
  return r;
});

async function exportSettlements(req: Request, res: Response, admin: AdminPrincipal, body: ExportRequest & { filters: { partnerType: PartnerType } & Record<string, unknown> }) {
  const f = body.filters as Partial<ListQuery> & { partnerType: PartnerType };
  assertPermission(admin, modulePerm(f.partnerType, 'export'));
  const r = await settlements.list({ partnerType: f.partnerType, partnerId: f.partnerId, period: f.period, status: f.status, q: f.q, ids: body.ids }, f.sort, 50_000, 0);
  await sendTableExport(req, res, { report: `settlements-${f.partnerType}`, format: body.format, columns: COLUMNS, selected: body.columns, rows: r.items, filters: body.filters });
}
