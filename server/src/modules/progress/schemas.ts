import { idOrSlug } from '../../common/validation/schemas.js';
import { z } from '../../common/validation/zod.js';

export const watchBody = z.object({
  lessonId: idOrSlug,
  positionSec: z.number().min(0).max(86_400),
  durationSec: z.number().min(0).max(86_400),
  event: z.enum(['heartbeat', 'pause', 'leave', 'ended', 'seek']),
  watchedSecDelta: z.number().min(0).max(3600).optional(),
  platform: z.enum(['web', 'ios', 'android']).optional(),
});
export const completeBody = z.object({ lessonId: idOrSlug });
export const lessonsQuery = z.object({ subjectId: idOrSlug.optional() });
export const dashboardQuery = z.object({ tzOffsetMinutes: z.coerce.number().int().min(-840).max(840).optional() });
export const trendQuery = z.object({ weeks: z.coerce.number().int().min(1).max(26).default(8) });
export const weakQuery = z.object({ limit: z.coerce.number().int().min(1).max(50).default(5), subjectId: idOrSlug.optional() });
export const calendarQuery = z.object({ weeks: z.coerce.number().int().min(1).max(52).default(16) });
export const activityQuery = z.object({ limit: z.coerce.number().int().min(1).max(50).default(10), cursor: z.string().max(500).optional() });
export const planItemParam = z.object({ itemId: z.string().uuid() });
export const planItemBody = z.object({ done: z.boolean() });
