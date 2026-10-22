import { Router, type Request, type Response } from 'express';
import { OK } from '../../common/dto/refs.js';
import { defineRoute } from '../../common/http/route.js';
import { uploadSingle } from '../../common/middleware/upload.js';
import { exportRequest, sendExport, type ExportColumn, type ExportRequest } from '../../common/services/exporter.js';
import { auditService } from '../../common/services/audit.js';
import { paged } from '../../common/utils/response.js';
import { idParam, okDto } from '../../common/validation/schemas.js';
import { questionsAdminService as qs, filterOf, questionTransitionTarget, type AdminQuestion } from './admin.service.js';
import { bankService } from './bank.service.js';
import { importService } from './import.service.js';
import {
  bankQuery,
  bookmarksQuery,
  bulkIdsBody,
  bulkTransitionBody,
  importBody,
  importPageQuery,
  importParam,
  previewQuery,
  questionCreateBody,
  questionListQuery,
  questionParam,
  questionPatchBody,
  reviewQueueQuery,
  similarBody,
  tagsQuery,
  templateQuery,
  transitionBody,
} from './schemas.js';

export const router = Router();
const A = 'admin' as const;
const AQ = ['Admin · Questions'];
const SB = ['Question bank'];

const EXPORT_COLUMNS: ExportColumn<AdminQuestion>[] = [
  { key: 'code', header: 'code', value: (r) => r.code },
  { key: 'body_en', header: 'body_en', value: (r) => r.body.en },
  { key: 'body_ar', header: 'body_ar', value: (r) => r.body.ar },
  { key: 'subject', header: 'subject', value: (r) => r.subject.name.en },
  { key: 'unit', header: 'unit', value: (r) => r.unit.name.en },
  { key: 'topic', header: 'topic', value: (r) => r.topic.name.en },
  { key: 'difficulty', header: 'difficulty', value: (r) => r.difficulty },
  { key: 'type', header: 'type', value: (r) => r.type },
  { key: 'tags', header: 'tags', value: (r) => r.tags.join(';') },
  { key: 'status', header: 'status', value: (r) => r.status },
  { key: 'author', header: 'author', value: (r) => r.author.name.en },
  { key: 'reviewer', header: 'reviewer', value: (r) => r.reviewer?.name.en ?? '' },
  { key: 'usage', header: 'usage', value: (r) => r.usageCount },
  { key: 'accuracy', header: 'accuracy', value: (r) => r.accuracy },
  { key: 'updatedAt', header: 'updatedAt', value: (r) => r.updatedAt },
];

