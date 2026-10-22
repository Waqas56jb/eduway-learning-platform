/* Admin content: subjects, units, topics, teachers, lessons, videos (contract §21). */
import type { ContentStatus, Lesson, LessonResource, Subject, SubjectKey, Teacher, Topic, Unit, VideoAsset, VideoState } from '@/types';
import { api, type Query } from './client';
import { useApiQuery } from './hooks';
import { qk } from './keys';
import type {
  AdminRef,
  BulkResult,
  FileKey,
  ID,
  ISODate,
  Lang,
  Localized,
  OkDto,
  PageMeta,
  Paged,
  SubjectRef,
  SubjectSlug,
  TeacherRef,
  TopicRef,
  UnitRef,
} from './types';

// ─── DTOs ────────────────────────────────────────────────────────────────────
export interface AdminSubject {
  id: ID;
  slug: SubjectSlug;
  name: Localized;
  tagline: Localized;
  description: Localized;
  color: string;
  icon: string;
  imageUrl: string | null;
  order: number;
  status: 'active' | 'hidden';
  sequentialUnlock: boolean;
  stats: { units: number; topics: number; lessons: number; published: number; publishedPct: number; questions: number };
  createdAt: ISODate;
  updatedAt: ISODate;
}
export interface AdminTopic {
  id: ID;
  unitId: ID;
  name: Localized;
  order: number;
  lessonCount: number;
}
export interface AdminUnit {
  id: ID;
  subjectId: ID;
  name: Localized;
  order: number;
  topicCount: number;
  lessonCount: number;
  topics: AdminTopic[];
}
export interface LessonVersionDto {
  id: ID;
  version: number;
  author: AdminRef;
  note: string;
  status: ContentStatus;
  createdAt: ISODate;
}
export interface AdminLessonResource {
  id: ID;
  name: string;
  title: Localized;
  sizeKb: number;
  pages: number | null;
  mimeType: string;
  url: string;
}
export interface AdminLessonDto {
  id: ID;
  subjectId: ID;
  unitId: ID;
  topicId: ID;
  subject: SubjectRef;
  unit: UnitRef;
  topic: TopicRef;
  title: Localized;
  description: Localized;
  teacherId: ID;
  teacher: TeacherRef;
  order: number;
  durationSec: number;
  thumbnailUrl: string | null;
  videoState: VideoState;
  video: { id: ID; assetId: string; streamStatus: 'ready' | 'processing' | 'failed'; fileName: string | null; sizeMb: number; renditions: string[] } | null;
  captions: string | null;
  captionTracks: { lang: Lang; fileName: string; url: string }[];
  resources: AdminLessonResource[];
  completionThreshold: number;
  prerequisiteId: ID | null;
  status: ContentStatus;
  publishAt: ISODate | null;
  views: number;
  versions: LessonVersionDto[];
  createdAt: ISODate;
  updatedAt: ISODate;
}
export interface LessonWriteDto {
  title: Localized;
  description?: Localized;
  subjectId: ID;
  unitId: ID;
  topicId: ID;
  teacherId: ID;
  order?: number;
  thumbnailFileKey?: FileKey | null;
  durationSec?: number;
  captions?: { lang: Lang; fileKey: FileKey }[] | null;
  completionThreshold?: number;
  prerequisiteId?: ID | null;
  versionNote?: string;
}
export interface VideoAssetDto {
  id: ID;
  assetId: string;
  lessonId: ID;
  lesson: { id: ID; title: Localized; subject: SubjectRef };
  fileName: string | null;
  sizeMb: number;
  durationSec: number;
  streamStatus: 'ready' | 'processing' | 'failed';
  cdnStatus: 'synced' | 'pending' | 'error';
  processingProgress: number | null;
  error: string | null;
  views: number;
  replays: number;
  resolution: '720p' | '1080p' | '4K';
  renditions: string[];
  uploadedAt: ISODate;
}
export interface VideoStats {
  count: number;
  totalStorageMb: number;
  totalViews: number;
  totalReplays: number;
  ready: number;
  readyPct: number;
  issues: number;
}
export interface TeacherDto {
  id: ID;
  name: Localized;
  bio: Localized;
  avatarUrl: string | null;
  subjectId: ID;
  subjectSlug: SubjectSlug;
  yearsExperience: number | null;
  studentsCount: number | null;
  rating: number | null;
  active: boolean;
}
/** ADM-TCH-01..04 response: TeacherDto + number of (non-deleted) lessons taught. */
export interface AdminTeacherDto extends TeacherDto {
  lessonsCount: number;
}
export interface TeacherWriteDto {
  name: Localized;
  bio?: Localized;
  avatarFileKey?: FileKey | null;
  subjectId: ID;
  yearsExperience?: number | null;
  studentsCount?: number | null;
  rating?: number | null;
  active?: boolean;
}

