/**
 * Typed, cached access to runtime settings (admin-editable, never hardcoded):
 *   - grouped key/value rows in eduway_platform_settings  (general, otp, support, payments, learning, marketing, security, auth)
 *   - singleton row eduway_platform_app_settings         (versions, maintenance, device limit, session timeout)
 *   - eduway_platform_feature_flags
 *
 *   const otp = await settingsStore.get('otp');        // fully typed, defaults applied
 *   const app = await settingsStore.app();
 *   if (await settingsStore.flag('ai_tutor')) …
 *
 * To add a group (B/C/D): add a zod schema with defaults to SETTINGS_SCHEMAS below and seed a row.
 */
import { T } from '../../config/constants.js';
import { db, type Executor } from '../../config/db.js';
import { TtlCache } from '../utils/cache.js';
import { z } from '../validation/zod.js';

const localized = (en = '', ar = '') => z.object({ en: z.string(), ar: z.string() }).default({ en, ar });
const GATEWAY_IDS = ['zaincash', 'fastpay', 'qicard', 'asiahawala', 'visa', 'mock'] as const;

/**
 * Settings sections (API_CONTRACT §31). Stored as JSON in eduway_platform_settings, keyed by section.
 * `app` lives in the eduway_platform_app_settings singleton (see appSettings below).
 * `auth` is internal (not exposed by ADM-CFG-*): lockout + token lifetimes.
 */
