import { Router } from 'express';
import { OK } from '../../common/dto/refs.js';
import { defineRoute } from '../../common/http/route.js';
import { exportRequest } from '../../common/services/exporter.js';
import { idParam, okDto } from '../../common/validation/schemas.js';
import { z } from '../../common/validation/zod.js';
import { contentController as c } from './controller.js';
import {
  approveBody,
  bulkIdsBody,
  bulkTransitionBody,
  idsBody,
  lessonCreateBody,
  lessonListQuery,
  lessonParam,
  lessonPatchBody,
  lessonResourceAdminParam,
  lessonResourceParam,
  nameBody,
  noteBody,
  reprocessBody,
  resourceCreateBody,
  resourcePatchBody,
  subjectCreateBody,
  subjectListQuery,
  subjectParam,
  subjectPatchBody,
  teacherBody,
  teacherListQuery,
  teacherPatchBody,
  transitionBody,
  videoListQuery,
  videoRegisterBody,
} from './schemas.js';

export const router = Router();
const S = ['Catalog'];
const A = 'admin' as const;

// ── student catalog (CAT-01…09) ──
defineRoute(router, { method: 'get', path: '/subjects', tags: S, summary: 'Subjects (CAT-01 / PUB-12)', auth: 'optional' }, ({ student }) => c.subjects(student?.userId));
defineRoute(router, { method: 'get', path: '/subjects/:subjectId', tags: S, summary: 'Subject detail (CAT-02)', auth: 'optional', params: subjectParam }, ({ params, student }) => c.subject(params.subjectId, student?.userId));
defineRoute(router, { method: 'get', path: '/subjects/:subjectId/question-stats', tags: S, summary: 'Subject question stats (CAT-03)', auth: 'student', params: subjectParam }, ({ params, student }) => c.questionStats(params.subjectId, student.userId));
defineRoute(router, { method: 'get', path: '/lessons/:lessonId', tags: S, summary: 'Lesson detail (CAT-05)', auth: 'student', params: lessonParam }, ({ params, student }) => c.lesson(params.lessonId, student.userId));
defineRoute(router, { method: 'get', path: '/lessons/:lessonId/stream-url', tags: S, summary: 'Signed stream URL (CAT-06) · ent:subject', auth: 'student', params: lessonParam }, ({ params, student }) => c.streamUrl(params.lessonId, student.userId));
defineRoute(router, { method: 'get', path: '/lessons/:lessonId/resources/:resourceId/url', tags: S, summary: 'Signed resource download (CAT-07) · ent:subject', auth: 'student', params: lessonResourceParam }, ({ params, student }) => c.resourceUrl(params.lessonId, params.resourceId, student.userId));
defineRoute(router, { method: 'get', path: '/lessons/:lessonId/note', tags: S, summary: 'My lesson note (CAT-08)', auth: 'student', params: lessonParam }, ({ params, student }) => c.note(params.lessonId, student.userId));
defineRoute(router, { method: 'put', path: '/lessons/:lessonId/note', tags: S, summary: 'Save lesson note (CAT-09)', auth: 'student', params: lessonParam, body: noteBody }, ({ params, student, body }) => c.saveNote(params.lessonId, student.userId, body.text));

// ── admin subjects (ADM-SUB-*) ──
const AS = ['Admin · Content'];
defineRoute(router, { method: 'get', path: '/admin/subjects', tags: AS, summary: 'Subjects (ADM-SUB-01)', auth: A, permission: 'content.view', query: subjectListQuery }, ({ query }) => c.structure.subjects(query));
defineRoute(router, { method: 'post', path: '/admin/subjects', tags: AS, summary: 'Create subject (ADM-SUB-02)', auth: A, permission: 'content.create', body: subjectCreateBody, status: 201, audit: { action: 'subject.create', entity: 'subject', entityId: () => null } }, ({ body }) => c.structure.createSubject(body));
defineRoute(router, { method: 'put', path: '/admin/subjects/order', tags: AS, summary: 'Reorder subjects (ADM-SUB-06)', auth: A, permission: 'content.edit', body: idsBody, audit: { action: 'subject.reorder', entity: 'subject', entityId: () => null } }, ({ body }) => c.structure.reorderSubjects(body.ids));
defineRoute(router, { method: 'get', path: '/admin/subjects/:id', tags: AS, summary: 'Subject (ADM-SUB-03)', auth: A, permission: 'content.view', params: idParam }, ({ params }) => c.structure.subject(params.id));
defineRoute(
  router,
  {
    method: 'patch', path: '/admin/subjects/:id', tags: AS, summary: 'Update subject (ADM-SUB-04)', auth: A, permission: 'content.edit', params: idParam, body: subjectPatchBody,
    audit: {
      action: 'subject.update', entity: 'subject', before: (req) => c.structure.subject(String(req.params.id)),
      summary: (req, data) => {
        const keys = Object.keys(req.body ?? {});
        const name = (data as { name?: { en?: string } } | null)?.name?.en ?? '';
        if (keys.length === 1 && keys[0] === 'sequentialUnlock') return `${(req.body as { sequentialUnlock: boolean }).sequentialUnlock ? 'Enabled' : 'Disabled'} sequential unlock for ${name}`;
        return `Updated subject ${name}`;
      },
    },
  },
  ({ params, body }) => c.structure.updateSubject(params.id, body),
);
defineRoute(router, { method: 'delete', path: '/admin/subjects/:id', tags: AS, summary: 'Delete subject (ADM-SUB-05)', auth: A, permission: 'content.delete', params: idParam, response: okDto, audit: { action: 'subject.delete', entity: 'subject', before: (req) => c.structure.subject(String(req.params.id)) } }, async ({ params }) => {
  await c.structure.deleteSubject(params.id);
  return OK;
});

