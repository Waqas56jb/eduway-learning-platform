import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { isApiError, normalizeError, type ApiError } from './client';

declare module '@tanstack/react-query' {
  interface Register {
    defaultError: ApiError;
    queryMeta: { silent?: boolean };
    mutationMeta: { silent?: boolean };
  }
}

type Reporter = (e: ApiError) => void;
let reporter: Reporter | null = null;
/** The UI (ApiBridge) registers a localized-toast reporter here. */
export function setErrorReporter(fn: Reporter | null) {
  reporter = fn;
}

const recent = new Map<string, number>();
function report(err: unknown) {
  const e = normalizeError(err);
  if (e.details.canceled) return;
  // Session/maintenance problems are handled by dedicated screens, not toasts.
  if (e.code === 'TOKEN_EXPIRED' || (e.code === 'UNAUTHORIZED' && e.status === 401)) return;
  if (e.reason === 'MAINTENANCE' || e.reason === 'LEGAL_ACCEPTANCE_REQUIRED') return;
  const sig = `${e.code}:${e.reason ?? ''}:${e.message}`;
  const now = Date.now();
  if ((recent.get(sig) ?? 0) > now - 3000) return; // de-dupe bursts
  recent.set(sig, now);
  reporter?.(e);
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (err, query) => {
      if (query.meta?.silent) return;
      // Queries render their own error/empty/paywall states; only toast transport-level failures.
      if (isApiError(err) && (err.status === 404 || err.isLocked || err.status === 403 || err.status === 409)) return;
      report(err);
    },
  }),
  mutationCache: new MutationCache({
    onError: (err, _vars, _ctx, mutation) => {
      if (mutation.meta?.silent) return;
      report(err);
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: false,
      retry: (count, err) => {
        const e = err as ApiError;
        if (e.status && e.status >= 400 && e.status < 500) return false;
        return count < 2;
      },
    },
    mutations: { retry: false },
  },
});
