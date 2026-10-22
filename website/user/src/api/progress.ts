import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { get, getPaged, patch, post, put, qs, sendKeepalive } from './client';
import { keys } from './keys';
import type {
  ActivityItem,
  LessonDetail,
  LessonProgressDto,
  PlanItem,
  ProgressSummaryDto,
  ScoreTrendDto,
  StreakCalendarDto,
  StudentDashboardDto,
  SubjectProgressDto,
  WatchBody,
  WeakTopicDto,
} from './types';

/** Progress & dashboard (PRG-01…13). */
export const progressApi = {
  watch: (body: WatchBody) => put<LessonProgressDto>('/progress/watch', { ...body, platform: 'web' }),
  /** Survives unload (pause/leave/visibilitychange). */
  watchKeepalive: (body: WatchBody) => sendKeepalive('PUT', '/progress/watch', { ...body, platform: 'web' }),
  complete: (lessonId: string) => post<LessonProgressDto>('/progress/complete', { lessonId }),
  dashboard: () => get<StudentDashboardDto>(`/progress/dashboard${qs({ tzOffsetMinutes: -new Date().getTimezoneOffset() })}`),
  subjects: () => get<SubjectProgressDto[]>('/progress/subjects'),
  summary: () => get<ProgressSummaryDto>('/progress/summary'),
  scoreTrend: (weeks = 8) => get<ScoreTrendDto>(`/progress/score-trend${qs({ weeks })}`),
  weakTopics: (limit = 5) => get<WeakTopicDto[]>(`/progress/weak-topics${qs({ limit })}`),
  streakCalendar: (weeks = 16) => get<StreakCalendarDto>(`/progress/streak-calendar${qs({ weeks })}`),
  activity: (limit = 10) => getPaged<ActivityItem>(`/progress/activity${qs({ limit })}`),
  todayPlan: () => get<PlanItem[]>('/progress/today-plan'),
  setPlanItem: (id: string, done: boolean) => patch<PlanItem>(`/progress/today-plan/${id}`, { done }),
};

function useAuthed() {
  return useAuth().isAuthenticated;
}

export const useDashboard = () => useQuery({ queryKey: keys.dashboard, queryFn: progressApi.dashboard, enabled: useAuthed() });
export const useSubjectProgress = () =>
  useQuery({ queryKey: keys.progressSubjects, queryFn: progressApi.subjects, enabled: useAuthed() });
export const useProgressSummary = () =>
  useQuery({ queryKey: keys.progressSummary, queryFn: progressApi.summary, enabled: useAuthed() });
export const useScoreTrend = (weeks = 8) =>
  useQuery({ queryKey: keys.scoreTrend(weeks), queryFn: () => progressApi.scoreTrend(weeks), enabled: useAuthed() });
export const useWeakTopics = (limit = 5) =>
  useQuery({ queryKey: keys.weakTopics(limit), queryFn: () => progressApi.weakTopics(limit), enabled: useAuthed() });
export const useStreakCalendar = (weeks = 16) =>
  useQuery({ queryKey: keys.streakCalendar(weeks), queryFn: () => progressApi.streakCalendar(weeks), enabled: useAuthed() });
export const useTodayPlan = () =>
  useQuery({ queryKey: keys.todayPlan, queryFn: progressApi.todayPlan, enabled: useAuthed(), meta: { silent: true } });

export function useSetPlanItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) => progressApi.setPlanItem(id, done),
    onMutate: async ({ id, done }) => {
      await qc.cancelQueries({ queryKey: keys.todayPlan });
      const prev = qc.getQueryData<PlanItem[]>(keys.todayPlan);
      qc.setQueryData<PlanItem[]>(keys.todayPlan, (xs) => xs?.map((x) => (x.id === id ? { ...x, done } : x)));
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(keys.todayPlan, ctx.prev),
  });
}

/** Applies a progress DTO to the cached lesson detail and invalidates aggregates when completed. */
export function useApplyLessonProgress() {
  const qc = useQueryClient();
  return (p: LessonProgressDto) => {
    qc.setQueryData<LessonDetail>(keys.lesson(p.lessonId), (l) =>
      l ? { ...l, status: p.status, progress: p.progress, positionSec: p.positionSec } : l,
    );
    if (p.justCompleted || p.status === 'completed') {
      void qc.invalidateQueries({ queryKey: keys.progress });
      void qc.invalidateQueries({ queryKey: ['catalog'] });
    }
  };
}

export function useCompleteLesson() {
  const apply = useApplyLessonProgress();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: progressApi.complete,
    onSuccess: (p) => {
      apply(p);
      void qc.invalidateQueries({ queryKey: keys.progress });
      void qc.invalidateQueries({ queryKey: ['catalog'] });
      void qc.invalidateQueries({ queryKey: ['lessons'] });
    },
  });
}
