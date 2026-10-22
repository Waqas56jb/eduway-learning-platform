import { Router, type Request, type Response } from 'express';
import { devFlags, env } from '../../config/env.js';
import { UnauthorizedError, BusinessRuleError } from '../../common/errors/index.js';
import { defineRoute } from '../../common/http/route.js';
import { rateLimits } from '../../common/middleware/rateLimit.js';
import { exportRequest, sendExport, type ExportColumn, type ExportRequest } from '../../common/services/exporter.js';
import { safeEqual } from '../../common/utils/crypto.js';
import { orderBy, toPagination } from '../../common/utils/pagination.js';
import { paged } from '../../common/utils/response.js';
import { idParam, okDto } from '../../common/validation/schemas.js';
import { z } from '../../common/validation/zod.js';
import { createHmac } from 'node:crypto';
import * as s from './schemas.js';
import {
  campaignsService,
  deliveriesService,
  studentNotifications,
  templatesService,
  type CampaignDto,
  type CampaignListQuery,
  type DeliveryDto,
  type DeliveryQuery,
  type TemplateDto,
  type TemplateListQuery,
} from './service.js';
import { SAMPLE_VARS, TEMPLATE_VARIABLES } from './templates.js';

export const router = Router();
const STU = ['Notifications'];
const TPL = ['Admin · Notification templates'];
const CMP = ['Admin · Campaigns'];
const DLV = ['Admin · Deliveries'];
const WHK = ['Webhooks'];
const A = 'admin' as const;

const TEMPLATE_SORT = { name: 't.name', type: 't.type', channel: 't.channel', updatedAt: 't.updated_at', createdAt: 't.created_at' };
const CAMPAIGN_SORT = { name: 'c.name', status: 'c.status', createdAt: 'c.created_at', audienceCount: 'c.audience_count', scheduledAt: 'c.scheduled_at', sentAt: 'c.sent_at' };
const DELIVERY_SORT = { createdAt: 'd.created_at', updatedAt: 'd.updated_at', status: 'd.status', channel: 'd.channel', provider: 'd.provider', attempts: 'd.attempts' };

const TEMPLATE_COLUMNS: ExportColumn<TemplateDto>[] = [
  { key: 'name', header: 'name', value: (r) => r.name },
  { key: 'type', header: 'type', value: (r) => r.type },
  { key: 'channel', header: 'channel', value: (r) => r.channel },
  { key: 'subject_en', header: 'subject_en', value: (r) => r.subject.en },
  { key: 'subject_ar', header: 'subject_ar', value: (r) => r.subject.ar },
  { key: 'body_en', header: 'body_en', value: (r) => r.body.en },
  { key: 'body_ar', header: 'body_ar', value: (r) => r.body.ar },
  { key: 'variables', header: 'variables', value: (r) => r.variables.join(' ') },
  { key: 'active', header: 'active', value: (r) => r.active },
  { key: 'updatedAt', header: 'updated_at', value: (r) => r.updatedAt },
];
const CAMPAIGN_COLUMNS: ExportColumn<CampaignDto>[] = [
  { key: 'name', header: 'name', value: (r) => r.name },
  { key: 'channel', header: 'channel', value: (r) => r.channel },
  { key: 'template', header: 'template', value: (r) => r.template?.name ?? '' },
  { key: 'status', header: 'status', value: (r) => r.status },
  { key: 'audienceCount', header: 'audience', value: (r) => r.audienceCount },
  { key: 'delivered', header: 'delivered', value: (r) => r.stats.delivered + r.stats.sent },
  { key: 'failed', header: 'failed', value: (r) => r.stats.failed },
  { key: 'scheduledAt', header: 'scheduled_at', value: (r) => r.scheduledAt },
  { key: 'sentAt', header: 'sent_at', value: (r) => r.sentAt },
  { key: 'createdBy', header: 'created_by', value: (r) => r.createdBy.name.en },
  { key: 'createdAt', header: 'created_at', value: (r) => r.createdAt },
];
const DELIVERY_COLUMNS: ExportColumn<DeliveryDto>[] = [
  { key: 'id', header: 'id', value: (r) => r.id },
  { key: 'student', header: 'student', value: (r) => r.recipient.name.en },
  { key: 'mobile', header: 'mobile', value: (r) => r.recipient.mobile },
  { key: 'channel', header: 'channel', value: (r) => r.channel },
  { key: 'provider', header: 'provider', value: (r) => r.provider },
  { key: 'status', header: 'status', value: (r) => r.status },
  { key: 'error', header: 'error', value: (r) => r.error },
  { key: 'attempts', header: 'attempts', value: (r) => r.attempts },
  { key: 'platform', header: 'platform', value: (r) => r.platform },
  { key: 'template', header: 'template', value: (r) => r.template?.name ?? '' },
  { key: 'createdAt', header: 'created_at', value: (r) => r.createdAt },
];

