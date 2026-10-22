import { Router } from 'express';
import { defineRoute } from '../../common/http/route.js';
import { paged } from '../../common/utils/response.js';
import { answerBody, finishBody, sessionParam, sessionsQuery, startBody } from './schemas.js';
import { practiceService as s } from './service.js';

export const router = Router();
const tags = ['Practice'];

defineRoute(router, { method: 'post', path: '/practice/start', tags, summary: 'Start practice (PRA-01) · ent:subject', auth: 'student', body: startBody, status: 201 }, ({ student, body }) => s.start(student.userId, body, student.platform));
defineRoute(router, { method: 'get', path: '/practice/sessions', tags, summary: 'Recent practice (PRA-05)', auth: 'student', query: sessionsQuery }, async ({ student, query }) => {
  const r = await s.sessions(student.userId, query.page, query.limit);
  return paged(r.items, r.meta);
});
defineRoute(router, { method: 'post', path: '/practice/:sessionId/answer', tags, summary: 'Answer (PRA-02)', auth: 'student', params: sessionParam, body: answerBody }, ({ student, params, body }) => s.answer(student.userId, params.sessionId, body, student.platform));
defineRoute(router, { method: 'post', path: '/practice/:sessionId/finish', tags, summary: 'Finish (PRA-03)', auth: 'student', params: sessionParam, body: finishBody }, ({ student, params, body }) => s.finish(student.userId, params.sessionId, body.timeSpentSec, student.platform));
defineRoute(router, { method: 'get', path: '/practice/:sessionId/result', tags, summary: 'Result (PRA-04)', auth: 'student', params: sessionParam }, ({ student, params }) => s.result(student.userId, params.sessionId));
