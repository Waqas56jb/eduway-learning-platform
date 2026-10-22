import type { Request, Response } from 'express';
import { OK } from '../../common/dto/refs.js';
import { sendExport, type ExportColumn, type ExportRequest } from '../../common/services/exporter.js';
import type { AdminPrincipal } from '../../common/types/index.js';
import { toPagination } from '../../common/utils/pagination.js';
import { paged } from '../../common/utils/response.js';
import type { z } from '../../common/validation/zod.js';
import { catalogService } from './catalog.service.js';
import { lessonsAdminService, transitionAction, type LessonFilter } from './lessons.service.js';
import type { ContentStatus, LessonListQuery, LessonWrite, videoListQuery } from './schemas.js';
import { structureService } from './structure.service.js';
import type { AdminLesson, VideoAssetDto } from './types.js';
import { videosService, type VideoFilter } from './videos.service.js';

const LESSON_COLUMNS: ExportColumn<AdminLesson>[] = [
  { key: 'id', header: 'id', value: (r) => r.id },
  { key: 'title_en', header: 'title_en', value: (r) => r.title.en },
  { key: 'title_ar', header: 'title_ar', value: (r) => r.title.ar },
  { key: 'subject', header: 'subject', value: (r) => r.subject.name.en },
  { key: 'unit', header: 'unit', value: (r) => r.unit.name.en },
  { key: 'topic', header: 'topic', value: (r) => r.topic.name.en },
  { key: 'teacher', header: 'teacher', value: (r) => r.teacher.name.en },
  { key: 'duration', header: 'duration', value: (r) => r.durationSec },
  { key: 'views', header: 'views', value: (r) => r.views },
  { key: 'status', header: 'status', value: (r) => r.status },
  { key: 'publishAt', header: 'publishAt', value: (r) => r.publishAt },
];

const VIDEO_COLUMNS: ExportColumn<VideoAssetDto>[] = [
  { key: 'assetId', header: 'assetId', value: (r) => r.assetId },
  { key: 'lesson', header: 'lesson', value: (r) => r.lesson.title.en },
  { key: 'subject', header: 'subject', value: (r) => r.lesson.subject.name.en },
  { key: 'fileName', header: 'fileName', value: (r) => r.fileName },
  { key: 'sizeMb', header: 'sizeMb', value: (r) => r.sizeMb },
  { key: 'durationSec', header: 'durationSec', value: (r) => r.durationSec },
  { key: 'streamStatus', header: 'streamStatus', value: (r) => r.streamStatus },
  { key: 'cdnStatus', header: 'cdnStatus', value: (r) => r.cdnStatus },
  { key: 'views', header: 'views', value: (r) => r.views },
  { key: 'replays', header: 'replays', value: (r) => r.replays },
  { key: 'uploadedAt', header: 'uploadedAt', value: (r) => r.uploadedAt },
];

const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
const lessonFilterOf = (f: Record<string, unknown>): LessonFilter => ({
  q: str(f.q),
  subjectId: str(f.subjectId),
  unitId: str(f.unitId),
  topicId: str(f.topicId),
  teacherId: str(f.teacherId),
  status: (Array.isArray(f.status) ? f.status : typeof f.status === 'string' ? f.status.split(',') : undefined) as ContentStatus[] | undefined,
  excludeArchived: f.excludeArchived === true || f.excludeArchived === 'true',
});

export const contentController = {
  // ── student ──
  subjects: (userId?: string) => catalogService.subjects(userId),
  subject: (id: string, userId?: string) => catalogService.subjectDetail(id, userId),
  questionStats: (id: string, userId: string) => catalogService.questionStats(id, userId),
  lesson: (id: string, userId: string) => catalogService.lessonDetail(id, userId),
  streamUrl: (id: string, userId: string) => catalogService.streamUrl(id, userId),
  resourceUrl: (id: string, resourceId: string, userId: string) => catalogService.resourceUrl(id, resourceId, userId),
  note: (id: string, userId: string) => catalogService.note(id, userId),
  saveNote: (id: string, userId: string, text: string) => catalogService.saveNote(id, userId, text),

  // ── admin lessons ──
  async lessons(q: LessonListQuery) {
    const r = await lessonsAdminService.list(q);
    return paged(r.items as unknown[], r.meta);
  },
  async exportLessons(req: Request, res: Response, body: ExportRequest) {
    const f = lessonFilterOf(body.filters ?? {});
    if (body.ids?.length) f.ids = body.ids;
    const rows = await lessonsAdminService.exportRows(f, str(body.filters?.sort));
    await sendExport(req, res, { report: 'lessons', format: body.format, columns: LESSON_COLUMNS, selected: body.columns, rows, filters: body.filters });
  },
  async transition(req: Request, admin: AdminPrincipal, id: string, b: { to: ContentStatus; publishAt?: string; note?: string; patch?: LessonWrite }) {
    const r = await lessonsAdminService.transition(id, b, admin);
    req.audit = { action: `lesson.${transitionAction(b.to)}`, entity: 'lesson', entityId: id, summary: `${r.lesson.title.en}: ${r.before} → ${b.to}`, before: { status: r.before }, after: { status: b.to, publishAt: r.lesson.publishAt } };
    return r.lesson;
  },
  async bulkTransition(req: Request, admin: AdminPrincipal, ids: string[], to: ContentStatus, reason?: string) {
    const r = await lessonsAdminService.bulkTransition(ids, to, admin, reason);
    req.audit = { action: `lesson.bulk_${transitionAction(to)}`, entity: 'lesson', entityId: null, summary: `${r.succeeded.length} lessons → ${to}`, before: null, after: { ids: r.succeeded, to, reason } };
    return r;
  },
  async bulkDelete(req: Request, ids: string[]) {
    const r = await lessonsAdminService.bulkDelete(ids);
    req.audit = { action: 'lesson.bulk_delete', entity: 'lesson', entityId: null, summary: `Deleted ${r.succeeded.length} lessons`, before: null, after: { ids: r.succeeded } };
    return r;
  },
  async deleteLesson(id: string) {
    await lessonsAdminService.remove(id);
    return OK;
  },

  // ── admin videos ──
  async videos(q: z.infer<typeof videoListQuery>) {
    const p = toPagination(q);
    const r = await videosService.list({ q: q.q, subjectId: q.subjectId, streamStatus: q.streamStatus, cdnStatus: q.cdnStatus }, q.sort, p.limit, p.offset);
    return paged(r.items, { page: p.page, pageSize: p.pageSize, total: r.total, nextCursor: null });
  },
  async exportVideos(req: Request, res: Response, body: ExportRequest) {
    const fl = body.filters ?? {};
    const f: VideoFilter = { q: str(fl.q), subjectId: str(fl.subjectId), streamStatus: str(fl.streamStatus), cdnStatus: str(fl.cdnStatus), ids: body.ids?.length ? body.ids : undefined };
    const r = await videosService.list(f, str(fl.sort), 50_000, 0);
    await sendExport(req, res, { report: 'videos', format: body.format, columns: VIDEO_COLUMNS, selected: body.columns, rows: r.items, filters: body.filters });
  },
  async detachVideo(lessonId: string) {
    await videosService.detach(lessonId);
    return lessonsAdminService.get(lessonId);
  },
  structure: structureService,
  lessonsAdmin: lessonsAdminService,
  videosAdmin: videosService,
};
