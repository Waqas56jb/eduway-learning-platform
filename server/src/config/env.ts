/**
 * Environment configuration — the ONLY place that reads secrets from process.env.
 * Validated with zod at startup. Secrets are never logged (see logger.ts redaction); validation
 * errors print variable NAMES only.
 */
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

loadDotenv({ quiet: true } as Parameters<typeof loadDotenv>[0]);

const bool = (def: boolean) =>
  z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((v) =>
      v === undefined || v === '' ? def : typeof v === 'boolean' ? v : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase()),
    );

/** Tri-state boolean: undefined when unset (the caller picks the default). */
const optBool = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((v) => (v === undefined || v === '' ? undefined : typeof v === 'boolean' ? v : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())));

const csv = z
  .string()
  .optional()
  .transform((v) =>
    (v ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );

export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  API_PREFIX: z.string().default('/api/v1'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
  /** TEST=1 switches every DB object to the eduway_platform_test_ prefix (integration tests only). */
  TEST: z
    .string()
    .optional()
    .transform((v) => v === '1'),

  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  SUPABASE_SECRET_KEY: z.string().optional(),
  SUPABASE_DB_URL: z.string().min(10),
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),
  DB_SSL: bool(true),
  DB_STATEMENT_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  DB_CONNECT_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  /** Mirror students/admins into Supabase Auth (app_metadata.app = "eduway_platform"). Best effort. */
  SUPABASE_AUTH_MIRROR: bool(true),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ADMIN_SECRET: z.string().min(32),
  JWT_ISSUER: z.string().default('eduway-platform'),
  ACCESS_TOKEN_TTL_SEC: z.coerce.number().int().positive().default(15 * 60),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  ADMIN_ACCESS_TOKEN_TTL_SEC: z.coerce.number().int().positive().default(15 * 60),
  ADMIN_REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),

  CORS_ORIGINS: csv,
  ADMIN_APP_URL: z.string().url().default('http://localhost:5174'),
  USER_APP_URL: z.string().url().default('http://localhost:5173'),

  // ── SMS / WhatsApp (OTP + notifications). A real provider without its credentials falls back to the mock. ──
  SMS_PROVIDER: z.enum(['mock', 'http', 'twilio', 'whatsapp_cloud']).default('mock'),
  /** Provider for the `whatsapp` channel; defaults to SMS_PROVIDER. `baileys` = number linked by QR in the admin portal. */
  WHATSAPP_PROVIDER: z.enum(['mock', 'http', 'twilio', 'whatsapp_cloud', 'baileys']).optional(),
  /** Secret for the AES-256-GCM encryption of the Baileys WhatsApp session stored in the database (≥ 32 chars). */
  WHATSAPP_SESSION_SECRET: z.string().min(32).optional(),
  SMS_HTTP_URL: z.string().url().optional(),
  SMS_HTTP_TOKEN: z.string().optional(),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  /** E.164 sender number for SMS (or use TWILIO_MESSAGING_SERVICE_SID). */
  TWILIO_FROM: z.string().optional(),
  TWILIO_MESSAGING_SERVICE_SID: z.string().optional(),
  /** E.164 WhatsApp-enabled sender (without the `whatsapp:` prefix). */
  TWILIO_WHATSAPP_FROM: z.string().optional(),
  /** Approved WhatsApp Content template SID (HX…) used for OTPs; variable {{1}} = code. */
  TWILIO_WHATSAPP_CONTENT_SID: z.string().optional(),
  WHATSAPP_CLOUD_TOKEN: z.string().optional(),
  WHATSAPP_CLOUD_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_CLOUD_API_VERSION: z.string().default('v21.0'),
  /** Approved authentication template name (body {{1}} = code, copy-code URL button). */
  WHATSAPP_CLOUD_OTP_TEMPLATE: z.string().optional(),
  WHATSAPP_CLOUD_TEMPLATE_LANG: z.string().default('ar'),
  /** Set false when the OTP template has no copy-code/URL button. */
  WHATSAPP_CLOUD_OTP_BUTTON: bool(true),
  /** Optional utility template (body {{1}} = message text) for notifications outside the 24h window. */
  WHATSAPP_CLOUD_NOTIFY_TEMPLATE: z.string().optional(),

  // ── Email ── unset EMAIL_PROVIDER = smtp when SMTP settings exist, else mock (logs).
  EMAIL_PROVIDER: z.enum(['mock', 'smtp']).optional(),
  SMTP_URL: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  /** Implicit TLS (port 465). Defaults to true on port 465, STARTTLS otherwise. */
  SMTP_SECURE: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((v) => (v === undefined || v === '' ? undefined : typeof v === 'boolean' ? v : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase()))),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().default('EDUWAY <no-reply@eduway.iq>'),
  /** Outgoing email throttle (messages per minute across the process); excess deliveries wait for the next window. */
  MAIL_RATE_PER_MINUTE: z.coerce.number().int().positive().default(20),

  // ── AI tutor providers (Agent D). Without a key for the configured provider the offline MockAiProvider is used. ──
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().url().default('https://api.openai.com/v1'),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_BASE_URL: z.string().url().default('https://api.anthropic.com'),
  AZURE_OPENAI_API_KEY: z.string().optional(),
  /** e.g. https://<resource>.openai.azure.com/openai/deployments/<deployment> */
  AZURE_OPENAI_BASE_URL: z.string().url().optional(),
  /** Overrides the admin-selected provider (ai_settings.provider). Unset = use the admin setting. */
  AI_PROVIDER: z.enum(['mock', 'anthropic', 'openai', 'azure']).optional(),
  /** Model used when the configured model belongs to another provider family. */
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-5-5'),
  OPENAI_MODEL: z.string().default('gpt-6-luna'),
  /** `reasoning_effort` sent to OpenAI reasoning models (gpt-5+/gpt-6/o-series); ignored for gpt-4o-style models. */
  OPENAI_REASONING_EFFORT: z.enum(['none', 'minimal', 'low', 'medium', 'high']).default('low'),
  /** Anthropic server-side refusal fallback (`fallbacks: "default"`); disable for proxies that reject betas. */
  ANTHROPIC_SERVER_FALLBACK: bool(true),
  /** Force the offline mock tutor even when an API key is present (demos / CI). */
  AI_FORCE_MOCK: bool(false),
  /** Embedding model for pgvector retrieval (OpenAI-compatible /embeddings). */
  AI_EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  /** Embedding price (USD per 1M tokens) used only for the knowledge-base index cost estimate. */
  AI_EMBEDDING_COST_PER_1M_USD: z.coerce.number().min(0).default(0.02),

  // ── Notification channels (Agent D) ──
  /** `auto` = Expo in production, mock elsewhere. */
  PUSH_PROVIDER: z.enum(['auto', 'expo', 'mock']).default('auto'),
  EXPO_ACCESS_TOKEN: z.string().optional(),
  /** HMAC secret for WHK-03 delivery receipts (header X-Signature = hex sha256 of the raw body). */
  NOTIFICATION_WEBHOOK_SECRET: z.string().optional(),

  JOBS_ENABLED: bool(true),

  // ── Dev-only behaviours (SEC-21). Each is OFF in production (the server refuses to start when one is set to
  //    true there). Outside production an unset flag defaults to ON only when NODE_ENV is EXPLICITLY
  //    `development` or `test`; with NODE_ENV unset every one of them is off. ──
  /** Serve Swagger UI + openapi.json (/api/docs). Never in production (SEC-09). */
  API_DOCS_PUBLIC: optBool,
  /** Accept the settings `otp.devBypassCode` (e.g. 123456) for the configured demo phones. */
  DEV_OTP_BYPASS: optBool,
  /** Allow any localhost / private-LAN browser origin through CORS (Expo web, phones on the LAN). */
  DEV_LAN_CORS: optBool,
  /** MockGateway + POST /payments/mock/:id/confirm; real gateways without credentials confirm through it. */
  DEV_MOCK_PAYMENTS: optBool,
  /** Accept unsigned WHK-03 delivery receipts while NOTIFICATION_WEBHOOK_SECRET is unset (SEC-25). Default off. */
  DEV_UNSIGNED_NOTIFICATION_WEBHOOKS: optBool,

  /**
   * Express `trust proxy` (SEC-22): how many reverse-proxy hops in front of the API may set X-Forwarded-For.
   *   unset → `loopback` outside production; REQUIRED in production
   *   `1`, `2`… → hop count (Render / Fly / Railway behind their single edge proxy: 1)
   *   `false` / `0` → trust nothing (the API is reached directly)
   *   `10.0.0.0/8,loopback` → explicit proxy addresses / CIDRs / presets (loopback, linklocal, uniquelocal)
   *   `true` → trust every hop (spoofable; rejected in production)
   */
  TRUST_PROXY: z.string().optional(),

  /** Rate-limit counter store (SEC-23): `memory` (per process, default) or `postgres` (shared across instances). */
  RATE_LIMIT_STORE: z.enum(['memory', 'postgres']).default('memory'),

  SIGNED_URL_TTL_SEC: z.coerce.number().int().positive().default(60 * 60),
  SEED_SUPER_ADMIN_EMAIL: z.string().email().default('admin@eduway.iq'),
  SEED_SUPER_ADMIN_PASSWORD: z.string().optional(),

  // ── payments (Agent C) ── gateway credentials are optional; a gateway without credentials is a stub that
  // fails closed in production (PAYMENT_GATEWAY_DISABLED). MOCK_GATEWAY_SECRET signs MockGateway webhooks
  // (derived from JWT_REFRESH_SECRET when unset; the MockGateway never runs in production).
  MOCK_GATEWAY_SECRET: z.string().min(16).optional(),
  PUBLIC_API_URL: z.string().url().optional(),
  PAYMENT_CHECKOUT_TTL_MIN: z.coerce.number().int().positive().default(30),
  ZAINCASH_MERCHANT_ID: z.string().optional(),
  ZAINCASH_SECRET: z.string().optional(),
  /** Merchant wallet MSISDN (e.g. 9647835077893). */
  ZAINCASH_MSISDN: z.string().optional(),
  ZAINCASH_ENV: z.enum(['test', 'live']).default('test'),
  ZAINCASH_LANG: z.enum(['ar', 'en', 'ku']).default('ar'),
  ZAINCASH_SERVICE_TYPE: z.string().default('EDUWAY subscription'),
  FASTPAY_STORE_ID: z.string().optional(),
  /** FastPay store password (kept under the historical name FASTPAY_SECRET). */
  FASTPAY_SECRET: z.string().optional(),
  FASTPAY_ENV: z.enum(['staging', 'live']).default('staging'),
  QICARD_TERMINAL_ID: z.string().optional(),
  /** Qi API password (Basic auth together with QICARD_USERNAME). */
  QICARD_SECRET: z.string().optional(),
  QICARD_USERNAME: z.string().optional(),
  QICARD_ENV: z.enum(['uat', 'live']).default('uat'),
  /** PEM public key published by Qi for notification signatures (optional; status API is always re-checked). */
  QICARD_WEBHOOK_PUBLIC_KEY: z.string().optional(),
  ASIAHAWALA_MERCHANT_ID: z.string().optional(),
  ASIAHAWALA_SECRET: z.string().optional(),
  VISA_MERCHANT_ID: z.string().optional(),
  VISA_SECRET: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

