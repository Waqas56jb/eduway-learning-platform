import { paginationQuery } from '../../common/utils/pagination.js';
import { z } from '../../common/validation/zod.js';

const uuidOrNone = z.union([z.string().uuid(), z.literal('__none')]);

export const studentListQuery = paginationQuery.extend({
  status: z.enum(['active', 'expired', 'trial', 'none', 'cancelled', 'locked']).optional(),
  packageId: uuidOrNone.optional(),
  governorateId: z.string().max(40).optional(),
  schoolId: uuidOrNone.optional(),
  marketerId: uuidOrNone.optional(),
  source: z.enum(['organic', 'school', 'marketer', 'referral', 'campaign']).optional(),
  platform: z.enum(['web', 'ios', 'android']).optional(),
  createdFrom: z.string().datetime({ offset: true }).optional(),
  createdTo: z.string().datetime({ offset: true }).optional(),
  lastActiveBefore: z.string().datetime({ offset: true }).optional(),
});
export type StudentListQuery = z.infer<typeof studentListQuery>;

export const bulkBody = z.object({ ids: z.array(z.string().uuid()).min(1).max(500), reason: z.string().trim().min(3).max(500) });
export const bulkOptionalReasonBody = z.object({ ids: z.array(z.string().uuid()).min(1).max(500), reason: z.string().trim().max(500).optional() });
export const lockBody = z.object({ reason: z.string().trim().min(3).max(500) });
export const unlockBody = z.object({ reason: z.string().trim().max(500).optional() }).default({});
export const studentSessionParams = z.object({ id: z.string().uuid(), sessionId: z.string().uuid() });
export const studentEntitlementParams = z.object({ id: z.string().uuid(), entitlementId: z.string().uuid() });
export const noteBody = z.object({ body: z.string().trim().min(3).max(4000) });
export const grantBody = z.object({ subjectId: z.string().uuid(), days: z.number().int().min(1).max(365), reason: z.string().trim().min(5).max(500) });
export const attributionBody = z.object({
  schoolId: z.string().uuid().nullable(),
  referralCode: z.string().trim().regex(/^[A-Za-z0-9-]{4,20}$/, 'REFERRAL_CODE_INVALID').nullable(),
  reason: z.string().trim().min(3).max(500),
});
export const activityQuery = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20), days: z.coerce.number().int().min(1).max(90).default(14) });
export const txQuery = paginationQuery.extend({ pageSize: z.coerce.number().int().min(1).max(100).default(10) });
export const updateStudentBody = z.object({
  name: z.object({ en: z.string().trim().min(3).max(60), ar: z.string().trim().min(3).max(60) }).optional(),
  email: z.string().email().max(200).nullable().optional(),
  gender: z.enum(['male', 'female']).nullable().optional(),
  governorateId: z.string().max(40).optional(),
  schoolName: z.string().trim().max(80).nullable().optional(),
});

export const ticketListQuery = paginationQuery.extend({
  status: z.enum(['open', 'pending', 'resolved']).optional(),
  category: z.enum(['payment', 'access', 'video', 'content', 'account']).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
});
export const ticketParam = z.object({ id: z.string().min(3).max(60) });
export const ticketPatchBody = z.object({
  status: z.enum(['open', 'pending', 'resolved']).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  assigneeId: z.string().uuid().nullable().optional(),
});
