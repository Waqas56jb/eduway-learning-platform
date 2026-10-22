import { boolQuery } from '../../common/validation/schemas.js';
import { paginationQuery } from '../../common/utils/pagination.js';
import { z } from '../../common/validation/zod.js';

export const auditListQuery = paginationQuery.extend({
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  actor: z.string().max(120).optional(),
  actorId: z.string().uuid().optional(),
  entity: z.string().max(60).optional(),
  entityId: z.string().max(120).optional(),
  action: z.string().max(60).optional(),
  sensitive: boolQuery.optional(),
  since: z.string().datetime({ offset: true }).optional(),
});
export type AuditListQuery = z.infer<typeof auditListQuery>;

export const facetsQuery = z.object({ from: z.string().datetime({ offset: true }).optional(), to: z.string().datetime({ offset: true }).optional() });

export const adminSessionsQuery = paginationQuery.extend({ adminId: z.string().uuid().optional() });
export const revokeAllBody = z.object({ adminId: z.string().uuid().optional(), exceptCurrent: z.literal(true).default(true) });

export const alertsQuery = paginationQuery.extend({
  kind: z.enum(['multiple_devices', 'otp_bruteforce', 'unusual_location', 'payment_fraud', 'admin_login_failure']).optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  status: z.enum(['open', 'resolved', 'blocked']).optional(),
  subjectType: z.enum(['student', 'admin']).optional(),
});
