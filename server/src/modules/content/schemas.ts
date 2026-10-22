import { paginationQuery } from '../../common/utils/pagination.js';
import { boolQuery, csvQuery, fileKey, idOrSlug, localized } from '../../common/validation/schemas.js';
import { z } from '../../common/validation/zod.js';

const loc = (min = 1, max = 300) => z.object({ en: z.string().trim().min(min).max(max), ar: z.string().trim().min(min).max(max) });
const locOpt = (max = 5000) => z.object({ en: z.string().trim().max(max), ar: z.string().trim().max(max) });
const color = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

export const CONTENT_STATUSES = ['draft', 'in_review', 'approved', 'scheduled', 'published', 'archived'] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

// ── student ──
export const subjectParam = z.object({ subjectId: idOrSlug });
export const lessonParam = z.object({ lessonId: idOrSlug });
export const lessonResourceParam = z.object({ lessonId: idOrSlug, resourceId: z.string().uuid() });
export const noteBody = z.object({ text: z.string().max(5000) });

// ── admin: subjects / units / topics / teachers ──
export const subjectListQuery = z.object({ status: z.enum(['active', 'hidden']).optional(), q: z.string().trim().max(200).optional() });
export const subjectCreateBody = z.object({
  name: loc(2, 120),
  slug: z.string().trim().regex(/^[a-z0-9-]{2,40}$/, 'invalid slug'),
  color,
  icon: z.string().trim().max(60).optional(),
  imageFileKey: fileKey.nullable().optional(),
  order: z.number().int().min(0).max(10_000).optional(),
  status: z.enum(['active', 'hidden']).default('active'),
  sequentialUnlock: z.boolean().default(false),
  tagline: locOpt(300).optional(),
  description: locOpt(5000).optional(),
});
export const subjectPatchBody = subjectCreateBody.partial();
export const idsBody = z.object({ ids: z.array(z.string().uuid()).min(1).max(1000), movedId: z.string().uuid().optional() });
export const nameBody = z.object({ name: loc(2, 200) });

export const teacherListQuery = z.object({ subjectId: idOrSlug.optional(), active: boolQuery.optional() });
export const teacherBody = z.object({
  name: loc(2, 120),
  bio: locOpt(4000).optional(),
  avatarFileKey: fileKey.nullable().optional(),
  subjectId: z.string().uuid(),
  yearsExperience: z.number().int().min(0).max(80).nullable().optional(),
  studentsCount: z.number().int().min(0).max(10_000_000).nullable().optional(),
  rating: z.number().min(0).max(5).nullable().optional(),
  active: z.boolean().optional(),
});
export const teacherPatchBody = teacherBody.partial();

// ── admin: lessons ──
export const lessonListQuery = paginationQuery.extend({
  pageSize: z.coerce.number().int().min(1).max(1000).default(20),
  subjectId: z.string().uuid().optional(),
  unitId: z.string().uuid().optional(),
  topicId: z.string().uuid().optional(),
  status: csvQuery.pipe(z.array(z.enum(CONTENT_STATUSES))).optional(),
  teacherId: z.string().uuid().optional(),
  excludeArchived: boolQuery.optional(),
  withoutQuizOverride: boolQuery.optional(),
  view: z.enum(['table', 'board', 'options']).optional(),
});
export type LessonListQuery = z.infer<typeof lessonListQuery>;

const captionInput = z.object({ lang: z.enum(['en', 'ar']).default('ar'), fileKey });
export const lessonWriteBase = z.object({
  title: loc(3, 200),
  description: locOpt(5000).optional(),
  subjectId: z.string().uuid(),
  unitId: z.string().uuid(),
  topicId: z.string().uuid(),
  teacherId: z.string().uuid(),
  order: z.number().int().min(1).max(10_000).optional(),
  thumbnailFileKey: fileKey.nullable().optional(),
  durationSec: z.number().int().min(30).max(14_400).optional(),
  captions: z.array(captionInput).max(2).nullable().optional(),
  completionThreshold: z.number().int().min(10).max(100).optional(),
  prerequisiteId: z.string().uuid().nullable().optional(),
  versionNote: z.string().trim().max(500).optional(),
});
export const lessonCreateBody = lessonWriteBase.extend({ status: z.enum(['draft', 'in_review']).optional() });
export const lessonPatchBody = lessonWriteBase.partial();
export type LessonWrite = z.infer<typeof lessonPatchBody>;
export const transitionBody = z.object({
  to: z.enum(CONTENT_STATUSES),
  publishAt: z.string().datetime({ offset: true }).optional(),
  note: z.string().trim().max(500).optional(),
  patch: lessonPatchBody.optional(),
});
export const approveBody = z.object({ note: z.string().trim().max(500).optional() }).default({});
export const bulkTransitionBody = z.object({ ids: z.array(z.string().uuid()).min(1).max(500), to: z.enum(['in_review', 'archived', 'published', 'draft', 'approved']), reason: z.string().trim().max(500).optional() });
export const bulkIdsBody = z.object({ ids: z.array(z.string().uuid()).min(1).max(500) });
export const resourceCreateBody = z.object({ fileKey, title: locOpt(200).optional(), pages: z.number().int().min(0).max(5000).nullable().optional() });
export const resourcePatchBody = z.object({ title: locOpt(200).optional(), pages: z.number().int().min(0).max(5000).nullable().optional(), order: z.number().int().min(1).max(1000).optional() });
export const lessonResourceAdminParam = z.object({ id: z.string().uuid(), resourceId: z.string().uuid() });

// ── admin: videos ──
export const videoRegisterBody = z.object({ lessonId: z.string().uuid(), fileKey, replace: z.boolean().optional() });
export const videoListQuery = paginationQuery.extend({
  subjectId: z.string().uuid().optional(),
  streamStatus: z.enum(['ready', 'processing', 'failed']).optional(),
  cdnStatus: z.enum(['synced', 'pending', 'error']).optional(),
});
export const reprocessBody = z.object({ reason: z.string().trim().max(500).optional() }).default({});

export { localized };
