import { Router } from 'express';
import { OK } from '../../common/dto/refs.js';
import { defineRoute } from '../../common/http/route.js';
import { exportRequest, sendExport, type ExportColumn } from '../../common/services/exporter.js';
import { paged } from '../../common/utils/response.js';
import { idParam, okDto } from '../../common/validation/schemas.js';
import { quizRulesService as rules, type QuizRuleDto } from './rules.service.js';
import { answerBody, attemptParam, attemptsQuery, effectiveQuery, lessonParam, ruleCreateBody, ruleListQuery, rulePatchBody, ruleWriteBody, startBody, submitBody, subjectIdParam } from './schemas.js';
import { quizzesService as s } from './service.js';

export const router = Router();
const tags = ['Quizzes'];
const AT = ['Admin · Assessments'];
const A = 'admin' as const;

defineRoute(router, { method: 'get', path: '/lessons/:lessonId/quiz-rule', tags: ['Catalog'], summary: 'Effective quiz rule (CAT-10)', auth: 'student', params: lessonParam }, ({ params, student }) => s.rule(params.lessonId, student.userId));
defineRoute(router, { method: 'get', path: '/quizzes/attempts', tags, summary: 'My quiz attempts (QUZ-04)', auth: 'student', query: attemptsQuery }, async ({ student, query }) => {
  const r = await s.attempts(student.userId, query.lessonId, query.page, query.pageSize);
  return paged(r.items, r.meta);
});
defineRoute(router, { method: 'get', path: '/quizzes/attempts/:attemptId', tags, summary: 'Quiz result (QUZ-05)', auth: 'student', params: attemptParam }, ({ student, params }) => s.result(params.attemptId, student.userId));
defineRoute(router, { method: 'post', path: '/quizzes/attempts/:attemptId/answer', tags, summary: 'Answer (QUZ-02) · ent:subject', auth: 'student', params: attemptParam, body: answerBody }, ({ student, params, body }) => s.answer(params.attemptId, student.userId, body, student.platform));
defineRoute(router, { method: 'post', path: '/quizzes/attempts/:attemptId/submit', tags, summary: 'Submit (QUZ-03)', auth: 'student', params: attemptParam, body: submitBody }, ({ student, params, body }) => s.submit(params.attemptId, student.userId, body.timeSpentSec, student.platform));
defineRoute(router, { method: 'post', path: '/quizzes/:lessonId/start', tags, summary: 'Start quiz (QUZ-01) · ent:subject', auth: 'student', params: lessonParam, body: startBody, status: 201 }, ({ student, params }) => s.start(params.lessonId, student.userId, student.platform));

// ── admin quiz rules (ADM-QZR-*) ──
const EXPORT_COLUMNS: ExportColumn<QuizRuleDto>[] = [
  { key: 'subject', header: 'subject', value: (r) => r.subject.name.en },
  { key: 'lesson', header: 'lesson', value: (r) => r.lesson?.title.en ?? '' },
  { key: 'questionCount', header: 'questionCount', value: (r) => r.questionCount },
  { key: 'poolSize', header: 'poolSize', value: (r) => r.poolSize },
  { key: 'randomize', header: 'randomize', value: (r) => r.randomize },
  { key: 'alternativeSets', header: 'alternativeSets', value: (r) => r.alternativeSets },
  { key: 'passThreshold', header: 'passThreshold', value: (r) => r.passThreshold },
  { key: 'retryPolicy', header: 'retryPolicy', value: (r) => r.retryPolicy },
  { key: 'maxRetries', header: 'maxRetries', value: (r) => r.maxRetries },
  { key: 'cooldownMinutes', header: 'cooldownMinutes', value: (r) => r.cooldownMinutes },
  { key: 'showExplanation', header: 'showExplanation', value: (r) => r.showExplanation },
  { key: 'updatedAt', header: 'updatedAt', value: (r) => r.updatedAt },
];

defineRoute(router, { method: 'get', path: '/admin/quiz-rules', tags: AT, summary: 'Quiz rules incl. effective subject defaults (ADM-QZR-01)', auth: A, permission: 'assessments.view', query: ruleListQuery }, async ({ query }) => {
  const r = await rules.list(query, query.page, query.pageSize);
  return paged(r.items, { page: query.page, pageSize: query.pageSize, total: r.total, nextCursor: null });
});
defineRoute(router, { method: 'get', path: '/admin/quiz-rules/effective', tags: AT, summary: 'Effective rule for a lesson (ADM-QZR-06)', auth: A, permission: 'assessments.view', query: effectiveQuery }, ({ query }) => rules.effective(query.lessonId));
defineRoute(router, { method: 'post', path: '/admin/quiz-rules/export', tags: AT, summary: 'Export overrides (ADM-QZR-07)', auth: A, permission: 'assessments.export', body: exportRequest, raw: true, rawContentType: 'text/csv' }, async ({ req, res, body }) => {
  const f = (body.filters ?? {}) as { subjectId?: string; q?: string };
  const r = await rules.list({ scope: 'lesson', subjectId: f.subjectId, q: f.q, ids: body.ids?.length ? body.ids : undefined }, 1, 50_000);
  await sendExport(req, res, { report: 'quiz-rules', format: body.format, columns: EXPORT_COLUMNS, selected: body.columns, rows: r.items, filters: body.filters });
});
defineRoute(router, { method: 'put', path: '/admin/quiz-rules/subjects/:subjectId', tags: AT, summary: 'Upsert subject default (ADM-QZR-02)', auth: A, permission: 'assessments.edit', params: subjectIdParam, body: ruleWriteBody, audit: { action: 'quiz_rule.update', entity: 'quiz_rule', entityId: (req) => String(req.params.subjectId) } }, ({ params, body }) => rules.upsertSubject(params.subjectId, body));
defineRoute(router, { method: 'post', path: '/admin/quiz-rules', tags: AT, summary: 'Create lesson override (ADM-QZR-03)', auth: A, permission: 'assessments.edit', body: ruleCreateBody, status: 201, audit: { action: 'quiz_rule.create', entity: 'quiz_rule', entityId: () => null } }, ({ body }) => {
  const { lessonId, ...v } = body;
  return rules.createOverride(lessonId, v);
});
defineRoute(router, { method: 'patch', path: '/admin/quiz-rules/:id', tags: AT, summary: 'Update rule (ADM-QZR-04)', auth: A, permission: 'assessments.edit', params: idParam, body: rulePatchBody, audit: { action: 'quiz_rule.update', entity: 'quiz_rule', before: (req) => rules.get(String(req.params.id)) } }, ({ params, body }) => rules.update(params.id, body));
defineRoute(router, { method: 'delete', path: '/admin/quiz-rules/:id', tags: AT, summary: 'Delete lesson override (ADM-QZR-05)', auth: A, permission: 'assessments.delete', params: idParam, response: okDto, audit: { action: 'quiz_rule.delete', entity: 'quiz_rule', before: (req) => rules.get(String(req.params.id)) } }, async ({ params }) => {
  await rules.remove(params.id);
  return OK;
});
