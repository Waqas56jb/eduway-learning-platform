import { boolQuery, idOrSlug } from '../../common/validation/schemas.js';
import { z } from '../../common/validation/zod.js';

export const mistakeListQuery = z.object({
  status: z.enum(['unresolved', 'reviewed', 'mastered', 'repeated']).optional(),
  subjectId: idOrSlug.optional(),
  unitId: z.string().uuid().optional(),
  topicId: z.string().uuid().optional(),
  source: z.enum(['quiz', 'bank', 'exam']).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  groupBy: z.enum(['subject', 'unit', 'topic', 'date']).optional(),
  sort: z.string().max(40).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});
export const mistakeParam = z.object({ id: z.string().uuid() });
export const mistakeDetailQuery = z.object({ reveal: boolQuery.optional() });
export const statusBody = z.object({ status: z.enum(['unresolved', 'reviewed', 'mastered']) });
export const retryBody = z.object({ optionId: z.string().uuid().optional(), chosenIndex: z.number().int().min(0).max(10).optional(), textAnswer: z.string().max(500).optional() });
