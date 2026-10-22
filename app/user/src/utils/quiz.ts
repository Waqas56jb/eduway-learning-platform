import { toQuestion } from '@/api/adapters';
import type { AnswerRecordDto } from '@/api/types';
import type { Question } from '@/types';

/** Fallback pass mark; the real one comes from the lesson's quiz rule (`passThreshold`). */
export const QUIZ_PASS_MARK = 60;

/** One answered question in a review list. `chosenIndex` indexes `question.options` (‑1 = unanswered). */
export interface AnswerRecord {
  questionId: string;
  chosenIndex: number;
  correct: boolean;
}

export type ScoreBand = 'excellent' | 'good' | 'keepGoing';

export function scoreBand(score: number, passMark = QUIZ_PASS_MARK): ScoreBand {
  if (score >= 85) return 'excellent';
  if (score >= passMark) return 'good';
  return 'keepGoing';
}

/** Server review rows → app questions (with answers revealed) + answer records. */
export function reviewFromAnswers(rows: AnswerRecordDto[]): { questions: Question[]; answers: AnswerRecord[] } {
  const questions: Question[] = [];
  const answers: AnswerRecord[] = [];
  for (const r of rows) {
    const q = toQuestion(r.question);
    questions.push(q);
    const idx = r.chosenOptionId ? (q.optionIds?.indexOf(r.chosenOptionId) ?? -1) : r.chosenIndex;
    answers.push({ questionId: r.questionId, chosenIndex: idx ?? -1, correct: r.correct });
  }
  return { questions, answers };
}

/** Option letter for a display position (A/B/C/D or أ/ب/ج/د). */
export function optionLetter(index: number, isAr: boolean): string {
  const en = ['A', 'B', 'C', 'D', 'E', 'F'];
  const ar = ['أ', 'ب', 'ج', 'د', 'هـ', 'و'];
  return (isAr ? ar : en)[index] ?? String(index + 1);
}

/** Merge instant answer feedback into a question so QuestionView can reveal it. */
export function revealQuestion(
  q: Question,
  fb: { correctIndex: number; correctOptionId: string | null; explanation: { en: string; ar: string } | null },
): Question {
  const byId = fb.correctOptionId ? (q.optionIds?.indexOf(fb.correctOptionId) ?? -1) : -1;
  return {
    ...q,
    correctIndex: byId >= 0 ? byId : fb.correctIndex,
    explanation: fb.explanation ?? q.explanation,
  };
}
