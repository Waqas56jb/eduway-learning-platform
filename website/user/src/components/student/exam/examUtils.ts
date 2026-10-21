import type { ExamAttempt } from '@/context/StudentContext';
import { getQuestion } from '@/data';
import { readStore, writeStore } from '@/lib/storage';
import type { ExamBlueprint } from '@/types';

/** In-progress exam state persisted per exam so a refresh never resets the clock or answers. */
export interface ExamSession {
  examId: string;
  startedAt: number;
  endAt: number;
  order: string[];
  answers: Record<string, number | null>;
  flagged: string[];
  current: number;
  savedAt: number;
}

export const examSessionKey = (examId: string) => `eduway.exam.session.${examId}`;

export function readExamSession(exam: ExamBlueprint): ExamSession | null {
  const s = readStore<ExamSession | null>(examSessionKey(exam.id), null);
  if (!s || s.examId !== exam.id || !Array.isArray(s.order) || s.order.length !== exam.questionIds.length) return null;
  return s;
}

export const writeExamSession = (s: ExamSession) => writeStore(examSessionKey(s.examId), s);
export const clearExamSession = (examId: string) => writeStore(examSessionKey(examId), null);

export interface AttemptScore {
  total: number;
  correct: number;
  incorrect: number;
  unanswered: number;
  pct: number;
}

export function scoreAttempt(a: Pick<ExamAttempt, 'answers' | 'questionIds'>): AttemptScore {
  let correct = 0;
  let incorrect = 0;
  let unanswered = 0;
  for (const qid of a.questionIds) {
    const q = getQuestion(qid);
    const ans = a.answers[qid];
    if (ans === null || ans === undefined) unanswered++;
    else if (q && ans === q.correctIndex) correct++;
    else incorrect++;
  }
  const total = a.questionIds.length;
  return { total, correct, incorrect, unanswered, pct: total ? Math.round((correct / total) * 100) : 0 };
}

export function attemptsLeftFor(exam: ExamBlueprint, attempts: ExamAttempt[]) {
  const used = attempts.filter((a) => a.examId === exam.id).length;
  return Math.max(0, exam.attemptsLeft - used);
}

export function bestScoreFor(exam: ExamBlueprint, attempts: ExamAttempt[]): number | undefined {
  const scores = attempts.filter((a) => a.examId === exam.id).map((a) => scoreAttempt(a).pct);
  if (typeof exam.bestScore === 'number') scores.push(exam.bestScore);
  return scores.length ? Math.max(...scores) : undefined;
}

export type Grade = 'excellent' | 'veryGood' | 'good' | 'pass' | 'needsWork';

export function gradeFor(pct: number, passMark: number): Grade {
  if (pct >= 90) return 'excellent';
  if (pct >= 80) return 'veryGood';
  if (pct >= 65) return 'good';
  if (pct >= passMark) return 'pass';
  return 'needsWork';
}

/** Past attempt dates for the seeded best scores (deterministic demo history). */
const DEMO_DATES: Record<string, string> = {
  'exam-math-final': '2026-10-20T18:30:00Z',
  'exam-physics-mid': '2026-10-16T17:10:00Z',
  'exam-chem-organic': '2026-10-13T16:45:00Z',
};

export const DEMO_PREFIX = 'demo-';

/**
 * Deterministic sample attempt so the result page is never empty. Aims for the blueprint's
 * best score (or 75%) with one unanswered question when there are mistakes.
 */
export function buildDemoAttempt(exam: ExamBlueprint, id = `${DEMO_PREFIX}${exam.id}`): ExamAttempt {
  const n = exam.questionIds.length;
  const target = Math.round(((exam.bestScore ?? 75) / 100) * n);
  const answers: Record<string, number | null> = {};
  let firstMiss = true;
  exam.questionIds.forEach((qid, i) => {
    const q = getQuestion(qid);
    const rank = (i * 7) % n; // spreads misses through the paper
    if (!q) answers[qid] = null;
    else if (rank < target) answers[qid] = q.correctIndex;
    else if (firstMiss) {
      answers[qid] = null;
      firstMiss = false;
    } else answers[qid] = (q.correctIndex + 1) % q.options.length;
  });
  const timeSpentSec = Math.round(exam.durationMin * 60 * 0.82);
  return {
    id,
    examId: exam.id,
    answers,
    flagged: exam.questionIds.filter((_, i) => i % 5 === 3),
    questionIds: exam.questionIds,
    timeSpentSec,
    finishedAt: DEMO_DATES[exam.id] ?? '2026-10-18T17:00:00Z',
    autoSubmitted: false,
  };
}