async function exportRows<T extends { id: string }>(req: Request, res: Response, body: ExportRequest, report: string, columns: ExportColumn<T>[], rows: T[]) {
  const selected = body.ids?.length ? rows.filter((r) => body.ids?.includes(r.id)) : rows;
  if (!selected.length) throw new BusinessRuleError('NO_ROWS');
  const f = (body.filters ?? {}) as { from?: string; to?: string };
  await sendExport(req, res, { report, format: body.format, columns, selected: body.columns, rows: selected, filters: body.filters, from: f.from, to: f.to });
}

// ── student inbox (NTF-01…05) ──
defineRoute(router, { method: 'get', path: '/notifications', tags: STU, summary: 'My notifications (NTF-01)', auth: 'student', query: s.inboxQuery, response: z.array(s.appNotificationDto) }, async ({ student, query }) => {
  const r = await studentNotifications.list(student.userId, query);
  return paged(r.items, r.meta);
});
defineRoute(router, { method: 'get', path: '/notifications/unread-count', tags: STU, summary: 'Unread badge count (NTF-02)', auth: 'student', response: z.object({ unreadCount: z.number() }) }, ({ student }) => studentNotifications.unreadCount(student.userId));
defineRoute(router, { method: 'post', path: '/notifications/read-all', tags: STU, summary: 'Mark all read (NTF-04)', auth: 'student', response: z.object({ unreadCount: z.literal(0), updated: z.number() }) }, ({ student }) => studentNotifications.readAll(student.userId));
defineRoute(router, { method: 'post', path: '/notifications/:id/read', tags: STU, summary: 'Mark one read (NTF-03)', auth: 'student', params: idParam, response: z.object({ id: z.string(), read: z.literal(true), unreadCount: z.number() }) }, ({ student, params }) => studentNotifications.read(student.userId, params.id));
defineRoute(router, { method: 'delete', path: '/notifications/:id', tags: STU, summary: 'Delete notification (NTF-05)', auth: 'student', params: idParam, response: z.object({ unreadCount: z.number() }) }, ({ student, params }) => studentNotifications.remove(student.userId, params.id));

