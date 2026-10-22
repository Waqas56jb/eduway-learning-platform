import { Router } from 'express';
import { defineRoute } from '../../common/http/route.js';
import { exportRequest } from '../../common/services/exporter.js';
import { idParam, okDto, reasonBody } from '../../common/validation/schemas.js';
import { z } from '../../common/validation/zod.js';
import { adminsController as c } from './controller.js';
import { adminListQuery, adminUserDto, changePasswordBody, inboxQuery, inviteBody, meAdminDto, preferencesBody, roleIdBody, updateMeBody } from './schemas.js';

export const router = Router();
const me = ['Admin · Me'];
const tags = ['Admin · Admin users'];

// ── ADM-ME-* (any admin) ──
defineRoute(router, { method: 'get', path: '/admin/me', tags: me, summary: 'Current admin (ADM-ME-01)', auth: 'admin', response: meAdminDto }, ({ admin }) => c.me(admin));
defineRoute(router, { method: 'patch', path: '/admin/me', tags: me, summary: 'Update own profile (ADM-ME-02)', auth: 'admin', body: updateMeBody, response: adminUserDto }, ({ req, admin, body }) => c.updateMe(req, admin, body));
defineRoute(router, { method: 'post', path: '/admin/me/password', tags: me, summary: 'Change own password (ADM-ME-03)', auth: 'admin', body: changePasswordBody, response: okDto }, ({ req, admin, body }) => c.changePassword(req, admin, body));
defineRoute(router, { method: 'patch', path: '/admin/me/preferences', tags: me, summary: 'Language / theme (ADM-ME-04)', auth: 'admin', body: preferencesBody }, ({ admin, body }) => c.setPreferences(admin, body));
defineRoute(router, { method: 'get', path: '/admin/me/sessions', tags: me, summary: 'Own sessions (ADM-ME-05)', auth: 'admin' }, ({ admin }) => c.mySessions(admin));
defineRoute(router, { method: 'get', path: '/admin/me/notifications', tags: me, summary: 'Admin inbox (ADM-ME-06)', auth: 'admin', query: inboxQuery }, ({ admin, query }) => c.inbox(admin, query));
defineRoute(router, { method: 'post', path: '/admin/me/notifications/read-all', tags: me, summary: 'Mark all read (ADM-ME-08)', auth: 'admin' }, ({ admin }) => c.markAllRead(admin));
defineRoute(router, { method: 'post', path: '/admin/me/notifications/:id/read', tags: me, summary: 'Mark one read (ADM-ME-07)', auth: 'admin', params: idParam }, ({ admin, params }) => c.markRead(admin, params.id));
defineRoute(router, { method: 'get', path: '/admin/lookups', tags: me, summary: 'Lookups for selects (ADM-ME-09)', auth: 'admin' }, () => c.lookups());

// ── ADM-ADM-* ──
defineRoute(router, { method: 'get', path: '/admin/admins', tags, summary: 'List admin users (ADM-ADM-01)', auth: 'admin', permission: 'security.view', query: adminListQuery, response: z.array(adminUserDto) }, ({ query }) => c.list(query));
defineRoute(router, { method: 'post', path: '/admin/admins/invite', tags, summary: 'Invite admin (ADM-ADM-02)', auth: 'admin', permission: 'security.create', body: inviteBody, response: adminUserDto, status: 201 }, ({ req, admin, body }) => c.invite(req, admin, body));
defineRoute(router, { method: 'post', path: '/admin/admins/export', tags, summary: 'Export admins (ADM-ADM-08)', auth: 'admin', permission: 'security.export', body: exportRequest, raw: true, rawContentType: 'text/csv' }, ({ req, res, body }) => c.export(req, res, body));
defineRoute(router, { method: 'post', path: '/admin/admins/:id/resend-invite', tags, summary: 'Resend invite (ADM-ADM-03)', auth: 'admin', permission: 'security.edit', params: idParam, response: okDto }, ({ req, admin, params }) => c.resendInvite(req, admin, params.id));
defineRoute(router, { method: 'patch', path: '/admin/admins/:id/role', tags, summary: 'Change role (ADM-ADM-04)', auth: 'admin', permission: 'security.edit', params: idParam, body: roleIdBody, response: adminUserDto }, ({ req, admin, params, body }) => c.changeRole(req, admin, params.id, body.roleId));
defineRoute(router, { method: 'post', path: '/admin/admins/:id/reset-mfa', tags, summary: 'Reset MFA (ADM-ADM-05)', auth: 'admin', permission: 'security.edit', params: idParam, response: adminUserDto }, ({ req, params }) => c.resetMfa(req, params.id));
defineRoute(router, { method: 'post', path: '/admin/admins/:id/deactivate', tags, summary: 'Deactivate admin (ADM-ADM-06)', auth: 'admin', permission: 'security.edit', params: idParam, body: reasonBody, response: adminUserDto }, ({ req, admin, params, body }) => c.deactivate(req, admin, params.id, body.reason));
defineRoute(router, { method: 'post', path: '/admin/admins/:id/activate', tags, summary: 'Reactivate admin (ADM-ADM-07)', auth: 'admin', permission: 'security.edit', params: idParam, response: adminUserDto }, ({ req, params }) => c.activate(req, params.id));
