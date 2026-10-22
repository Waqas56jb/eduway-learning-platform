import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { get, getPaged, idempotencyKey, post, put, qs } from './client';
import { keys } from './keys';
import type {
  ExamAttemptState,
  ExamAttemptSummary,
  ExamAutosaveBody,
  ExamAutosaveDto,
  ExamCard,
  ExamResultDto,
  ExamSubmitBody,
  ExamSubmitDto,
  UpcomingExamDto,
} from './types';

/** Exam simulator (EXM-01…09). */
export const examsApi = {
  available: (subjectId?: string) => get<ExamCard[]>(`/exams/available${qs({ subjectId })}`),
  upcoming: (limit = 3) => get<UpcomingExamDto[]>(`/exams/upcoming${qs({ limit })}`),
  start: (blueprintId: string) => post<ExamAttemptState>(`/exams/${blueprintId}/start`, {}),
  attempt: (attemptId: string) => get<ExamAttemptState>(`/exams/attempts/${attemptId}`),
  autosave: (attemptId: string, body: ExamAutosaveBody) => put<ExamAutosaveDto>(`/exams/attempts/${attemptId}/autosave`, body),
  flag: (attemptId: string, questionId: string, flagged: boolean) =>
    post<{ flagged: string[] }>(`/exams/attempts/${attemptId}/flag`, { questionId, flagged }),
  /** `key` must be stable across retries of the same submission. */
  submit: (attemptId: string, body: ExamSubmitBody, key: string = idempotencyKey()) =>
    post<ExamSubmitDto>(`/exams/attempts/${attemptId}/submit`, body, { headers: { 'Idempotency-Key': key } }),
  result: (attemptId: string) => get<ExamResultDto>(`/exams/attempts/${attemptId}/result`),
  attempts: (p: { examId?: string; status?: string; page?: number; pageSize?: number } = {}) =>
    getPaged<ExamAttemptSummary>(`/exams/attempts${qs({ pageSize: 50, ...p })}`),
};

export function useAvailableExams() {
  const { isAuthenticated } = useAuth();
  return useQuery({ queryKey: keys.examsAvailable, queryFn: () => examsApi.available(), enabled: isAuthenticated });
}

export function useExamAttempts() {
  const { isAuthenticated } = useAuth();
  return useQuery({ queryKey: keys.examAttempts, queryFn: () => examsApi.attempts(), enabled: isAuthenticated });
}

export function useExamResult(attemptId: string | undefined) {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: keys.examResult(attemptId ?? ''),
    queryFn: () => examsApi.result(attemptId!),
    enabled: !!attemptId && isAuthenticated,
    retry: (count, err) => count < 4 && (err as { code?: string }).code === 'CONFLICT',
    retryDelay: 1500,
  });
}

export const useStartExam = () => useMutation({ mutationFn: examsApi.start, meta: { silent: true } });

export function useInvalidateExams() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: keys.exams });
    void qc.invalidateQueries({ queryKey: ['catalog'] });
    void qc.invalidateQueries({ queryKey: keys.progress });
    void qc.invalidateQueries({ queryKey: keys.mistakes });
  };
}
