import { idOrSlug } from '../../common/validation/schemas.js';
import { z } from '../../common/validation/zod.js';

const diff = z.enum(['easy', 'medium', 'hard', 'all']);
export const startBody = z.object({
  mode: z.enum(['filters', 'bookmarks', 'mistakes']),
  filters: z
    .object({
      subjectId: idOrSlug.optional(),
      unitId: z.string().uuid().optional(),
      topicId: z.string().uuid().optional(),
      topic: z.string().max(200).optional(),
      difficulty: z.union([z.array(diff), diff]).optional(),
      tags: z.array(z.string().max(40)).max(20).optional(),
      q: z.string().max(200).optional(),
    })
    .optional(),
  count: z.number().int().min(1).max(500),
  includeQuestionId: z.string().uuid().optional(),
  questionIds: z.array(z.string().uuid()).max(500).optional(),
  seed: z.string().max(100).optional(),
});
export const sessionParam = z.object({ sessionId: z.string().uuid() });
export const answerBody = z.object({ questionId: z.string().uuid(), optionId: z.string().uuid().optional(), textAnswer: z.string().max(500).optional(), timeSec: z.number().min(0).max(36_000).optional() });
export const finishBody = z.object({ timeSpentSec: z.number().min(0).max(86_400).default(0) });
export const sessionsQuery = z.object({ limit: z.coerce.number().int().min(1).max(100).default(5), page: z.coerce.number().int().min(1).default(1) });
