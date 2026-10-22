import { exportRequest } from '../../common/services/exporter.js';
import { paginationQuery } from '../../common/utils/pagination.js';
import { isoDate } from '../../common/validation/schemas.js';
import { z } from '../../common/validation/zod.js';

const fields = z.object({
  code: z.string().trim().regex(/^[A-Za-z0-9-]{4,20}$/, 'code must match ^[A-Z0-9-]{4,20}$').transform((s) => s.toUpperCase()),
  type: z.enum(['promo', 'school', 'referral', 'campaign']),
  discountType: z.enum(['percent', 'fixed']),
  discountValue: z.number().int().positive(),
  packageIds: z.array(z.string().uuid()).max(100).default([]),
  eligibility: z.enum(['all', 'new_users', 'renewals', 'school_students']).default('all'),
  usageLimit: z.number().int().min(0).default(0),
  perUserLimit: z.number().int().min(1).max(100).default(1),
  validFrom: isoDate,
  validTo: isoDate,
  enabled: z.boolean().default(true),
  ownerType: z.enum(['school', 'marketer']).nullable().default(null),
  ownerId: z.string().uuid().nullable().default(null),
});

export const promotionWriteBody = fields
  .superRefine((v, ctx) => {
    if (v.discountType === 'percent' && v.discountValue > 100) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['discountValue'], message: 'percent discount must be ≤ 100' });
    if (new Date(v.validTo).getTime() < new Date(v.validFrom).getTime()) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['validTo'], message: 'validTo must be ≥ validFrom' });
    if (v.ownerType && !v.ownerId) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['ownerId'], message: 'ownerId is required' });
  })
  .openapi('PromotionWrite');
export const promotionPatchBody = fields
  .partial()
  .extend({ packageIds: z.array(z.string().uuid()).max(100).optional(), ownerType: z.enum(['school', 'marketer']).nullable().optional(), ownerId: z.string().uuid().nullable().optional() });
export type PromotionWrite = z.infer<typeof promotionWriteBody>;
export type PromotionPatch = z.infer<typeof promotionPatchBody>;

export const promotionListQuery = paginationQuery.extend({
  type: z.enum(['promo', 'school', 'referral', 'campaign']).optional(),
  phase: z.enum(['live', 'upcoming', 'expired', 'exhausted', 'disabled']).optional(),
  packageId: z.string().uuid().optional(),
});
export type PromotionListQuery = z.infer<typeof promotionListQuery>;

export const checkCodeQuery = z.object({ code: z.string().trim().min(1).max(40), excludeId: z.string().uuid().optional() });
export const generateCodeQuery = z.object({ prefix: z.string().trim().max(10).optional() });
export const redemptionsQuery = paginationQuery;
export const validateBody = z.object({ code: z.string().trim().min(1).max(40), packageId: z.string().uuid(), cycle: z.enum(['monthly', 'yearly']).default('monthly') });
export { exportRequest };
export const promotionDto = z.record(z.unknown()).openapi('PromotionDto');
