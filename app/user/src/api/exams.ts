import { useQuery } from '@tanstack/react-query';
import { get, getPaged, idem, post, put } from './client';
import { qk } from './keys';
import type {
  ExamAttemptState,
  ExamAttemptSummary,
  ExamAutosaveBody,
  ExamAutosaveDto,
  ExamCardDto,
  ExamResultDto,
  ExamSubmitBody,
  ExamSubmitDto,
  UpcomingExamDto,
} from './types';

// EXM-01
export const useAvailableExams = (subjectId?: string) =>
  useQuery({
    queryKey: qk.exams.available(subjectId),
    queryFn: () => get<ExamCardDto[]>('/exams/available', { subjectId }),
  });

// EXM-02
export const useUpcomingExams = (limit = 3) =>
  useQuery({
    queryKey: qk.exams.upcoming(limit),
    queryFn: () => get<UpcomingExamDto[]>('/exams/upcoming', { limit }),
    meta: { silent: true },
  });

// EXM-03 (start or resume)
export const startExam = (blueprintId: string) => post<ExamAttemptState>(`/exams/${encodeURIComponent(blueprintId)}/start`, {});

// EXM-04
export const fetchExamAttempt = (attemptId: string) => get<ExamAttemptState>(`/exams/attempts/${attemptId}`);

// EXM-05
export const autosaveExam = (attemptId: string, body: ExamAutosaveBody) =>
  put<ExamAutosaveDto>(`/exams/attempts/${attemptId}/autosave`, body, { timeout: 10_000 });

// EXM-06
export const flagExamQuestion = (attemptId: string, questionId: string, flagged: boolean) =>
  post<{ flagged: string[] }>(`/exams/attempts/${attemptId}/flag`, { questionId, flagged });

// EXM-07 (idempotent per attempt)
export const submitExam = (attemptId: string, body: ExamSubmitBody) =>
  post<ExamSubmitDto>(`/exams/attempts/${attemptId}/submit`, body, idem(`exam-submit-${attemptId}`));

// EXM-08
export const useExamResult = (attemptId: string | undefined) =>
  useQuery({
    queryKey: qk.exams.result(attemptId ?? ''),
    queryFn: () => get<ExamResultDto>(`/exams/attempts/${attemptId}/result`),
    enabled: !!attemptId,
    staleTime: Infinity,
  });

// EXM-09
export const useExamAttempts = (examId?: string) =>
  useQuery({
    queryKey: qk.exams.attempts(examId),
    queryFn: async () => (await getPaged<ExamAttemptSummary>('/exams/attempts', { examId, pageSize: 50 })).items,
    meta: { silent: true },
  });
