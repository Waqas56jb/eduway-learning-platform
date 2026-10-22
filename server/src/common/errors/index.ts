/**
 * Error classes (docs/API_CONTRACT.md §0.2–0.3). `code` is a CLOSED set; domain causes are `reason`s that end up
 * in `error.details.reason` and pick the localized message. The central errorHandler renders:
 *   { success: false, error: { code, message (localized via Accept-Language), details: { reason?, ... } } }
 *
 *   throw new NotFoundError('lesson');
 *   throw new BusinessRuleError('INVALID_TRANSITION', { from, to });          // 422
 *   throw new UnauthorizedError('OTP_INVALID', { attemptsLeft: 2 });          // 401
 *   throw new RateLimitError(42, 'OTP_RESEND_COOLDOWN');                      // 429 + Retry-After
 *   throw new PaymentRequiredError({ reason: 'NO_SUBSCRIPTION', subjectId, packageIds });
 */
import type { ErrorCode, ErrorReason, MessageParams } from '../i18n/index.js';

export interface AppErrorOptions {
  /** Domain cause → `details.reason` and the localized message. */
  reason?: ErrorReason;
  /** Extra machine-readable data merged into `error.details`. */
  details?: Record<string, unknown>;
  /** Values interpolated into the localized message (`{minutes}` …). Defaults to `details`. */
  params?: MessageParams;
  cause?: unknown;
  /** Response headers to set (e.g. Retry-After). */
  headers?: Record<string, string>;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly reason?: ErrorReason;
  readonly details?: Record<string, unknown>;
  readonly params?: MessageParams;
  readonly headers?: Record<string, string>;

  constructor(code: ErrorCode, status: number, opts: AppErrorOptions = {}) {
    super(opts.reason ? `${code}:${opts.reason}` : code, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = new.target.name;
    this.code = code;
    this.status = status;
    this.reason = opts.reason;
    this.details = opts.details;
    this.params = opts.params ?? (opts.details as MessageParams | undefined);
    this.headers = opts.headers;
  }

  /** `error.details` as sent to the client. */
  toDetails(): Record<string, unknown> | undefined {
    if (!this.reason && !this.details) return undefined;
    return { ...(this.reason ? { reason: this.reason } : {}), ...(this.details ?? {}) };
  }
}

/** 400 — `details.fields` = { "path.to.field": "localized message" } (filled by the error handler). */
export class ValidationError extends AppError {
  readonly issues: { path: string; message: string }[];
  constructor(issues: { path: string; message: string }[], reason?: ErrorReason) {
    super('VALIDATION_ERROR', 400, { reason });
    this.issues = issues;
  }
}

export class UnauthorizedError extends AppError {
  constructor(reason?: ErrorReason, details?: Record<string, unknown>) {
    super('UNAUTHORIZED', 401, { reason, details });
  }
}

export class TokenExpiredError extends AppError {
  constructor() {
    super('TOKEN_EXPIRED', 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(reason?: ErrorReason, details?: Record<string, unknown>) {
    super('FORBIDDEN', 403, { reason, details });
  }
}

/** LockedPayload (§1.4). */
export type LockedReason = 'NO_SUBSCRIPTION' | 'SUBJECT_NOT_IN_PACKAGE' | 'EXPIRED' | 'AI_NOT_INCLUDED';
export interface LockedPayload {
  reason: LockedReason;
  subjectId?: string;
  subjectSlug?: string;
  packageIds?: string[];
}

/** 402 SUBSCRIPTION_REQUIRED, `details.locked`. */
export class PaymentRequiredError extends AppError {
  constructor(locked: LockedPayload) {
    super('SUBSCRIPTION_REQUIRED', 402, { reason: locked.reason, details: { locked } });
  }
}

/** 403 NOT_ENTITLED, `details.locked`. */
export class NotEntitledError extends AppError {
  constructor(locked: LockedPayload) {
    super('NOT_ENTITLED', 403, { reason: locked.reason, details: { locked } });
  }
}

export class NotFoundError extends AppError {
  constructor(entity = 'resource', reason?: ErrorReason) {
    super('NOT_FOUND', 404, { reason, details: { entity }, params: { entity } });
  }
}

export class ConflictError extends AppError {
  constructor(reason?: ErrorReason, details?: Record<string, unknown>) {
    super('CONFLICT', 409, { reason, details });
  }
}

/** 422 BUSINESS_RULE — always carries `details.reason`. */
export class BusinessRuleError extends AppError {
  constructor(reason: ErrorReason, details?: Record<string, unknown>) {
    super('BUSINESS_RULE', 422, { reason, details });
  }
}

/** 429 — `details.retryAfterSeconds` + Retry-After header. */
export class RateLimitError extends AppError {
  constructor(retryAfterSeconds: number, reason?: ErrorReason, details?: Record<string, unknown>) {
    const s = Math.max(1, Math.ceil(retryAfterSeconds));
    super('RATE_LIMITED', 429, {
      reason,
      details: { retryAfterSeconds: s, ...details },
      params: { seconds: s, minutes: Math.ceil(s / 60), ...details } as MessageParams,
      headers: { 'Retry-After': String(s) },
    });
  }
}

/** 503 — dependency down (code INTERNAL, reason SERVICE_UNAVAILABLE). */
export class ServiceUnavailableError extends AppError {
  constructor(details?: Record<string, unknown>) {
    super('INTERNAL', 503, { reason: 'SERVICE_UNAVAILABLE', details });
  }
}

export const isAppError = (e: unknown): e is AppError => e instanceof AppError;

/**
 * Per-item failure for bulk endpoints (SEC-18): AppErrors keep their code/reason/message; anything else (pg errors,
 * driver errors) is reported as INTERNAL without its raw message — raw SQL/constraint text must not reach clients.
 */
export function bulkItemError(err: unknown): { code: string; reason?: string; message: string } {
  if (err instanceof AppError) return { code: err.code, reason: err.details?.reason as string | undefined ?? err.reason, message: err.message };
  return { code: 'INTERNAL', message: 'INTERNAL' };
}
