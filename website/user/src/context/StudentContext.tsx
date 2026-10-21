import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  lessons as seedLessons,
  mistakes as seedMistakes,
  notifications as seedNotifications,
  demoUser,
} from '@/data';
import { useAuth } from '@/hooks/useAuth';
import { readStore, writeStore } from '@/lib/storage';
import type { AppNotification, LessonStatus, Mistake, MistakeStatus } from '@/types';

/** Result of a finished exam simulation, used by the result page. */
export interface ExamAttempt {
  id: string;
  examId: string;
  answers: Record<string, number | null>; // questionId -> chosen index
  flagged: string[];
  questionIds: string[];
  timeSpentSec: number;
  finishedAt: string;
  autoSubmitted: boolean;
}

interface LessonProgress {
  status: LessonStatus;
  progress: number;
  position?: number; // seconds into the video
}

interface StudentState {
  lessonProgress: Record<string, LessonProgress>;
  mistakes: Mistake[];
  bookmarks: string[];
  notifications: AppNotification[];
  aiUsed: number;
  attempts: ExamAttempt[];
  quizScores: Record<string, number>; // lessonId -> best % score
}

export interface StudentContextValue extends StudentState {
  getLessonProgress: (lessonId: string) => LessonProgress;
  saveVideoPosition: (lessonId: string, seconds: number, duration: number) => void;
  markLessonComplete: (lessonId: string) => void;
  /** Push a wrong answer into My Mistakes (increments repeat count when already present). */
  addMistake: (questionId: string, chosenIndex: number, source: Mistake['source']) => void;
  setMistakeStatus: (mistakeId: string, status: MistakeStatus) => void;
  toggleBookmark: (questionId: string) => void;
  isBookmarked: (questionId: string) => boolean;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  unreadCount: number;
  consumeAiQuestion: () => boolean;
  aiQuota: number;
  saveAttempt: (attempt: ExamAttempt) => void;
  getAttempt: (id: string) => ExamAttempt | undefined;
  recordQuizScore: (lessonId: string, pct: number) => void;
  resetDemo: () => void;
}

export const StudentContext = createContext<StudentContextValue | null>(null);

const KEY = 'eduway.student.v1';

const seed = (): StudentState => ({
  lessonProgress: Object.fromEntries(
    seedLessons.map((l) => [
      l.id,
      {
        status: l.status,
        progress: l.progress,
        position: l.status === 'in-progress' ? Math.round((l.duration * l.progress) / 100) : 0,
      },
    ]),
  ),
  mistakes: seedMistakes,
  bookmarks: ['q4', 'q12', 'q20', 'q34', 'q41'],
  notifications: seedNotifications,
  aiUsed: demoUser.aiUsed,
  attempts: [],
  quizScores: {},
});

