import { useQuery } from '@tanstack/react-query';
import { get, getPaged, post } from './client';
import { qk } from './keys';
import type { AnswerFeedback, QuizAttemptSummary, QuizResultDto, QuizStartDto } from './types';

// QUZ-01
export const startQuiz = (lessonId: string) => post<QuizStartDto>(`/quizzes/${encodeURIComponent(lessonId)}/start`, {});

// QUZ-02
export const answerQuiz = (
  attemptId: string,
  body: { questionId: string; optionId?: string; textAnswer?: string; timeSec?: number },
) => post<AnswerFeedback>(`/quizzes/attempts/${attemptId}/answer`, body);

// QUZ-03
export const submitQuiz = (attemptId: string, timeSpentSec: number) =>
  post<QuizResultDto>(`/quizzes/attempts/${attemptId}/submit`, { timeSpentSec });

// QUZ-04
export const useQuizAttempts = (lessonId?: string) =>
  useQuery({
    queryKey: qk.quizzes.attempts(lessonId),
    queryFn: async () => (await getPaged<QuizAttemptSummary>('/quizzes/attempts', { lessonId, pageSize: 50 })).items,
    meta: { silent: true },
  });

// QUZ-05
export const useQuizAttempt = (attemptId: string | undefined) =>
  useQuery({
    queryKey: qk.quizzes.attempt(attemptId ?? ''),
    queryFn: () => get<QuizResultDto>(`/quizzes/attempts/${attemptId}`),
    enabled: !!attemptId,
  });
