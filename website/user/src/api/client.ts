import axios, {
  AxiosError,
  AxiosHeaders,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';
import i18n from '@/i18n';
import type { ApiErrorBody, ApiErrorCode, ApiSuccess, AuthTokens, LockedPayload, Localized, PageMeta, Paged } from './types';
import { apiEvents } from './events';

/**
 * EDUWAY API client (ENGINEERING §5).
 *
 * Token storage tradeoff — the access token (15 min) lives in memory only, so an XSS payload cannot
 * lift it from storage and it disappears with the tab. The refresh token (30 days, rotated on every
 * use, reuse-detection revokes the whole family server-side) is kept in localStorage so a reload or a
 * new tab can silently re-authenticate. That is the pragmatic choice for a static SPA served from a
 * different origin than the API (no shared httpOnly cookie is available); the residual XSS risk is
 * limited by rotation + reuse detection + the strict CSP/escaping React gives us. If the API ever
 * moves behind the same site, switch the refresh token to an httpOnly SameSite cookie.
 */

export const API_URL: string = (import.meta.env.VITE_API_URL || 'http://localhost:4100/api/v1').replace(/\/+$/, '');

const REFRESH_KEY = 'eduway.auth.refresh';
const DEVICE_KEY = 'eduway.device.id';

/* ------------------------------------------------------------------ ids */

export function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // RFC4122 v4 fallback for older browsers.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

let deviceIdCache: string | null = null;
/** Stable per-browser device id (X-Device-Id). */
export function getDeviceId(): string {
  if (deviceIdCache) return deviceIdCache;
  try {
    const stored = localStorage.getItem(DEVICE_KEY);
    if (stored) return (deviceIdCache = stored);
    const id = uuid();
    localStorage.setItem(DEVICE_KEY, id);
    return (deviceIdCache = id);
  } catch {
    return (deviceIdCache = uuid());
  }
}

export const idempotencyKey = () => uuid();

/* ------------------------------------------------------------------ tokens */

let accessToken: string | null = null;
let accessExpiresAt = 0;

function readRefresh(): string | null {
  try {
    return localStorage.getItem(REFRESH_KEY);
  } catch {
    return null;
  }
}

export const tokenStore = {
  getAccess: () => accessToken,
  getRefresh: readRefresh,
  hasSession: () => !!accessToken || !!readRefresh(),
  set(tokens: Pick<AuthTokens, 'accessToken' | 'refreshToken' | 'expiresIn'>) {
    accessToken = tokens.accessToken;
    accessExpiresAt = Date.now() + Math.max(0, tokens.expiresIn - 20) * 1000;
    try {
      localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
    } catch {
      /* storage unavailable — session lasts for this tab only */
    }
  },
  clear() {
    accessToken = null;
    accessExpiresAt = 0;
    try {
      localStorage.removeItem(REFRESH_KEY);
    } catch {
      /* ignore */
    }
  },
};

/* ------------------------------------------------------------------ errors */

export interface ApiErrorInit {
  code: ApiErrorCode;
  message: string;
  status: number;
  details?: Record<string, unknown>;
  requestId?: string | null;
}

/** Normalized error thrown by every API call. */
export class ApiError extends Error {
  code: ApiErrorCode;
  status: number;
  details: Record<string, unknown>;
  requestId: string | null;
  constructor(init: ApiErrorInit) {
    super(init.message);
    this.name = 'ApiError';
    this.code = init.code;
    this.status = init.status;
    this.details = init.details ?? {};
    this.requestId = init.requestId ?? null;
  }
  /** `details.reason` (§0.3), when present. */
  get reason(): string | undefined {
    const r = this.details.reason;
    return typeof r === 'string' ? r : undefined;
  }
  get locked(): LockedPayload | undefined {
    const l = this.details.locked as LockedPayload | undefined;
    return l && typeof l === 'object' ? l : undefined;
  }
  get isLocked() {
    return (this.code === 'SUBSCRIPTION_REQUIRED' || this.code === 'NOT_ENTITLED') && !!this.locked;
  }
  get retryAfterSeconds(): number | undefined {
    const v = this.details.retryAfterSeconds;
    return typeof v === 'number' ? v : undefined;
  }
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;

/** Localized, user-facing message: specific reason → server message → generic code message. */
export function errorMessage(e: unknown): string {
  const t = i18n.t.bind(i18n);
  if (!isApiError(e)) return t('errors.UNKNOWN');
  if (e.reason && i18n.exists(`errors.reasons.${e.reason}`)) {
    return t(`errors.reasons.${e.reason}`, {
      seconds: e.retryAfterSeconds ?? 0,
      count: typeof e.details.attemptsLeft === 'number' ? e.details.attemptsLeft : 0,
    });
  }
  if (e.isLocked && e.locked && i18n.exists(`errors.locked.${e.locked.reason}`)) return t(`errors.locked.${e.locked.reason}`);
  if (e.message && e.code !== 'NETWORK_ERROR' && e.code !== 'TIMEOUT' && e.code !== 'UNKNOWN') return e.message;
  return i18n.exists(`errors.${e.code}`) ? t(`errors.${e.code}`) : t('errors.UNKNOWN');
}

export function normalizeError(err: unknown): ApiError {
  if (isApiError(err)) return err;
  if (axios.isAxiosError(err)) {
    const ax = err as AxiosError<ApiErrorBody>;
    const requestId = (ax.response?.headers?.['x-request-id'] as string | undefined) ?? null;
    if (ax.response) {
      const body = ax.response.data;
      if (body && typeof body === 'object' && 'error' in body && body.error) {
        return new ApiError({
          code: body.error.code,
          message: body.error.message,
          details: body.error.details,
          status: ax.response.status,
          requestId,
        });
      }
      const fallback: ApiErrorCode =
        ax.response.status === 404 ? 'NOT_FOUND' : ax.response.status === 401 ? 'UNAUTHORIZED' : ax.response.status >= 500 ? 'INTERNAL' : 'UNKNOWN';
      return new ApiError({ code: fallback, message: '', status: ax.response.status, requestId });
    }
    if (ax.code === 'ECONNABORTED' || ax.code === 'ETIMEDOUT') return new ApiError({ code: 'TIMEOUT', message: '', status: 0 });
    if (ax.code === 'ERR_CANCELED') return new ApiError({ code: 'UNKNOWN', message: 'canceled', status: 0, details: { canceled: true } });
    return new ApiError({ code: 'NETWORK_ERROR', message: '', status: 0 });
  }
  return new ApiError({ code: 'UNKNOWN', message: err instanceof Error ? err.message : '', status: 0 });
}

/** Builds an ApiError from a raw fetch Response (SSE / keepalive paths). */
export async function errorFromResponse(res: Response): Promise<ApiError> {
  let body: ApiErrorBody | null = null;
  try {
    body = (await res.json()) as ApiErrorBody;
  } catch {
    /* not json */
  }
  if (body?.error) {
    return new ApiError({
      code: body.error.code,
      message: body.error.message,
      details: body.error.details,
      status: res.status,
      requestId: res.headers.get('x-request-id'),
    });
  }
  return new ApiError({ code: res.status >= 500 ? 'INTERNAL' : 'UNKNOWN', message: '', status: res.status });
}

/* ------------------------------------------------------------------ headers */

export const currentLang = (): 'en' | 'ar' => (i18n.language === 'en' ? 'en' : 'ar');

/** Headers every request carries (also used by the raw-fetch SSE/keepalive paths). */
export function baseHeaders(): Record<string, string> {
  return {
    Accept: 'application/json',
    'Accept-Language': currentLang(),
    'X-Request-Id': uuid(),
    'X-Client-Platform': 'web',
    'X-Device-Id': getDeviceId(),
  };
}

/* ------------------------------------------------------------------ refresh (single-flight) */

let refreshing: Promise<string | null> | null = null;

async function doRefresh(): Promise<string | null> {
  const refreshToken = readRefresh();
  if (!refreshToken) return null;
  try {
    const res = await axios.post<ApiSuccess<AuthTokens>>(
      `${API_URL}/auth/refresh`,
      { refreshToken },
      { headers: { ...baseHeaders(), 'Content-Type': 'application/json' }, timeout: 20000 },
    );
    tokenStore.set(res.data.data);
    return res.data.data.accessToken;
  } catch (err) {
    const e = normalizeError(err);
    if (e.status === 401 || e.status === 400 || e.status === 403) {
      // Refresh rejected (expired / revoked / reused) → the session is over.
      tokenStore.clear();
      apiEvents.emit('sessionEnded', { reason: 'refresh_failed' });
      return null;
    }
    // Network trouble: keep the refresh token for a later attempt.
    throw e;
  }
}

/** Returns a fresh access token, refreshing at most once concurrently. */
export function refreshAccessToken(): Promise<string | null> {
  if (!refreshing) refreshing = doRefresh().finally(() => (refreshing = null));
  return refreshing;
}

/** Valid access token for raw-fetch callers (SSE, keepalive). */
export async function getValidAccessToken(): Promise<string | null> {
  if (accessToken && Date.now() < accessExpiresAt) return accessToken;
  if (!readRefresh()) return accessToken;
  return refreshAccessToken();
}

/* ------------------------------------------------------------------ axios instance */

export interface RequestExtras {
  /** Do not attach the bearer token (public endpoints). */
  skipAuth?: boolean;
  /** Internal: request already retried after a refresh. */
  _retried?: boolean;
}

declare module 'axios' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface AxiosRequestConfig extends RequestExtras {}
}

export const http = axios.create({ baseURL: API_URL, timeout: 30000 });

http.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const headers = AxiosHeaders.from(config.headers);
  for (const [k, v] of Object.entries(baseHeaders())) if (!headers.has(k)) headers.set(k, v);
  if (!config.skipAuth) {
    let token = accessToken;
    // After a reload only the refresh token exists → obtain an access token first.
    if ((!token || Date.now() >= accessExpiresAt) && readRefresh()) {
      try {
        token = await refreshAccessToken();
      } catch {
        token = accessToken;
      }
    }
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }
  config.headers = headers;
  return config;
});

