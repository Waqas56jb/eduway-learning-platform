import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CLIENT_PLATFORM } from './config';
import { get, getPaged, patch, post, put } from './client';
import { qk } from './keys';
import type {
  AchievementDto,
  ActivityItem,
  LessonProgressDto,
  PlanItemDto,
  ProgressSummaryDto,
  ScoreTrendDto,
  StreakCalendarDto,
  StudentDashboardDto,
  SubjectProgressDto,
  WatchBody,
  WeakTopicDto,
} from './types';

const tzOffsetMinutes = () => -new Date().getTimezoneOffset();

// PRG-01 — fire-and-forget heartbeat (idempotent).
export const putWatch = (body: WatchBody) =>
  put<LessonProgressDto>('/progress/watch', { ...body, platform: CLIENT_PLATFORM });

// PRG-02
export const completeLesson = (lessonId: string) => post<LessonProgressDto>('/progress/complete', { lessonId });

// PRG-03
export const useLessonProgressList = (subjectId?: string) =>
  useQuery({
    queryKey: qk.progress.lessons(subjectId),
    queryFn: () => get<LessonProgressDto[]>('/progress/lessons', { subjectId }),
    meta: { silent: true },
  });

// PRG-04
export const useDashboard = () =>
  useQuery({
    queryKey: qk.progress.dashboard,
    queryFn: () => get<StudentDashboardDto>('/progress/dashboard', { tzOffsetMinutes: tzOffsetMinutes() }),
  });

// PRG-05
export const useProgressSubjects = () =>
  useQuery({ queryKey: qk.progress.subjects, queryFn: () => get<SubjectProgressDto[]>('/progress/subjects') });

// PRG-06
export const useProgressSummary = () =>
  useQuery({ queryKey: qk.progress.summary, queryFn: () => get<ProgressSummaryDto>('/progress/summary') });

// PRG-07
export const useScoreTrend = (weeks = 8) =>
  useQuery({
    queryKey: qk.progress.scoreTrend(weeks),
    queryFn: () => get<ScoreTrendDto>('/progress/score-trend', { weeks }),
    meta: { silent: true },
  });

// PRG-08
export const useWeakTopics = (limit = 5) =>
  useQuery({
    queryKey: qk.progress.weakTopics(limit),
    queryFn: () => get<WeakTopicDto[]>('/progress/weak-topics', { limit }),
    meta: { silent: true },
  });

// PRG-09
export const useStreakCalendar = (weeks = 16) =>
  useQuery({
    queryKey: qk.progress.streak(weeks),
    queryFn: () => get<StreakCalendarDto>('/progress/streak-calendar', { weeks }),
    meta: { silent: true },
  });

// PRG-10
export const useActivity = (limit = 10) =>
  useQuery({
    queryKey: qk.progress.activity(limit),
    queryFn: async () => (await getPaged<ActivityItem>('/progress/activity', { limit })).items,
    meta: { silent: true },
  });

// PRG-11
export const useTodayPlan = () =>
  useQuery({
    queryKey: qk.progress.todayPlan,
    queryFn: () => get<PlanItemDto[]>('/progress/today-plan'),
    meta: { silent: true },
  });

// PRG-12 (optimistic checkbox)
export function useTogglePlanItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) =>
      patch<PlanItemDto>(`/progress/today-plan/${encodeURIComponent(id)}`, { done }),
    onMutate: async ({ id, done }) => {
      await qc.cancelQueries({ queryKey: qk.progress.todayPlan });
      const prev = qc.getQueryData<PlanItemDto[]>(qk.progress.todayPlan);
      qc.setQueryData<PlanItemDto[]>(qk.progress.todayPlan, (old) => old?.map((p) => (p.id === id ? { ...p, done } : p)));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.progress.todayPlan, ctx.prev);
    },
  });
}

// PRG-13
export const useAchievements = () =>
  useQuery({
    queryKey: qk.progress.achievements,
    queryFn: () => get<AchievementDto[]>('/progress/achievements'),
    meta: { silent: true },
  });