/** Dev-only flags (SEC-21) that must never be enabled in production. */
const DEV_FLAG_VARS = ['API_DOCS_PUBLIC', 'DEV_OTP_BYPASS', 'DEV_LAN_CORS', 'DEV_MOCK_PAYMENTS', 'DEV_UNSIGNED_NOTIFICATION_WEBHOOKS'] as const;

const isLocalUrl = (u: string): boolean => {
  try {
    return /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|0\.0\.0\.0)$/i.test(new URL(u).hostname);
  } catch {
    return true;
  }
};
const isHttpsUrl = (u: string): boolean => {
  try {
    return new URL(u).protocol === 'https:';
  } catch {
    return false;
  }
};

/**
 * Cross-field rules, enforced in production only — the server (and every script) refuses to start with these:
 *  - SEC-06: student and admin tokens must not share a key, or a leaked student-signing key would also mint admin
 *    tokens; the refresh-token HMAC key must differ from both.
 *  - SEC-21: no dev-only flag may be on; the public URLs must be real HTTPS hosts; DB TLS stays on.
 *  - SEC-22: TRUST_PROXY must be set explicitly (and never `true`).
 */
export function envProblems(e: Env): string[] {
  const out: string[] = [];
  if (e.NODE_ENV !== 'production') return out;
  const secrets = [e.JWT_ACCESS_SECRET, e.JWT_ADMIN_SECRET, e.JWT_REFRESH_SECRET];
  if (new Set(secrets).size !== secrets.length) out.push('  - JWT_ACCESS_SECRET / JWT_ADMIN_SECRET / JWT_REFRESH_SECRET: must be three different values in production');
  if (e.CORS_ORIGINS.some((o) => o === '*')) out.push('  - CORS_ORIGINS: wildcard is not allowed in production');
  const insecureOrigins = e.CORS_ORIGINS.filter((o) => o !== '*' && (!isHttpsUrl(o) || isLocalUrl(o)));
  if (insecureOrigins.length) out.push('  - CORS_ORIGINS: production origins must be https:// and not localhost');
  for (const k of DEV_FLAG_VARS) if (e[k] === true) out.push(`  - ${k}: dev-only, must not be enabled in production`);
  if (!e.PUBLIC_API_URL) out.push('  - PUBLIC_API_URL: required in production (public https base of this API)');
  else if (!isHttpsUrl(e.PUBLIC_API_URL) || isLocalUrl(e.PUBLIC_API_URL)) out.push('  - PUBLIC_API_URL: must be a public https:// URL in production');
  for (const k of ['ADMIN_APP_URL', 'USER_APP_URL'] as const) {
    if (!isHttpsUrl(e[k]) || isLocalUrl(e[k])) out.push(`  - ${k}: must be a public https:// URL in production (the localhost default is dev-only)`);
  }
  if (!e.DB_SSL) out.push('  - DB_SSL: must be true in production');
  const tp = (e.TRUST_PROXY ?? '').trim().toLowerCase();
  if (!tp) out.push('  - TRUST_PROXY: required in production — the number of reverse proxies in front of the API (usually 1), or `false`');
  else if (tp === 'true') out.push('  - TRUST_PROXY: `true` trusts every X-Forwarded-For hop (spoofable); use a hop count or proxy addresses');
  return out;
}