http.interceptors.response.use(
  (res) => res,
  async (err) => {
    const e = normalizeError(err);
    const config = (err as AxiosError).config as (InternalAxiosRequestConfig & RequestExtras) | undefined;

    // Access token expired → single-flight refresh, then retry once.
    if (config && !config.skipAuth && !config._retried && e.status === 401 && (e.code === 'TOKEN_EXPIRED' || (e.code === 'UNAUTHORIZED' && !!readRefresh() && !!accessToken))) {
      config._retried = true;
      accessExpiresAt = 0;
      const token = await refreshAccessToken().catch(() => null);
      if (token) {
        const headers = AxiosHeaders.from(config.headers);
        headers.set('Authorization', `Bearer ${token}`);
        headers.set('X-Request-Id', uuid());
        config.headers = headers;
        return http.request(config);
      }
      throw e;
    }

    if (e.status === 401 && config && !config.skipAuth && accessToken === null && !readRefresh()) {
      apiEvents.emit('sessionEnded', { reason: 'unauthorized' });
    }

    if (e.reason === 'MAINTENANCE') {
      apiEvents.emit('maintenance', { message: (e.details.message as Localized | undefined) ?? null });
    }
    if (e.reason === 'LEGAL_ACCEPTANCE_REQUIRED') apiEvents.emit('legalRequired', {});
    if (e.reason === 'ACCOUNT_LOCKED' && config && !config.skipAuth) {
      tokenStore.clear();
      apiEvents.emit('sessionEnded', { reason: 'locked' });
    }
    throw e;
  },
);

