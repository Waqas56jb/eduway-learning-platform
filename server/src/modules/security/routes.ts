import { Router } from 'express';
import { defineRoute } from '../../common/http/route.js';
import { exportRequest } from '../../common/services/exporter.js';
import { idParam, okDto, reasonBody } from '../../common/validation/schemas.js';
import { securityController as c } from './controller.js';
import { adminSessionsQuery, alertsQuery, auditListQuery, facetsQuery, revokeAllBody } from './schemas.js';

export const router = Router();
const audit = ['Admin · Audit logs'];
const sess = ['Admin · Admin sessions'];
const alerts = ['Admin · Security alerts'];
const A = 'admin' as const;

defineRoute(router, { method: 'get', path: '/admin/audit-logs', tags: audit, summary: 'Audit log (ADM-AUD-01)', auth: A, permission: 'security.view', query: auditListQuery }, ({ query }) => c.auditList(query));
defineRoute(router, { method: 'get', path: '/admin/audit-logs/facets', tags: audit, summary: 'Audit filter facets (ADM-AUD-03)', auth: A, permission: 'security.view', query: facetsQuery }, ({ query }) => c.auditFacets(query.from, query.to));
defineRoute(router, { method: 'post', path: '/admin/audit-logs/export', tags: audit, summary: 'Export audit log (ADM-AUD-04)', auth: A, permission: 'security.export', body: exportRequest, raw: true, rawContentType: 'text/csv' }, ({ req, res, body }) => c.auditExport(req, res, body));
defineRoute(router, { method: 'get', path: '/admin/audit-logs/:id', tags: audit, summary: 'Audit entry with diff (ADM-AUD-02)', auth: A, permission: 'security.view', params: idParam }, ({ params }) => c.auditGet(params.id));

defineRoute(router, { method: 'get', path: '/admin/admin-sessions', tags: sess, summary: 'Active admin sessions (ADM-SES-01)', auth: A, permission: 'security.view', query: adminSessionsQuery }, ({ query, admin }) => c.adminSessions(query, admin));
defineRoute(router, { method: 'post', path: '/admin/admin-sessions/revoke-all', tags: sess, summary: 'Revoke all admin sessions (ADM-SES-03)', auth: A, permission: 'security.edit', body: revokeAllBody }, ({ req, admin, body }) => c.revokeAll(req, admin, body.adminId));
defineRoute(router, { method: 'post', path: '/admin/admin-sessions/export', tags: sess, summary: 'Export admin sessions (ADM-SES-04)', auth: A, permission: 'security.export', body: exportRequest, raw: true, rawContentType: 'text/csv' }, ({ req, res, admin, body }) => c.sessionsExport(req, res, admin, body));
defineRoute(router, { method: 'delete', path: '/admin/admin-sessions/:id', tags: sess, summary: 'Revoke admin session (ADM-SES-02)', auth: A, permission: 'security.edit', params: idParam, response: okDto }, ({ req, admin, params }) => c.revokeAdminSession(req, admin, params.id));

defineRoute(router, { method: 'get', path: '/admin/security-alerts', tags: alerts, summary: 'Suspicious activity (ADM-ALR-01)', auth: A, permission: 'security.view', query: alertsQuery }, ({ query }) => c.alerts(query));
defineRoute(router, { method: 'post', path: '/admin/security-alerts/:id/resolve', tags: alerts, summary: 'Resolve alert (ADM-ALR-02)', auth: A, permission: 'security.edit', params: idParam, body: reasonBody }, ({ req, admin, params, body }) => c.resolve(req, admin, params.id, body.reason));
defineRoute(router, { method: 'post', path: '/admin/security-alerts/:id/block', tags: alerts, summary: 'Block subject (ADM-ALR-03)', auth: A, permission: 'security.edit', params: idParam, body: reasonBody }, ({ req, admin, params, body }) => c.block(req, admin, params.id, body.reason));
defineRoute(router, { method: 'post', path: '/admin/security-alerts/:id/reopen', tags: alerts, summary: 'Reopen alert (ADM-ALR-04)', auth: A, permission: 'security.edit', params: idParam }, ({ req, params }) => c.reopen(req, params.id));
