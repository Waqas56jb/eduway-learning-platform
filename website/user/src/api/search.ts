import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { get, qs } from './client';
import { keys } from './keys';
import type { SearchResultDto } from './types';

/** Global search (SRC-01) — the TopBar uses the `lessons` scope. */
export const searchApi = {
  search: (q: string, scopes: string[] = ['lessons'], limit = 6) => get<SearchResultDto>(`/search${qs({ q, scopes, limit })}`),
};

export function useLessonSearch(q: string) {
  const { isAuthenticated } = useAuth();
  const term = q.trim();
  return useQuery({
    queryKey: keys.search(term),
    queryFn: ({ signal }) => get<SearchResultDto>(`/search${qs({ q: term, scopes: ['lessons'], limit: 6 })}`, { signal }),
    enabled: isAuthenticated && term.length >= 2,
    staleTime: 30_000,
    meta: { silent: true },
  });
}
