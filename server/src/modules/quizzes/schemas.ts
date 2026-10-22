import { paginationQuery } from '../../common/utils/pagination.js';
import { idOrSlug } from '../../common/validation/schemas.js';
import { z } from '../../common/validation/zod.js';

export const lessonParam = z.object({ lessonId: idOrSlug });
export const attemptParam = z.object({ attemptId: z.string().uuid() });
export const startBody = z.object({}).passthrough().default({});
export const answerBody = z.object({ questionId: z.string().uuid(), optionId: z.string().uuid().optional(), textAnswer: z.string().max(500).optional(), timeSec: z.number().min(0).max(36_000).optional() });
export const submitBody = z.object({ timeSpentSec: z.number().min(0).max(86_400).default(0) });
export const attemptsQuery = z.object({ lessonId: idOrSlug.optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20) });

export const ruleWriteBody = z.object({
  questionCount: z.number().int().min(1).max(50),
  poolSize: z.number().int().min(1).max(200),
  randomize: z.boolean(),
  alternativeSets: z.number().int().min(1).max(5),
  passThreshold: z.number().int().min(0).max(100),
  retryPolicy: z.enum(['unlimited', 'limited', 'cooldown']),
  maxRetries: z.number().int().min(0).max(10),
  cooldownMinutes: z.number().int().min(0).max(10_080).default(60),
  showExplanation: z.boolean(),
  requireCompletionToUnlock: z.boolean(),
});
export const ruleCreateBody = ruleWriteBody.extend({ lessonId: z.string().uuid() });
export const rulePatchBody = ruleWriteBody.partial();
export const ruleListQuery = paginationQuery.extend({ scope: z.enum(['subject', 'lesson']).optional(), subjectId: z.string().uuid().optional() });
export const subjectIdParam = z.object({ subjectId: z.string().uuid() });
export const effectiveQuery = z.object({ lessonId: z.string().uuid() });