// ── templates (ADM-NTT-01…10) ──
const listTemplates = async (q: Partial<TemplateListQuery>, limit: number, offset: number) => templatesService.list(q, orderBy(q.sort, TEMPLATE_SORT, '-updatedAt'), limit, offset);
defineRoute(router, { method: 'get', path: '/admin/notification-templates', tags: TPL, summary: 'Templates + type×channel matrix (ADM-NTT-01)', auth: A, permission: 'notifications.view', query: s.templatesQuery, response: z.array(s.templateDto) }, async ({ query }) => {
  const p = toPagination(query);
  const r = await listTemplates(query, p.limit, p.offset);
  return paged(r.items, { page: p.page, pageSize: p.pageSize, total: r.total, nextCursor: null, matrix: r.matrix });
});
defineRoute(router, { method: 'get', path: '/admin/notification-templates/variables', tags: TPL, summary: 'Variable palette (ADM-NTT-08)', auth: A, permission: 'notifications.view', response: s.variablesDto }, () => TEMPLATE_VARIABLES);
defineRoute(router, { method: 'post', path: '/admin/notification-templates/preview', tags: TPL, summary: 'Render preview + SMS segments (ADM-NTT-09)', auth: A, permission: 'notifications.view', body: s.templatePreviewBody }, ({ body }) => templatesService.preview(body, SAMPLE_VARS));
defineRoute(router, { method: 'post', path: '/admin/notification-templates/export', tags: TPL, summary: 'Export templates (ADM-NTT-10)', auth: A, permission: 'notifications.export', body: exportRequest, raw: true, rawContentType: 'text/csv', rateLimit: rateLimits.export }, async ({ req, res, body }) => {
  const r = await listTemplates((body.filters ?? {}) as Partial<TemplateListQuery>, 50_000, 0);
  await exportRows(req, res, body, 'notification-templates', TEMPLATE_COLUMNS, r.items);
});
defineRoute(router, { method: 'post', path: '/admin/notification-templates/bulk', tags: TPL, summary: 'Bulk activate/deactivate/delete (ADM-NTT-07)', auth: A, anyPermission: ['notifications.edit', 'notifications.delete'], body: s.templatesBulkBody, response: s.bulkResultDto }, async ({ req, admin, body }) => {
  const r = await templatesService.bulk(body.ids, body.action, admin);
  req.audit = { action: body.action === 'delete' ? 'notification_template.bulk_delete' : 'notification_template.bulk_update', entity: 'notification_template', entityId: null, summary: `${body.action} ${r.succeeded.length} templates`, before: null, after: r };
  return r;
});
defineRoute(router, { method: 'get', path: '/admin/notification-templates/:id', tags: TPL, summary: 'Template (ADM-NTT-02)', auth: A, permission: 'notifications.view', params: idParam, response: s.templateDto }, ({ params }) => templatesService.get(params.id));
defineRoute(router, { method: 'post', path: '/admin/notification-templates', tags: TPL, summary: 'Create template (ADM-NTT-03)', auth: A, permission: 'notifications.create', body: s.createTemplateBody, response: s.templateDto, status: 201 }, async ({ req, admin, body }) => {
  const t = await templatesService.create(body, admin);
  req.audit = { action: 'notification_template.create', entity: 'notification_template', entityId: t.id, summary: `Created template ${t.name}`, before: null, after: t };
  return t;
});
defineRoute(router, { method: 'patch', path: '/admin/notification-templates/:id', tags: TPL, summary: 'Update template (ADM-NTT-04)', auth: A, permission: 'notifications.edit', params: idParam, body: s.patchTemplateBody, response: s.templateDto }, async ({ req, admin, params, body }) => {
  const r = await templatesService.update(params.id, body, admin);
  const keys = Object.keys(body);
  const action = keys.length === 1 && body.active !== undefined ? (body.active ? 'notification_template.activate' : 'notification_template.deactivate') : 'notification_template.update';
  req.audit = { action, entity: 'notification_template', entityId: params.id, summary: `${action.split('.')[1]} template ${r.after.name}`, before: r.before, after: r.after };
  return r.after;
});
defineRoute(router, { method: 'delete', path: '/admin/notification-templates/:id', tags: TPL, summary: 'Delete template (ADM-NTT-05)', auth: A, permission: 'notifications.delete', params: idParam, response: okDto }, async ({ req, params }) => {
  const before = await templatesService.remove(params.id);
  req.audit = { action: 'notification_template.delete', entity: 'notification_template', entityId: params.id, summary: `Deleted template ${before.name}`, before, after: null };
  return { ok: true as const };
});
defineRoute(router, { method: 'post', path: '/admin/notification-templates/:id/duplicate', tags: TPL, summary: 'Duplicate template (ADM-NTT-06)', auth: A, permission: 'notifications.create', params: idParam, response: s.templateDto, status: 201 }, async ({ req, admin, params }) => {
  const t = await templatesService.duplicate(params.id, admin);
  req.audit = { action: 'notification_template.duplicate', entity: 'notification_template', entityId: t.id, summary: `Duplicated template → ${t.name}`, before: { sourceId: params.id }, after: t };
  return t;
});

