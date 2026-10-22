import { Router } from 'express';
import { defineRoute } from '../../common/http/route.js';
import { exportRequest } from '../../common/services/exporter.js';
import { idParam, okDto, optionalReasonBody } from '../../common/validation/schemas.js';
import { studentsController as c } from './controller.js';
import {
  activityQuery,
  attributionBody,
  bulkBody,
  bulkOptionalReasonBody,
  grantBody,
  lockBody,
  noteBody,
  studentEntitlementParams,
  studentListQuery,
  studentSessionParams,
  ticketListQuery,
  ticketParam,
  ticketPatchBody,
  ticketReplyBody,
  txQuery,
  unlockBody,
  updateStudentBody,
} from './schemas.js';

export const router = Router();
const tags = ['Admin · Students'];
const A = 'admin' as const;

defineRoute(router, { method: 'get', path: '/admin/students', tags, summary: 'List students (ADM-STU-01)', auth: A, permission: 'users.view', query: studentListQuery }, ({ query }) => c.list(query));
defineRoute(router, { method: 'get', path: '/admin/students/stats', tags, summary: 'Student stat cards (ADM-STU-02)', auth: A, permission: 'users.view' }, () => c.stats());
defineRoute(router, { method: 'post', path: '/admin/students/export', tags, summary: 'Export students (ADM-STU-03)', auth: A, permission: 'users.export', body: exportRequest, raw: true, rawContentType: 'text/csv' }, ({ req, res, body }) => c.export(req, res, body));
defineRoute(router, { method: 'post', path: '/admin/students/bulk/lock', tags, summary: 'Bulk lock (ADM-STU-04)', auth: A, permission: 'users.edit', body: bulkBody }, ({ req, admin, body }) => c.bulkLock(req, admin, body.ids, body.reason));
defineRoute(router, { method: 'post', path: '/admin/students/bulk/unlock', tags, summary: 'Bulk unlock (ADM-STU-05)', auth: A, permission: 'users.edit', body: bulkOptionalReasonBody }, ({ req, admin, body }) => c.bulkUnlock(req, admin, body.ids, body.reason));
defineRoute(router, { method: 'get', path: '/admin/students/:id', tags, summary: 'Student detail (ADM-STU-06)', auth: A, permission: 'users.view', params: idParam }, ({ params }) => c.detail(params.id));
defineRoute(router, { method: 'patch', path: '/admin/students/:id', tags, summary: 'Update student (ADM-STU-21)', auth: A, permission: 'users.edit', params: idParam, body: updateStudentBody }, ({ req, params, body }) => c.update(req, params.id, body));
defineRoute(router, { method: 'post', path: '/admin/students/:id/lock', tags, summary: 'Lock student (ADM-STU-07)', auth: A, permission: 'users.edit', params: idParam, body: lockBody }, ({ req, admin, params, body }) => c.lock(req, admin, params.id, body.reason));
defineRoute(router, { method: 'post', path: '/admin/students/:id/unlock', tags, summary: 'Unlock student (ADM-STU-08)', auth: A, permission: 'users.edit', params: idParam, body: unlockBody }, ({ req, admin, params, body }) => c.unlock(req, admin, params.id, body.reason));
defineRoute(router, { method: 'get', path: '/admin/students/:id/sessions', tags, summary: 'Student sessions (ADM-STU-09)', auth: A, permission: 'users.view', params: idParam }, ({ params }) => c.sessions(params.id));
defineRoute(router, { method: 'delete', path: '/admin/students/:id/sessions/:sessionId', tags, summary: 'Force logout one session (ADM-STU-10)', auth: A, permission: 'users.edit', params: studentSessionParams, response: okDto }, ({ req, admin, params }) => c.revokeSession(req, admin, params.id, params.sessionId));
defineRoute(router, { method: 'delete', path: '/admin/students/:id/sessions', tags, summary: 'Force logout all (ADM-STU-11)', auth: A, permission: 'users.edit', params: idParam, body: optionalReasonBody }, ({ req, admin, params, body }) => c.revokeAll(req, admin, params.id, body.reason ?? (typeof req.query.reason === 'string' ? req.query.reason : undefined)));
defineRoute(router, { method: 'get', path: '/admin/students/:id/notes', tags, summary: 'Support notes (ADM-STU-12)', auth: A, permission: 'users.view', params: idParam }, ({ params }) => c.notes(params.id));
defineRoute(router, { method: 'post', path: '/admin/students/:id/notes', tags, summary: 'Add note (ADM-STU-13)', auth: A, permission: 'users.edit', params: idParam, body: noteBody, status: 201 }, ({ req, admin, params, body }) => c.addNote(req, admin, params.id, body.body));
defineRoute(router, { method: 'post', path: '/admin/students/:id/entitlements', tags, summary: 'Manual access grant (ADM-STU-14)', auth: A, permission: 'users.edit', params: idParam, body: grantBody, idempotency: 'required' }, ({ req, admin, params, body }) => c.grant(req, admin, params.id, body));
defineRoute(router, { method: 'delete', path: '/admin/students/:id/entitlements/:entitlementId', tags, summary: 'Revoke manual access (ADM-STU-15)', auth: A, permission: 'users.edit', params: studentEntitlementParams, body: optionalReasonBody }, ({ req, admin, params, body }) => c.revokeGrant(req, admin, params.id, params.entitlementId, body.reason ?? (typeof req.query.reason === 'string' ? req.query.reason : undefined)));
defineRoute(router, { method: 'get', path: '/admin/students/:id/entitlement-logs', tags, summary: 'Entitlement history (ADM-STU-16)', auth: A, permission: 'users.view', params: idParam }, ({ params }) => c.entitlementLogs(params.id));
defineRoute(router, { method: 'patch', path: '/admin/students/:id/attribution', tags, summary: 'Change school / referral attribution (ADM-STU-17)', auth: A, permission: 'users.edit', params: idParam, body: attributionBody }, ({ req, params, body }) => c.attribution(req, params.id, body));
defineRoute(router, { method: 'post', path: '/admin/students/:id/otp/reset', tags, summary: 'Reset OTP lockout (ADM-STU-18)', auth: A, permission: 'users.edit', params: idParam }, ({ req, params }) => c.resetOtp(req, params.id));
defineRoute(router, { method: 'get', path: '/admin/students/:id/activity', tags, summary: 'Activity telemetry (ADM-STU-19)', auth: A, permission: 'users.view', params: idParam, query: activityQuery }, ({ params, query }) => c.activity(params.id, query.limit, query.days));
defineRoute(router, { method: 'get', path: '/admin/students/:id/transactions', tags, summary: 'Student transactions (ADM-STU-20)', auth: A, permission: 'users.view', params: idParam, query: txQuery }, ({ params, query }) => c.transactions(params.id, query));

