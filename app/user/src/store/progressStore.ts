import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { lessons } from '@/data';
import type { LessonStatus, SubjectId } from '@/types';
import { asyncJSONStorage } from './storage';

export interface LessonProgress {
  /** 0–100 */
  progress: number;
  /** Last playback position in seconds (for "Resume from 04:32"). */
  positionSec: number;
  status: LessonStatus;
}

export interface AnswerRecord {
  questionId: string;
  /** -1 when unanswered */
  chosenIndex: number;
  correct: boolean;
}

export type AttemptKind = 'quiz' | 'practice' | 'exam';

export interface Attempt {
  id: string;
  kind: AttemptKind;
  /** lessonId for quizzes, examId for exams, 'bank' for practice */
  refId: string;
  subjectId?: SubjectId;
  attemptNo: number;
  answers: AnswerRecord[];
  score: number; // 0–100
  correct: number;
  total: number;
  timeSpentSec: number;
  date: string; // ISO
}

/** In-progress exam state so the exam room can resume after interruption. */
export interface ExamDraft {
  examId: string;
  answers: Record<string, number>;
  flagged: string[];
  startedAt: number; // epoch ms
  endsAt: number; // epoch ms
  currentIndex: number;
}

interface ProgressState {
  lessonProgress: Record<string, LessonProgress>;
  attempts: Attempt[];
  notes: Record<string, string>;
  bookmarks: string[];
  examDrafts: Record<string, ExamDraft>;
  /** Exam attempts used, keyed by examId (added on top of blueprint attemptsLeft). */
  examAttemptsUsed: Record<string, number>;

  getLesson: (lessonId: string) => LessonProgress;
  savePosition: (lessonId: string, positionSec: number, durationSec: number) => void;
  markComplete: (lessonId: string) => void;
  /** Saves an attempt, assigning id/attemptNo/date. Returns the stored attempt. */
  addAttempt: (a: Omit<Attempt, 'id' | 'attemptNo' | 'date'>) => Attempt;
  getAttempt: (id: string) => Attempt | undefined;
  setNote: (lessonId: string, text: string) => void;
  toggleBookmark: (questionId: string) => void;
  isBookmarked: (questionId: string) => boolean;
  saveExamDraft: (draft: ExamDraft) => void;
  clearExamDraft: (examId: string) => void;
  /** Completion % across a subject (or all subjects when omitted). */
  subjectCompletion: (subjectId?: SubjectId) => number;
  completedCount: () => number;
  /** Average score of quiz attempts (0–100), seeded at 82 if none. */
  quizAverage: () => number;
}

const seedProgress = (): Record<string, LessonProgress> =>
  Object.fromEntries(
    lessons.map((l) => [
      l.id,
      {
        progress: l.progress,
        positionSec: l.status === 'in-progress' ? Math.round((l.duration * l.progress) / 100) : 0,
        status: l.status,
      },
    ]),
  );

export const useProgressStore = create<ProgressState>()(
  persist(
    (set, get) => ({
      lessonProgress: seedProgress(),
      attempts: [],
      notes: {},
      bookmarks: ['q3', 'q14', 'q27'],
      examDrafts: {},
      examAttemptsUsed: {},

      getLesson: (lessonId) =>
        get().lessonProgress[lessonId] ?? { progress: 0, positionSec: 0, status: 'not-started' },
      savePosition: (lessonId, positionSec, durationSec) =>
        set((s) => {
          const prev = s.lessonProgress[lessonId] ?? { progress: 0, positionSec: 0, status: 'not-started' as const };
          const pct = durationSec > 0 ? Math.min(100, Math.round((positionSec / durationSec) * 100)) : prev.progress;
          const progress = Math.max(prev.progress, pct);
          const status: LessonStatus = prev.status === 'completed' ? 'completed' : progress > 0 ? 'in-progress' : prev.status;
          return { lessonProgress: { ...s.lessonProgress, [lessonId]: { progress, positionSec, status } } };
        }),
      markComplete: (lessonId) =>
        set((s) => ({
          lessonProgress: {
            ...s.lessonProgress,
            [lessonId]: { progress: 100, positionSec: s.lessonProgress[lessonId]?.positionSec ?? 0, status: 'completed' },
          },
        })),
      addAttempt: (a) => {
        const attemptNo = get().attempts.filter((x) => x.kind === a.kind && x.refId === a.refId).length + 1;
        const attempt: Attempt = { ...a, id: `att-${Date.now()}`, attemptNo, date: new Date().toISOString() };
        set((s) => ({
          attempts: [attempt, ...s.attempts],
          examAttemptsUsed:
            a.kind === 'exam'
              ? { ...s.examAttemptsUsed, [a.refId]: (s.examAttemptsUsed[a.refId] ?? 0) + 1 }
              : s.examAttemptsUsed,
        }));
        return attempt;
      },
      getAttempt: (id) => get().attempts.find((a) => a.id === id),
      setNote: (lessonId, text) => set((s) => ({ notes: { ...s.notes, [lessonId]: text } })),
      toggleBookmark: (questionId) =>
        set((s) => ({
          bookmarks: s.bookmarks.includes(questionId)
            ? s.bookmarks.filter((b) => b !== questionId)
            : [...s.bookmarks, questionId],
        })),
      isBookmarked: (questionId) => get().bookmarks.includes(questionId),
      saveExamDraft: (draft) => set((s) => ({ examDrafts: { ...s.examDrafts, [draft.examId]: draft } })),
      clearExamDraft: (examId) =>
        set((s) => {
          const { [examId]: _removed, ...rest } = s.examDrafts;
          return { examDrafts: rest };
        }),
      subjectCompletion: (subjectId) => {
        const list = subjectId ? lessons.filter((l) => l.subjectId === subjectId) : lessons;
        if (!list.length) return 0;
        const lp = get().lessonProgress;
        const sum = list.reduce((acc, l) => acc + (lp[l.id]?.status === 'completed' ? 100 : (lp[l.id]?.progress ?? 0)), 0);
        return Math.round(sum / list.length);
      },
      completedCount: () => Object.values(get().lessonProgress).filter((p) => p.status === 'completed').length,
      quizAverage: () => {
        const q = get().attempts.filter((a) => a.kind === 'quiz');
        if (!q.length) return 82;
        return Math.round(q.reduce((acc, a) => acc + a.score, 0) / q.length);
      },
    }),
    {
      name: 'eduway.progress',
      storage: asyncJSONStorage,
      partialize: (s) => ({
        lessonProgress: s.lessonProgress,
        attempts: s.attempts,
        notes: s.notes,
        bookmarks: s.bookmarks,
        examDrafts: s.examDrafts,
        examAttemptsUsed: s.examAttemptsUsed,
      }),
    },
  ),
);
