import { Router } from 'express';
import { defineRoute } from '../../common/http/route.js';
import { rateLimits } from '../../common/middleware/rateLimit.js';
import { paged } from '../../common/utils/response.js';
import { idParam } from '../../common/validation/schemas.js';
import { z } from '../../common/validation/zod.js';
import { paymentsController as c } from './controller.js';
import { reconciliation } from './reconciliation.service.js';
import {
  approveBody, bulkIdsBody, exportRequest, initiateBody, mockConfirmBody, myPaymentsQuery, paymentIdParam, paymentListQuery, priceQuoteDto, providerParam, quoteBody, receiptDto, receiptQuery,
  recComparisonQuery, recExportBody, recImportBody, recQuery, recResolveBody, refundCreateBody, refundDto, refundListQuery, rejectBody, studentPaymentDto, transactionDetailDto, transactionRowDto, webhookAck,
} from './schemas.js';
import { studentPayments } from './student.service.js';
import { processCallback, processWebhook } from './webhook.service.js';

export const router = Router();
const pay = ['Payments'];
const tags = ['Admin · Payments'];
const A = 'admin' as const;

// ── student (PAY-*) — static paths before /payments/:paymentId ──
defineRoute(router, { method: 'get', path: '/payments/methods', tags: pay, summary: 'Payment methods (PAY-11, alias of PUB-09)', auth: 'public' }, () => c.methods());
defineRoute(router, { method: 'get', path: '/payments/my', tags: pay, summary: 'Billing history (PAY-09)', auth: 'student', query: myPaymentsQuery, response: z.array(studentPaymentDto) }, ({ student, query }) => c.my(student.userId, query));
defineRoute(router, { method: 'post', path: '/payments/quote', tags: pay, summary: 'Price quote incl. promo + upgrade proration (PAY-04)', auth: 'student', body: quoteBody, response: priceQuoteDto }, ({ student, body }) => studentPayments.quote(student.userId, body));
defineRoute(
  router,
  { method: 'post', path: '/payments/initiate', tags: pay, summary: 'Start checkout (PAY-06) — returnUrl `__ID__` is replaced by the payment id', auth: 'student', idempotency: 'required', rateLimit: rateLimits.auth, body: initiateBody, status: 201 },
  ({ req, student, body }) => studentPayments.initiate(student.userId, body, req.clientPlatform ?? student.platform),
);
defineRoute(router, { method: 'post', path: '/payments/mock/:paymentId/confirm', tags: pay, summary: 'MockGateway confirm (PAY-07, non-production)', auth: 'student', params: paymentIdParam, body: mockConfirmBody, response: studentPaymentDto }, ({ student, params, body }) => studentPayments.mockConfirm(student.userId, params.paymentId, body.outcome));
defineRoute(
  router,
  { method: 'post', path: '/payments/webhook/:provider', tags: ['Webhooks'], summary: 'Gateway webhook (WHK-01) — signature-verified, idempotent', auth: 'public', rateLimit: rateLimits.webhook, params: providerParam, response: webhookAck },
  ({ req, params }) => processWebhook(params.provider, req.rawBody, req.headers, (req.body ?? {}) as Record<string, unknown>),
);
for (const method of ['get', 'post'] as const) {
  defineRoute(
    router,
    { method, path: '/payments/callback/:provider', tags: ['Webhooks'], summary: 'Gateway browser return (ZainCash token / Qi finish / FastPay return) — verified, idempotent, 302 to the app', auth: 'public', rateLimit: rateLimits.webhook, params: providerParam, raw: true, rawContentType: 'text/html' },
    async ({ req, res, params }) => {
      const { redirectTo } = await processCallback(params.provider, req.query as Record<string, unknown>, (req.body ?? {}) as Record<string, unknown>, req.headers);
      res.redirect(302, redirectTo);
    },
  );
}
defineRoute(router, { method: 'get', path: '/payments/:paymentId', tags: pay, summary: 'Payment status (PAY-08)', auth: 'student', params: paymentIdParam, response: studentPaymentDto }, ({ student, params }) => studentPayments.get(student.userId, params.paymentId));
defineRoute(
  router,
  { method: 'get', path: '/payments/:paymentId/receipt', tags: pay, summary: 'Receipt JSON | PDF (PAY-10) — own payment, or admin with payments.view', auth: 'any', params: paymentIdParam, query: receiptQuery, raw: true, rawContentType: 'application/pdf' },
  ({ req, res, params, query }) => c.receipt(req, res, params.paymentId, query.format, query.lang),
);

