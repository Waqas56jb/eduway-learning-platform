import { Router } from 'express';
import { defineRoute } from '../../common/http/route.js';
import { paged } from '../../common/utils/response.js';
import { mistakeDetailQuery, mistakeListQuery, mistakeParam, retryBody, statusBody } from './schemas.js';
import { mistakesService as s } from './service.js';

export const router = Router();
const tags = ['Mistakes'];

defineRoute(router, { method: 'get', path: '/mistakes', tags, summary: 'My mistakes (MST-01)', auth: 'student', query: mistakeListQuery }, async ({ student, query }) => {
  const r = await s.list(student.userId, query);
  return paged(r.items, r.meta);
});
defineRoute(router, { method: 'get', path: '/mistakes/summary', tags, summary: 'Mistake counters (MST-02)', auth: 'student' }, ({ student }) => s.summary(student.userId));
defineRoute(router, { method: 'get', path: '/mistakes/:id', tags, summary: 'Mistake detail — answer concealed until retry (MST-03)', auth: 'student', params: mistakeParam, query: mistakeDetailQuery }, ({ student, params, query }) => s.detail(student.userId, params.id, query.reveal));
defineRoute(router, { method: 'patch', path: '/mistakes/:id', tags, summary: 'Set status (MST-04)', auth: 'student', params: mistakeParam, body: statusBody }, ({ student, params, body }) => s.setStatus(student.userId, params.id, body.status));
defineRoute(router, { method: 'post', path: '/mistakes/:id/retry', tags, summary: 'Retry (MST-05) · ent:subject', auth: 'student', params: mistakeParam, body: retryBody }, ({ student, params, body }) => s.retry(student.userId, params.id, body, student.platform));
