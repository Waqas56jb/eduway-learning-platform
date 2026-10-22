import axios, { type AxiosError } from 'axios';
import i18n from '@/i18n';
import { toast } from '@/components/ui/Toast';
import type { ErrorCode, LockedPayload } from './types';

/** Normalized API error (contract §0.2). `message` is already localized (server Accept-Language or i18n). */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly reason: string | null;
  readonly details: Record<string, unknown>;
  readonly requestId: string | null;

  constructor(opts: {
    status: number;
    code: ErrorCode;
    message: string;
    reason?: string | null;
    details?: Record<string, unknown> | null;
    requestId?: string | null;
  }) {
    super(opts.message || fallbackMessage(opts.code, opts.status));
    this.name = 'ApiError';
    this.status = opts.status;
    this.code = opts.code;
    this.reason = opts.reason ?? null;
    this.details = opts.details ?? {};
    this.requestId = opts.requestId ?? null;
  }

  /** 402/403 entitlement lock payload, when present. */
  get locked(): LockedPayload | null {
    const l = this.details.locked;
    return l && typeof l === 'object' ? (l as LockedPayload) : null;
  }

  get isNetwork() {
    return this.code === 'NETWORK_ERROR' || this.code === 'TIMEOUT';
  }

  get fields(): Record<string, string> {
    const f = this.details.fields;
    return f && typeof f === 'object' ? (f as Record<string, string>) : {};
  }

  get retryAfterSeconds(): number | null {
    const v = this.details.retryAfterSeconds;
    return typeof v === 'number' ? v : null;
  }
}

const t = (key: string) => i18n.t(`common:errors.${key}`);

/** i18n fallback when the server did not send a message (or the request never reached it). */
function fallbackMessage(code: ErrorCode, status: number): string {
  switch (code) {
    case 'NETWORK_ERROR':
      return t('network');
    case 'TIMEOUT':
      return t('timeout');
    case 'UNAUTHORIZED':
    case 'TOKEN_EXPIRED':
      return t('sessionExpired');
    case 'SUBSCRIPTION_REQUIRED':
    case 'NOT_ENTITLED':
      return t('locked');
    case 'RATE_LIMITED':
      return t('rateLimited');
    case 'NOT_FOUND':
      return t('notFound');
    case 'VALIDATION_ERROR':
      return t('validation');
    default:
      return status >= 500 ? t('server') : t('generic');
  }
}

interface ErrorBody {
  success?: false;
  error?: { code?: string; message?: string; details?: Record<string, unknown> };
}

/** Turn anything thrown by axios/fetch into an `ApiError`. */
export function normalizeError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (axios.isAxiosError(err)) {
    const e = err as AxiosError<ErrorBody>;
    if (!e.response) {
      const code: ErrorCode = e.code === 'ECONNABORTED' || e.code === 'ETIMEDOUT' ? 'TIMEOUT' : 'NETWORK_ERROR';
      return new ApiError({ status: 0, code, message: fallbackMessage(code, 0) });
    }
    const status = e.response.status;
    const body = e.response.data;
    const rawCode = body?.error?.code;
    const code = (rawCode ?? (status === 401 ? 'UNAUTHORIZED' : status === 404 ? 'NOT_FOUND' : status >= 500 ? 'INTERNAL' : 'BUSINESS_RULE')) as ErrorCode;
    const details = body?.error?.details ?? {};
    const reason = typeof details.reason === 'string' ? details.reason : null;
    const requestId = (e.response.headers?.['x-request-id'] as string | undefined) ?? null;
    return new ApiError({
      status,
      code,
      reason,
      details,
      requestId,
      message: body?.error?.message || fallbackMessage(code, status),
    });
  }
  if (err instanceof Error && err.name === 'AbortError') {
    return new ApiError({ status: 0, code: 'NETWORK_ERROR', message: fallbackMessage('NETWORK_ERROR', 0) });
  }
  return new ApiError({ status: 0, code: 'INTERNAL', message: fallbackMessage('INTERNAL', 0) });
}

export const isLockedError = (err: unknown): boolean => {
  const e = err instanceof ApiError ? err : null;
  return !!e && (e.code === 'SUBSCRIPTION_REQUIRED' || e.code === 'NOT_ENTITLED');
};

export const hasReason = (err: unknown, reason: string): boolean => err instanceof ApiError && err.reason === reason;

/** Errors that are handled globally (session/maintenance/update screens) and must not toast. */
export function isSilentError(err: ApiError): boolean {
  return (
    err.code === 'TOKEN_EXPIRED' ||
    (err.code === 'UNAUTHORIZED' && err.reason === null && err.status === 401 && !err.details.attemptsLeft) ||
    err.reason === 'MAINTENANCE' ||
    err.reason === 'UPDATE_REQUIRED'
  );
}

let lastToast = { message: '', at: 0 };

/** Show the localized error toast (deduplicated within 2.5 s). */
export function toastError(err: unknown): ApiError {
  const e = normalizeError(err);
  if (isSilentError(e)) return e;
  const now = Date.now();
  if (lastToast.message === e.message && now - lastToast.at < 2500) return e;
  lastToast = { message: e.message, at: now };
  toast.show({ message: e.message, tone: 'error', icon: e.isNetwork ? 'wifi-off' : isLockedError(e) ? 'lock' : undefined });
  return e;
}
