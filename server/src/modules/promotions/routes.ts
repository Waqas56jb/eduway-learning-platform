import { Router } from 'express';
import { defineRoute } from '../../common/http/route.js';
import { rateLimits } from '../../common/middleware/rateLimit.js';
import { idParam, okDto } from '../../common/validation/schemas.js';
import { z } from '../../common/validation/zod.js';
import { promotionsController as c } from './controller.js';
import { promotionsService } from './service.js';
import { checkCodeQuery, exportRequest, generateCodeQuery, promotionDto, promotionListQuery, promotionPatchBody, promotionWriteBody, redemptionsQuery, validateBody } from './schemas.js';

export const router = Router();
const tags = ['Admin · Promotions'];
const A = 'admin' as const;

// ── student (PAY-05) ──
defineRoute(
  router,
  { method: 'post', path: '/promotions/validate', tags: ['Payments'], summary: 'Validate a promo code (PAY-05) — 200 with valid:false when invalid', auth: 'student', rateLimit: rateLimits.auth, body: validateBody },
  ({ student, body, locale }) => promotionsService.validate(student.userId, body, locale),
);

// ── admin (ADM-PRM-*) — static paths first ──
defineRoute(router, { method: 'get', path: '/admin/promotions', tags, summary: 'List promotions (ADM-PRM-01)', auth: A, permission: 'packages.view', query: promotionListQuery, response: z.array(promotionDto) }, ({ query }) => c.list(query));
defineRoute(router, { method: 'get', path: '/admin/promotions/stats', tags, summary: 'Promotion KPIs (ADM-PRM-02)', auth: A, permission: 'packages.view' }, () => c.stats());
defineRoute(router, { method: 'get', path: '/admin/promotions/check-code', tags, summary: 'Code availability (ADM-PRM-06)', auth: A, permission: 'packages.view', query: checkCodeQuery }, ({ query }) => c.checkCode(query.code, query.excludeId));
defineRoute(router, { method: 'get', path: '/admin/promotions/generate-code', tags, summary: 'Generate a unique code (ADM-PRM-07)', auth: A, permission: 'packages.create', query: generateCodeQuery }, ({ query }) => c.generateCode(query.prefix));
defineRoute(router, { method: 'post', path: '/admin/promotions/export', tags, summary: 'Export promotions (ADM-PRM-09)', auth: A, permission: 'packages.export', body: exportRequest, raw: true, rawContentType: 'text/csv', rateLimit: rateLimits.export }, ({ req, res, body }) => c.export(req, res, body));
defineRoute(router, { method: 'post', path: '/admin/promotions', tags, summary: 'Create promotion (ADM-PRM-03)', auth: A, permission: 'packages.create', body: promotionWriteBody, status: 201, response: promotionDto }, ({ req, admin, body }) => c.create(req, admin, body));
defineRoute(router, { method: 'patch', path: '/admin/promotions/:id', tags, summary: 'Update / enable / disable promotion (ADM-PRM-04)', auth: A, permission: 'packages.edit', params: idParam, body: promotionPatchBody, response: promotionDto }, ({ req, params, body }) => c.update(req, params.id, body));
defineRoute(router, { method: 'delete', path: '/admin/promotions/:id', tags, summary: 'Delete promotion (ADM-PRM-05)', auth: A, permission: 'packages.delete', params: idParam, response: okDto }, ({ req, params }) => c.remove(req, params.id));
defineRoute(router, { method: 'get', path: '/admin/promotions/:id/redemptions', tags, summary: 'Redemptions (ADM-PRM-08) — sort at|discount|ref|student', auth: A, permission: 'packages.view', params: idParam, query: redemptionsQuery }, ({ params, query }) => c.redemptions(params.id, query));
defineRoute(router, { method: 'post', path: '/admin/promotions/:id/redemptions/export', tags, summary: 'Export redemptions (ADM-PRM-10)', auth: A, permission: 'packages.export', params: idParam, body: exportRequest, raw: true, rawContentType: 'text/csv', rateLimit: rateLimits.export }, ({ req, res, params, body }) => c.exportRedemptions(req, res, params.id, body));
