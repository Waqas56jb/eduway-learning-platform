import { AppState, Platform } from 'react-native';
import { MutationCache, QueryCache, QueryClient, focusManager, onlineManager } from '@tanstack/react-query';
import { onConnectivityChange, isOnline } from './connectivity';
import { normalizeError, toastError, type ApiError } from './errors';

/**
 * Query metadata:
 *  - `silent: true` → never toast (the screen renders its own empty/error state);
 *  - mutations toast by default unless `meta.silent`.
 */
declare module '@tanstack/react-query' {
  interface Register {
    defaultError: ApiError;
    queryMeta: { silent?: boolean };
    mutationMeta: { silent?: boolean };
  }
}

// React Native: refetch on app foreground instead of window focus.
focusManager.setEventListener((handleFocus) => {
  const sub = AppState.addEventListener('change', (s) => {
    if (Platform.OS !== 'web') handleFocus(s === 'active');
  });
  return () => sub.remove();
});

// Online state comes from our own connectivity tracker (no NetInfo in Expo Go).
onlineManager.setEventListener((setOnline) => {
  setOnline(isOnline());
  return onConnectivityChange(setOnline);
});

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (err, query) => {
      // Background refetch failures of data already on screen stay quiet; first loads toast.
      if (query.meta?.silent || query.state.data !== undefined) return;
      toastError(err);
    },
  }),
  mutationCache: new MutationCache({
    onError: (err, _vars, _ctx, mutation) => {
      if (mutation.meta?.silent) return;
      toastError(err);
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      retry: (count, err) => {
        const e = normalizeError(err);
        if (e.isNetwork) return count < 2;
        return e.status >= 500 && count < 1;
      },
      refetchOnWindowFocus: true,
      networkMode: 'online',
    },
    mutations: {
      retry: false,
      networkMode: 'always',
    },
  },
});
