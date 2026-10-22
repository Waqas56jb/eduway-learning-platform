import { Router } from 'express';
import { defineRoute } from '../../common/http/route.js';
import { assertPermission } from '../../common/middleware/rbac.js';
import { idParam, isoDate, okDto } from '../../common/validation/schemas.js';
import { z } from '../../common/validation/zod.js';
import { OK } from '../../common/dto/refs.js';
import { incentiveRules, modulePerm } from './service.js';

export const router = Router();
const tags = ['Admin · Incentive rules'];
const A = 'admin' as const;

const partnerType = z.enum(['school', 'marketer']);
export const tierInput = z.object({
  from: z.number().int().min(0),
  to: z.number().int().min(0).nullable(),
  rewardType: z.enum(['per_student', 'fixed']),
  amount: z.number().int().min(0),
  label: z.string().trim().max(80).default(''),
});
const listQuery = z.object({ partnerType, status: z.enum(['active', 'scheduled', 'superseded', 'draft']).optional() });
const createBody = z.object({ partnerType, cloneFromId: z.string().uuid().optional() });
const patchBody = z.object({
  name: z.object({ en: z.string().trim().min(1).max(200), ar: z.string().trim().min(1).max(200) }).optional(),
  qualificationThreshold: z.number().int().min(0).optional(),
  period: z.enum(['monthly', 'quarterly', 'semester', 'yearly']).optional(),
  effectiveFrom: isoDate.optional(),
  effectiveTo: isoDate.nullable().optional(),
  tiers: z.array(tierInput).max(50).optional(),
});
const previewBody = z.object({ qualificationThreshold: z.number().int().min(0), tiers: z.array(tierInput).max(50), students: z.number().int().min(0) });
const ruleDto = z.record(z.unknown()).openapi('IncentiveRuleDto');
const VIEW_ANY = ['schools.view', 'marketers.view'] as const;

defineRoute(router, { method: 'get', path: '/admin/incentive-rules', tags, summary: 'Rule versions (ADM-INC-01)', auth: A, anyPermission: [...VIEW_ANY], query: listQuery, response: z.array(ruleDto) }, ({ admin, query }) => {
  assertPermission(admin, modulePerm(query.partnerType, 'view'));
  return incentiveRules.list(query.partnerType, query.status);
});
defineRoute(router, { method: 'post', path: '/admin/incentive-rules/preview', tags, summary: 'Preview calculator (ADM-INC-07)', auth: A, anyPermission: [...VIEW_ANY], body: previewBody }, ({ body }) => incentiveRules.preview(body));
defineRoute(router, { method: 'post', path: '/admin/incentive-rules', tags, summary: 'New draft version (ADM-INC-03)', auth: A, anyPermission: ['schools.edit', 'marketers.edit'], body: createBody, status: 201, response: ruleDto }, async ({ req, admin, body }) => {
  assertPermission(admin, modulePerm(body.partnerType, 'edit'));
  const r = await incentiveRules.createDraft(body.partnerType, body.cloneFromId, admin);
  req.audit = { action: 'incentive_rule.create_version', entity: 'incentive_rule', entityId: r.id, summary: `Created ${body.partnerType} incentive draft v${r.version}`, after: r };
  return r;
});
defineRoute(router, { method: 'get', path: '/admin/incentive-rules/:id', tags, summary: 'Rule (ADM-INC-02)', auth: A, anyPermission: [...VIEW_ANY], params: idParam, response: ruleDto }, ({ admin, params }) => incentiveRules.getChecked(params.id, admin, 'view'));
defineRoute(router, { method: 'patch', path: '/admin/incentive-rules/:id', tags, summary: 'Edit draft (ADM-INC-04)', auth: A, anyPermission: ['schools.edit', 'marketers.edit'], params: idParam, body: patchBody, response: ruleDto }, async ({ req, admin, params, body }) => {
  const before = await incentiveRules.getChecked(params.id, admin, 'edit');
  const r = await incentiveRules.updateDraft(params.id, body);
  req.audit = { action: 'incentive_rule.update_draft', entity: 'incentive_rule', entityId: r.id, summary: `Edited draft v${r.version}: ${Object.keys(body).join(', ')}`, before: Object.fromEntries(Object.keys(body).map((k) => [k, (before as unknown as Record<string, unknown>)[k]])), after: body };
  return r;
});
defineRoute(router, { method: 'delete', path: '/admin/incentive-rules/:id', tags, summary: 'Delete draft (ADM-INC-05)', auth: A, anyPermission: ['schools.delete', 'marketers.delete'], params: idParam, response: okDto }, async ({ req, admin, params }) => {
  const before = await incentiveRules.getChecked(params.id, admin, 'delete');
  await incentiveRules.deleteDraft(params.id);
  req.audit = { action: 'incentive_rule.delete', entity: 'incentive_rule', entityId: params.id, summary: `Deleted draft v${before.version}`, before };
  return OK;
});
defineRoute(router, { method: 'post', path: '/admin/incentive-rules/:id/activate', tags, summary: 'Activate / schedule (ADM-INC-06)', auth: A, anyPermission: ['schools.approve', 'marketers.approve'], params: idParam }, async ({ req, admin, params }) => {
  await incentiveRules.getChecked(params.id, admin, 'approve');
  const r = await incentiveRules.activate(params.id, admin);
  req.audit = {
    action: 'incentive_rule.activate',
    entity: 'incentive_rule',
    entityId: params.id,
    summary: `${r.activated.status === 'scheduled' ? 'Scheduled' : 'Activated'} ${r.activated.partnerType} rule v${r.activated.version} from ${r.activated.effectiveFrom.slice(0, 10)}${r.superseded ? ` (supersede v${r.superseded.version})` : ''}`,
    after: r,
  };
  return r;
});
