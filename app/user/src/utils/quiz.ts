import { getLesson, lessonsBySubject, questions } from '@/data';
import type { AnswerRecord } from '@/store/progressStore';
import type { Lesson, Question } from '@/types';
import { shuffle } from './format';

/** Score (0–100) needed to pass a lesson quiz. */
export const QUIZ_PASS_MARK = 60;

/**
 * Questions for a lesson quiz: the lesson's own questions first, topped up to `n`
 * from the same unit, then the same subject. Final list is shuffled.
 */
export function pickQuizQuestions(lessonId: string, n = 5, seed?: number): Question[] {
  const lesson = getLesson(lessonId);
  const own = questions.filter((q) => q.lessonId === lessonId);
  const picked: Question[] = shuffle(own, seed).slice(0, n);
  const taken = new Set(picked.map((q) => q.id));
  const topUp = (pool: Question[]) => {
    for (const q of shuffle(pool, seed)) {
      if (picked.length >= n) return;
      if (taken.has(q.id)) continue;
      picked.push(q);
      taken.add(q.id);
    }
  };
  if (lesson) {
    topUp(questions.filter((q) => q.unitId === lesson.unitId));
    topUp(questions.filter((q) => q.subjectId === lesson.subjectId));
  } else {
    topUp(questions);
  }
  return shuffle(picked, seed);
}

/** Random display order of a question's options (indexes into `question.options`). */
export function makeOptionOrder(question: Question, seed?: number): number[] {
  return shuffle(
    question.options.map((_, i) => i),
    seed,
  );
}

export interface QuizScore {
  answers: AnswerRecord[];
  correct: number;
  total: number;
  /** 0–100, rounded */
  score: number;
  passed: boolean;
}

/** Score answers keyed by questionId (missing / -1 = unanswered → incorrect). */
export function scoreAnswers(qs: readonly Question[], chosen: Record<string, number | undefined>): QuizScore {
  const answers: AnswerRecord[] = qs.map((q) => {
    const chosenIndex = chosen[q.id] ?? -1;
    return { questionId: q.id, chosenIndex, correct: chosenIndex === q.correctIndex };
  });
  const correct = answers.filter((a) => a.correct).length;
  const total = qs.length;
  const score = total ? Math.round((correct / total) * 100) : 0;
  return { answers, correct, total, score, passed: score >= QUIZ_PASS_MARK };
}

export type ScoreBand = 'excellent' | 'good' | 'keepGoing';

export function scoreBand(score: number): ScoreBand {
  if (score >= 85) return 'excellent';
  if (score >= QUIZ_PASS_MARK) return 'good';
  return 'keepGoing';
}

/** Next lesson (by order) in the same subject, if any. */
export function nextLessonOf(lessonId: string): Lesson | undefined {
  const lesson = getLesson(lessonId);
  if (!lesson) return undefined;
  const list = lessonsBySubject(lesson.subjectId);
  const idx = list.findIndex((l) => l.id === lessonId);
  return idx >= 0 ? list[idx + 1] : undefined;
}

/** Option letter for a display position (A/B/C/D or أ/ب/ج/د). */
export function optionLetter(index: number, isAr: boolean): string {
  const en = ['A', 'B', 'C', 'D', 'E', 'F'];
  const ar = ['أ', 'ب', 'ج', 'د', 'هـ', 'و'];
  return (isAr ? ar : en)[index] ?? String(index + 1);
}
