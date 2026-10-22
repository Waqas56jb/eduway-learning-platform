import axios, { type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios';
import { useLangStore } from '@/store/langStore';
import type { Localized } from '@/types';
import { useAppStatus } from './appStatus';
import { API_URL, APP_VERSION, CLIENT_PLATFORM, REQUEST_TIMEOUT_MS } from './config';
import { markOffline, markOnline } from './connectivity';
import { ApiError, normalizeError } from './errors';
import { clearTokens, getAccessToken, getDeviceId, getRefreshToken, newRequestId, setTokens } from './session';
import type { AuthTokens, Envelope, PageMeta, Paged } from './types';

/** Headers sent on every request (contract §0.4). */
export function baseHeaders(): Record<string, string> {
  return {
    Accept: 'application/json',
    'Accept-Language': useLangStore.getState().lang,
    'X-Request-Id': newRequestId(),
    'X-Client-Platform': CLIENT_PLATFORM,
    'X-Device-Id': getDeviceId(),
    'X-App-Version': APP_VERSION,
  };
}

export const http = axios.create({ baseURL: API_URL, timeout: REQUEST_TIMEOUT_MS });

/** Called once when the refresh token is rejected — the auth store signs the user out. */
let sessionExpiredHandler: (() => void) | null = null;
export function onSessionExpired(handler: () => void) {
  sessionExpiredHandler = handler;
}

// ── Single-flight refresh ───────────────────────────────────────────────────
let refreshing: Promise<string | null> | null = null;

async function runRefresh(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;
  try {
    const res = await axios.post<Envelope<AuthTokens>>(
      `${API_URL}/auth/refresh`,
      { refreshToken },
      { headers: baseHeaders(), timeout: REQUEST_TIMEOUT_MS },
    );
    await setTokens(res.data.data);
    return res.data.data.accessToken;
  } catch (err) {
    const e = normalizeError(err);
    // Only a definitive rejection ends the session; network failures keep the tokens for a later retry.
    if (!e.isNetwork && e.status >= 400 && e.status < 500) {
      await clearTokens();
      sessionExpiredHandler?.();
    }
    throw e;
  }
}

/** Refresh the access token once even if many requests hit 401 at the same time. */
export function refreshAccessToken(): Promise<string | null> {
  if (!refreshing) {
    refreshing = runRefresh().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

type RetryConfig = InternalAxiosRequestConfig & { _retried?: boolean; _skipAuth?: boolean };

http.interceptors.request.use((config) => {
  const c = config as RetryConfig;
  const headers = baseHeaders();
  for (const [k, v] of Object.entries(headers)) {
    if (!c.headers.has(k)) c.headers.set(k, v);
  }
  const token = getAccessToken();
  if (token && !c._skipAuth) c.headers.set('Authorization', `Bearer ${token}`);
  return c;
});

const NO_REFRESH_PATHS = ['/auth/refresh', '/auth/send-otp', '/auth/verify-otp'];

http.interceptors.response.use(
  (res) => {
    markOnline();
    return res;
  },
  async (error: unknown) => {
    const e = normalizeError(error);
    if (e.isNetwork) markOffline();
    else markOnline();

    const config = axios.isAxiosError(error) ? (error.config as RetryConfig | undefined) : undefined;
    const url = config?.url ?? '';
    const canRefresh =
      !!config &&
      !config._retried &&
      !config._skipAuth &&
      e.status === 401 &&
      (e.code === 'TOKEN_EXPIRED' || (e.code === 'UNAUTHORIZED' && !!getAccessToken())) &&
      !NO_REFRESH_PATHS.some((p) => url.includes(p)) &&
      !!getRefreshToken();

    if (canRefresh && config) {
      config._retried = true;
      try {
        const token = await refreshAccessToken();
        if (token) {
          config.headers.set('Authorization', `Bearer ${token}`);
          config.headers.set('X-Request-Id', newRequestId());
          return http.request(config);
        }
      } catch (refreshErr) {
        throw normalizeError(refreshErr);
      }
    }

    if (e.reason === 'MAINTENANCE') {
      const msg = e.details.message as Localized | undefined;
      useAppStatus.getState().setMaintenance(true, msg ?? null);
    } else if (e.reason === 'UPDATE_REQUIRED') {
      useAppStatus.getState().setUpdateRequired(true, (e.details.storeUrl as string | undefined) ?? null);
    }
    throw e;
  },
);

// ── Typed helpers (unwrap the `{ success, data, meta }` envelope) ──────────
export type RequestOptions = AxiosRequestConfig & { skipAuth?: boolean };

function cfg(o?: RequestOptions): AxiosRequestConfig {
  if (!o) return {};
  const { skipAuth, ...rest } = o;
  return skipAuth ? ({ ...rest, _skipAuth: true } as AxiosRequestConfig) : rest;
}

export async function get<T>(url: string, params?: object, o?: RequestOptions): Promise<T> {
  const res = await http.get<Envelope<T>>(url, { ...cfg(o), params });
  return res.data.data;
}

export async function getPaged<T, M = PageMeta>(url: string, params?: object, o?: RequestOptions): Promise<Paged<T, M>> {
  const res = await http.get<Envelope<T[], M>>(url, { ...cfg(o), params });
  return {
    items: res.data.data ?? [],
    meta: (res.data.meta ?? { page: 1, pageSize: res.data.data?.length ?? 0, total: res.data.data?.length ?? 0, nextCursor: null }) as M,
  };
}

export async function post<T>(url: string, body?: unknown, o?: RequestOptions): Promise<T> {
  const res = await http.post<Envelope<T>>(url, body ?? {}, cfg(o));
  return res.data.data;
}

export async function put<T>(url: string, body?: unknown, o?: RequestOptions): Promise<T> {
  const res = await http.put<Envelope<T>>(url, body ?? {}, cfg(o));
  return res.data.data;
}

export async function patch<T>(url: string, body?: unknown, o?: RequestOptions): Promise<T> {
  const res = await http.patch<Envelope<T>>(url, body ?? {}, cfg(o));
  return res.data.data;
}

export async function del<T>(url: string, body?: unknown, o?: RequestOptions): Promise<T> {
  const res = await http.delete<Envelope<T>>(url, { ...cfg(o), data: body });
  return res.data.data;
}

/** `Idempotency-Key` header for payments / exam submit (contract §0.4). */
export const idem = (key: string): RequestOptions => ({ headers: { 'Idempotency-Key': key } });

/** Repeat query arrays as `a=1&a=2` (contract §0.6 accepts both). */
http.defaults.paramsSerializer = {
  serialize: (params: Record<string, unknown>) => {
    const parts: string[] = [];
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null || v === '') continue;
      const values = Array.isArray(v) ? v : [v];
      for (const item of values) parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(item))}`);
    }
    return parts.join('&');
  },
};

export { ApiError };