// ── units & topics (ADM-UNT-*, ADM-TOP-*) ──
const subjectIdParam = z.object({ id: z.string().min(1).max(120) });
defineRoute(router, { method: 'get', path: '/admin/subjects/:id/units', tags: AS, summary: 'Units with topics (ADM-UNT-01)', auth: A, permission: 'content.view', params: subjectIdParam }, ({ params }) => c.structure.units(params.id));
defineRoute(router, { method: 'post', path: '/admin/subjects/:id/units', tags: AS, summary: 'Create unit (ADM-UNT-02)', auth: A, permission: 'content.create', params: idParam, body: nameBody, status: 201, audit: { action: 'unit.create', entity: 'unit', entityId: () => null } }, ({ params, body }) => c.structure.createUnit(params.id, body.name));
defineRoute(router, { method: 'put', path: '/admin/subjects/:id/units/order', tags: AS, summary: 'Reorder units (ADM-UNT-05)', auth: A, permission: 'content.edit', params: idParam, body: idsBody, audit: { action: 'unit.reorder', entity: 'subject' } }, ({ params, body }) => c.structure.reorderUnits(params.id, body.ids));
defineRoute(router, { method: 'patch', path: '/admin/units/:id', tags: AS, summary: 'Rename unit (ADM-UNT-03)', auth: A, permission: 'content.edit', params: idParam, body: nameBody, audit: { action: 'unit.update', entity: 'unit', before: (req) => c.structure.unitDto(String(req.params.id)) } }, ({ params, body }) => c.structure.renameUnit(params.id, body.name));
defineRoute(router, { method: 'delete', path: '/admin/units/:id', tags: AS, summary: 'Delete unit (ADM-UNT-04)', auth: A, permission: 'content.delete', params: idParam, response: okDto, audit: { action: 'unit.delete', entity: 'unit', before: (req) => c.structure.unitDto(String(req.params.id)) } }, async ({ params }) => {
  await c.structure.deleteUnit(params.id);
  return OK;
});
defineRoute(router, { method: 'post', path: '/admin/units/:id/topics', tags: AS, summary: 'Create topic (ADM-TOP-01)', auth: A, permission: 'content.create', params: idParam, body: nameBody, status: 201, audit: { action: 'topic.create', entity: 'topic', entityId: () => null } }, ({ params, body }) => c.structure.createTopic(params.id, body.name));
defineRoute(router, { method: 'put', path: '/admin/units/:id/topics/order', tags: AS, summary: 'Reorder topics (ADM-TOP-04)', auth: A, permission: 'content.edit', params: idParam, body: idsBody, audit: { action: 'topic.reorder', entity: 'unit' } }, ({ params, body }) => c.structure.reorderTopics(params.id, body.ids));
defineRoute(router, { method: 'patch', path: '/admin/topics/:id', tags: AS, summary: 'Rename topic (ADM-TOP-02)', auth: A, permission: 'content.edit', params: idParam, body: nameBody, audit: { action: 'topic.update', entity: 'topic', before: (req) => c.structure.topicDto(String(req.params.id)) } }, ({ params, body }) => c.structure.renameTopic(params.id, body.name));
defineRoute(router, { method: 'delete', path: '/admin/topics/:id', tags: AS, summary: 'Delete topic (ADM-TOP-03)', auth: A, permission: 'content.delete', params: idParam, response: okDto, audit: { action: 'topic.delete', entity: 'topic', before: (req) => c.structure.topicDto(String(req.params.id)) } }, async ({ params }) => {
  await c.structure.deleteTopic(params.id);
  return OK;
});
defineRoute(router, { method: 'put', path: '/admin/topics/:id/lessons/order', tags: AS, summary: 'Reorder lessons in a topic (ADM-LSN-12)', auth: A, permission: 'content.edit', params: idParam, body: z.object({ ids: z.array(z.string().uuid()).min(1).max(1000) }), audit: { action: 'lesson.reorder', entity: 'topic' } }, ({ params, body }) => c.lessonsAdmin.reorderTopicLessons(params.id, body.ids));

