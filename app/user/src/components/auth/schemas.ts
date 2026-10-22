import { z } from 'zod';

/**
 * Zod schemas for the auth forms. Every issue message is a key in the `validation`
 * namespace (e.g. "mobile.length") and is translated by `useFieldError`.
 */

const digitsOf = (v: string) => v.replace(/\D/g, '').replace(/^0/, '');

/** Letters (Latin + Arabic, incl. Kurdish/Persian extensions), spaces, apostrophes, dots and hyphens. */
const NAME_PATTERN = /^[A-Za-zء-غـ-ْٰ-ۓە\s'.-]+$/;

export const mobileSchema = z
  .string()
  .min(1, 'mobile.required')
  .refine((v) => v.trim() === '' || digitsOf(v).length === 10, 'mobile.length')
  .refine((v) => v.trim() === '' || digitsOf(v).startsWith('7'), 'mobile.prefix');

export const loginSchema = z.object({
  mobile: mobileSchema,
});
export type LoginValues = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'name.required')
    .min(3, 'name.min')
    .max(60, 'name.max')
    .refine((v) => v === '' || NAME_PATTERN.test(v), 'name.letters'),
  mobile: mobileSchema,
  governorate: z.string().min(1, 'governorate.required'),
  school: z.string().trim().max(80, 'school.max'),
  referral: z
    .string()
    .trim()
    .refine((v) => v === '' || /^[A-Za-z0-9-]{4,20}$/.test(v), 'referral.invalid'),
  acceptTerms: z.boolean().refine((v) => v, 'terms.required'),
});
export type RegisterInput = z.input<typeof registerSchema>;
export type RegisterOutput = z.output<typeof registerSchema>;

/** "770 123 4567" → "+964 770 123 4567" (the format stored in `pendingMobile`). */
export const toE164ish = (formatted: string) => `+964 ${formatted.trim()}`;