export const SETTINGS_SCHEMAS = {
  general: z.object({
    platformName: localized('EDUWAY', 'إيدوواي'),
    logoUrl: z.string().nullable().default(null),
    defaultLanguage: z.enum(['ar', 'en']).default('ar'),
    currency: z.enum(['IQD', 'USD']).default('IQD'),
    timezone: z.enum(['Asia/Baghdad', 'Asia/Dubai', 'Asia/Riyadh', 'Europe/Istanbul', 'UTC']).default('Asia/Baghdad'),
    dateFormat: z.enum(['d MMM yyyy', 'dd/MM/yyyy', 'yyyy-MM-dd']).default('d MMM yyyy'),
    academicYear: z.string().default('2026–2027'),
  }),
  otp: z.object({
    expirySeconds: z.number().int().min(30).max(900).default(120),
    codeLength: z.union([z.literal(4), z.literal(6)]).default(6),
    /** Max sends per phone within resendWindowMinutes. */
    resendLimit: z.number().int().min(1).max(10).default(3),
    resendWindowMinutes: z.number().int().min(1).max(1440).default(30),
    resendCooldownSeconds: z.number().int().min(15).max(600).default(60),
    maxAttempts: z.number().int().min(1).max(20).default(5),
    lockoutMinutes: z.number().int().min(1).max(1440).default(30),
    /** Failed verifications per phone (across codes) before lockout. */
    lockoutThreshold: z.number().int().min(1).max(100).default(10),
    provider: z.enum(['korek', 'twilio', 'whatsapp']).default('korek'),
    fallbackProvider: z.enum(['none', 'korek', 'twilio', 'whatsapp']).default('whatsapp'),
    /** Non-production only: accepted for phones in devBypassPhones (or every phone when devBypassAllPhones). */
    devBypassCode: z.string().regex(/^\d{4,6}$/).nullable().default('123456'),
    devBypassPhones: z.array(z.string()).default(['+9647701234567']),
    devBypassAllPhones: z.boolean().default(false),
  }),
  support: z.object({
    phone: z.string().default(''),
    whatsapp: z.string().default(''),
    email: z.string().default(''),
    hours: localized(),
    address: localized(),
    facebook: z.string().default(''),
    instagram: z.string().default(''),
    telegram: z.string().default(''),
    youtube: z.string().default(''),
    tiktok: z.string().default(''),
  }),
  payments: z.object({
    gateways: z
      .array(
        z.object({
          id: z.enum(GATEWAY_IDS),
          enabled: z.boolean(),
          feeRatePct: z.number().min(0).max(20),
          name: z.object({ en: z.string(), ar: z.string() }),
          color: z.string(),
          displayOrder: z.number().int(),
        }),
      )
      .default([]),
    mockGatewayEnabled: z.boolean().default(true),
    receiptCompany: z
      .object({ name: z.object({ en: z.string(), ar: z.string() }), address: z.object({ en: z.string(), ar: z.string() }), email: z.string() })
      .default({ name: { en: 'EDUWAY', ar: 'إيدوواي' }, address: { en: 'Baghdad, Iraq', ar: 'بغداد، العراق' }, email: 'billing@eduway.iq' }),
    taxNote: localized('Prices include all applicable taxes.', 'الأسعار تشمل جميع الضرائب المطبقة.'),
  }),
  learning: z.object({
    quizQuestionCount: z.number().int().min(1).max(50).default(5),
    quizPassMark: z.number().int().min(0).max(100).default(60),
    examDefaultPassMark: z.number().int().min(0).max(100).default(50),
    practiceSessionSizes: z.array(z.number().int().positive()).default([10, 20, 50]),
    practiceMaxSize: z.number().int().min(1).max(500).default(100),
    dailyGoalMinutes: z.number().int().min(15).max(600).default(120),
    watchHeartbeatSeconds: z.number().int().min(5).max(120).default(10),
    examAutosaveSeconds: z.number().int().min(5).max(300).default(15),
    examGraceSeconds: z.number().int().min(0).max(600).default(30),
    gradeBands: z
      .array(z.object({ key: z.string(), min: z.number() }))
      .default([
        { key: 'excellent', min: 90 },
        { key: 'veryGood', min: 80 },
        { key: 'good', min: 70 },
        { key: 'pass', min: 50 },
        { key: 'needsWork', min: 0 },
      ]),
    heatmapLevels: z.array(z.number()).default([0, 25, 50, 80, 120]),
    avatarPresets: z.array(z.string()).default([]),
  }),
  marketing: z.object({
    stats: z
      .object({ satisfactionPct: z.number(), passRatePct: z.number(), rating: z.number(), ratingCount: z.number().int() })
      .default({ satisfactionPct: 97, passRatePct: 94, rating: 4.9, ratingCount: 12000 }),
    displayOverrides: z.record(z.enum(['students', 'lessons', 'questions']), z.string()).default({}),
    appLinks: z.object({ appStore: z.string().nullable(), googlePlay: z.string().nullable() }).default({ appStore: null, googlePlay: null }),
  }),
  security: z.object({
    adminMfaMandatory: z.boolean().default(false),
    adminSessionHours: z.number().int().min(1).max(720).default(12),
    passwordMinLength: z.number().int().min(10).max(64).default(10),
  }),
  auth: z.object({
    adminLockoutAttempts: z.number().int().min(3).max(50).default(5),
    adminLockoutMinutes: z.number().int().min(1).max(1440).default(15),
    inviteExpiryHours: z.number().int().min(1).max(720).default(168),
    passwordResetExpiryMinutes: z.number().int().min(5).max(1440).default(60),
    requireLegalAcceptance: z.boolean().default(true),
    rememberRefreshDays: z.number().int().min(1).max(90).default(30),
    shortRefreshHours: z.number().int().min(1).max(72).default(12),
  }),
} as const;

export type SettingsKey = keyof typeof SETTINGS_SCHEMAS;
export type SettingsValue<K extends SettingsKey> = z.infer<(typeof SETTINGS_SCHEMAS)[K]>;

export const appSettingsSchema = z.object({
  minVersionIos: z.string().regex(/^\d+\.\d+\.\d+$/),
  minVersionAndroid: z.string().regex(/^\d+\.\d+\.\d+$/),
  latestVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  forceUpdate: z.boolean(),
  storeUrlIos: z.string().nullable(),
  storeUrlAndroid: z.string().nullable(),
  maintenanceMode: z.boolean(),
  maintenanceMessage: z.object({ en: z.string(), ar: z.string() }),
  maintenancePlatforms: z.array(z.enum(['web', 'ios', 'android'])),
  deviceLimit: z.number().int().min(1).max(20),
  sessionTimeoutMinutes: z.number().int().min(5),
  updatedAt: z.string().nullable(),
});
export type AppSettings = z.infer<typeof appSettingsSchema>;