// ── teachers (ADM-TCH-*) ──
defineRoute(router, { method: 'get', path: '/admin/teachers', tags: AS, summary: 'Teachers (ADM-TCH-01)', auth: A, permission: 'content.view', query: teacherListQuery }, ({ query }) => c.structure.teachers(query));
defineRoute(router, { method: 'post', path: '/admin/teachers', tags: AS, summary: 'Create teacher (ADM-TCH-02)', auth: A, permission: 'content.create', body: teacherBody, status: 201, audit: { action: 'teacher.create', entity: 'teacher', entityId: () => null } }, ({ body }) => c.structure.createTeacher(body));
defineRoute(router, { method: 'patch', path: '/admin/teachers/:id', tags: AS, summary: 'Update teacher (ADM-TCH-03)', auth: A, permission: 'content.edit', params: idParam, body: teacherPatchBody, audit: { action: 'teacher.update', entity: 'teacher', before: (req) => c.structure.teacher(String(req.params.id)) } }, ({ params, body }) => c.structure.updateTeacher(params.id, body));
defineRoute(router, { method: 'delete', path: '/admin/teachers/:id', tags: AS, summary: 'Delete teacher (ADM-TCH-04)', auth: A, permission: 'content.delete', params: idParam, response: okDto, audit: { action: 'teacher.delete', entity: 'teacher', before: (req) => c.structure.teacher(String(req.params.id)) } }, async ({ params }) => {
  await c.structure.deleteTeacher(params.id);
  return OK;
});

// ── lessons (ADM-LSN-*) ──
defineRoute(router, { method: 'get', path: '/admin/lessons', tags: AS, summary: 'Lessons (ADM-LSN-01)', auth: A, permission: 'content.view', query: lessonListQuery }, ({ query }) => c.lessons(query));
defineRoute(router, { method: 'post', path: '/admin/lessons', tags: AS, summary: 'Create lesson (ADM-LSN-02)', auth: A, permission: 'content.create', body: lessonCreateBody, status: 201, audit: { action: 'lesson.create', entity: 'lesson', entityId: () => null } }, ({ body, admin }) => c.lessonsAdmin.create(body, admin));
defineRoute(router, { method: 'post', path: '/admin/lessons/export', tags: AS, summary: 'Export lessons (ADM-LSN-10)', auth: A, permission: 'content.export', body: exportRequest, raw: true, rawContentType: 'text/csv' }, ({ req, res, body }) => c.exportLessons(req, res, body));
defineRoute(router, { method: 'post', path: '/admin/lessons/bulk/transition', tags: AS, summary: 'Bulk workflow transition (ADM-LSN-08)', auth: A, anyPermission: ['content.edit', 'content.create', 'content.approve'], body: bulkTransitionBody }, ({ req, admin, body }) => c.bulkTransition(req, admin, body.ids, body.to, body.reason));
defineRoute(router, { method: 'post', path: '/admin/lessons/bulk/delete', tags: AS, summary: 'Bulk delete (ADM-LSN-09)', auth: A, permission: 'content.delete', body: bulkIdsBody }, ({ req, body }) => c.bulkDelete(req, body.ids));
defineRoute(router, { method: 'get', path: '/admin/lessons/:id', tags: AS, summary: 'Lesson (ADM-LSN-03)', auth: A, permission: 'content.view', params: idParam }, ({ params }) => c.lessonsAdmin.get(params.id));
defineRoute(router, { method: 'patch', path: '/admin/lessons/:id', tags: AS, summary: 'Update lesson (ADM-LSN-04)', auth: A, permission: 'content.edit', params: idParam, body: lessonPatchBody, audit: { action: 'lesson.update', entity: 'lesson', before: (req) => c.lessonsAdmin.get(String(req.params.id)) } }, ({ params, body, admin }) => c.lessonsAdmin.update(params.id, body, admin));
defineRoute(router, { method: 'delete', path: '/admin/lessons/:id', tags: AS, summary: 'Delete lesson (ADM-LSN-05)', auth: A, permission: 'content.delete', params: idParam, response: okDto, audit: { action: 'lesson.delete', entity: 'lesson', before: (req) => c.lessonsAdmin.get(String(req.params.id)) } }, ({ params }) => c.deleteLesson(params.id));
defineRoute(router, { method: 'post', path: '/admin/lessons/:id/transition', tags: AS, summary: 'Workflow transition (ADM-LSN-06)', auth: A, anyPermission: ['content.edit', 'content.create', 'content.approve'], params: idParam, body: transitionBody }, ({ req, admin, params, body }) => c.transition(req, admin, params.id, body));
defineRoute(router, { method: 'post', path: '/admin/lessons/:id/approve', tags: AS, summary: 'Approve lesson (ADM-LSN-07)', auth: A, permission: 'content.approve', params: idParam, body: approveBody }, ({ req, admin, params, body }) => c.transition(req, admin, params.id, { to: 'approved', note: body.note || 'Approved from dashboard' }));
defineRoute(router, { method: 'get', path: '/admin/lessons/:id/versions', tags: AS, summary: 'Lesson versions (ADM-LSN-11)', auth: A, permission: 'content.view', params: idParam }, ({ params }) => c.lessonsAdmin.versions(params.id));
defineRoute(router, { method: 'post', path: '/admin/lessons/:id/resources', tags: AS, summary: 'Add resource (ADM-LSN-13)', auth: A, permission: 'content.edit', params: idParam, body: resourceCreateBody, status: 201, audit: { action: 'lesson.add_resource', entity: 'lesson' } }, ({ params, body }) => c.lessonsAdmin.addResource(params.id, body));
defineRoute(router, { method: 'patch', path: '/admin/lessons/:id/resources/:resourceId', tags: AS, summary: 'Update resource (ADM-LSN-14)', auth: A, permission: 'content.edit', params: lessonResourceAdminParam, body: resourcePatchBody, audit: { action: 'lesson.update_resource', entity: 'lesson' } }, ({ params, body }) => c.lessonsAdmin.updateResource(params.id, params.resourceId, body));
defineRoute(router, { method: 'delete', path: '/admin/lessons/:id/resources/:resourceId', tags: AS, summary: 'Remove resource (ADM-LSN-15)', auth: A, permission: 'content.edit', params: lessonResourceAdminParam, response: okDto, audit: { action: 'lesson.remove_resource', entity: 'lesson' } }, async ({ params }) => {
  await c.lessonsAdmin.removeResource(params.id, params.resourceId);
  return OK;
});
defineRoute(router, { method: 'delete', path: '/admin/lessons/:id/video', tags: AS, summary: 'Detach video (ADM-VID-08)', auth: A, permission: 'content.edit', params: idParam, audit: { action: 'lesson.remove_video', entity: 'lesson' } }, ({ params }) => c.detachVideo(params.id));