// ─── UI view models (flat shapes the pages already render) ───────────────────
export type SubjectVM = Subject & { slug: string; stats: AdminSubject['stats']; tagline: Localized; description: Localized; icon: string };
export type TopicVM = Topic & { lessonCount: number };
export type UnitVM = Unit & { topicCount: number; lessonCount: number; topics: TopicVM[] };
export type LessonVM = Lesson & {
  subject: SubjectRef | null;
  unit: UnitRef | null;
  topic: TopicRef | null;
  teacher: TeacherRef | null;
  video: AdminLessonDto['video'];
  captionTracks: AdminLessonDto['captionTracks'];
  resourceFiles: AdminLessonResource[];
  createdAt: string;
};
export type VideoVM = VideoAsset & { lesson: VideoAssetDto['lesson']; fileName: string | null; processingProgress: number | null; error: string | null };

export const toSubjectVM = (s: AdminSubject): SubjectVM => ({
  id: s.id,
  key: s.slug as SubjectKey,
  slug: s.slug,
  name_en: s.name.en,
  name_ar: s.name.ar,
  color: s.color,
  image: s.imageUrl ?? '',
  order: s.order,
  status: s.status,
  sequentialUnlock: s.sequentialUnlock,
  stats: s.stats ?? { units: 0, topics: 0, lessons: 0, published: 0, publishedPct: 0, questions: 0 },
  tagline: s.tagline ?? { en: '', ar: '' },
  description: s.description ?? { en: '', ar: '' },
  icon: s.icon ?? '',
});
export const toTopicVM = (tp: AdminTopic): TopicVM => ({ id: tp.id, unitId: tp.unitId, name_en: tp.name.en, name_ar: tp.name.ar, order: tp.order, lessonCount: tp.lessonCount ?? 0 });
export const toUnitVM = (u: AdminUnit): UnitVM => ({
  id: u.id,
  subjectId: u.subjectId,
  name_en: u.name.en,
  name_ar: u.name.ar,
  order: u.order,
  topicCount: u.topicCount ?? u.topics?.length ?? 0,
  lessonCount: u.lessonCount ?? 0,
  topics: (u.topics ?? []).map(toTopicVM).sort((a, b) => a.order - b.order),
});
export const toTeacherVM = (tc: TeacherDto | (TeacherRef & { subjectId?: ID })): Teacher => ({
  id: tc.id,
  name_en: tc.name.en,
  name_ar: tc.name.ar,
  subjectId: tc.subjectId ?? '',
  avatar: tc.avatarUrl ?? '',
});
export const toLessonVM = (l: AdminLessonDto): LessonVM => ({
  id: l.id,
  subjectId: l.subjectId ?? l.subject?.id,
  unitId: l.unitId ?? l.unit?.id,
  topicId: l.topicId ?? l.topic?.id,
  title_en: l.title?.en ?? '',
  title_ar: l.title?.ar ?? '',
  description_en: l.description?.en ?? '',
  description_ar: l.description?.ar ?? '',
  teacherId: l.teacherId ?? l.teacher?.id ?? '',
  order: l.order ?? 0,
  durationSec: l.durationSec ?? 0,
  thumbnail: l.thumbnailUrl ?? '',
  videoState: l.videoState ?? 'none',
  captions: l.captions ?? null,
  resources: (l.resources ?? []).map((r): LessonResource => ({ id: r.id, name: r.name, sizeKb: r.sizeKb })),
  completionThreshold: l.completionThreshold ?? 90,
  prerequisiteId: l.prerequisiteId ?? null,
  status: l.status,
  publishAt: l.publishAt ?? null,
  updatedAt: l.updatedAt,
  views: l.views ?? 0,
  versions: (l.versions ?? []).map((v) => ({ id: v.id, version: v.version, author: v.author?.name?.en ?? '—', note: v.note, status: v.status, createdAt: v.createdAt })),
  subject: l.subject ?? null,
  unit: l.unit ?? null,
  topic: l.topic ?? null,
  teacher: l.teacher ?? null,
  video: l.video ?? null,
  captionTracks: l.captionTracks ?? [],
  resourceFiles: l.resources ?? [],
  createdAt: l.createdAt,
});
export const toVideoVM = (v: VideoAssetDto): VideoVM => ({
  id: v.id,
  assetId: v.assetId,
  lessonId: v.lessonId,
  sizeMb: v.sizeMb,
  durationSec: v.durationSec,
  streamStatus: v.streamStatus,
  cdnStatus: v.cdnStatus,
  views: v.views,
  replays: v.replays,
  resolution: v.resolution,
  uploadedAt: v.uploadedAt,
  lesson: v.lesson,
  fileName: v.fileName,
  processingProgress: v.processingProgress,
  error: v.error,
});

