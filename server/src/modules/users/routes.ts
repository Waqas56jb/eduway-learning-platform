import { Router } from 'express';
import { defineRoute } from '../../common/http/route.js';
import { okDto } from '../../common/validation/schemas.js';
import { z } from '../../common/validation/zod.js';
import { usersController as c } from './controller.js';
import { meStudentDto, notificationPrefsDto, pushTokenBody, pushTokenDeleteBody, revokeSessionsQuery, sessionDto, sessionIdParam, studentUserDto, updateMeBody } from './schemas.js';

export const router = Router();
const tags = ['Me (student)'];

defineRoute(router, { method: 'get', path: '/me', tags, summary: 'My account (ME-01)', auth: 'student*', response: meStudentDto }, ({ student }) => c.me(student));
defineRoute(router, { method: 'patch', path: '/me', tags, summary: 'Update profile (ME-02)', auth: 'student', body: updateMeBody, response: studentUserDto }, ({ student, body }) => c.update(student, body));
defineRoute(router, { method: 'get', path: '/me/sessions', tags, summary: 'Active sessions (ME-03)', auth: 'student*', response: z.array(sessionDto) }, ({ student }) => c.sessions(student));
defineRoute(router, { method: 'delete', path: '/me/sessions/:sessionId', tags, summary: 'Sign out a session (ME-04)', auth: 'student*', params: sessionIdParam, response: okDto }, ({ student, params }) => c.revokeSession(student, params.sessionId));
defineRoute(router, { method: 'delete', path: '/me/sessions', tags, summary: 'Sign out all other sessions (ME-05)', auth: 'student*', query: revokeSessionsQuery }, ({ student }) => c.revokeOthers(student));
defineRoute(router, { method: 'get', path: '/me/devices', tags, summary: 'Devices (ME-06)', auth: 'student*' }, ({ student }) => c.devices(student));
defineRoute(router, { method: 'post', path: '/me/push-token', tags, summary: 'Register Expo push token (ME-07)', auth: 'student*', body: pushTokenBody, response: okDto }, ({ student, body }) => c.setPushToken(student, body));
defineRoute(router, { method: 'delete', path: '/me/push-token', tags, summary: 'Remove push token (ME-08)', auth: 'student*', body: pushTokenDeleteBody, response: okDto }, ({ student, body }) => c.removePushToken(student, body.token));
defineRoute(router, { method: 'get', path: '/me/notification-preferences', tags, summary: 'Notification preferences (ME-09)', auth: 'student*', response: notificationPrefsDto }, ({ student }) => c.getPrefs(student));
defineRoute(router, { method: 'patch', path: '/me/notification-preferences', tags, summary: 'Update notification preferences (ME-10)', auth: 'student*', body: notificationPrefsDto.partial(), response: notificationPrefsDto }, ({ student, body }) => c.setPrefs(student, body));
defineRoute(router, { method: 'get', path: '/me/entitlements', tags, summary: 'My entitlements (ME-11)', auth: 'student*' }, ({ student }) => c.entitlements(student));
