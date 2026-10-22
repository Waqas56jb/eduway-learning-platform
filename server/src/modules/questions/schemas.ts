import { paginationQuery } from '../../common/utils/pagination.js';
import { boolQuery, csvQuery, fileKey, idOrSlug } from '../../common/validation/schemas.js';
import { z } from '../../common/validation/zod.js';

export const QUESTION_STATUSES = ['draft', 'in_review', 'approved', 'published', 'archived'] as const;
export type QuestionStatus = (typeof QUESTION_STATUSES)[number];
const TYPES = ['mcq', 'true_false', 'fill_blank'] as const;
const DIFFS = ['easy', 'medium', 'hard'] as const;

const locMin = (en: number, ar: number, max = 5000) => z.object({ en: z.string().trim().min(en).max(max), ar: z.string().trim().min(ar).max(max) });

export const questionWriteBase = z.object({
  type: z.enum(TYPES),
  difficulty: z.enum(DIFFS),
  subjectId: z.string().uuid(),
  unitId: z.string().uuid(),
  topicId: z.string().uuid(),
  body: locMin(8, 5),
  explanation: locMin(5, 5),
  options: z.array(z.object({ id: z.string().uuid().optional(), text: z.object({ en: z.string().trim().min(1).max(1000), ar: z.string().trim().min(1).max(1000) }), correct: z.boolean() })).min(1).max(6),
  imageFileKey: fileKey.nullable().optional(),
  formula: z.string().max(2000).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  source: z.string().trim().max(120).optional(),
  year: z.number().int().min(2000).max(2027).nullable().optional(),
});
export const questionCreateBody = questionWriteBase.extend({ status: z.enum(['draft', 'in_review']).optional() });
export const questionPatchBody = questionWriteBase.partial();
export type QuestionWrite = z.infer<typeof questionPatchBody>;

export const questionListQuery = paginationQuery.extend({
  subjectId: z.string().uuid().optional(),
  unitId: z.string().uuid().optional(),
  topicId: z.string().uuid().optional(),
  difficulty: csvQuery.pipe(z.array(z.enum(DIFFS))).optional(),
  type: csvQuery.pipe(z.array(z.enum(TYPES))).optional(),
  status: csvQuery.pipe(z.array(z.enum(QUESTION_STATUSES))).optional(),
  duplicatesOnly: boolQuery.optional(),
  authorId: z.string().uuid().optional(),
  tags: csvQuery.optional(),
});
export type QuestionListQuery = z.infer<typeof questionListQuery>;

export const transitionBody = z.object({
  to: z.enum(['in_review', 'approved', 'draft', 'published', 'archived']).optional(),
  action: z.enum(['submit', 'approve', 'reject', 'publish', 'archive', 'restore']),
  comment: z.string().trim().max(1000).optional(),
  patch: questionPatchBody.optional(),
});
export const bulkTransitionBody = z.object({ ids: z.array(z.string().uuid()).min(1).max(500), action: z.enum(['submit', 'approve', 'publish', 'archive']) });
export const bulkIdsBody = z.object({ ids: z.array(z.string().uuid()).min(1).max(500) });
export const similarBody = z.object({
  topicId: z.string().uuid(),
  body: z.object({ en: z.string().max(5000), ar: z.string().max(5000).optional() }),
  excludeId: z.string().uuid().optional(),
  threshold: z.number().min(0).max(1).optional(),
  limit: z.number().int().min(1).max(20).optional(),
});
export const reviewQueueQuery = z.object({ subjectId: z.string().uuid().optional(), q: z.string().trim().max(200).optional() });
export const previewQuery = z.object({ lang: z.enum(['en', 'ar']).optional() });
export const tagsQuery = z.object({ q: z.string().trim().max(60).optional(), limit: z.coerce.number().int().min(1).max(200).default(50) });

// ── import ──
export const templateQuery = z.object({ format: z.enum(['csv', 'xlsx']).default('csv') });
export const importBody = z.object({ fileKey: fileKey.optional() });
export const importParam = z.object({ importId: z.string().uuid() });
export const importPageQuery = z.object({
  filter: z.enum(['all', 'valid', 'invalid']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});

// ── student bank & bookmarks ──
export const bankQuery = z.object({
  subjectId: idOrSlug.optional(),
  unitId: z.string().uuid().optional(),
  topicId: z.string().uuid().optional(),
  topic: z.string().trim().max(200).optional(),
  difficulty: csvQuery.pipe(z.array(z.enum([...DIFFS, 'all']))).optional(),
  type: csvQuery.pipe(z.array(z.enum(TYPES))).optional(),
  tags: csvQuery.optional(),
  bookmarked: boolQuery.optional(),
  q: z.string().trim().max(200).optional(),
  reveal: boolQuery.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(12),
  sort: z.string().max(40).optional(),
});
export type BankQuery = z.infer<typeof bankQuery>;
export const questionParam = z.object({ questionId: z.string().uuid() });
export const bookmarksQuery = z.object({ subjectId: idOrSlug.optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20) });
