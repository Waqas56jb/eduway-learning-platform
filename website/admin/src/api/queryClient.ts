import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { isApiError, toastError } from './client';

declare module '@tanstack/react-query' {
  interface Register {
    queryMeta: { silentError?: boolean };
    mutationMeta: { silentError?: boolean };
  }
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    // First-load errors are rendered by the page (error state). Background refetch failures toast.
    onError: (err, query) => {
      if (query.meta?.silentError) return;
      if (query.state.data !== undefined) toastError(err);
    },
  }),
  mutationCache: new MutationCache({
    onError: (err, _v, _c, mutation) => {
      if (!mutation.meta?.silentError) toastError(err);
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (count, err) => {
        if (isApiError(err) && err.status >= 400 && err.status < 500) return false;
        return count < 2;
      },
    },
    mutations: { retry: false },
  },
});