/* ------------------------------------------------------------------ helpers */

type Cfg = AxiosRequestConfig;

/** Envelope unwrap helpers. */
export async function get<T>(url: string, config?: Cfg): Promise<T> {
  const res = await http.get<ApiSuccess<T>>(url, config);
  return res.data.data;
}
export async function getPaged<T, M = PageMeta>(url: string, config?: Cfg): Promise<Paged<T, M>> {
  const res = await http.get<ApiSuccess<T[], M>>(url, config);
  return { items: res.data.data ?? [], meta: (res.data.meta ?? {}) as M };
}
export async function post<T>(url: string, body?: unknown, config?: Cfg): Promise<T> {
  const res = await http.post<ApiSuccess<T>>(url, body ?? {}, config);
  return res.data.data;
}
export async function put<T>(url: string, body?: unknown, config?: Cfg): Promise<T> {
  const res = await http.put<ApiSuccess<T>>(url, body ?? {}, config);
  return res.data.data;
}
export async function patch<T>(url: string, body?: unknown, config?: Cfg): Promise<T> {
  const res = await http.patch<ApiSuccess<T>>(url, body ?? {}, config);
  return res.data.data;
}
export async function del<T>(url: string, config?: Cfg): Promise<T> {
  const res = await http.delete<ApiSuccess<T>>(url, config);
  return res.data.data;
}

/** Repeats array params (`difficulty=easy&difficulty=hard`) and drops empty values. */
export function qs(params: Record<string, unknown>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) v.forEach((x) => x !== undefined && x !== null && x !== '' && sp.append(k, String(x)));
    else sp.append(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

/** Downloads a binary endpoint (PDF/CSV) as a file. */
export async function downloadFile(url: string, fallbackName: string) {
  const res = await http.get<Blob>(url, { responseType: 'blob' });
  const cd = String(res.headers['content-disposition'] ?? '');
  const match = /filename="?([^";]+)"?/i.exec(cd);
  const name = match?.[1] ?? fallbackName;
  const href = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 1000);
}

/**
 * Fire-and-forget request that survives page unload (`fetch` keepalive — sendBeacon cannot carry the
 * Authorization header). Used for watch-progress "leave" events.
 */
export function sendKeepalive(method: 'PUT' | 'POST', path: string, body: unknown) {
  const token = accessToken;
  const headers: Record<string, string> = { ...baseHeaders(), 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    void fetch(`${API_URL}${path}`, { method, headers, body: JSON.stringify(body), keepalive: true }).catch(() => undefined);
  } catch {
    /* ignore */
  }
}
