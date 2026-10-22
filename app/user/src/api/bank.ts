import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { del, get, getPaged, post, put } from './client';
import { qk } from './keys';
import type {
  BankFacetsDto,
  BankQuery,
  PageMeta,
  PracticeFeedback,
  PracticeResultDto,
  PracticeSessionSummary,
  PracticeStartBody,
  PracticeStartDto,
  QuestionPublic,
  QuestionReview,
} from './types';

type BankMeta = PageMeta & { bookmarkedCount: number };

// BNK-01 (paged, "show more")
export const useBankQuestions = (query: Omit<BankQuery, 'page'>, enabled = true) =>
  useInfiniteQuery({
    queryKey: qk.bank.questions(query),
    queryFn: ({ pageParam }) =>
      getPaged<QuestionPublic | QuestionReview, BankMeta>('/bank/questions', { ...query, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.meta.page * last.meta.pageSize < last.meta.total ? last.meta.page + 1 : undefined),
    enabled,
    placeholderData: keepPreviousData,
  });

// BNK-02
export const useBankFacets = (query: Omit<BankQuery, 'page' | 'pageSize' | 'reveal'>, enabled = true) =>
  useQuery({
    queryKey: qk.bank.facets(query),
    queryFn: () => get<BankFacetsDto>('/bank/facets', query),
    enabled,
    placeholderData: keepPreviousData,
    meta: { silent: true },
  });

// BNK-03
export const useBankQuestion = (id: string | undefined) =>
  useQuery({
    queryKey: qk.bank.question(id ?? ''),
    queryFn: () => get<QuestionReview>(`/bank/questions/${id}`),
    enabled: !!id,
  });

// PRA-01..05
export const startPractice = (body: PracticeStartBody) => post<PracticeStartDto>('/practice/start', body);
export const answerPractice = (
  sessionId: string,
  body: { questionId: string; optionId?: string; textAnswer?: string; timeSec?: number },
) => post<PracticeFeedback>(`/practice/${sessionId}/answer`, body);
export const finishPractice = (sessionId: string, timeSpentSec: number) =>
  post<PracticeResultDto>(`/practice/${sessionId}/finish`, { timeSpentSec });
export const usePracticeResult = (sessionId: string | undefined) =>
  useQuery({
    queryKey: qk.practice.result(sessionId ?? ''),
    queryFn: () => get<PracticeResultDto>(`/practice/${sessionId}/result`),
    enabled: !!sessionId,
    staleTime: Infinity,
  });
export const usePracticeSessions = (limit = 5) =>
  useQuery({
    queryKey: qk.practice.sessions(limit),
    queryFn: async () => (await getPaged<PracticeSessionSummary>('/practice/sessions', { limit })).items,
    meta: { silent: true },
  });

// BMK-01
export const useBookmarks = (subjectId?: string) =>
  useInfiniteQuery({
    queryKey: qk.bookmarks.list(subjectId),
    queryFn: ({ pageParam }) => getPaged<QuestionPublic>('/bookmarks', { subjectId, page: pageParam, pageSize: 20 }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.meta.page * last.meta.pageSize < last.meta.total ? last.meta.page + 1 : undefined),
  });

// BMK-02
export const useBookmarkIds = () =>
  useQuery({
    queryKey: qk.bookmarks.ids,
    queryFn: () => get<string[]>('/bookmarks/ids'),
    staleTime: 5 * 60_000,
    meta: { silent: true },
  });

/** True when the question is bookmarked (from the cached id list). */
export function useIsBookmarked(questionId: string): boolean {
  const { data } = useBookmarkIds();
  return !!data?.includes(questionId);
}

// BMK-03 / BMK-04 (optimistic)
export function useToggleBookmark() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ questionId, bookmarked }: { questionId: string; bookmarked: boolean }) =>
      bookmarked
        ? put<{ questionId: string; bookmarked: boolean }>(`/bookmarks/${questionId}`)
        : del<{ questionId: string; bookmarked: boolean }>(`/bookmarks/${questionId}`),
    onMutate: async ({ questionId, bookmarked }) => {
      await qc.cancelQueries({ queryKey: qk.bookmarks.ids });
      const prev = qc.getQueryData<string[]>(qk.bookmarks.ids);
      qc.setQueryData<string[]>(qk.bookmarks.ids, (old = []) =>
        bookmarked ? Array.from(new Set([...old, questionId])) : old.filter((id) => id !== questionId),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.bookmarks.ids, ctx.prev);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.bookmarks.all });
      void qc.invalidateQueries({ queryKey: ['bank', 'facets'] });
    },
  });
}
