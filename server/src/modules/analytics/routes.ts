import { Router } from 'express';
import { defineRoute } from '../../common/http/route.js';
import { assertPermission } from '../../common/middleware/rbac.js';
import { rateLimits } from '../../common/middleware/rateLimit.js';
import { exportRequest, type ExportColumn } from '../../common/services/exporter.js';
import { paginationQuery } from '../../common/utils/pagination.js';
import { paged } from '../../common/utils/response.js';
import { boolQuery, csvQuery, idParam, isoDate } from '../../common/validation/schemas.js';
import { z } from '../../common/validation/zod.js';
import { sendFile, sendTableExport } from '../commerce/lib.js';
import { exportsService, REPORTS, type toExportRecord } from './exports.js';
import { dashboardService } from './dashboard.js';
import { analyticsService } from './service.js';

export const router = Router();
const tags = ['Admin · Analytics'];
const A = 'admin' as const;

const platform = z.enum(['web', 'ios', 'android']).optional();
const baseQuery = z.object({ from: isoDate.optional(), to: isoDate.optional(), grain: z.enum(['day', 'week', 'month']).optional(), compare: boolQuery.optional(), platform });
const learningQuery = baseQuery.extend({ subjectId: z.string().uuid().optional() });
const dailyQuery = z.object({ from: isoDate.optional(), to: isoDate.optional(), fields: csvQuery.optional(), platform });
const topicsQuery = z.object({ subjectId: z.string().uuid().optional(), from: isoDate.optional(), to: isoDate.optional(), sort: z.string().max(40).optional(), limit: z.coerce.number().int().min(1).max(500).optional() });
const splitQuery = z.object({ from: isoDate.optional(), to: isoDate.optional() });
const report = z.enum(REPORTS);
const generateBody = z.object({ report, from: isoDate, to: isoDate, format: z.enum(['csv', 'xlsx']) });
const historyQuery = paginationQuery.extend({ report: z.string().max(60).optional() });
const previewQuery = z.object({ report, from: isoDate, to: isoDate });
const exportRecordDto = z.record(z.unknown()).openapi('ExportRecord');

type Rec = ReturnType<typeof toExportRecord>;
const HISTORY_COLUMNS: ExportColumn<Rec>[] = [
  { key: 'at', header: 'at', value: (r) => r.at },
  { key: 'report', header: 'report', value: (r) => r.report },
  { key: 'format', header: 'format', value: (r) => r.format },
  { key: 'range', header: 'range', value: (r) => r.range },
  { key: 'rows', header: 'rows', value: (r) => r.rows },
  { key: 'by', header: 'by', value: (r) => r.by.name.en },
  { key: 'source', header: 'source', value: (r) => r.source },
  { key: 'status', header: 'status', value: (r) => r.status },
];

const dashboardQuery = z.object({ from: isoDate.optional(), to: isoDate.optional() });
defineRoute(router, { method: 'get', path: '/admin/dashboard', tags: ['Admin · Dashboard'], summary: 'Dashboard composite (ADM-DSH-01) — sections without module permission are null', auth: A, permission: 'dashboard.view', query: dashboardQuery }, ({ admin, query }) => dashboardService.get(admin, query));
defineRoute(router, { method: 'get', path: '/admin/analytics/business', tags, summary: 'Business analytics (ADM-ANL-01)', auth: A, permission: 'analytics.view', query: baseQuery }, ({ query }) => analyticsService.business(query));
defineRoute(router, { method: 'get', path: '/admin/analytics/learning', tags, summary: 'Learning analytics (ADM-ANL-02) — kpis.dau adds prevWau/prevMau', auth: A, permission: 'analytics.view', query: learningQuery }, ({ query }) => analyticsService.learning(query));
defineRoute(router, { method: 'get', path: '/admin/analytics/daily', tags, summary: 'Daily metrics (ADM-ANL-03) — rollups + live today', auth: A, anyPermission: ['analytics.view', 'dashboard.view'], query: dailyQuery }, ({ query }) => analyticsService.daily(query));
defineRoute(router, { method: 'get', path: '/admin/analytics/topics', tags, summary: 'Topic accuracy (ADM-ANL-04)', auth: A, permission: 'analytics.view', query: topicsQuery }, ({ query }) => analyticsService.topics(query));
defineRoute(router, { method: 'get', path: '/admin/analytics/platform-split', tags, summary: 'Platform split web/ios/android (ADM-ANL-05)', auth: A, permission: 'analytics.view', query: splitQuery }, ({ query }) => analyticsService.platformSplit(query));

// ── exports ──
defineRoute(router, { method: 'post', path: '/admin/exports', tags, summary: 'Generate report export (ADM-EXP-01) — 422 NO_ROWS when empty', auth: A, permission: 'analytics.export', idempotency: 'optional', rateLimit: rateLimits.export, body: generateBody, status: 201, response: exportRecordDto }, ({ req, admin, body }) => {
  exportsService.assertReportAccess(admin, body.report);
  return exportsService.generate(req, body);
});
defineRoute(router, { method: 'get', path: '/admin/exports', tags, summary: 'Export history (ADM-EXP-02) — sort at|report|rows|format|by|status', auth: A, permission: 'analytics.view', query: historyQuery, response: z.array(exportRecordDto) }, async ({ query }) => {
  const r = await exportsService.page(query);
  return paged(r.items, r.meta);
});
defineRoute(router, { method: 'get', path: '/admin/exports/preview', tags, summary: 'Preview row count (ADM-EXP-04)', auth: A, permission: 'analytics.view', query: previewQuery }, ({ admin, query }) => {
  exportsService.assertReportAccess(admin, query.report);
  return exportsService.preview(query.report, query.from, query.to);
});
defineRoute(router, { method: 'post', path: '/admin/exports/history/export', tags, summary: 'Export the export history (ADM-EXP-05)', auth: A, permission: 'analytics.export', body: exportRequest, raw: true, rawContentType: 'text/csv', rateLimit: rateLimits.export }, async ({ req, res, body }) => {
  let rows = await exportsService.all((body.filters ?? {}) as { report?: string; q?: string; sort?: string });
  if (body.ids?.length) rows = rows.filter((r) => body.ids?.includes(r.id));
  await sendTableExport(req, res, { report: 'exports-history', format: body.format, columns: HISTORY_COLUMNS, selected: body.columns, rows, filters: body.filters });
});
defineRoute(router, { method: 'get', path: '/admin/exports/:id/download', tags, summary: 'Download a stored export (ADM-EXP-03)', auth: A, permission: 'analytics.export', params: idParam, raw: true, rawContentType: 'application/octet-stream' }, async ({ res, admin, params }) => {
  const rec = await exportsService.get(params.id);
  if ((REPORTS as readonly string[]).includes(rec.report)) exportsService.assertReportAccess(admin, rec.report as (typeof REPORTS)[number]);
  else if (rec.report === 'transactions' || rec.report === 'refunds') assertPermission(admin, 'payments.view');
  const f = await exportsService.file(params.id);
  sendFile(res, f.buf, f.fileName, f.contentType);
});
