import { exportRequest } from '../../common/services/exporter.js';
import { paginationQuery } from '../../common/utils/pagination.js';
import { boolQuery, fileKey, isoDate } from '../../common/validation/schemas.js';
import { z } from '../../common/validation/zod.js';
import { GATEWAY_ALIASES } from './providers.js';

const cycle = z.enum(['monthly', 'yearly']).default('monthly');
const gatewayInput = z
  .string()
  .trim()
  .toLowerCase()
  .refine((g) => g in GATEWAY_ALIASES, 'unknown gateway')
  .openapi({ description: "zaincash | fastpay | qicard | asiahawala | visa | mock (aliases: zain, card, asia, mastercard → visa)" });

export const quoteBody = z.object({ packageId: z.string().uuid(), cycle, promoCode: z.string().trim().max(40).optional() });
export const initiateBody = z.object({
  packageId: z.string().uuid(),
  cycle,
  gateway: gatewayInput,
  promoCode: z.string().trim().max(40).optional(),
  walletPhone: z.string().trim().max(32).optional().openapi({ description: 'Iraqi wallet number in any common form (07…, 7…, 964…, +964…, 00964…, Arabic-Indic digits)' }),
  returnUrl: z.string().url().max(2000).optional().openapi({ description: '`__ID__` is replaced by the payment id' }),
  returnScheme: z.string().max(500).optional(),
});
export const mockConfirmBody = z.object({ outcome: z.enum(['success', 'failure', 'cancel']) });
export const paymentIdParam = z.object({ paymentId: z.string().uuid() });
export const providerParam = z.object({ provider: z.string().min(2).max(30) });
export const receiptQuery = z.object({
  format: z.enum(['json', 'pdf']).default('json'),
  /** PDF language. Default: the request's Accept-Language, else the payer's account language. */
  lang: z.enum(['en', 'ar']).optional(),
});
export const myPaymentsQuery = paginationQuery;

const csv = z.union([z.string(), z.array(z.string())]).transform((v) => (Array.isArray(v) ? v.join(',') : v));
export const paymentListQuery = paginationQuery.extend({
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  from: isoDate.optional(),
  to: isoDate.optional(),
  status: csv.optional(),
  gateway: csv.optional(),
  packageId: z.string().uuid().optional(),
  source: z.enum(['school', 'promo', 'direct']).optional(),
  schoolId: z.string().max(40).optional(),
  marketerId: z.string().max(40).optional(),
  studentId: z.string().uuid().optional(),
  platform: z.enum(['web', 'ios', 'android']).optional(),
});
export type PaymentListQuery = z.infer<typeof paymentListQuery>;

export const refundCreateBody = z
  .object({
    kind: z.enum(['full', 'partial']),
    amount: z.number().int().min(1000).optional(),
    reason: z.string().trim().min(5).max(500),
    processNow: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    if (v.kind === 'partial' && v.amount === undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['amount'], message: 'amount is required for partial refunds' });
    if (v.amount !== undefined && v.amount % 1000 !== 0) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['amount'], message: 'amount must be a multiple of 1000' });
  });
export const refundListQuery = paginationQuery.extend({ status: z.enum(['pending', 'approved', 'rejected']).optional(), from: isoDate.optional(), to: isoDate.optional() });
export type RefundListQuery = z.infer<typeof refundListQuery>;
export const approveBody = z.object({ note: z.string().trim().max(500).optional() }).default({});
export const rejectBody = z.object({ reason: z.string().trim().min(3).max(500) });
export const bulkIdsBody = z.object({ ids: z.array(z.string().uuid()).min(1).max(500) });

export const recQuery = z.object({ from: isoDate.optional(), to: isoDate.optional(), gateway: z.string().max(30).optional() });
export const recComparisonQuery = paginationQuery.extend({
  from: isoDate.optional(),
  to: isoDate.optional(),
  gateway: z.string().max(30).optional(),
  onlyMismatches: boolQuery.optional(),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
});
export const recResolveBody = z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), gateway: z.string().min(2).max(30), reason: z.string().trim().min(3).max(500) });
export const recImportBody = z.object({ gateway: z.string().min(2).max(30), fileKey });
export const recExportBody = exportRequest.extend({ table: z.enum(['daily', 'comparison']) });
export { exportRequest };

export const webhookAck = z.object({ received: z.literal(true), duplicate: z.boolean() });
export const priceQuoteDto = z.record(z.unknown()).openapi('PriceQuote');
export const studentPaymentDto = z.record(z.unknown()).openapi('StudentPaymentDto');
export const transactionRowDto = z.record(z.unknown()).openapi('TransactionRow');
export const transactionDetailDto = z.record(z.unknown()).openapi('TransactionDetail');
export const refundDto = z.record(z.unknown()).openapi('RefundDto');
export const receiptDto = z.record(z.unknown()).openapi('ReceiptDto');
