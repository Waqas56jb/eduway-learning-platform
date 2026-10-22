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

  SMS_PROVIDER: z.enum(['mock', 'http']).default('mock'),
  SMS_HTTP_URL: z.string().url().optional(),
  SMS_HTTP_TOKEN: z.string().optional(),

  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.string().default('EDUWAY <no-reply@eduway.iq>'),

  // ── AI tutor providers (Agent D). Without a key for the configured provider the offline MockAiProvider is used. ──
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().url().default('https://api.openai.com/v1'),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_BASE_URL: z.string().url().default('https://api.anthropic.com'),
  AZURE_OPENAI_API_KEY: z.string().optional(),
  /** e.g. https://<resource>.openai.azure.com/openai/deployments/<deployment> */
  AZURE_OPENAI_BASE_URL: z.string().url().optional(),
  /** Force the offline mock tutor even when an API key is present (demos / CI). */
  AI_FORCE_MOCK: bool(false),
  /** Embedding model for pgvector retrieval (OpenAI-compatible /embeddings). */
  AI_EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),

  // ── Notification channels (Agent D) ──
  /** `auto` = Expo in production, mock elsewhere. */
  PUSH_PROVIDER: z.enum(['auto', 'expo', 'mock']).default('auto'),
  EXPO_ACCESS_TOKEN: z.string().optional(),
  /** HMAC secret for WHK-03 delivery receipts (header X-Signature = hex sha256 of the raw body). */
  NOTIFICATION_WEBHOOK_SECRET: z.string().optional(),

  JOBS_ENABLED: bool(true),
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
  FASTPAY_STORE_ID: z.string().optional(),
  FASTPAY_SECRET: z.string().optional(),
  QICARD_TERMINAL_ID: z.string().optional(),
  QICARD_SECRET: z.string().optional(),
  ASIAHAWALA_MERCHANT_ID: z.string().optional(),
  ASIAHAWALA_SECRET: z.string().optional(),
  VISA_MERCHANT_ID: z.string().optional(),
  VISA_SECRET: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}\nSee server/.env.example`);
  }
  return parsed.data;
}

export const env: Env = loadEnv();
export const isProd = env.NODE_ENV === 'production';
export const isTestEnv = env.NODE_ENV === 'test' || env.TEST;
export const isDev = env.NODE_ENV === 'development';
