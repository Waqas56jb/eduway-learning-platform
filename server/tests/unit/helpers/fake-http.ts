/** Mocked HTTP for adapter tests: an axios instance whose adapter answers from a handler (no network). */
import axios, { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';

export interface FakeReply {
  status?: number;
  data: unknown;
}
export interface FakeHttp {
  http: AxiosInstance;
  calls: InternalAxiosRequestConfig[];
  /** Parsed request body of call n (JSON or form-encoded). */
  body(n?: number): Record<string, unknown>;
}

export function fakeHttp(handler: (cfg: InternalAxiosRequestConfig) => FakeReply | Promise<FakeReply>): FakeHttp {
  const calls: InternalAxiosRequestConfig[] = [];
  const http = axios.create({
    adapter: async (config) => {
      calls.push(config);
      const r = await handler(config);
      const res = { data: r.data, status: r.status ?? 200, statusText: 'OK', headers: {}, config, request: {} };
      if (res.status >= 400) throw new AxiosError(`Request failed with status code ${res.status}`, 'ERR_BAD_RESPONSE', config, {}, res);
      return res;
    },
  });
  return {
    http,
    calls,
    body(n = calls.length - 1) {
      const raw = calls[n]?.data;
      if (typeof raw !== 'string') return (raw ?? {}) as Record<string, unknown>;
      try {
        return JSON.parse(raw) as Record<string, unknown>;
      } catch {
        return Object.fromEntries(new URLSearchParams(raw));
      }
    },
  };
}
