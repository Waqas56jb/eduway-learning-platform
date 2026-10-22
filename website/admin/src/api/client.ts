/* Axios instance for the EDUWAY admin API (docs/ENGINEERING.md §5, docs/API_CONTRACT.md §0).
 *
 * - baseURL = VITE_API_URL (default http://localhost:4100/api/v1)
 * - Accept-Language from i18n, Bearer admin token, X-Request-Id, X-Client-Platform=admin, X-Device-Id
 * - Envelope unwrapping: `api.get<T>()` helpers return `data` (and `meta` for lists)
 * - 401 TOKEN_EXPIRED → single-flight POST /auth/refresh → retry once; refresh failure → logout
 * - Every failure is normalized into `ApiError` (code, status, reason, fields, localized message)
 */
import axios, { AxiosError, AxiosHeaders, type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios';
import toast from 'react-hot-toast';
import i18n from '@/i18n';
import type { ApiErrorCode, ApiErrorDetails, AuthTokens, ErrorEnvelope, PageMeta, Paged, SuccessEnvelope } from './types';

export const API_URL: string = (import.meta.env.VITE_API_URL || 'http://localhost:4100/api/v1').replace(/\/+$/, '');

// ─── ids ─────────────────────────────────────────────────────────────────────
export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const DEVICE_KEY = 'eduway.admin.deviceId';
export const deviceId: string = (() => {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = uuid();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return uuid();
  }
})();

/** Headers for endpoints marked `idem` in the contract. Pass the same key when retrying the same action. */
export const idempotency = (key: string = uuid()) => ({ headers: { 'Idempotency-Key': key } });

// ─── token storage ("remember me" → localStorage, otherwise sessionStorage) ─
const TOKENS_KEY = 'eduway.admin.tokens';
interface StoredTokens extends AuthTokens {
  remember: boolean;
}
let memTokens: StoredTokens | null = (() => {
  try {
    const raw = localStorage.getItem(TOKENS_KEY) ?? sessionStorage.getItem(TOKENS_KEY);
    return raw ? (JSON.parse(raw) as StoredTokens) : null;
  } catch {
    return null;
  }
})();

export const tokenStore = {
  get: () => memTokens,
  access: () => memTokens?.accessToken ?? null,
  set(tokens: AuthTokens, remember = memTokens?.remember ?? true) {
    memTokens = { ...tokens, remember };
    try {
      const raw = JSON.stringify(memTokens);
      (remember ? localStorage : sessionStorage).setItem(TOKENS_KEY, raw);
      (remember ? sessionStorage : localStorage).removeItem(TOKENS_KEY);
    } catch {
      /* storage unavailable */
    }
  },
  clear() {
    memTokens = null;
    try {
      localStorage.removeItem(TOKENS_KEY);
      sessionStorage.removeItem(TOKENS_KEY);
    } catch {
      /* storage unavailable */
    }
  },
};

/** Registered by the auth store: called when the session can't be refreshed. */
let onAuthLost: () => void = () => {};
export const setAuthLostHandler = (fn: () => void) => {
  onAuthLost = fn;
};

// ─── errors ──────────────────────────────────────────────────────────────────
export class ApiError extends Error {
  code: ApiErrorCode;
  status: number;
  details: ApiErrorDetails;
  requestId: string | null;
  constructor(code: ApiErrorCode, message: string, status = 0, details: ApiErrorDetails = {}, requestId: string | null = null) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
    this.requestId = requestId;
  }
  /** Domain cause, e.g. `HAS_DEPENDENTS`, `INVALID_TRANSITION` (contract §0.3). */
  get reason(): string | undefined {
    return this.details.reason;
  }
  /** Field errors from VALIDATION_ERROR (`details.fields`). */
  get fields(): Record<string, string> {
    return this.details.fields ?? {};
  }
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;

/** Localized, user-facing message. Server message wins (already localized by Accept-Language);
 *  falls back to `apiErrors.reasons.<REASON>` / `apiErrors.<CODE>` i18n keys. */
