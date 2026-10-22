import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, put } from './client';
import { qk } from './keys';
import type {
  EffectiveQuizRule,
  ExamCardDto,
  LessonDetail,
  LessonNoteDto,
  QuestionStatsDto,
  ResourceUrlDto,
  StreamUrlDto,
  SubjectDetail,
  SubjectSummary,
} from './types';

// CAT-01
export const fetchSubjects = () => get<SubjectSummary[]>('/subjects');
export const useSubjects = () => useQuery({ queryKey: qk.catalog.subjects, queryFn: fetchSubjects, staleTime: 60_000 });

// CAT-02 (uuid or slug)
export const useSubject = (id: string | undefined) =>
  useQuery({
    queryKey: qk.catalog.subject(id ?? ''),
    queryFn: () => get<SubjectDetail>(`/subjects/${encodeURIComponent(id!)}`),
    enabled: !!id,
  });

// CAT-03
export const useQuestionStats = (id: string | undefined, enabled = true) =>
  useQuery({
    queryKey: qk.catalog.questionStats(id ?? ''),
    queryFn: () => get<QuestionStatsDto>(`/subjects/${encodeURIComponent(id!)}/question-stats`),
    enabled: !!id && enabled,
    meta: { silent: true },
  });

// CAT-04
export const useSubjectExams = (id: string | undefined, enabled = true) =>
  useQuery({
    queryKey: qk.catalog.subjectExams(id ?? ''),
    queryFn: () => get<ExamCardDto[]>(`/subjects/${encodeURIComponent(id!)}/exams`),
    enabled: !!id && enabled,
    meta: { silent: true },
  });

// CAT-05
export const fetchLesson = (id: string) => get<LessonDetail>(`/lessons/${encodeURIComponent(id)}`);
export const useLesson = (id: string | undefined) =>
  useQuery({ queryKey: qk.catalog.lesson(id ?? ''), queryFn: () => fetchLesson(id!), enabled: !!id });

// CAT-06 — signed URL; refetched shortly before it expires.
export const fetchStreamUrl = (id: string) => get<StreamUrlDto>(`/lessons/${encodeURIComponent(id)}/stream-url`);
export const useStreamUrl = (id: string | undefined, enabled = true) =>
  useQuery({
    queryKey: qk.catalog.stream(id ?? ''),
    queryFn: () => fetchStreamUrl(id!),
    enabled: !!id && enabled,
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    meta: { silent: true },
    refetchInterval: (q) => {
      const exp = q.state.data?.expiresAt;
      if (!exp) return false;
      const ms = new Date(exp).getTime() - Date.now() - 60_000;
      return ms > 5_000 ? ms : 5_000;
    },
    refetchOnWindowFocus: false,
  });

// CAT-07
export const getResourceUrl = (lessonId: string, resourceId: string) =>
  get<ResourceUrlDto>(`/lessons/${encodeURIComponent(lessonId)}/resources/${encodeURIComponent(resourceId)}/url`);

// CAT-08
export const useLessonNote = (lessonId: string | undefined) =>
  useQuery({
    queryKey: qk.catalog.note(lessonId ?? ''),
    queryFn: () => get<LessonNoteDto>(`/lessons/${encodeURIComponent(lessonId!)}/note`),
    enabled: !!lessonId,
    meta: { silent: true },
  });

// CAT-09
export const saveLessonNote = (lessonId: string, text: string) =>
  put<LessonNoteDto>(`/lessons/${encodeURIComponent(lessonId)}/note`, { text });

export function useSaveLessonNote(lessonId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => put<LessonNoteDto>(`/lessons/${encodeURIComponent(lessonId)}/note`, { text }),
    onMutate: (text) => {
      qc.setQueryData<LessonNoteDto>(qk.catalog.note(lessonId), (old) => ({
        lessonId,
        text,
        updatedAt: old?.updatedAt ?? null,
      }));
    },
    onSuccess: (note) => qc.setQueryData(qk.catalog.note(lessonId), note),
  });
}

// CAT-10
export const useQuizRule = (lessonId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: qk.catalog.quizRule(lessonId ?? ''),
    queryFn: () => get<EffectiveQuizRule>(`/lessons/${encodeURIComponent(lessonId!)}/quiz-rule`),
    enabled: !!lessonId && enabled,
    meta: { silent: true },
  });
