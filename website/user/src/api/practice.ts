import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { get, getPaged, post, qs } from './client';
import { keys } from './keys';
import type {
  AnswerBody,
  AnswerFeedback,
  BankFacetsDto,
  BankFilters,
  BankMeta,
  PracticeResultDto,
  PracticeStartBody,
  PracticeStartDto,
  QuestionPublic,
  QuestionReview,
} from './types';

/** Question bank (BNK-01…03) and practice sessions (PRA-01…05). */
const filterParams = (f: BankFilters) => ({
  subjectId: f.subjectId,
  unitId: f.unitId,
  topicId: f.topicId,
  topic: f.topic,
  difficulty: f.difficulty,
  type: f.type,
  tags: f.tags,
  bookmarked: f.bookmarked ? true : undefined,
  q: f.q?.trim() || undefined,
});

export const bankApi = {
  questions: (f: BankFilters, page: number, pageSize: number, reveal = false) =>
    getPaged<QuestionPublic | QuestionReview, BankMeta>(
      `/bank/questions${qs({ ...filterParams(f), page, pageSize, reveal: reveal || undefined })}`,
    ),
  facets: (f: BankFilters) => get<BankFacetsDto>(`/bank/facets${qs(filterParams(f))}`),
  question: (id: string) => get<QuestionReview>(`/bank/questions/${id}`),
};

export const practiceApi = {
  start: (body: PracticeStartBody) => post<PracticeStartDto>('/practice/start', body),
  answer: (sessionId: string, body: AnswerBody) =>
    post<AnswerFeedback & { streak: number }>(`/practice/${sessionId}/answer`, body),
  finish: (sessionId: string, timeSpentSec: number) => post<PracticeResultDto>(`/practice/${sessionId}/finish`, { timeSpentSec }),
  result: (sessionId: string) => get<PracticeResultDto>(`/practice/${sessionId}/result`),
};

/** Paged bank listing; "show more" fetches the next page. */
export function useBankQuestions(filters: BankFilters, pageSize = 12) {
  const { isAuthenticated } = useAuth();
  return useInfiniteQuery({
    queryKey: keys.bankQuestions(filters, pageSize),
    queryFn: ({ pageParam }) => bankApi.questions(filters, pageParam, pageSize),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.meta.page * last.meta.pageSize < last.meta.total ? last.meta.page + 1 : undefined),
    enabled: isAuthenticated,
    placeholderData: keepPreviousData,
  });
}

export function useBankFacets(filters: BankFilters) {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: keys.bankFacets(filters),
    queryFn: () => bankApi.facets(filters),
    enabled: isAuthenticated,
    placeholderData: keepPreviousData,
  });
}

export const useStartPractice = () => useMutation({ mutationFn: practiceApi.start });

export function useAnswerPractice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, body }: { sessionId: string; body: AnswerBody }) => practiceApi.answer(sessionId, body),
    onSuccess: (fb) => {
      if (fb.mistake) void qc.invalidateQueries({ queryKey: keys.mistakes });
    },
  });
}

export function useFinishPractice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, timeSpentSec }: { sessionId: string; timeSpentSec: number }) => practiceApi.finish(sessionId, timeSpentSec),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.bank });
      void qc.invalidateQueries({ queryKey: keys.progress });
      void qc.invalidateQueries({ queryKey: keys.mistakes });
    },
  });
}
