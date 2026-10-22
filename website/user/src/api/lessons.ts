import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { get, put } from './client';
import { keys } from './keys';
import type { EffectiveQuizRule, LessonDetail, StreamUrlDto } from './types';

/** Lessons (CAT-05…10). */
export const lessonsApi = {
  get: (id: string) => get<LessonDetail>(`/lessons/${id}`),
  streamUrl: (id: string) => get<StreamUrlDto>(`/lessons/${id}/stream-url`),
  resourceUrl: (lessonId: string, resourceId: string) =>
    get<{ url: string; expiresAt: string; fileName: string; mimeType: string; sizeBytes: number }>(
      `/lessons/${lessonId}/resources/${resourceId}/url`,
    ),
  note: (id: string) => get<{ lessonId: string; text: string; updatedAt: string | null }>(`/lessons/${id}/note`),
  saveNote: (id: string, text: string) =>
    put<{ lessonId: string; text: string; updatedAt: string | null }>(`/lessons/${id}/note`, { text }),
  quizRule: (id: string) => get<EffectiveQuizRule>(`/lessons/${id}/quiz-rule`),
};

export function useLesson(id: string | undefined) {
  const { isAuthenticated } = useAuth();
  return useQuery({ queryKey: keys.lesson(id ?? ''), queryFn: () => lessonsApi.get(id!), enabled: !!id && isAuthenticated });
}

export function useLessonNote(id: string) {
  return useQuery({ queryKey: keys.lessonNote(id), queryFn: () => lessonsApi.note(id), meta: { silent: true } });
}

export function useSaveLessonNote(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => lessonsApi.saveNote(id, text),
    onSuccess: (note) => qc.setQueryData(keys.lessonNote(id), note),
  });
}

export function useQuizRule(id: string | undefined, enabled = true) {
  return useQuery({
    queryKey: keys.quizRule(id ?? ''),
    queryFn: () => lessonsApi.quizRule(id!),
    enabled: !!id && enabled,
    meta: { silent: true },
  });
}