export function StudentProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StudentState>(() => readStore<StudentState>(KEY, seed()));

  useEffect(() => writeStore(KEY, state), [state]);

  const getLessonProgress = useCallback(
    (lessonId: string) => state.lessonProgress[lessonId] ?? { status: 'not-started' as const, progress: 0 },
    [state.lessonProgress],
  );

  const saveVideoPosition = useCallback((lessonId: string, seconds: number, duration: number) => {
    setState((s) => {
      const prev = s.lessonProgress[lessonId] ?? { status: 'not-started', progress: 0 };
      const pct = duration > 0 ? Math.round((seconds / duration) * 100) : prev.progress;
      return {
        ...s,
        lessonProgress: {
          ...s.lessonProgress,
          [lessonId]: {
            status: prev.status === 'completed' ? 'completed' : 'in-progress',
            progress: prev.status === 'completed' ? 100 : Math.max(prev.progress, Math.min(99, pct)),
            position: seconds,
          },
        },
      };
    });
  }, []);

  const markLessonComplete = useCallback((lessonId: string) => {
    setState((s) => ({
      ...s,
      lessonProgress: {
        ...s.lessonProgress,
        [lessonId]: { ...s.lessonProgress[lessonId], status: 'completed', progress: 100 },
      },
    }));
  }, []);

  const addMistake = useCallback((questionId: string, chosenIndex: number, source: Mistake['source']) => {
    setState((s) => {
      const existing = s.mistakes.find((m) => m.questionId === questionId);
      const now = new Date().toISOString();
      if (existing) {
        return {
          ...s,
          mistakes: s.mistakes.map((m) =>
            m.id === existing.id
              ? { ...m, chosenIndex, repeatCount: m.repeatCount + 1, status: 'unresolved', date: now, source }
              : m,
          ),
        };
      }
      const m: Mistake = {
        id: `m-${Date.now()}-${questionId}`,
        questionId,
        chosenIndex,
        status: 'unresolved',
        repeatCount: 1,
        date: now,
        source,
      };
      return { ...s, mistakes: [m, ...s.mistakes] };
    });
  }, []);

  const setMistakeStatus = useCallback((mistakeId: string, status: MistakeStatus) => {
    setState((s) => ({
      ...s,
      mistakes: s.mistakes.map((m) => (m.id === mistakeId ? { ...m, status } : m)),
    }));
  }, []);

  const toggleBookmark = useCallback((questionId: string) => {
    setState((s) => ({
      ...s,
      bookmarks: s.bookmarks.includes(questionId)
        ? s.bookmarks.filter((b) => b !== questionId)
        : [...s.bookmarks, questionId],
    }));
  }, []);

  const isBookmarked = useCallback((qid: string) => state.bookmarks.includes(qid), [state.bookmarks]);

  const markNotificationRead = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
    }));
  }, []);

  const markAllNotificationsRead = useCallback(() => {
    setState((s) => ({ ...s, notifications: s.notifications.map((n) => ({ ...n, read: true })) }));
  }, []);

  const { user } = useAuth();
  const aiQuota = user?.aiQuota ?? demoUser.aiQuota;
  const consumeAiQuestion = useCallback(() => {
    if (state.aiUsed >= aiQuota) return false;
    setState((s) => ({ ...s, aiUsed: Math.min(aiQuota, s.aiUsed + 1) }));
    return true;
  }, [aiQuota, state.aiUsed]);

  const saveAttempt = useCallback((attempt: ExamAttempt) => {
    setState((s) => ({ ...s, attempts: [attempt, ...s.attempts.filter((a) => a.id !== attempt.id)] }));
  }, []);

  const getAttempt = useCallback((id: string) => state.attempts.find((a) => a.id === id), [state.attempts]);

  const recordQuizScore = useCallback((lessonId: string, pct: number) => {
    setState((s) => ({
      ...s,
      quizScores: { ...s.quizScores, [lessonId]: Math.max(pct, s.quizScores[lessonId] ?? 0) },
    }));
  }, []);

  const resetDemo = useCallback(() => setState(seed()), []);

  const value = useMemo<StudentContextValue>(
    () => ({
      ...state,
      getLessonProgress,
      saveVideoPosition,
      markLessonComplete,
      addMistake,
      setMistakeStatus,
      toggleBookmark,
      isBookmarked,
      markNotificationRead,
      markAllNotificationsRead,
      unreadCount: state.notifications.filter((n) => !n.read).length,
      consumeAiQuestion,
      aiQuota,
      saveAttempt,
      getAttempt,
      recordQuizScore,
      resetDemo,
    }),
    [
      state,
      getLessonProgress,
      saveVideoPosition,
      markLessonComplete,
      addMistake,
      setMistakeStatus,
      toggleBookmark,
      isBookmarked,
      markNotificationRead,
      markAllNotificationsRead,
      consumeAiQuestion,
      aiQuota,
      saveAttempt,
      getAttempt,
      recordQuizScore,
      resetDemo,
    ],
  );

  return <StudentContext.Provider value={value}>{children}</StudentContext.Provider>;
}