// ── campaigns (ADM-CMP-01…06) ──
const listCampaigns = (q: Partial<CampaignListQuery>, limit: number, offset: number) => campaignsService.list(q, orderBy(q.sort, CAMPAIGN_SORT, '-createdAt'), limit, offset);
defineRoute(router, { method: 'get', path: '/admin/campaigns', tags: CMP, summary: 'Campaign history (ADM-CMP-01)', auth: A, permission: 'notifications.view', query: s.campaignsQuery, response: z.array(s.campaignDto) }, async ({ query }) => {
  const p = toPagination(query);
  const r = await listCampaigns(query, p.limit, p.offset);
  return paged(r.items, { page: p.page, pageSize: p.pageSize, total: r.total, nextCursor: null });
});
defineRoute(router, { method: 'post', path: '/admin/campaigns/audience-preview', tags: CMP, summary: 'Audience builder live count (ADM-CMP-03)', auth: A, permission: 'notifications.view', body: s.audiencePreviewBody, response: s.audiencePreviewDto }, async ({ body }) => {
  const type = body.templateId ? ((await templatesService.get(body.templateId).catch(() => null))?.type ?? null) : null;
  return campaignsService.preview(body.filters, body.channel, type);
});
defineRoute(router, { method: 'post', path: '/admin/campaigns/export', tags: CMP, summary: 'Export campaigns (ADM-CMP-06)', auth: A, permission: 'notifications.export', body: exportRequest, raw: true, rawContentType: 'text/csv', rateLimit: rateLimits.export }, async ({ req, res, body }) => {
  const r = await listCampaigns((body.filters ?? {}) as Partial<CampaignListQuery>, 50_000, 0);
  await exportRows(req, res, body, 'campaigns', CAMPAIGN_COLUMNS, r.items);
});
defineRoute(router, { method: 'get', path: '/admin/campaigns/:id', tags: CMP, summary: 'Campaign (ADM-CMP-02)', auth: A, permission: 'notifications.view', params: idParam, response: s.campaignDto }, ({ params }) => campaignsService.get(params.id));
defineRoute(
  router,
  {
    method: 'post',
    path: '/admin/campaigns',
    tags: CMP,
    summary: 'Send now / schedule campaign (ADM-CMP-04)',
    description: 'Push goes to Expo tokens of the targeted app platforms (ios/android); in-app rows are written for push + in_app. 422 NO_RECIPIENTS when nobody is reachable.',
    auth: A,
    permission: 'notifications.create',
    idempotency: 'required',
    body: s.createCampaignBody,
    response: s.campaignDto,
    status: 201,
  },
  async ({ req, admin, body }) => {
    const r = await campaignsService.create(body, admin);
    req.audit = { action: r.action, entity: 'campaign', entityId: r.dto.id, summary: `${r.action === 'campaign.schedule' ? 'Scheduled' : 'Sent'} campaign ${r.dto.name} (${r.dto.audienceCount} recipients)`, before: null, after: r.dto };
    return r.dto;
  },
);
defineRoute(router, { method: 'post', path: '/admin/campaigns/:id/cancel', tags: CMP, summary: 'Cancel scheduled campaign (ADM-CMP-05)', auth: A, permission: 'notifications.create', params: idParam, response: s.campaignDto }, async ({ req, params }) => {
  const dto = await campaignsService.cancel(params.id);
  req.audit = { action: 'campaign.cancel', entity: 'campaign', entityId: params.id, summary: `Cancelled campaign ${dto.name}`, before: { status: 'scheduled' }, after: { status: dto.status } };
  return dto;
});