const sendFile = (res: Response, buf: Buffer, fileName: string) => {
  res.setHeader('Content-Type', fileName.endsWith('.csv') ? 'text/csv; charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.status(200).send(buf);
};

async function exportQuestions(req: Request, res: Response, body: ExportRequest) {
  const f = filterOf((body.filters ?? {}) as Record<string, string>);
  if (body.ids?.length) f.ids = body.ids;
  const rows = await qs.exportRows(f, typeof body.filters?.sort === 'string' ? body.filters.sort : undefined);
  await sendExport(req, res, { report: 'questions', format: body.format, columns: EXPORT_COLUMNS, selected: body.columns, rows, filters: body.filters });
}

// ── admin questions (ADM-QST-*) ──
defineRoute(router, { method: 'get', path: '/admin/questions', tags: AQ, summary: 'Questions (ADM-QST-01)', auth: A, permission: 'questions.view', query: questionListQuery }, async ({ query }) => {
  const r = await qs.list(query);
  return paged(r.items, { page: query.page, pageSize: query.pageSize, total: r.total, nextCursor: null });
});
defineRoute(router, { method: 'get', path: '/admin/questions/stats', tags: AQ, summary: 'Question KPIs (ADM-QST-02)', auth: A, permission: 'questions.view' }, () => qs.stats());
defineRoute(router, { method: 'get', path: '/admin/questions/review-queue', tags: AQ, summary: 'Review queue (ADM-QST-12)', auth: A, permission: 'questions.view', query: reviewQueueQuery }, async ({ query }) => {
  const r = await qs.reviewQueue(query);
  return paged(r.items, { total: r.total, page: 1, pageSize: r.items.length, nextCursor: null });
});
defineRoute(router, { method: 'post', path: '/admin/questions/similar', tags: AQ, summary: 'Similar questions (ADM-QST-11)', auth: A, permission: 'questions.view', body: similarBody }, ({ body }) => qs.similar(body));
defineRoute(router, { method: 'post', path: '/admin/questions/export', tags: AQ, summary: 'Export questions (ADM-QST-15)', auth: A, permission: 'questions.export', body: exportRequest, raw: true, rawContentType: 'text/csv' }, ({ req, res, body }) => exportQuestions(req, res, body));
defineRoute(router, { method: 'post', path: '/admin/questions/bulk/transition', tags: AQ, summary: 'Bulk workflow action (ADM-QST-08)', auth: A, anyPermission: ['questions.edit', 'questions.approve'], body: bulkTransitionBody }, async ({ req, admin, body }) => {
  const r = await qs.bulkTransition(body.ids, body.action, admin);
  req.audit = { action: `question.bulk_${body.action}`, entity: 'question', entityId: null, summary: `${body.action}: ${r.succeeded.length} questions`, before: null, after: { ids: r.succeeded } };
  return r;
});
defineRoute(router, { method: 'post', path: '/admin/questions/bulk/delete', tags: AQ, summary: 'Bulk delete (ADM-QST-09)', auth: A, permission: 'questions.delete', body: bulkIdsBody }, async ({ req, body }) => {
  const r = await qs.bulkDelete(body.ids);
  req.audit = { action: 'question.bulk_delete', entity: 'question', entityId: null, summary: `Deleted ${r.succeeded.length} questions`, before: null, after: { ids: r.succeeded } };
  return r;
});

// ── import (ADM-IMP-*) — static paths before /:id ──
defineRoute(router, { method: 'get', path: '/admin/questions/import/template', tags: AQ, summary: 'Import template (ADM-IMP-01)', auth: A, permission: 'questions.create', query: templateQuery, raw: true, rawContentType: 'text/csv' }, async ({ res, query }) => {
  const t = await importService.template(query.format);
  sendFile(res, t.buf, t.fileName);
});
defineRoute(
  router,
  { method: 'post', path: '/admin/questions/import', tags: AQ, summary: 'Upload & preview import (ADM-IMP-02) — JSON { fileKey } or multipart field `file`', auth: A, permission: 'questions.create', body: importBody, status: 201, middleware: [uploadSingle('file', { maxMb: 10 })] },
  async ({ req, admin, locale }) => {
    const parsed = importBody.parse(req.body ?? {});
    const file = (req as Request & { file?: { buffer: Buffer; originalname: string } }).file;
    const r = await importService.upload({ fileKey: parsed.fileKey, file }, admin, locale);
    return paged(r.dto as unknown as unknown[], r.meta);
  },
);
defineRoute(router, { method: 'get', path: '/admin/questions/import/:importId', tags: AQ, summary: 'Import preview page (ADM-IMP-03)', auth: A, permission: 'questions.create', params: importParam, query: importPageQuery }, async ({ params, query }) => {
  const r = await importService.preview(params.importId, query.filter, query.page, query.pageSize);
  // data = ImportPreviewDto (rows = requested page), envelope meta = row pagination
  return paged(r.dto as unknown as unknown[], r.meta);
});
defineRoute(router, { method: 'post', path: '/admin/questions/import/:importId/commit', tags: AQ, summary: 'Commit import (ADM-IMP-04)', auth: A, permission: 'questions.create', params: importParam, idempotency: 'required' }, async ({ req, admin, params }) => {
  const r = await importService.commit(params.importId, admin);
  await auditService.fromRequest(req, { action: 'question.bulk_import', entity: 'question_import', entityId: params.importId, summary: `Imported ${r.imported} questions`, before: null, after: { imported: r.imported, skipped: r.skipped, file: 'fileName' in r ? r.fileName : undefined } });
  return { imported: r.imported, skipped: r.skipped, createdIds: r.createdIds };
});
defineRoute(router, { method: 'get', path: '/admin/questions/import/:importId/errors', tags: AQ, summary: 'Import error report CSV (ADM-IMP-05)', auth: A, permission: 'questions.create', params: importParam, raw: true, rawContentType: 'text/csv' }, async ({ res, params }) => {
  const r = await importService.errorsCsv(params.importId);
  sendFile(res, r.buf, r.fileName);
});

defineRoute(router, { method: 'post', path: '/admin/questions', tags: AQ, summary: 'Create question (ADM-QST-04)', auth: A, permission: 'questions.create', body: questionCreateBody, status: 201, audit: { action: 'question.create', entity: 'question', entityId: () => null } }, ({ body, admin }) => qs.create(body, admin));
defineRoute(router, { method: 'get', path: '/admin/questions/:id', tags: AQ, summary: 'Question (ADM-QST-03)', auth: A, permission: 'questions.view', params: idParam }, ({ params }) => qs.get(params.id));
defineRoute(router, { method: 'patch', path: '/admin/questions/:id', tags: AQ, summary: 'Update question (ADM-QST-05)', auth: A, permission: 'questions.edit', params: idParam, body: questionPatchBody, audit: { action: 'question.update', entity: 'question', before: (req) => qs.get(String(req.params.id)) } }, ({ params, body, admin }) => qs.update(params.id, body, admin));
defineRoute(router, { method: 'delete', path: '/admin/questions/:id', tags: AQ, summary: 'Delete question (ADM-QST-06)', auth: A, permission: 'questions.delete', params: idParam, response: okDto, audit: { action: 'question.delete', entity: 'question', before: (req) => qs.get(String(req.params.id)) } }, async ({ params }) => {
  await qs.remove(params.id);
  return OK;
});
defineRoute(router, { method: 'post', path: '/admin/questions/:id/transition', tags: AQ, summary: 'Workflow action (ADM-QST-07)', auth: A, anyPermission: ['questions.edit', 'questions.approve'], params: idParam, body: transitionBody }, async ({ req, admin, params, body }) => {
  const r = await qs.transition(params.id, body, admin);
  req.audit = { action: `question.${body.action}`, entity: 'question', entityId: params.id, summary: `${r.question.code}: ${r.before} → ${questionTransitionTarget(body.action)}`, before: { status: r.before }, after: { status: r.question.status, comment: body.comment ?? null } };
  return r.question;
});
defineRoute(router, { method: 'post', path: '/admin/questions/:id/duplicate', tags: AQ, summary: 'Duplicate question (ADM-QST-10)', auth: A, permission: 'questions.create', params: idParam, status: 201, audit: { action: 'question.duplicate', entity: 'question' } }, ({ params, admin }) => qs.duplicate(params.id, admin));
defineRoute(router, { method: 'get', path: '/admin/questions/:id/preview', tags: AQ, summary: 'Student preview (ADM-QST-13)', auth: A, permission: 'questions.view', params: idParam, query: previewQuery }, ({ params }) => qs.preview(params.id));
defineRoute(router, { method: 'get', path: '/admin/tags', tags: AQ, summary: 'Tags autocomplete (ADM-QST-14)', auth: A, permission: 'questions.view', query: tagsQuery }, ({ query }) => qs.tags(query.q, query.limit));

// ── student bank (BNK-*) & bookmarks (BMK-*) ──
defineRoute(router, { method: 'get', path: '/bank/questions', tags: SB, summary: 'Question bank list (BNK-01)', auth: 'student', query: bankQuery }, async ({ student, query }) => {
  const r = await bankService.list(student.userId, query);
  return paged(r.items, r.meta);
});
defineRoute(router, { method: 'get', path: '/bank/facets', tags: SB, summary: 'Bank facets & match counts (BNK-02)', auth: 'student', query: bankQuery }, ({ student, query }) => bankService.facets(student.userId, query));
defineRoute(router, { method: 'get', path: '/bank/questions/:questionId', tags: SB, summary: 'Question with answer (BNK-03) · ent:subject', auth: 'student', params: questionParam }, ({ student, params }) => bankService.question(student.userId, params.questionId));
defineRoute(router, { method: 'get', path: '/bookmarks', tags: SB, summary: 'Bookmarked questions (BMK-01)', auth: 'student', query: bookmarksQuery }, async ({ student, query }) => {
  const r = await bankService.bookmarks(student.userId, query.subjectId, query.page, query.pageSize);
  return paged(r.items, r.meta);
});
defineRoute(router, { method: 'get', path: '/bookmarks/ids', tags: SB, summary: 'Bookmarked ids (BMK-02)', auth: 'student' }, ({ student }) => bankService.bookmarkIds(student.userId));
defineRoute(router, { method: 'put', path: '/bookmarks/:questionId', tags: SB, summary: 'Bookmark (BMK-03)', auth: 'student', params: questionParam }, ({ student, params }) => bankService.bookmark(student.userId, params.questionId));
defineRoute(router, { method: 'delete', path: '/bookmarks/:questionId', tags: SB, summary: 'Remove bookmark (BMK-04)', auth: 'student', params: questionParam }, ({ student, params }) => bankService.unbookmark(student.userId, params.questionId));
