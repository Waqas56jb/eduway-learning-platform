import { createRequire } from 'node:module';
import { pino, type Logger } from 'pino';
import { env, isDev } from './env.js';

/** pino-pretty is a devDependency: never assume it exists (production images omit dev deps). */
function prettyAvailable(): boolean {
  try {
    createRequire(import.meta.url).resolve('pino-pretty');
    return true;
  } catch {
    return false;
  }
}

/** Paths redacted from every log line (auth headers, tokens, passwords, OTP codes, secrets). */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'req.headers["idempotency-key"]',
  'res.headers["set-cookie"]',
  '*.password',
  '*.newPassword',
  '*.currentPassword',
  '*.passwordHash',
  '*.password_hash',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.registrationToken',
  '*.mfaToken',
  '*.secret',
  '*.mfaSecret',
  '*.mfa_secret',
  '*.totp',
  '*.otp',
  '*.otpCode',
  '*.apiKey',
  '*.serviceRoleKey',
  '*.connectionString',
  'body.password',
  'body.code',
  'body.refreshToken',
  'body.totp',
];

export const logger: Logger = pino({
  level: env.LOG_LEVEL ?? (env.NODE_ENV === 'test' ? 'silent' : isDev ? 'debug' : 'info'),
  base: { service: 'eduway-server' },
  redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(isDev && prettyAvailable()
    ? { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname,service' } } }
    : {}),
});

/** Remove credentials from a postgres URL before it is ever printed. */
export function maskConnectionString(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = '****';
    if (u.username) u.username = `${u.username.slice(0, 4)}…`;
    return u.toString();
  } catch {
    return '[unparseable connection string]';
  }
}
