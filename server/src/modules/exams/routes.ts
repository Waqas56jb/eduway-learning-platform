import { Router } from 'express';
import { OK } from '../../common/dto/refs.js';
import { defineRoute } from '../../common/http/route.js';
import { exportRequest, sendExport, type ExportColumn } from '../../common/services/exporter.js';
import { settingsStore } from '../../common/services/settings-store.js';
import { paged } from '../../common/utils/response.js';
import { idParam, okDto } from '../../common/validation/schemas.js';
import { attemptsAdminService, type AttemptFilter, type AttemptRowDto } from './attempts.service.js';
import { availability, blueprintsService as bps, type ExamBlueprintDto } from './blueprints.service.js';
import {
  adminAttemptsQuery,
  attemptParam,
  attemptsQuery,
  autosaveBody,
  availabilityBody,
  blueprintBody,
  blueprintListQuery,
  blueprintParam,
  flagBody,
  publishBody,
  subjectParam,
  subjectQuery,
  submitBody,
  upcomingQuery,
} from './schemas.js';
import { examsService as s } from './student.service.js';

export const router = Router();
const tags = ['Exams'];
const AT = ['Admin · Assessments'];
const A = 'admin' as const;

// ── student (EXM-*, CAT-04) ──
defineRoute(router, { method: 'get', path: '/subjects/:subjectId/exams', tags: ['Catalog'], summary: 'Exams of a subject (CAT-04)', auth: 'student', params: subjectParam }, ({ student, params }) => s.available(student.userId, params.subjectId));
defineRoute(router, { method: 'get', path: '/exams/available', tags, summary: 'Available exams (EXM-01)', auth: 'student', query: subjectQuery }, ({ student, query }) => s.available(student.userId, query.subjectId));
defineRoute(router, { method: 'get', path: '/exams/upcoming', tags, summary: 'Upcoming exam dates (EXM-02)', auth: 'student', query: upcomingQuery }, ({ student, query }) => s.upcoming(student.userId, query.limit));
defineRoute(router, { method: 'get', path: '/exams/attempts', tags, summary: 'My exam attempts (EXM-09)', auth: 'student', query: attemptsQuery }, async ({ student, query }) => {
  const r = await s.attempts(student.userId, query);
  return paged(r.items, r.meta);
});
defineRoute(router, { method: 'get', path: '/exams/attempts/:attemptId', tags, summary: 'Attempt state / resume (EXM-04)', auth: 'student', params: attemptParam }, ({ student, params }) => s.state(student.userId, params.attemptId));
defineRoute(router, { method: 'put', path: '/exams/attempts/:attemptId/autosave', tags, summary: 'Autosave (EXM-05)', auth: 'student', params: attemptParam, body: autosaveBody }, ({ student, params, body }) => s.autosave(student.userId, params.attemptId, body));
defineRoute(router, { method: 'post', path: '/exams/attempts/:attemptId/flag', tags, summary: 'Flag question (EXM-06)', auth: 'student', params: attemptParam, body: flagBody }, ({ student, params, body }) => s.flag(student.userId, params.attemptId, body.questionId, body.flagged));
defineRoute(router, { method: 'post', path: '/exams/attempts/:attemptId/submit', tags, summary: 'Submit (EXM-07) — idempotent', auth: 'student', params: attemptParam, body: submitBody, idempotency: 'required' }, ({ student, params, body }) => s.submit(student.userId, params.attemptId, body, student.platform));
defineRoute(router, { method: 'get', path: '/exams/attempts/:attemptId/result', tags, summary: 'Result (EXM-08)', auth: 'student', params: attemptParam }, ({ student, params }) => s.result(student.userId, params.attemptId));
defineRoute(router, { method: 'post', path: '/exams/:blueprintId/start', tags, summary: 'Start / resume exam (EXM-03) · ent:subject', auth: 'student', params: blueprintParam, status: 201 }, ({ student, params }) => s.start(student.userId, params.blueprintId, student.platform));

