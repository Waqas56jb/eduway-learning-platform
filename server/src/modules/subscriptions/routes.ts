import { Router } from 'express';
import { defineRoute } from '../../common/http/route.js';
import { rateLimits } from '../../common/middleware/rateLimit.js';
import { idParam } from '../../common/validation/schemas.js';
import { z } from '../../common/validation/zod.js';
import { subscriptionsController as c } from './controller.js';
import { adminSubscriptionDto, cancelBody, changePackageBody, exportRequest, extendBody, grantBody, mySubscriptionDto, subscriptionListQuery } from './schemas.js';
import { subscriptionsService } from './service.js';

export const router = Router();
const tags = ['Admin · Subscriptions'];
const A = 'admin' as const;

defineRoute(router, { method: 'get', path: '/subscriptions/my', tags: ['Payments'], summary: 'My subscription (PAY-03)', auth: 'student*', response: mySubscriptionDto }, ({ student }) => subscriptionsService.my(student.userId));

defineRoute(router, { method: 'get', path: '/admin/subscriptions', tags, summary: 'List subscriptions (ADM-SBS-01) — sort endsAt|startedAt|status|createdAt|student|package', auth: A, permission: 'packages.view', query: subscriptionListQuery, response: z.array(adminSubscriptionDto) }, ({ query }) => c.list(query));
defineRoute(router, { method: 'post', path: '/admin/subscriptions/export', tags, summary: 'Export subscriptions (ADM-SBS-06)', auth: A, permission: 'packages.export', body: exportRequest, raw: true, rawContentType: 'text/csv', rateLimit: rateLimits.export }, ({ req, res, body }) => c.export(req, res, body));
defineRoute(router, { method: 'post', path: '/admin/subscriptions/grant', tags, summary: 'Manual grant (ADM-SBS-02)', auth: A, permission: 'packages.edit', idempotency: 'required', body: grantBody, status: 201, response: adminSubscriptionDto }, ({ req, admin, body }) => c.grant(req, admin, body));
defineRoute(router, { method: 'post', path: '/admin/subscriptions/:id/change-package', tags, summary: 'Upgrade / downgrade (ADM-SBS-03)', auth: A, permission: 'packages.edit', params: idParam, body: changePackageBody, response: adminSubscriptionDto }, ({ req, admin, params, body }) => c.changePackage(req, admin, params.id, body));
defineRoute(router, { method: 'post', path: '/admin/subscriptions/:id/extend', tags, summary: 'Extend (ADM-SBS-04)', auth: A, permission: 'packages.edit', params: idParam, body: extendBody, response: adminSubscriptionDto }, ({ req, admin, params, body }) => c.extend(req, admin, params.id, body));
defineRoute(router, { method: 'post', path: '/admin/subscriptions/:id/cancel', tags, summary: 'Cancel (ADM-SBS-05)', auth: A, permission: 'packages.edit', params: idParam, body: cancelBody, response: adminSubscriptionDto }, ({ req, admin, params, body }) => c.cancel(req, admin, params.id, body));
