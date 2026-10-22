import { csvQuery } from '../../common/validation/schemas.js';
import { z } from '../../common/validation/zod.js';

export const searchQuery = z.object({
  q: z.string().trim().min(2).max(200),
  scopes: csvQuery.optional(),
  limit: z.coerce.number().int().min(1).max(20).default(5),
});