// ── admin blueprints (ADM-EBP-*) ──
const BP_COLUMNS: ExportColumn<ExamBlueprintDto>[] = [
  { key: 'name_en', header: 'name_en', value: (r) => r.name.en },
  { key: 'name_ar', header: 'name_ar', value: (r) => r.name.ar },
  { key: 'subjects', header: 'subjects', value: (r) => r.subjects.map((x) => x.slug).join('|') },
  { key: 'questionCount', header: 'questionCount', value: (r) => r.questionCount },
  { key: 'durationMin', header: 'durationMin', value: (r) => r.durationMin },
  { key: 'scoring', header: 'scoring', value: (r) => r.scoring },
  { key: 'attemptLimit', header: 'attemptLimit', value: (r) => r.attemptLimit },
  { key: 'passMark', header: 'passMark', value: (r) => r.passMark },
  { key: 'availableFrom', header: 'availableFrom', value: (r) => r.availableFrom },
  { key: 'availableTo', header: 'availableTo', value: (r) => r.availableTo },
  { key: 'status', header: 'status', value: (r) => r.status },
  { key: 'attempts', header: 'attempts', value: (r) => r.attempts },
];
const examPassMark = async () => (await settingsStore.get('learning')).examDefaultPassMark;

defineRoute(router, { method: 'get', path: '/admin/exam-blueprints', tags: AT, summary: 'Blueprints (ADM-EBP-01)', auth: A, permission: 'assessments.view', query: blueprintListQuery }, async ({ query }) => {
  const r = await bps.list(query, query.sort, query.pageSize, (query.page - 1) * query.pageSize);
  return paged(r.items, { page: query.page, pageSize: query.pageSize, total: r.total, nextCursor: null });
});
defineRoute(router, { method: 'get', path: '/admin/exam-blueprints/stats', tags: AT, summary: 'Blueprint KPIs (ADM-EBP-02)', auth: A, permission: 'assessments.view' }, () => bps.stats());
defineRoute(router, { method: 'post', path: '/admin/exam-blueprints/availability', tags: AT, summary: 'Pool availability (ADM-EBP-10)', auth: A, permission: 'assessments.view', body: availabilityBody }, ({ body }) => availability(body.rows));
defineRoute(router, { method: 'post', path: '/admin/exam-blueprints/export', tags: AT, summary: 'Export blueprints (ADM-EBP-11)', auth: A, permission: 'assessments.export', body: exportRequest, raw: true, rawContentType: 'text/csv' }, async ({ req, res, body }) => {
  const f = (body.filters ?? {}) as { status?: string; q?: string; subjectId?: string; sort?: string };
  const r = await bps.list({ status: f.status, q: f.q, subjectId: f.subjectId, ids: body.ids?.length ? body.ids : undefined }, f.sort, 50_000, 0);
  await sendExport(req, res, { report: 'exam-blueprints', format: body.format, columns: BP_COLUMNS, selected: body.columns, rows: r.items, filters: body.filters });
});
defineRoute(router, { method: 'post', path: '/admin/exam-blueprints', tags: AT, summary: 'Create blueprint (ADM-EBP-04)', auth: A, permission: 'assessments.create', body: blueprintBody, status: 201, audit: { action: 'exam_blueprint.create', entity: 'exam_blueprint', entityId: () => null } }, async ({ body, admin }) => bps.create(body, admin, await examPassMark()));
defineRoute(router, { method: 'get', path: '/admin/exam-blueprints/:id', tags: AT, summary: 'Blueprint (ADM-EBP-03)', auth: A, permission: 'assessments.view', params: idParam }, ({ params }) => bps.get(params.id));
defineRoute(router, { method: 'put', path: '/admin/exam-blueprints/:id', tags: AT, summary: 'Update blueprint (ADM-EBP-05)', auth: A, permission: 'assessments.edit', params: idParam, body: blueprintBody }, async ({ req, params, body, admin }) => {
  const before = await bps.get(params.id);
  const r = await bps.update(params.id, body, admin, await examPassMark());
  const action = r.before !== body.status ? (body.status === 'published' ? 'publish' : body.status) : 'update';
  req.audit = { action: `exam_blueprint.${action}`, entity: 'exam_blueprint', entityId: params.id, summary: `${r.blueprint.name.en}${r.before !== body.status ? `: ${r.before} → ${body.status}` : ''}`, before, after: r.blueprint };
  return r.blueprint;
});
defineRoute(router, { method: 'delete', path: '/admin/exam-blueprints/:id', tags: AT, summary: 'Delete blueprint (ADM-EBP-06)', auth: A, permission: 'assessments.delete', params: idParam, response: okDto, audit: { action: 'exam_blueprint.delete', entity: 'exam_blueprint', before: (req) => bps.get(String(req.params.id)) } }, async ({ params }) => {
  await bps.remove(params.id);
  return OK;
});
defineRoute(router, { method: 'post', path: '/admin/exam-blueprints/:id/publish', tags: AT, summary: 'Publish (ADM-EBP-07)', auth: A, permission: 'assessments.approve', params: idParam, body: publishBody, audit: { action: 'exam_blueprint.publish', entity: 'exam_blueprint' } }, ({ params, body, admin }) => bps.publish(params.id, admin, body.force));
defineRoute(router, { method: 'post', path: '/admin/exam-blueprints/:id/archive', tags: AT, summary: 'Archive (ADM-EBP-08)', auth: A, permission: 'assessments.edit', params: idParam, audit: { action: 'exam_blueprint.archive', entity: 'exam_blueprint' } }, ({ params, admin }) => bps.archive(params.id, admin));
defineRoute(router, { method: 'post', path: '/admin/exam-blueprints/:id/duplicate', tags: AT, summary: 'Duplicate (ADM-EBP-09)', auth: A, permission: 'assessments.create', params: idParam, status: 201, audit: { action: 'exam_blueprint.duplicate', entity: 'exam_blueprint' } }, ({ params, admin }) => bps.duplicate(params.id, admin));