// ── deliveries (ADM-DLV-01…04) ──
const listDeliveries = (q: Partial<DeliveryQuery>, limit: number, offset: number) => deliveriesService.list(q, orderBy(q.sort, DELIVERY_SORT, '-createdAt'), limit, offset);
defineRoute(router, { method: 'get', path: '/admin/deliveries', tags: DLV, summary: 'Delivery log (ADM-DLV-01)', auth: A, permission: 'notifications.view', query: s.deliveriesQuery, response: z.array(s.deliveryDto) }, async ({ query }) => {
  const p = toPagination(query);
  const r = await listDeliveries(query, p.limit, p.offset);
  return paged(r.items, { page: p.page, pageSize: p.pageSize, total: r.total, nextCursor: null });
});
defineRoute(router, { method: 'get', path: '/admin/deliveries/stats', tags: DLV, summary: 'Delivery KPIs + provider health (ADM-DLV-02)', auth: A, permission: 'notifications.view', query: s.deliveriesQuery, response: s.deliveryStatsDto }, ({ query }) => deliveriesService.stats(query));
defineRoute(router, { method: 'post', path: '/admin/deliveries/retry', tags: DLV, summary: 'Retry failed deliveries (ADM-DLV-03)', auth: A, anyPermission: ['notifications.edit', 'notifications.create'], body: s.retryBody, response: s.bulkResultDto }, async ({ req, body }) => {
  const r = await deliveriesService.retry(body);
  req.audit = { action: 'notification.retry', entity: 'notification_delivery', entityId: null, summary: `Retried ${r.succeeded.length} deliveries`, before: null, after: r };
  return r;
});
defineRoute(router, { method: 'post', path: '/admin/deliveries/export', tags: DLV, summary: 'Export delivery log (ADM-DLV-04)', auth: A, permission: 'notifications.export', body: exportRequest, raw: true, rawContentType: 'text/csv', rateLimit: rateLimits.export }, async ({ req, res, body }) => {
  const r = await listDeliveries((body.filters ?? {}) as Partial<DeliveryQuery>, 50_000, 0);
  await exportRows(req, res, body, 'deliveries', DELIVERY_COLUMNS, r.items);
});

// ── WHK-03 delivery receipts ──
/**
 * SEC-25: receipts must be signed in every environment. Without NOTIFICATION_WEBHOOK_SECRET they are rejected, unless
 * DEV_UNSIGNED_NOTIFICATION_WEBHOOKS=true (explicit, never in production).
 */
export function verifyReceiptSignature(rawBody: Buffer | undefined, signatureHeader: string | undefined, secret = env.NOTIFICATION_WEBHOOK_SECRET, allowUnsigned = devFlags.unsignedNotificationWebhooks): void {
  if (!secret) {
    if (allowUnsigned) return;
    throw new UnauthorizedError('SIGNATURE_INVALID');
  }
  const sig = (signatureHeader ?? '').replace(/^sha256=/, '');
  const expected = createHmac('sha256', secret).update(rawBody ?? Buffer.alloc(0)).digest('hex');
  if (!sig || !safeEqual(sig, expected)) throw new UnauthorizedError('SIGNATURE_INVALID');
}
function verifySignature(req: Request): void {
  verifyReceiptSignature(req.rawBody, req.get('x-signature'));
}
defineRoute(
  router,
  {
    method: 'post',
    path: '/webhooks/notifications/:provider',
    tags: WHK,
    summary: 'Delivery receipts from SMS/WhatsApp/email providers (WHK-03)',
    description: 'Header `X-Signature` = hex HMAC-SHA256 of the raw body with NOTIFICATION_WEBHOOK_SECRET (required in every environment). Only deliveries sent through `:provider` are updated.',
    auth: 'public',
    rateLimit: rateLimits.webhook,
    params: s.providerParam,
    body: s.receiptBody,
    response: z.object({ received: z.literal(true), updated: z.number() }),
  },
  ({ req, params, body }) => {
    verifySignature(req);
    const events = Array.isArray(body) ? body : 'events' in body ? body.events : [body];
    return deliveriesService.receipt(params.provider, events);
  },
);
