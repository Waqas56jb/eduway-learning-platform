import { isValidPhone } from '../../common/utils/phone.js';
import { z } from '../../common/validation/zod.js';

export const appConfigQuery = z.object({ platform: z.enum(['web', 'ios', 'android']).optional() });
export const schoolsQuery = z.object({ governorateId: z.string().max(40).optional(), q: z.string().trim().max(100).optional(), limit: z.coerce.number().int().min(1).max(200).default(50) });
export const codeParam = z.object({ code: z.string().regex(/^[A-Za-z0-9-]{4,20}$/) });
export const testimonialsQuery = z.object({ placement: z.enum(['landing', 'auth', 'app']).optional() });
export const faqQuery = z.object({ placement: z.enum(['landing', 'pricing', 'subscription_app', 'contact']).optional() });
export const legalDocParam = z.object({ doc: z.enum(['terms', 'privacy']) });
export const legalVersionQuery = z.object({ version: z.string().max(20).optional() });
export const contactBody = z.object({
  name: z.string().trim().min(3).max(80),
  contact: z
    .string()
    .trim()
    .max(200)
    .refine((v) => z.string().email().safeParse(v).success || isValidPhone(v), 'CONTACT_INVALID'),
  subject: z.enum(['general', 'support', 'billing', 'partnerships', 'schools']),
  message: z.string().trim().min(20).max(4000),
  locale: z.enum(['en', 'ar']).optional(),
});