export interface DevFlags {
  /** /api/docs (Swagger UI + openapi.json). */
  apiDocs: boolean;
  /** settings `otp.devBypassCode`. */
  otpBypass: boolean;
  /** localhost / private-LAN browser origins through CORS. */
  lanCors: boolean;
  /** MockGateway, mock confirm, stub checkouts for unconfigured gateways. */
  mockPayments: boolean;
  /** Unsigned WHK-03 receipts while NOTIFICATION_WEBHOOK_SECRET is unset. */
  unsignedNotificationWebhooks: boolean;
}

/**
 * SEC-21: dev-only behaviours are opt-in. Production: always off (startup already fails if one is set).
 * Elsewhere an unset flag follows `NODE_ENV` only when it was set EXPLICITLY to `development` / `test` — a deploy
 * that forgets NODE_ENV gets none of them. `DEV_UNSIGNED_NOTIFICATION_WEBHOOKS` is never on by default.
 */
export function resolveDevFlags(e: Pick<Env, 'NODE_ENV' | (typeof DEV_FLAG_VARS)[number]>, rawNodeEnv: string | undefined): DevFlags {
  if (e.NODE_ENV === 'production') return { apiDocs: false, otpBypass: false, lanCors: false, mockPayments: false, unsignedNotificationWebhooks: false };
  const explicitDev = rawNodeEnv === 'development' || rawNodeEnv === 'test';
  const pick = (v: boolean | undefined, def = explicitDev) => v ?? def;
  return {
    apiDocs: pick(e.API_DOCS_PUBLIC),
    otpBypass: pick(e.DEV_OTP_BYPASS),
    lanCors: pick(e.DEV_LAN_CORS),
    mockPayments: pick(e.DEV_MOCK_PAYMENTS),
    unsignedNotificationWebhooks: pick(e.DEV_UNSIGNED_NOTIFICATION_WEBHOOKS, false),
  };
}

/** Express `trust proxy` value from TRUST_PROXY (SEC-22). Unset → `loopback` (only a local dev proxy is trusted). */
export function trustProxySetting(raw: string | undefined): boolean | number | string[] {
  const v = (raw ?? '').trim();
  if (!v) return ['loopback'];
  const lower = v.toLowerCase();
  if (['false', 'no', 'off', '0'].includes(lower)) return false;
  if (lower === 'true') return true;
  if (/^\d+$/.test(v)) return Number(v);
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}\nSee server/.env.example`);
  }
  const problems = envProblems(parsed.data);
  if (problems.length) throw new Error(`Invalid environment configuration:\n${problems.join('\n')}\nSee server/.env.example and docs/DEPLOYMENT.md`);
  return parsed.data;
}

export const env: Env = loadEnv();
export const isProd = env.NODE_ENV === 'production';
export const isTestEnv = env.NODE_ENV === 'test' || env.TEST;
export const isDev = env.NODE_ENV === 'development';
/** Effective dev-only switches (SEC-21) — use these, never `!isProd`, to gate dev conveniences. */
export const devFlags: DevFlags = resolveDevFlags(env, process.env.NODE_ENV);