// ── admin attempts (ADM-ATT-*) ──
const ATT_COLUMNS: ExportColumn<AttemptRowDto>[] = [
  { key: 'id', header: 'id', value: (r) => r.id },
  { key: 'kind', header: 'kind', value: (r) => r.kind },
  { key: 'student', header: 'student', value: (r) => r.student.name.en },
  { key: 'mobile', header: 'mobile', value: (r) => r.student.mobile },
  { key: 'title', header: 'title', value: (r) => r.title.en },
  { key: 'score', header: 'score', value: (r) => r.score },
  { key: 'correct', header: 'correct', value: (r) => r.correct },
  { key: 'total', header: 'total', value: (r) => r.total },
  { key: 'timeSec', header: 'timeSec', value: (r) => r.timeSec },
  { key: 'status', header: 'status', value: (r) => r.status },
  { key: 'platform', header: 'platform', value: (r) => r.platform },
  { key: 'date', header: 'date', value: (r) => r.date },
];
const attFilter = (q: Record<string, unknown>): AttemptFilter => {
  const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
  return { kind: str(q.kind) as AttemptFilter['kind'], status: str(q.status) as AttemptFilter['status'], q: str(q.q), studentId: str(q.studentId), refId: str(q.refId), from: str(q.from), to: str(q.to), platform: str(q.platform) };
};

defineRoute(router, { method: 'get', path: '/admin/attempts', tags: AT, summary: 'Attempts (ADM-ATT-01)', auth: A, permission: 'assessments.view', query: adminAttemptsQuery }, async ({ query }) => {
  const r = await attemptsAdminService.list(attFilter(query), query.sort, query.pageSize, (query.page - 1) * query.pageSize);
  return paged(r.items, { page: query.page, pageSize: query.pageSize, total: r.total, nextCursor: null });
});
defineRoute(router, { method: 'get', path: '/admin/attempts/stats', tags: AT, summary: 'Attempt KPIs (ADM-ATT-02)', auth: A, permission: 'assessments.view', query: adminAttemptsQuery }, ({ query }) => attemptsAdminService.stats(attFilter(query)));
defineRoute(router, { method: 'post', path: '/admin/attempts/export', tags: AT, summary: 'Export attempts (ADM-ATT-04)', auth: A, permission: 'assessments.export', body: exportRequest, raw: true, rawContentType: 'text/csv' }, async ({ req, res, body }) => {
  const f = attFilter(body.filters ?? {});
  if (body.ids?.length) f.ids = body.ids;
  const r = await attemptsAdminService.list(f, typeof body.filters?.sort === 'string' ? body.filters.sort : undefined, 50_000, 0);
  await sendExport(req, res, { report: 'attempts', format: body.format, columns: ATT_COLUMNS, selected: body.columns, rows: r.items, filters: body.filters, from: f.from, to: f.to });
});
defineRoute(router, { method: 'get', path: '/admin/attempts/:id', tags: AT, summary: 'Attempt detail (ADM-ATT-03)', auth: A, permission: 'assessments.view', params: idParam }, ({ params }) => attemptsAdminService.detail(params.id));
