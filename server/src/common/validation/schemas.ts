/** Reusable zod building blocks for request/response schemas. */
import { CLIENT_PLATFORMS, STUDENT_PLATFORMS } from '../../config/constants.js';
import { normalizePhone } from '../utils/phone.js';
import { z } from './zod.js';

export const uuid = z.string().uuid();

/** `:id` route param. */
export const idParam = z.object({ id: z.string().uuid() });
export type IdParam = z.infer<typeof idParam>;

/** Accepts a uuid OR a stable slug (e.g. `math`, `math-l1`). */
export const idOrSlug = z.string().min(1).max(120).regex(/^[A-Za-z0-9_-]+$/, 'invalid id');

export const localized = z
  .object({ en: z.string(), ar: z.string() })
  .openapi('Localized', { description: 'Bilingual text', example: { en: 'Mathematics', ar: 'الرياضيات' } });

export const localizedInput = z.object({ en: z.string().trim().min(1).max(5000), ar: z.string().trim().min(1).max(5000) });

/**
 * Any international phone number → E.164 (`+447911123456`). Iraqi local formats (07…, 7…, 964…) stay accepted and
 * normalize to `+964…`. Fails with the localized PHONE_INVALID reason. `mobileOnly` rejects fixed-line / toll-free
 * numbers (OTP-capable numbers only).
 */
export function phoneSchema(opts: { mobileOnly?: boolean } = {}) {
  return z
    .string()
    .trim()
    .max(40)
    .transform((v, ctx) => {
      const n = normalizePhone(v, { mobileOnly: opts.mobileOnly });
      if (!n) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'PHONE_INVALID' });
        return z.NEVER;
      }
      return n;
    })
    .openapi({ example: '+9647701234567', description: 'International phone number in any common format (Iraqi 07… accepted), normalized to E.164' });
}

/** Student mobile (OTP login / registration): international, mobile-capable, E.164. */
export const mobilePhone = phoneSchema({ mobileOnly: true });
/** Any international phone (contact details, admin profile, WhatsApp test-send), E.164. */
export const anyPhone = phoneSchema();

export const clientPlatform = z.enum(CLIENT_PLATFORMS);
export const studentPlatform = z.enum(STUDENT_PLATFORMS);

/** Query-string boolean: `true/false/1/0`. */
export const boolQuery = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((v) => v === true || v === 'true' || v === '1');

export const isoDate = z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/));

/** Comma-separated list in a query string → string[]. */
export const csvQuery = z
  .union([z.string(), z.array(z.string())])
  .transform((v) => (Array.isArray(v) ? v : v.split(',')).map((s) => s.trim()).filter(Boolean));

export const emptyObject = z.object({}).strict();

/** Standard success envelope for OpenAPI documentation. */
export function envelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({ success: z.literal(true), data, meta: z.record(z.unknown()).optional() });
}

export const errorEnvelope = z
  .object({
    success: z.literal(false),
    error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }),
  })
  .openapi('ErrorEnvelope');

/** ReasonBody (API_CONTRACT §1.9): trimmed, 3..500 chars. */
export const reasonBody = z.object({ reason: z.string().trim().min(3).max(500) });
export const optionalReasonBody = z.object({ reason: z.string().trim().max(500).optional() }).default({});
export const okDto = z.object({ ok: z.literal(true) }).openapi('OkDto');
/** Opaque upload key issued by POST /storage/signed-upload-url. */
export const fileKey = z.string().regex(/^upl_[0-9a-f-]{36}$/, 'invalid fileKey');