// ── support tickets (ADM-SUP-*) ──
const SUP = ['Admin · Support'];
defineRoute(router, { method: 'get', path: '/admin/support-tickets', tags: SUP, summary: 'Support tickets (ADM-SUP-01) — meta.counts by status', auth: A, permission: 'users.view', query: ticketListQuery }, ({ query }) => c.tickets(query));
defineRoute(router, { method: 'post', path: '/admin/support-tickets/export', tags: SUP, summary: 'Export support tickets (ADM-SUP-06)', auth: A, permission: 'users.export', body: exportRequest, raw: true, rawContentType: 'text/csv' }, ({ req, res, body }) => c.exportTickets(req, res, body));
defineRoute(router, { method: 'get', path: '/admin/support-tickets/:id', tags: SUP, summary: 'Ticket detail + thread (ADM-SUP-03)', auth: A, permission: 'users.view', params: ticketParam }, ({ params }) => c.ticket(params.id));
defineRoute(router, { method: 'patch', path: '/admin/support-tickets/:id', tags: SUP, summary: 'Update ticket: status / priority / assignee (ADM-SUP-02)', auth: A, permission: 'users.edit', params: ticketParam, body: ticketPatchBody }, ({ req, params, body }) => c.updateTicket(req, params.id, body));
defineRoute(router, { method: 'post', path: '/admin/support-tickets/:id/replies', tags: SUP, summary: 'Reply to a ticket (ADM-SUP-04)', auth: A, permission: 'users.edit', params: ticketParam, body: ticketReplyBody, status: 201 }, ({ req, admin, params, body }) => c.replyTicket(req, admin, params.id, body));
defineRoute(router, { method: 'delete', path: '/admin/support-tickets/:id', tags: SUP, summary: 'Delete ticket (ADM-SUP-05)', auth: A, permission: 'users.delete', params: ticketParam, response: okDto }, ({ req, params }) => c.removeTicket(req, params.id));
