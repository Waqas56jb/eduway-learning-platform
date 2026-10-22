import { Router } from 'express';
import { OK } from '../../common/dto/refs.js';
import { BusinessRuleError } from '../../common/errors/index.js';
import { defineRoute } from '../../common/http/route.js';
import { rateLimits } from '../../common/middleware/rateLimit.js';
import { exportRequest, type ExportColumn } from '../../common/services/exporter.js';
import { paginationQuery } from '../../common/utils/pagination.js';
import { paged } from '../../common/utils/response.js';
import { anyPhone, fileKey, idParam, isoDate, okDto } from '../../common/validation/schemas.js';
import { z } from '../../common/validation/zod.js';
import { sendTableExport } from '../commerce/lib.js';
import { attributedStudents } from '../commerce/students.js';
import { schoolsService } from '../schools/service.js';
import { marketersService, type MarketerDto } from './service.js';

export const router = Router();
const tags = ['Admin · Marketers'];
const A = 'admin' as const;

const loc = z.object({ en: z.string().trim().min(2).max(200), ar: z.string().trim().min(2).max(200) });
const writeFields = z.object({
  name: loc,
  mobile: anyPhone,
  email: z.string().trim().email().max(200),
  governorateId: z.string().min(2).max(40),
  status: z.enum(['active', 'inactive']).default('active'),
  code: z.string().trim().regex(/^[A-Za-z0-9-]{4,20}$/).nullable().optional(),
  avatarFileKey: fileKey.nullable().optional(),
});
const listQuery = paginationQuery.extend({ status: z.enum(['active', 'inactive']).optional(), governorateId: z.string().max(40).optional() });
const bulkBody = z.object({ ids: z.array(z.string().uuid()).min(1).max(500), status: z.enum(['active', 'inactive']) });
const assignBody = z.object({ schoolId: z.string().uuid(), overrideReason: z.string().trim().max(500).optional() });
const schoolParams = z.object({ id: z.string().uuid(), schoolId: z.string().uuid() });
const perfQuery = z.object({ months: z.coerce.number().int().min(1).max(36).default(12) });
const progressQuery = z.object({ period: z.string().max(10).optional() });
const setsQuery = z.object({ status: z.enum(['active', 'draft', 'superseded']).optional() });
const createSetBody = z.object({ cloneFromId: z.string().uuid().optional() }).default({});
const updateSetBody = z.object({
  items: z.array(z.object({ id: z.string().uuid().optional(), threshold: z.number().int().min(1), reward: z.number().int().min(1), label: z.object({ en: z.string().trim().min(1).max(120), ar: z.string().trim().min(1).max(120) }) })).max(50),
  effectiveFrom: isoDate.optional(),
});
const marketerDto = z.record(z.unknown()).openapi('MarketerDto');
const milestoneSetDto = z.record(z.unknown()).openapi('MilestoneSetDto');

const COLUMNS: ExportColumn<MarketerDto>[] = [
  { key: 'name_en', header: 'name_en', value: (r) => r.name.en },
  { key: 'name_ar', header: 'name_ar', value: (r) => r.name.ar },
  { key: 'mobile', header: 'mobile', value: (r) => r.mobile },
  { key: 'email', header: 'email', value: (r) => r.email },
  { key: 'code', header: 'code', value: (r) => r.code },
  { key: 'governorate', header: 'governorate', value: (r) => r.governorate.name.en },
  { key: 'schoolsCount', header: 'schools', value: (r) => r.schoolsCount },
  { key: 'paidStudents', header: 'paid_students', value: (r) => r.paidStudents },
  { key: 'milestonesHit', header: 'milestones_hit', value: (r) => r.milestonesHit },
  { key: 'pendingReward', header: 'pending_reward_iqd', value: (r) => r.pendingReward },
  { key: 'status', header: 'status', value: (r) => r.status },
  { key: 'joinedAt', header: 'joined_at', value: (r) => r.joinedAt },
];