// ── admin payments (ADM-PAY-*) ──
defineRoute(router, { method: 'get', path: '/admin/payments', tags, summary: 'Transactions (ADM-PAY-01)', auth: A, permission: 'payments.view', query: paymentListQuery, response: z.array(transactionRowDto) }, ({ query }) => c.list(query));
defineRoute(router, { method: 'get', path: '/admin/payments/summary', tags, summary: 'Transaction KPIs (ADM-PAY-02)', auth: A, permission: 'payments.view', query: paymentListQuery }, ({ query }) => c.summary(query));
defineRoute(router, { method: 'post', path: '/admin/payments/export', tags, summary: 'Export transactions (ADM-PAY-06)', auth: A, permission: 'payments.export', body: exportRequest, raw: true, rawContentType: 'text/csv', rateLimit: rateLimits.export }, ({ req, res, body }) => c.export(req, res, body));
defineRoute(router, { method: 'get', path: '/admin/payments/:id', tags, summary: 'Transaction detail + timeline + webhooks (ADM-PAY-03)', auth: A, permission: 'payments.view', params: idParam, response: transactionDetailDto }, ({ admin, params }) => c.detail(params.id, admin));
defineRoute(
  router,
  { method: 'get', path: '/admin/payments/:id/receipt', tags, summary: 'Receipt JSON | PDF (ADM-PAY-04)', auth: A, permission: 'payments.view', params: idParam, query: receiptQuery, raw: true, rawContentType: 'application/pdf', response: receiptDto },
  ({ req, res, params, query }) => c.receipt(req, res, params.id, query.format, query.lang),
);
defineRoute(
  router,
  { method: 'post', path: '/admin/payments/:id/refunds', tags, summary: 'Refund full/partial (ADM-PAY-05) — processNow needs payments.approve', auth: A, permission: 'payments.edit', idempotency: 'required', params: idParam, body: refundCreateBody, status: 201 },
  ({ req, admin, params, body }) => c.refund(req, admin, params.id, body),
);

// ── refunds (ADM-REF-*) ──
defineRoute(router, { method: 'get', path: '/admin/refunds', tags, summary: 'Refunds (ADM-REF-01) — sort requestedAt|amount|status|decidedAt', auth: A, permission: 'payments.view', query: refundListQuery, response: z.array(refundDto) }, ({ query }) => c.refunds(query));
defineRoute(router, { method: 'get', path: '/admin/refunds/summary', tags, summary: 'Refund KPIs (ADM-REF-02)', auth: A, permission: 'payments.view' }, () => c.refundSummary());
defineRoute(router, { method: 'post', path: '/admin/refunds/bulk/approve', tags, summary: 'Bulk approve (ADM-REF-05)', auth: A, permission: 'payments.approve', idempotency: 'required', body: bulkIdsBody }, ({ req, admin, body }) => c.bulkApprove(req, admin, body.ids));
defineRoute(router, { method: 'post', path: '/admin/refunds/export', tags, summary: 'Export refunds (ADM-REF-06)', auth: A, permission: 'payments.export', body: exportRequest, raw: true, rawContentType: 'text/csv', rateLimit: rateLimits.export }, ({ req, res, body }) => c.exportRefunds(req, res, body));
defineRoute(router, { method: 'post', path: '/admin/refunds/:id/approve', tags, summary: 'Approve + settle refund (ADM-REF-03)', auth: A, permission: 'payments.approve', idempotency: 'required', params: idParam, body: approveBody }, ({ req, admin, params, body }) => c.approve(req, admin, params.id, body.note));
defineRoute(router, { method: 'post', path: '/admin/refunds/:id/reject', tags, summary: 'Reject refund (ADM-REF-04)', auth: A, permission: 'payments.approve', params: idParam, body: rejectBody, response: refundDto }, ({ req, admin, params, body }) => c.reject(req, admin, params.id, body.reason));

// ── reconciliation (ADM-REC-*) ──
defineRoute(router, { method: 'get', path: '/admin/reconciliation', tags, summary: 'Reconciliation summary/chart/daily (ADM-REC-01)', auth: A, permission: 'payments.view', query: recQuery }, ({ query }) => reconciliation.summary(query));
defineRoute(router, { method: 'get', path: '/admin/reconciliation/comparison', tags, summary: 'Gateway comparison (ADM-REC-02) — sort day|gateway|systemAmount|reportedAmount|difference|count|state', auth: A, permission: 'payments.view', query: recComparisonQuery }, async ({ query }) => {
  const r = await reconciliation.comparison(query);
  return paged(r.items, r.meta);
});
defineRoute(router, { method: 'post', path: '/admin/reconciliation/resolve', tags, summary: 'Mark reconciled (ADM-REC-03)', auth: A, permission: 'payments.approve', body: recResolveBody }, ({ req, admin, body }) => c.resolve(req, admin, body));
defineRoute(router, { method: 'post', path: '/admin/reconciliation/import', tags, summary: 'Import gateway settlement file (ADM-REC-04)', auth: A, permission: 'payments.approve', body: recImportBody }, ({ req, admin, body }) => c.import(req, admin, body));
defineRoute(router, { method: 'post', path: '/admin/reconciliation/export', tags, summary: 'Export reconciliation (ADM-REC-05) — body ExportRequest & { table }', auth: A, permission: 'payments.export', body: recExportBody, raw: true, rawContentType: 'text/csv', rateLimit: rateLimits.export }, ({ req, res, body }) => c.exportReconciliation(req, res, body));

