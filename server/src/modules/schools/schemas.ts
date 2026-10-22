import { exportRequest } from '../../common/services/exporter.js';
import { paginationQuery } from '../../common/utils/pagination.js';
import { isoDate } from '../../common/validation/schemas.js';
import { z } from '../../common/validation/zod.js';

const loc = (min = 1) => z.object({ en: z.string().trim().min(min).max(300), ar: z.string().trim().min(min).max(300) });
const fields = z.object({
  name: loc(2),
  code: z.string().trim().regex(/^[A-Za-z0-9-]{4,16}$/, 'code must match ^[A-Z0-9-]{4,16}$').transform((s) => s.toUpperCase()),
  city: loc(0).default({ en: '', ar: '' }),
  governorateId: z.string().min(2).max(40),
  contactName: z.string().trim().min(2).max(120),
  contactMobile: z.string().trim().regex(/^\+?[\d\s]{10,16}$/, 'invalid mobile'),
  contractStart: isoDate,
  contractEnd: isoDate,
  status: z.enum(['active', 'pending', 'suspended']).default('active'),
});
export const schoolCreateBody = fields
  .extend({ marketerId: z.string().uuid().nullable().optional() })
  .refine((v) => new Date(v.contractEnd).getTime() > new Date(v.contractStart).getTime(), { path: ['contractEnd'], message: 'contractEnd must be after contractStart' });
export const schoolPatchBody = fields.partial();
export const schoolListQuery = paginationQuery.extend({
  status: z.enum(['active', 'pending', 'suspended']).optional(),
  governorateId: z.string().max(40).optional(),
  marketerId: z.string().max(40).optional(),
  tier: z.string().max(80).optional(),
});
export type SchoolListQuery = z.infer<typeof schoolListQuery>;
export const bulkStatusBody = z.object({ ids: z.array(z.string().uuid()).min(1).max(500), status: z.enum(['active', 'suspended']), reason: z.string().trim().max(500).optional() });
export const setMarketerBody = z.object({ marketerId: z.string().uuid().nullable(), overrideReason: z.string().trim().max(500).optional() });
export const studentsQuery = paginationQuery.extend({ pageSize: z.coerce.number().int().min(1).max(100).default(5) });
export const progressQuery = z.object({ period: z.string().max(10).optional() });
export const noteBody = z.object({ body: z.string().trim().min(1).max(4000) });
export { exportRequest };
export const schoolDto = z.record(z.unknown()).openapi('SchoolDto');