const mapPaged = <A, B>(p: Paged<A>, f: (a: A) => B): Paged<B> & { counts?: Record<string, number> } => ({
  items: p.items.map(f),
  meta: p.meta,
  counts: (p.meta as PageMeta & { counts?: Record<string, number> }).counts,
});

// ─── endpoints ───────────────────────────────────────────────────────────────
export interface SubjectWriteDto {
  name: Localized;
  slug: string;
  color: string;
  icon?: string;
  imageFileKey?: FileKey | null;
  order?: number;
  status: 'active' | 'hidden';
  sequentialUnlock: boolean;
  tagline?: Localized;
  description?: Localized;
}

export const subjectsApi = {
  list: async (params?: Query) => (await api.get<AdminSubject[]>('/admin/subjects', params)).map(toSubjectVM),
  get: async (id: ID) => toSubjectVM(await api.get<AdminSubject>(`/admin/subjects/${id}`)),
  create: (body: SubjectWriteDto) => api.post<AdminSubject>('/admin/subjects', body),
  update: (id: ID, body: Partial<SubjectWriteDto>) => api.patch<AdminSubject>(`/admin/subjects/${id}`, body),
  remove: (id: ID) => api.delete<OkDto>(`/admin/subjects/${id}`),
  reorder: (ids: ID[]) => api.put<AdminSubject[]>('/admin/subjects/order', { ids }),
};

export const unitsApi = {
  list: async (subjectId: ID) => (await api.get<AdminUnit[]>(`/admin/subjects/${subjectId}/units`)).map(toUnitVM).sort((a, b) => a.order - b.order),
  create: (subjectId: ID, name: Localized) => api.post<AdminUnit>(`/admin/subjects/${subjectId}/units`, { name }),
  update: (id: ID, name: Localized) => api.patch<AdminUnit>(`/admin/units/${id}`, { name }),
  remove: (id: ID) => api.delete<OkDto>(`/admin/units/${id}`),
  reorder: (subjectId: ID, ids: ID[], movedId?: ID) => api.put<AdminUnit[]>(`/admin/subjects/${subjectId}/units/order`, { ids, movedId }),
};

export const topicsApi = {
  create: (unitId: ID, name: Localized) => api.post<AdminTopic>(`/admin/units/${unitId}/topics`, { name }),
  update: (id: ID, name: Localized) => api.patch<AdminTopic>(`/admin/topics/${id}`, { name }),
  remove: (id: ID) => api.delete<OkDto>(`/admin/topics/${id}`),
  reorder: (unitId: ID, ids: ID[], movedId?: ID) => api.put<AdminTopic[]>(`/admin/units/${unitId}/topics/order`, { ids, movedId }),
  reorderLessons: (topicId: ID, ids: ID[]) => api.put<{ id: ID; order: number }[]>(`/admin/topics/${topicId}/lessons/order`, { ids }),
};

export const teachersApi = {
  list: async (params?: { subjectId?: ID; active?: boolean }) => (await api.get<TeacherDto[]>('/admin/teachers', params)).map(toTeacherVM),
  /** Full admin rows (bio, stats, lessonsCount) for the Teachers page. */
  listFull: (params?: { subjectId?: ID; active?: boolean }) => api.get<AdminTeacherDto[]>('/admin/teachers', params),
  create: (body: TeacherWriteDto) => api.post<AdminTeacherDto>('/admin/teachers', body),
  update: (id: ID, body: Partial<TeacherWriteDto>) => api.patch<AdminTeacherDto>(`/admin/teachers/${id}`, body),
  remove: (id: ID) => api.delete<OkDto>(`/admin/teachers/${id}`),
};

export type LessonTransitionBody = { to: ContentStatus; publishAt?: ISODate; note?: string; patch?: Partial<LessonWriteDto> };

