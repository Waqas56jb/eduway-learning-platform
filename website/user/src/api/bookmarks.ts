import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { del, get, getPaged, put, qs } from './client';
import { keys } from './keys';
import type { QuestionPublic } from './types';

/** Bookmarks (BMK-01…04). */
export const bookmarksApi = {
  list: (subjectId?: string, page = 1, pageSize = 50) => getPaged<QuestionPublic>(`/bookmarks${qs({ subjectId, page, pageSize })}`),
  ids: () => get<string[]>('/bookmarks/ids'),
  add: (questionId: string) => put<{ questionId: string; bookmarked: true }>(`/bookmarks/${questionId}`),
  remove: (questionId: string) => del<{ questionId: string; bookmarked: false }>(`/bookmarks/${questionId}`),
};

export function useBookmarkIds() {
  const { isAuthenticated } = useAuth();
  return useQuery({ queryKey: keys.bookmarkIds, queryFn: bookmarksApi.ids, enabled: isAuthenticated, staleTime: 60 * 1000 });
}

/** Optimistic bookmark toggle shared by quiz cards, the bank, mistakes and exam review. */
export function useToggleBookmark() {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: async ({ questionId, on }: { questionId: string; on: boolean }) => {
      if (on) await bookmarksApi.add(questionId);
      else await bookmarksApi.remove(questionId);
      return { questionId, bookmarked: on };
    },
    onMutate: async ({ questionId, on }) => {
      await qc.cancelQueries({ queryKey: keys.bookmarkIds });
      const prev = qc.getQueryData<string[]>(keys.bookmarkIds);
      qc.setQueryData<string[]>(keys.bookmarkIds, (ids = []) =>
        on ? Array.from(new Set([...ids, questionId])) : ids.filter((x) => x !== questionId),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(keys.bookmarkIds, ctx.prev);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: keys.bookmarkIds });
      void qc.invalidateQueries({ queryKey: keys.bank });
    },
  });
  return mutation;
}

/** `isBookmarked` + `toggleBookmark` convenience used across the UI. */
export function useBookmarks() {
  const { data } = useBookmarkIds();
  const toggle = useToggleBookmark();
  const set = useMemo(() => new Set(data ?? []), [data]);
  const isBookmarked = useCallback((id: string) => set.has(id), [set]);
  const toggleBookmark = useCallback(
    (id: string) => toggle.mutate({ questionId: id, on: !set.has(id) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [set, toggle.mutate],
  );
  return { bookmarks: data ?? [], isBookmarked, toggleBookmark };
}
