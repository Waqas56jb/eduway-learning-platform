import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { get } from './client';
import { keys } from './keys';
import type { ExamCard, QuestionStatsDto, SubjectDetail, SubjectSummary } from './types';

/** Catalog (CAT-01…04). `:subjectId` accepts uuid or slug. */
export const catalogApi = {
  subjects: () => get<SubjectSummary[]>('/subjects'),
  subject: (id: string) => get<SubjectDetail>(`/subjects/${encodeURIComponent(id)}`),
  questionStats: (id: string) => get<QuestionStatsDto>(`/subjects/${encodeURIComponent(id)}/question-stats`),
  exams: (id: string) => get<ExamCard[]>(`/subjects/${encodeURIComponent(id)}/exams`),
};

/** All active subjects (optional auth: adds `locked` + `progress` for students). */
export function useSubjects() {
  const { isAuthenticated, status } = useAuth();
  return useQuery({
    queryKey: keys.subjects(isAuthenticated),
    queryFn: catalogApi.subjects,
    staleTime: 5 * 60 * 1000,
    enabled: status !== 'loading',
  });
}

/** Lookup helper: slug or id → subject, from the cached catalog. */
export function useSubjectLookup() {
  const { data } = useSubjects();
  return (idOrSlug: string | null | undefined): SubjectSummary | undefined =>
    idOrSlug ? data?.find((s) => s.id === idOrSlug || s.slug === idOrSlug) : undefined;
}

export function useSubject(id: string | undefined) {
  const { status } = useAuth();
  return useQuery({
    queryKey: keys.subject(id ?? ''),
    queryFn: () => catalogApi.subject(id!),
    enabled: !!id && status !== 'loading',
  });
}

export function useQuestionStats(id: string | undefined) {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: keys.questionStats(id ?? ''),
    queryFn: () => catalogApi.questionStats(id!),
    enabled: !!id && isAuthenticated,
  });
}

export function useSubjectExams(id: string | undefined) {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: keys.subjectExams(id ?? ''),
    queryFn: () => catalogApi.exams(id!),
    enabled: !!id && isAuthenticated,
  });
}