export const lessonsApi = {
  list: async (params: Query) => mapPaged(await api.list<AdminLessonDto>('/admin/lessons', params), toLessonVM),
  get: async (id: ID) => toLessonVM(await api.get<AdminLessonDto>(`/admin/lessons/${id}`)),
  create: async (body: LessonWriteDto & { status?: 'draft' | 'in_review' }) => toLessonVM(await api.post<AdminLessonDto>('/admin/lessons', body)),
  update: async (id: ID, body: Partial<LessonWriteDto>) => toLessonVM(await api.patch<AdminLessonDto>(`/admin/lessons/${id}`, body)),
  remove: (id: ID) => api.delete<OkDto>(`/admin/lessons/${id}`),
  transition: async (id: ID, body: LessonTransitionBody) => toLessonVM(await api.post<AdminLessonDto>(`/admin/lessons/${id}/transition`, body)),
  approve: async (id: ID, note?: string) => toLessonVM(await api.post<AdminLessonDto>(`/admin/lessons/${id}/approve`, { note })),
  bulkTransition: (ids: ID[], to: 'in_review' | 'archived' | 'published' | 'draft', reason?: string) =>
    api.post<BulkResult>('/admin/lessons/bulk/transition', { ids, to, reason }),
  bulkDelete: (ids: ID[]) => api.post<BulkResult>('/admin/lessons/bulk/delete', { ids }),
  versions: (id: ID) => api.get<LessonVersionDto[]>(`/admin/lessons/${id}/versions`),
  addResource: (id: ID, body: { fileKey: FileKey; title?: Localized; pages?: number | null }) =>
    api.post<AdminLessonResource>(`/admin/lessons/${id}/resources`, body),
  updateResource: (id: ID, resourceId: ID, body: { title?: Localized; pages?: number | null; order?: number }) =>
    api.patch<AdminLessonResource>(`/admin/lessons/${id}/resources/${resourceId}`, body),
  removeResource: (id: ID, resourceId: ID) => api.delete<OkDto>(`/admin/lessons/${id}/resources/${resourceId}`),
  removeVideo: async (id: ID) => toLessonVM(await api.delete<AdminLessonDto>(`/admin/lessons/${id}/video`)),
};

export const videosApi = {
  register: async (body: { lessonId: ID; fileKey: FileKey; replace?: boolean }) => toVideoVM(await api.post<VideoAssetDto>('/admin/videos', body)),
  list: async (params: Query) => mapPaged(await api.list<VideoAssetDto>('/admin/videos', params), toVideoVM),
  get: async (id: ID) => toVideoVM(await api.get<VideoAssetDto>(`/admin/videos/${id}`)),
  stats: () => api.get<VideoStats>('/admin/videos/stats'),
  cdnResync: async (id: ID) => toVideoVM(await api.post<VideoAssetDto>(`/admin/videos/${id}/cdn-resync`)),
  reprocess: async (id: ID, reason?: string) => toVideoVM(await api.post<VideoAssetDto>(`/admin/videos/${id}/reprocess`, { reason })),
  bulkCdnResync: (ids: ID[]) => api.post<BulkResult>('/admin/videos/bulk/cdn-resync', { ids }),
};

// ─── hooks ───────────────────────────────────────────────────────────────────
export function useSubjectsQuery() {
  return useApiQuery(qk.subjects.list(), () => subjectsApi.list(), { staleTime: 60_000 });
}
export function useUnitsQuery(subjectId: ID | null | undefined) {
  return useApiQuery(qk.units.list({ subjectId }), () => unitsApi.list(subjectId as ID), { enabled: !!subjectId, staleTime: 60_000 });
}
export function useTeachersQuery(subjectId?: ID) {
  return useApiQuery(qk.teachers.list({ subjectId }), () => teachersApi.list(subjectId ? { subjectId } : undefined), { staleTime: 5 * 60_000 });
}
/** Lightweight lesson options (prerequisites, quiz rule pickers). */
export function useLessonOptions(params: Query, enabled = true) {
  return useApiQuery(qk.lessons.list({ view: 'options', ...params }), () => lessonsApi.list({ view: 'options', pageSize: 1000, ...params }), { enabled, staleTime: 60_000 });
}
/** Keys to invalidate after any curriculum change (structure is cached in several places). */
export const curriculumKeys = [qk.subjects.all, qk.units.all, qk.lessons.all, qk.lookups];
