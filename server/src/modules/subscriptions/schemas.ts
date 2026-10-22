import { exportRequest } from '../../common/services/exporter.js';
import { paginationQuery } from '../../common/utils/pagination.js';
import { isoDate } from '../../common/validation/schemas.js';
import { z } from '../../common/validation/zod.js';

export const subscriptionListQuery = paginationQuery.extend({
  studentId: z.string().uuid().optional(),
  packageId: z.string().uuid().optional(),
  status: z.enum(['active', 'trial', 'expired', 'cancelled']).optional(),
  source: z.enum(['payment', 'manual', 'trial']).optional(),
  expiringBefore: isoDate.optional(),
});
export type SubscriptionListQuery = z.infer<typeof subscriptionListQuery>;
export type SubscriptionFilter = Partial<Pick<SubscriptionListQuery, 'studentId' | 'packageId' | 'status' | 'source' | 'expiringBefore' | 'q'>> & { ids?: string[] };

const reason = z.string().trim().min(5).max(500);
export const grantBody = z.object({ studentId: z.string().uuid(), packageId: z.string().uuid(), days: z.number().int().min(1).max(3650).optional(), startsAt: isoDate.optional(), reason });
export const changePackageBody = z.object({ packageId: z.string().uuid(), reason: z.string().trim().min(3).max(500), keepEndDate: z.boolean().default(true) });
export const extendBody = z.object({ days: z.number().int().min(1).max(365), reason: z.string().trim().min(3).max(500) });
export const cancelBody = z.object({ reason: z.string().trim().min(3).max(500), immediate: z.boolean().default(false) });
export { exportRequest };
export const adminSubscriptionDto = z.record(z.unknown()).openapi('AdminSubscriptionDto');
export const mySubscriptionDto = z.record(z.unknown()).nullable().openapi('MySubscription');