export function errorMessage(err: unknown): string {
  if (isApiError(err)) {
    const reasonKey = err.reason ? `apiErrors.reasons.${err.reason}` : null;
    if (reasonKey && i18n.exists(reasonKey) && !err.message) return i18n.t(reasonKey, err.details);
    if (err.message) return err.message;
    if (reasonKey && i18n.exists(reasonKey)) return i18n.t(reasonKey, err.details);
    const codeKey = `apiErrors.${err.code}`;
    return i18n.exists(codeKey) ? i18n.t(codeKey) : i18n.t('apiErrors.INTERNAL');
  }
  if (err instanceof Error && err.message) return err.message;
  return i18n.t('apiErrors.INTERNAL');
}

/** Toast a normalized error (deduplicated by message). */
export function toastError(err: unknown) {
  const msg = errorMessage(err);
  toast.error(msg, { id: `err:${msg}` });
}

async function normalize(error: unknown): Promise<ApiError> {
  if (isApiError(error)) return error;
  if (axios.isCancel(error)) return new ApiError('CANCELLED', 'cancelled', 0);
  const ax = error as AxiosError<ErrorEnvelope | Blob>;
  const res = ax.response;
  const requestId = (res?.headers?.['x-request-id'] as string | undefined) ?? null;
  if (!res) return new ApiError('NETWORK_ERROR', i18n.t('apiErrors.NETWORK_ERROR'), 0, {}, requestId);
  let body: unknown = res.data;
  if (body instanceof Blob) {
    try {
      body = JSON.parse(await body.text());
    } catch {
      body = null;
    }
  }
  const env = body as ErrorEnvelope | null;
  if (env && env.success === false && env.error) {
    const details = { ...(env.error.details ?? {}) };
    if (res.status === 429 && details.retryAfterSeconds == null) {
      const ra = Number(res.headers?.['retry-after']);
      if (!Number.isNaN(ra)) details.retryAfterSeconds = ra;
    }
    return new ApiError(env.error.code, env.error.message, res.status, details, requestId);
  }
  const fallback: Record<number, ApiErrorCode> = {
    400: 'VALIDATION_ERROR',
    401: 'UNAUTHORIZED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    409: 'CONFLICT',
    422: 'BUSINESS_RULE',
    429: 'RATE_LIMITED',
  };
  const code = fallback[res.status] ?? 'INTERNAL';
  return new ApiError(code, i18n.t(`apiErrors.${code}`), res.status, {}, requestId);
}

// ─── axios instance ──────────────────────────────────────────────────────────
export const http = axios.create({ baseURL: API_URL, timeout: 60_000 });

http.interceptors.request.use((config) => {
  const headers = AxiosHeaders.from(config.headers);
  headers.set('Accept-Language', i18n.language === 'ar' ? 'ar' : 'en');
  if (!headers.has('X-Request-Id')) headers.set('X-Request-Id', uuid());
  headers.set('X-Client-Platform', 'admin');
  headers.set('X-Device-Id', deviceId);
  const token = tokenStore.access();
  if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
  config.headers = headers;
  return config;
});

let refreshing: Promise<string | null> | null = null;