// ── milestone sets (static paths first) ──
defineRoute(router, { method: 'get', path: '/admin/milestone-sets', tags, summary: 'Milestone sets (ADM-MIL-01)', auth: A, permission: 'marketers.view', query: setsQuery, response: z.array(milestoneSetDto) }, ({ query }) => marketersService.sets(query.status));
defineRoute(router, { method: 'post', path: '/admin/milestone-sets', tags, summary: 'New draft set (ADM-MIL-02)', auth: A, permission: 'marketers.edit', body: createSetBody, status: 201, response: milestoneSetDto }, async ({ req, admin, body }) => {
  const r = await marketersService.createSet(body.cloneFromId, admin);
  req.audit = { action: 'milestone_rule.create_version', entity: 'milestone_set', entityId: r.id, summary: `Created milestone draft v${r.version}`, after: r };
  return r;
});
defineRoute(router, { method: 'put', path: '/admin/milestone-sets/:id', tags, summary: 'Edit draft (ADM-MIL-03)', auth: A, permission: 'marketers.edit', params: idParam, body: updateSetBody, response: milestoneSetDto }, async ({ req, params, body }) => {
  const before = await marketersService.getSet(params.id);
  const r = await marketersService.updateSet(params.id, body);
  req.audit = { action: 'milestone_rule.update_draft', entity: 'milestone_set', entityId: r.id, summary: `Edited milestone draft v${r.version} (${r.items.length} items)`, before: { items: before.items, effectiveFrom: before.effectiveFrom }, after: { items: r.items, effectiveFrom: r.effectiveFrom } };
  return r;
});
defineRoute(router, { method: 'delete', path: '/admin/milestone-sets/:id', tags, summary: 'Delete draft (ADM-MIL-04)', auth: A, anyPermission: ['marketers.edit', 'marketers.delete'], params: idParam, response: okDto }, async ({ req, params }) => {
  const before = await marketersService.deleteSet(params.id);
  req.audit = { action: 'milestone_rule.delete_draft', entity: 'milestone_set', entityId: params.id, summary: `Deleted milestone draft v${before.version}`, before };
  return OK;
});
defineRoute(router, { method: 'post', path: '/admin/milestone-sets/:id/activate', tags, summary: 'Activate (ADM-MIL-05)', auth: A, permission: 'marketers.approve', params: idParam }, async ({ req, params }) => {
  const r = await marketersService.activateSet(params.id);
  req.audit = { action: 'milestone_rule.activate', entity: 'milestone_set', entityId: params.id, summary: `Activated milestone set v${r.activated.version}${r.superseded ? ` (superseded v${r.superseded.version})` : ''}`, after: r };
  return r;
});