// ── videos (ADM-VID-*) ──
defineRoute(router, { method: 'post', path: '/admin/videos', tags: AS, summary: 'Register uploaded video (ADM-VID-01)', auth: A, anyPermission: ['content.edit', 'content.create'], body: videoRegisterBody, status: 201, audit: { action: 'video.register', entity: 'video', entityId: () => null } }, ({ body, admin }) => c.videosAdmin.register(body, admin.userId));
defineRoute(router, { method: 'get', path: '/admin/videos', tags: AS, summary: 'Video library (ADM-VID-02)', auth: A, permission: 'content.view', query: videoListQuery }, ({ query }) => c.videos(query));
defineRoute(router, { method: 'get', path: '/admin/videos/stats', tags: AS, summary: 'Video stats (ADM-VID-04)', auth: A, permission: 'content.view' }, () => c.videosAdmin.stats());
defineRoute(router, { method: 'post', path: '/admin/videos/export', tags: AS, summary: 'Export videos (ADM-VID-09)', auth: A, permission: 'content.export', body: exportRequest, raw: true, rawContentType: 'text/csv' }, ({ req, res, body }) => c.exportVideos(req, res, body));
defineRoute(router, { method: 'post', path: '/admin/videos/bulk/cdn-resync', tags: AS, summary: 'Bulk CDN re-sync (ADM-VID-07)', auth: A, permission: 'content.edit', body: bulkIdsBody, audit: { action: 'video.bulk_cdn_resync', entity: 'video', entityId: () => null } }, ({ body }) => c.videosAdmin.cdnResync(body.ids));
defineRoute(router, { method: 'get', path: '/admin/videos/:id', tags: AS, summary: 'Video status (ADM-VID-03)', auth: A, permission: 'content.view', params: idParam }, ({ params }) => c.videosAdmin.get(params.id));
defineRoute(router, { method: 'post', path: '/admin/videos/:id/cdn-resync', tags: AS, summary: 'CDN re-sync (ADM-VID-05)', auth: A, permission: 'content.edit', params: idParam, audit: { action: 'video.cdn_resync', entity: 'video' } }, async ({ params }) => {
  await c.videosAdmin.cdnResync([params.id]);
  return c.videosAdmin.get(params.id);
});
defineRoute(router, { method: 'post', path: '/admin/videos/:id/reprocess', tags: AS, summary: 'Reprocess video (ADM-VID-06)', auth: A, permission: 'content.edit', params: idParam, body: reprocessBody, audit: { action: 'video.reprocess', entity: 'video' } }, ({ params }) => c.videosAdmin.reprocess(params.id));