/** Single-flight refresh: concurrent 401s share one POST /auth/refresh. */
export function refreshAccessToken(): Promise<string | null> {
  if (refreshing) return refreshing;
  const current = tokenStore.get();
  if (!current?.refreshToken) return Promise.resolve(null);
  refreshing = axios
    .post<SuccessEnvelope<AuthTokens>>(
      `${API_URL}/auth/refresh`,
      { refreshToken: current.refreshToken },
      {
        headers: {
          'Accept-Language': i18n.language === 'ar' ? 'ar' : 'en',
          'X-Request-Id': uuid(),
          'X-Client-Platform': 'admin',
          'X-Device-Id': deviceId,
        },
      },
    )
    .then((r) => {
      tokenStore.set(r.data.data, current.remember);
      return r.data.data.accessToken;
    })
    .catch(() => null)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

const NO_REFRESH = ['/auth/refresh', '/auth/admin/login', '/auth/admin/mfa/verify', '/auth/admin/forgot-password', '/auth/admin/reset-password', '/auth/admin/accept-invite'];

http.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const config = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
    const status = error.response?.status;
    const url = config?.url ?? '';
    const code = (error.response?.data as ErrorEnvelope | undefined)?.error?.code;
    const canRefresh = config && !config._retried && !NO_REFRESH.some((p) => url.includes(p)) && !!tokenStore.get()?.refreshToken;
    if (status === 401 && canRefresh && (code === 'TOKEN_EXPIRED' || code === 'UNAUTHORIZED' || !code)) {
      config._retried = true;
      const token = await refreshAccessToken();
      if (token) {
        const headers = AxiosHeaders.from(config.headers);
        headers.set('Authorization', `Bearer ${token}`);
        config.headers = headers;
        return http(config);
      }
      tokenStore.clear();
      onAuthLost();
    } else if (status === 401 && config?._retried) {
      tokenStore.clear();
      onAuthLost();
    }
    throw await normalize(error);
  },
);

// ─── typed helpers (envelope unwrapping) ─────────────────────────────────────
export type Query = Record<string, unknown>;

/** Drop empty filter values; arrays are sent comma-separated (contract §0.6). */
export function cleanParams(params?: Query): Record<string, string | number | boolean> | undefined {
  if (!params) return undefined;
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '' || v === 'all') continue;
    if (Array.isArray(v)) {
      if (v.length) out[k] = v.join(',');
    } else if (typeof v === 'object') {
      out[k] = JSON.stringify(v);
    } else {
      out[k] = v as string | number | boolean;
    }
  }
  return out;
}

async function unwrap<T>(p: Promise<{ data: SuccessEnvelope<T> }>): Promise<T> {
  const res = await p;
  return res.data.data;
}

export const api = {
  get: <T>(url: string, params?: Query, config?: AxiosRequestConfig) =>
    unwrap<T>(http.get(url, { ...config, params: cleanParams(params) })),
  /** GET a paginated list → `{ items, meta }`. */
  list: async <T>(url: string, params?: Query, config?: AxiosRequestConfig): Promise<Paged<T>> => {
    const res = await http.get<SuccessEnvelope<T[]>>(url, { ...config, params: cleanParams(params) });
    const items = res.data.data ?? [];
    const meta: PageMeta = res.data.meta ?? { page: 1, pageSize: items.length, total: items.length, nextCursor: null };
    return { items, meta };
  },
  post: <T>(url: string, body?: unknown, config?: AxiosRequestConfig) => unwrap<T>(http.post(url, body ?? {}, config)),
  put: <T>(url: string, body?: unknown, config?: AxiosRequestConfig) => unwrap<T>(http.put(url, body ?? {}, config)),
  patch: <T>(url: string, body?: unknown, config?: AxiosRequestConfig) => unwrap<T>(http.patch(url, body ?? {}, config)),
  delete: <T>(url: string, config?: AxiosRequestConfig) => unwrap<T>(http.delete(url, config)),
};

// ─── file downloads (exports, receipts, templates) ───────────────────────────
function filenameFrom(disposition: string | undefined, fallback: string) {
  if (!disposition) return fallback;
  const star = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  if (star) return decodeURIComponent(star[1]);
  const plain = /filename="?([^";]+)"?/i.exec(disposition);
  return plain ? plain[1] : fallback;
}

export function saveBlob(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

/** Request a file (non-envelope response) and save it. `POST` for exports, `GET` for templates/receipts. */
export async function download(
  url: string,
  opts: { method?: 'GET' | 'POST'; body?: unknown; params?: Query; fallbackName?: string } = {},
): Promise<string> {
  const res = await http.request<Blob>({
    url,
    method: opts.method ?? (opts.body ? 'POST' : 'GET'),
    data: opts.body,
    params: cleanParams(opts.params),
    responseType: 'blob',
  });
  const name = filenameFrom(res.headers['content-disposition'] as string | undefined, opts.fallbackName ?? 'download');
  saveBlob(res.data, name);
  return name;
}
