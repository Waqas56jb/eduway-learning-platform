import { z } from 'zod';
import { isValidPhone, phoneToE164, type PhoneValue } from '@/utils/phone';

/**
 * Zod schemas for the auth forms. Every issue message is a key in the `validation`
 * namespace (e.g. "mobile.length") and is translated by `useFieldError`.
 */

const digitsOf = (v: string) => v.replace(/\D/g, '').replace(/^0/, '');

/** Letters (Latin + Arabic, incl. Kurdish/Persian extensions), spaces, apostrophes, dots and hyphens. */
const NAME_PATTERN = /^[A-Za-zء-غـ-ْٰ-ۓە\s'.-]+$/;

/**
 * International mobile number: `{ country, national }` from `PhoneField`. Valid when libphonenumber
 * (max metadata, same as the server) accepts it for the selected country — or, in dev builds only,
 * when it is a reserved fictional UK test number (+44 7700 900000–900999) the dev server accepts.
 */
export const mobileSchema = z
  .object({ country: z.string(), national: z.string() })
  .superRefine((v, ctx) => {
    if (!v.national.replace(/\D/g, '')) ctx.addIssue({ code: 'custom', message: 'mobile.required' });
    else if (!isValidPhone(v)) ctx.addIssue({ code: 'custom', message: 'mobile.invalidCountry' });
  });

/** Legacy Iraqi-only rules (10 digits after +964, starting with 7) — kept for reference/back-compat. */
export const iraqiMobileSchema = z
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

/** "770 123 4567" → "+964 770 123 4567" (legacy Iraqi-only helper; use `toE164`). */
export const toE164ish = (formatted: string) => `+964 ${formatted.trim()}`;

/** `{ country: 'GB', national: '7911 123456' }` → "+447911123456" (what the API expects). */
export const toE164 = (value: PhoneValue) => phoneToE164(value);
