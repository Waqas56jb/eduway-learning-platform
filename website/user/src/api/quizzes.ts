import { useMutation, useQueryClient } from '@tanstack/react-query';
import { post } from './client';
import { keys } from './keys';
import type { AnswerBody, AnswerFeedback, QuizResultDto, QuizStartDto } from './types';

/** Lesson quizzes (QUZ-01…03). */
export const quizzesApi = {
  start: (lessonId: string) => post<QuizStartDto>(`/quizzes/${lessonId}/start`, {}),
  answer: (attemptId: string, body: AnswerBody) => post<AnswerFeedback>(`/quizzes/attempts/${attemptId}/answer`, body),
  submit: (attemptId: string, timeSpentSec: number) => post<QuizResultDto>(`/quizzes/attempts/${attemptId}/submit`, { timeSpentSec }),
};

export const useStartQuiz = () => useMutation({ mutationFn: quizzesApi.start, meta: { silent: true } });

export function useAnswerQuiz() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ attemptId, body }: { attemptId: string; body: AnswerBody }) => quizzesApi.answer(attemptId, body),
    onSuccess: (fb) => {
      if (fb.mistake) void qc.invalidateQueries({ queryKey: keys.mistakes });
    },
  });
}

export function useSubmitQuiz() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ attemptId, timeSpentSec }: { attemptId: string; timeSpentSec: number }) => quizzesApi.submit(attemptId, timeSpentSec),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: keys.lesson(res.lessonId) });
      void qc.invalidateQueries({ queryKey: keys.quizRule(res.lessonId) });
      void qc.invalidateQueries({ queryKey: keys.progress });
      void qc.invalidateQueries({ queryKey: keys.mistakes });
    },
  });
}