// ── marketers ──
defineRoute(router, { method: 'get', path: '/admin/marketers', tags, summary: 'Marketers (ADM-MKT-01) — sort name|paidStudents|milestonesHit|pendingReward|joinedAt|schoolsCount|status', auth: A, permission: 'marketers.view', query: listQuery, response: z.array(marketerDto) }, async ({ query }) => {
  const r = await marketersService.page(query);
  return paged(r.items, r.meta);
});
defineRoute(router, { method: 'get', path: '/admin/marketers/stats', tags, summary: 'Marketer KPIs (ADM-MKT-02)', auth: A, permission: 'marketers.view' }, () => marketersService.stats());
defineRoute(router, { method: 'post', path: '/admin/marketers/bulk/status', tags, summary: 'Bulk status (ADM-MKT-08)', auth: A, permission: 'marketers.edit', body: bulkBody }, async ({ req, body }) => {
  const r = await marketersService.bulkStatus(body.ids, body.status);
  req.audit = { action: body.status === 'active' ? 'marketer.bulk_activate' : 'marketer.bulk_deactivate', entity: 'marketer', entityId: null, summary: `${body.status} ${r.succeeded.length} marketers`, after: r };
  return r;
});
defineRoute(router, { method: 'post', path: '/admin/marketers/export', tags, summary: 'Export marketers (ADM-MKT-12)', auth: A, permission: 'marketers.export', body: exportRequest, raw: true, rawContentType: 'text/csv', rateLimit: rateLimits.export }, async ({ req, res, body }) => {
  const rows = await marketersService.all({ ...((body.filters ?? {}) as Record<string, string>), ids: body.ids });
  await sendTableExport(req, res, { report: 'marketers', format: body.format, columns: COLUMNS, selected: body.columns, rows, filters: body.filters });
});
defineRoute(router, { method: 'post', path: '/admin/marketers', tags, summary: 'Create marketer (ADM-MKT-05)', auth: A, permission: 'marketers.create', body: writeFields, status: 201, response: marketerDto }, async ({ req, admin, body }) => {
  const r = await marketersService.create(body, admin);
  req.audit = { action: 'marketer.create', entity: 'marketer', entityId: r.id, summary: `Created marketer ${r.name.en}`, after: r };
  return r;
});
defineRoute(router, { method: 'get', path: '/admin/marketers/:id', tags, summary: 'Marketer detail (ADM-MKT-03)', auth: A, permission: 'marketers.view', params: idParam }, ({ params }) => marketersService.detail(params.id));
defineRoute(router, { method: 'get', path: '/admin/marketers/:id/performance', tags, summary: 'Monthly paying students (ADM-MKT-04)', auth: A, permission: 'marketers.view', params: idParam, query: perfQuery }, ({ params, query }) => marketersService.performance(params.id, query.months));
defineRoute(router, { method: 'get', path: '/admin/marketers/:id/incentive-progress', tags, summary: 'Incentive progress (ADM-MKT-13)', auth: A, permission: 'marketers.view', params: idParam, query: progressQuery }, ({ params, query }) => marketersService.incentiveProgress(params.id, query.period));
defineRoute(router, { method: 'patch', path: '/admin/marketers/:id', tags, summary: 'Update marketer (ADM-MKT-06)', auth: A, permission: 'marketers.edit', params: idParam, body: writeFields.partial(), response: marketerDto }, async ({ req, admin, params, body }) => {
  const before = await marketersService.get(params.id);
  const r = await marketersService.update(params.id, body, admin);
  const keys = Object.keys(body);
  req.audit = { action: 'marketer.update', entity: 'marketer', entityId: params.id, summary: `Updated ${r.name.en}: ${keys.join(', ')}`, before: Object.fromEntries(keys.map((k) => [k, (before as unknown as Record<string, unknown>)[k]])), after: Object.fromEntries(keys.map((k) => [k, (r as unknown as Record<string, unknown>)[k]])) };
  return r;
});
defineRoute(router, { method: 'delete', path: '/admin/marketers/:id', tags, summary: 'Delete marketer (ADM-MKT-07)', auth: A, permission: 'marketers.delete', params: idParam, response: okDto }, async ({ req, params }) => {
  const before = await marketersService.remove(params.id);
  req.audit = { action: 'marketer.delete', entity: 'marketer', entityId: params.id, summary: `Deleted marketer ${before.name.en} (unassigned ${before.schoolsCount} schools)`, before };
  return OK;
});
defineRoute(router, { method: 'post', path: '/admin/marketers/:id/schools', tags, summary: 'Assign school with double-attribution guard (ADM-MKT-09)', auth: A, permission: 'marketers.edit', params: idParam, body: assignBody, response: marketerDto }, async ({ req, admin, params, body }) => {
  await marketersService.get(params.id);
  const r = await schoolsService.setMarketer(body.schoolId, params.id, body.overrideReason, admin);
  req.audit = { action: r.action ?? 'school.assign_marketer', entity: 'school', entityId: body.schoolId, summary: r.action === 'school.attribution_override' ? `Attribution override → ${r.school.marketer?.name.en}: ${body.overrideReason}` : `Assigned ${r.school.name.en} to ${r.school.marketer?.name.en}`, before: r.before, after: { marketerId: params.id, overrideReason: body.overrideReason ?? null } };
  return marketersService.get(params.id);
});
defineRoute(router, { method: 'delete', path: '/admin/marketers/:id/schools/:schoolId', tags, summary: 'Unassign school (ADM-MKT-10)', auth: A, permission: 'marketers.edit', params: schoolParams, response: marketerDto }, async ({ req, admin, params }) => {
  const school = await schoolsService.get(params.schoolId);
  if (school.marketerId !== params.id) throw new BusinessRuleError('INVALID_TRANSITION', { schoolId: params.schoolId, marketerId: school.marketerId });
  const r = await schoolsService.setMarketer(params.schoolId, null, undefined, admin);
  req.audit = { action: 'school.unassign_marketer', entity: 'school', entityId: params.schoolId, summary: `Unassigned ${school.name.en}`, before: r.before, after: { marketerId: null } };
  return marketersService.get(params.id);
});
defineRoute(router, { method: 'get', path: '/admin/marketers/:id/students', tags, summary: 'Attributed students (ADM-MKT-11) — sort name|createdAt|lastActive (default -createdAt)', auth: A, permission: 'marketers.view', params: idParam, query: paginationQuery }, async ({ params, query }) => {
  await marketersService.get(params.id);
  return attributedStudents({ marketerId: params.id }, query);
});