export const DEFAULT_APP_SETTINGS: AppSettings = {
  minVersionIos: '1.0.0',
  minVersionAndroid: '1.0.0',
  latestVersion: '1.0.0',
  forceUpdate: false,
  storeUrlIos: null,
  storeUrlAndroid: null,
  maintenanceMode: false,
  maintenanceMessage: { en: '', ar: '' },
  maintenancePlatforms: ['web', 'ios', 'android'],
  deviceLimit: 2,
  sessionTimeoutMinutes: 43_200,
  updatedAt: null,
};

interface AppSettingsRow {
  min_version_ios: string;
  min_version_android: string;
  latest_version: string;
  force_update: boolean;
  store_url_ios: string | null;
  store_url_android: string | null;
  maintenance_mode: boolean;
  maintenance_message_en: string;
  maintenance_message_ar: string;
  maintenance_platforms: string[];
  device_limit: number;
  session_timeout_minutes: number;
  updated_at: Date;
}

export function mapAppSettings(r: AppSettingsRow | null): AppSettings {
  if (!r) return DEFAULT_APP_SETTINGS;
  return {
    minVersionIos: r.min_version_ios,
    minVersionAndroid: r.min_version_android,
    latestVersion: r.latest_version,
    forceUpdate: r.force_update,
    storeUrlIos: r.store_url_ios,
    storeUrlAndroid: r.store_url_android,
    maintenanceMode: r.maintenance_mode,
    maintenanceMessage: { en: r.maintenance_message_en, ar: r.maintenance_message_ar },
    maintenancePlatforms: r.maintenance_platforms as AppSettings['maintenancePlatforms'],
    deviceLimit: r.device_limit,
    sessionTimeoutMinutes: r.session_timeout_minutes,
    updatedAt: r.updated_at.toISOString(),
  };
}

const CACHE_MS = 30_000;
const cache = new TtlCache<unknown>(CACHE_MS);

async function loadGroup<K extends SettingsKey>(key: K, ex?: Executor): Promise<SettingsValue<K>> {
  const row = await db.maybeOne<{ value: unknown }>(`SELECT value FROM ${T.settings} WHERE key = $1`, [key], ex);
  const schema = SETTINGS_SCHEMAS[key] as z.ZodTypeAny;
  const parsed = schema.safeParse(row?.value ?? {});
  // Corrupt/partial values never break the app: fall back to defaults for invalid fields.
  return (parsed.success ? parsed.data : schema.parse({})) as SettingsValue<K>;
}

export const settingsStore = {
  async get<K extends SettingsKey>(key: K): Promise<SettingsValue<K>> {
    return (await cache.getOrLoad(`g:${key}`, () => loadGroup(key))) as SettingsValue<K>;
  },

  /** Merge-update a group (validated), returns the new value. */
  async set<K extends SettingsKey>(key: K, patch: Partial<SettingsValue<K>>, updatedBy: string | null, ex?: Executor): Promise<SettingsValue<K>> {
    const current = await loadGroup(key, ex);
    const next = (SETTINGS_SCHEMAS[key] as z.ZodTypeAny).parse({ ...current, ...patch }) as SettingsValue<K>;
    await db.query(
      `INSERT INTO ${T.settings} (key, value, updated_by) VALUES ($1, $2, $3)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by`,
      [key, JSON.stringify(next), updatedBy],
      ex,
    );
    cache.delete(`g:${key}`);
    return next;
  },

  async app(): Promise<AppSettings> {
    return (await cache.getOrLoad('app', async () => {
      const row = await db.maybeOne<AppSettingsRow>(`SELECT * FROM ${T.app_settings} WHERE id = 1`);
      return mapAppSettings(row);
    })) as AppSettings;
  },

  async flags(): Promise<Record<string, boolean>> {
    return (await cache.getOrLoad('flags', async () => {
      const rows = await db.many<{ key: string; enabled: boolean }>(`SELECT key, enabled FROM ${T.feature_flags}`);
      return Object.fromEntries(rows.map((r) => [r.key, r.enabled]));
    })) as Record<string, boolean>;
  },

  /** Feature flag value; unknown flags default to `fallback`. */
  async flag(key: string, fallback = false): Promise<boolean> {
    const flags = await this.flags();
    return flags[key] ?? fallback;
  },

  invalidate(scope?: 'app' | 'flags' | SettingsKey): void {
    if (!scope) cache.clear();
    else if (scope === 'app' || scope === 'flags') cache.delete(scope);
    else cache.delete(`g:${scope}`);
  },
};
