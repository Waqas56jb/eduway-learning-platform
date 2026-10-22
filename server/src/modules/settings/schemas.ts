import { SETTINGS_SCHEMAS } from '../../common/services/settings-store.js';
import { fileKey } from '../../common/validation/schemas.js';
import { paginationQuery } from '../../common/utils/pagination.js';
import { z } from '../../common/validation/zod.js';
import { SECTIONS } from './service.js';

const semver = z.string().regex(/^\d+\.\d+\.\d+$/);
const loc = z.object({ en: z.string().max(2000), ar: z.string().max(2000) });
const plat = z.enum(['web', 'ios', 'android']);

export const sectionParam = z.object({ section: z.enum(SECTIONS) });

/** PUT body per section (partial — the server merges). */
export const SECTION_BODIES: Record<(typeof SECTIONS)[number], z.ZodTypeAny> = {
  general: (SETTINGS_SCHEMAS.general as z.AnyZodObject).partial().extend({ logoFileKey: fileKey.nullable().optional() }),
  otp: (SETTINGS_SCHEMAS.otp as z.AnyZodObject).pick({ expirySeconds: true, codeLength: true, resendLimit: true, resendCooldownSeconds: true, maxAttempts: true, lockoutMinutes: true, provider: true, fallbackProvider: true, devBypassCode: true }).partial(),
  app: z
    .object({
      minVersionIos: semver,
      minVersionAndroid: semver,
      latestVersion: semver,
      forceUpdate: z.boolean(),
      maintenanceMode: z.boolean(),
      maintenanceMessage: loc,
      deviceLimit: z.number().int().min(1).max(5),
      sessionTimeoutMinutes: z.union([z.literal(60), z.literal(240), z.literal(1440), z.literal(10080), z.literal(43200)]),
      storeUrls: z.object({ ios: z.string().url().nullable(), android: z.string().url().nullable() }),
      maintenanceAppliesTo: z.array(plat).min(1),
    })
    .partial(),
  support: (SETTINGS_SCHEMAS.support as z.AnyZodObject).partial(),
  payments: (SETTINGS_SCHEMAS.payments as z.AnyZodObject).partial(),
  learning: (SETTINGS_SCHEMAS.learning as z.AnyZodObject).partial(),
  marketing: (SETTINGS_SCHEMAS.marketing as z.AnyZodObject).partial(),
  security: (SETTINGS_SCHEMAS.security as z.AnyZodObject).partial(),
};

export const flagsQuery = z.object({ environment: z.enum(['production', 'staging', 'beta']).optional(), q: z.string().max(100).optional() });
export const flagPatchBody = z.object({ enabled: z.boolean().optional(), platforms: z.array(plat).optional(), rolloutPct: z.number().int().min(0).max(100).optional() });
export const flagCreateBody = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{2,40}$/),
  name: z.object({ en: z.string().min(2).max(80), ar: z.string().min(2).max(80) }),
  description: loc,
  environment: z.enum(['production', 'staging', 'beta']),
  enabled: z.boolean(),
});

export const docParam = z.object({ doc: z.enum(['terms', 'privacy']) });
export const legalCreateBody = z.object({ version: z.string().regex(/^\d+(\.\d+){0,2}$/).optional(), cloneFromId: z.string().uuid().optional() }).default({});
export const legalPatchBody = z.object({
  version: z.string().regex(/^\d+(\.\d+){0,2}$/).optional(),
  title: z.object({ en: z.string().max(200), ar: z.string().max(200) }).optional(),
  body: z.object({ en: z.string().max(100_000), ar: z.string().max(100_000) }).optional(),
  changeSummary: loc.nullable().optional(),
});
export const publishBody = z.object({ requireReacceptance: z.boolean().default(true) }).default({});
export const acceptancesQuery = paginationQuery;

const placementsT = z.array(z.enum(['landing', 'auth', 'app'])).min(1);
const placementsF = z.array(z.enum(['landing', 'pricing', 'subscription_app', 'contact'])).min(1);
const loc1 = z.object({ en: z.string().trim().min(1).max(2000), ar: z.string().trim().min(1).max(2000) });
export const testimonialBody = z.object({
  name: loc1,
  city: loc,
  role: loc,
  quote: loc1,
  avatarFileKey: fileKey.nullable().optional(),
  rating: z.number().int().min(1).max(5),
  placements: placementsT,
  order: z.number().int().min(0),
  active: z.boolean(),
});
export const faqBody = z.object({ q: loc1, a: loc1, placements: placementsF, order: z.number().int().min(0), active: z.boolean() });
export const orderBody = z.object({ kind: z.enum(['testimonials', 'faq']), ids: z.array(z.string().uuid()).min(1).max(500) });
