import { exportRequest } from '../../common/services/exporter.js';
import { boolQuery, isoDate } from '../../common/validation/schemas.js';
import { z } from '../../common/validation/zod.js';
import { paginationQuery } from '../../common/utils/pagination.js';

const loc = (min = 0) => z.object({ en: z.string().trim().min(min).max(2000), ar: z.string().trim().min(min).max(2000) });

export const comparisonSchema = z
  .object({
    subjectsCount: z.number().int().min(0),
    lessons: z.boolean(),
    quizzes: z.boolean(),
    questionBank: z.enum(['subject', 'full', 'unlimited']),
    mistakes: z.boolean(),
    examSimulator: z.union([z.boolean(), z.literal('unlimited')]),
    aiQuota: z.number().int().min(0),
    pdfResources: z.boolean(),
    analytics: z.boolean(),
    devices: z.number().int().min(1),
    prioritySupport: z.boolean(),
  })
  .partial();

const packageFields = z.object({
  name: loc(3),
  description: loc().default({ en: '', ar: '' }),
  tagline: loc().default({ en: '', ar: '' }),
  subjectIds: z.array(z.string().uuid()).min(1).max(50),
  price: z.number().int().min(0),
  currency: z.enum(['IQD', 'USD']).default('IQD'),
  taxBehavior: z.enum(['inclusive', 'exclusive', 'exempt']).default('inclusive'),
  validityType: z.enum(['days', 'months', 'until_date']),
  validityValue: z.number().int().min(0).max(3650),
  validUntil: isoDate.nullable().default(null),
  yearlyPrice: z.number().int().min(0).nullable().default(null),
  yearlyValidityDays: z.number().int().min(1).max(3650).default(365),
  renewal: z.enum(['manual', 'auto', 'none']).default('manual'),
  accessStart: z.enum(['immediate', 'from_date']).default('immediate'),
  accessStartDate: isoDate.nullable().default(null),
  status: z.enum(['active', 'draft', 'archived']).default('draft'),
  featured: z.boolean().default(false),
  order: z.number().int().min(0).max(10_000).default(0),
  aiQuota: z.number().int().min(0).max(100_000).nullable().default(null),
  features: z.array(loc(1)).max(30).default([]),
  comparison: comparisonSchema.default({}),
});

type Fields = Partial<z.infer<typeof packageFields>>;
function validity(v: Fields, ctx: z.RefinementCtx) {
  if ((v.validityType === 'days' || v.validityType === 'months') && v.validityValue !== undefined && v.validityValue < 1) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['validityValue'], message: 'validityValue must be ≥ 1 for days/months' });
  }
  if (v.validityType === 'until_date' && !v.validUntil) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['validUntil'], message: 'validUntil is required for until_date' });
  if (v.accessStart === 'from_date' && !v.accessStartDate) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['accessStartDate'], message: 'accessStartDate is required for from_date' });
}

export const packageWriteBody = packageFields.superRefine(validity).openapi('PackageWriteDto');
export const packagePatchBody = packageFields
  .partial()
  .extend({
    description: loc().optional(),
    tagline: loc().optional(),
    features: z.array(loc(1)).max(30).optional(),
    comparison: comparisonSchema.optional(),
    validUntil: isoDate.nullable().optional(),
    accessStartDate: isoDate.nullable().optional(),
    yearlyPrice: z.number().int().min(0).nullable().optional(),
    aiQuota: z.number().int().min(0).max(100_000).nullable().optional(),
  })
  .superRefine(validity);
export type PackageWrite = z.infer<typeof packageWriteBody>;
export type PackagePatch = z.infer<typeof packagePatchBody>;

export const adminPackageListQuery = paginationQuery.extend({
  status: z.enum(['active', 'draft', 'archived']).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).default(100),
});
export type AdminPackageListQuery = z.infer<typeof adminPackageListQuery>;

export const packageIdParam = z.object({ packageId: z.string().uuid() });
export const archiveBody = z.object({ reason: z.string().trim().max(500).optional() }).default({});
export const orderBody = z.object({ ids: z.array(z.string().uuid()).min(1).max(500) });
export const packageExportBody = exportRequest;
export const currentQuery = z.object({ includeArchived: boolQuery.optional() });

export const packagePublicDto = z.record(z.unknown()).openapi('PackagePublic');
export const adminPackageDto = z.record(z.unknown()).openapi('AdminPackage');
