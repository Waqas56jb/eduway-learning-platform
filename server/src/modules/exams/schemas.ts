import { paginationQuery } from '../../common/utils/pagination.js';
import { idOrSlug } from '../../common/validation/schemas.js';
import { z } from '../../common/validation/zod.js';

const loc = (min = 1, max = 300) => z.object({ en: z.string().trim().min(min).max(max), ar: z.string().trim().min(min).max(max) });

// ── student ──
export const subjectQuery = z.object({ subjectId: idOrSlug.optional() });
export const subjectParam = z.object({ subjectId: idOrSlug });
export const upcomingQuery = z.object({ limit: z.coerce.number().int().min(1).max(20).default(3) });
export const blueprintParam = z.object({ blueprintId: z.string().uuid() });
export const attemptParam = z.object({ attemptId: z.string().uuid() });
const answersMap = z.record(z.string().uuid(), z.string().uuid().nullable());
export const autosaveBody = z.object({
  answers: answersMap,
  flagged: z.array(z.string().uuid()).max(500).default([]),
  currentIndex: z.number().int().min(0).max(1000).default(0),
  clientSavedAt: z.string().datetime({ offset: true }),
  seq: z.number().int().min(0),
});
export const flagBody = z.object({ questionId: z.string().uuid(), flagged: z.boolean() });
export const submitBody = z.object({ reason: z.enum(['manual', 'timeout']).default('manual'), answers: answersMap.optional(), flagged: z.array(z.string().uuid()).max(500).optional(), seq: z.number().int().min(0).optional() });
export const attemptsQuery = z.object({ examId: z.string().uuid().optional(), status: z.enum(['in_progress', 'submitted', 'auto_submitted']).optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20) });

// ── admin blueprints ──
const rowInput = z.object({ id: z.string().optional(), subjectId: z.string().uuid(), topicId: z.string().uuid().nullable().optional().transform((v) => v ?? null), count: z.number().int().min(1).max(500), easy: z.number().int().min(0).max(100), medium: z.number().int().min(0).max(100), hard: z.number().int().min(0).max(100) });
export const blueprintBody = z.object({
  name: loc(2, 200),
  description: z.object({ en: z.string().max(2000), ar: z.string().max(2000) }).optional(),
  rows: z.array(rowInput).min(1).max(50),
  durationMin: z.number().int().min(10).max(300),
  randomize: z.boolean(),
  scoring: z.enum(['standard', 'negative', 'weighted']),
  attemptLimit: z.number().int().min(1).max(10),
  reviewBeforeSubmit: z.boolean(),
  passMark: z.number().int().min(0).max(100).optional(),
  availableFrom: z.string().datetime({ offset: true }),
  availableTo: z.string().datetime({ offset: true }),
  status: z.enum(['draft', 'published', 'archived']).default('draft'),
});
export const blueprintListQuery = paginationQuery.extend({ status: z.enum(['draft', 'published', 'archived']).optional(), subjectId: z.string().uuid().optional() });
export const publishBody = z.object({ force: z.boolean().optional() }).default({});
export const availabilityBody = z.object({ rows: z.array(rowInput.omit({ id: true })).min(1).max(50) });

// ── admin attempts ──
export const adminAttemptsQuery = paginationQuery.extend({
  kind: z.enum(['quiz', 'exam', 'practice']).optional(),
  status: z.enum(['passed', 'failed', 'in_progress', 'abandoned']).optional(),
  studentId: z.string().uuid().optional(),
  refId: z.string().uuid().optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  platform: z.enum(['web', 'ios', 'android']).optional(),
});
export type AdminAttemptsQuery = z.infer<typeof adminAttemptsQuery>;
