import { optionIdAt, optionIndex, toQuestion } from '@/api/adapters';
import type { AnswerRecordDto } from '@/api/types';
import type { Question } from '@/types';

/** One reviewed answer, in app shape (`chosenIndex` = index in the served options, −1 unanswered). */
export interface ReviewAnswer {
  questionId: string;
  question: Question;
  chosenIndex: number;
  correct: boolean;
}

/** Server answer records → review rows. */
export function toReviewAnswers(records: AnswerRecordDto[]): ReviewAnswer[] {
  return records.map((a) => {
    const question = toQuestion(a.question);
    const idx = a.chosenOptionId ? optionIndex(question, a.chosenOptionId) : a.chosenIndex;
    return { questionId: a.questionId, question, chosenIndex: idx, correct: a.correct };
  });
}

/** Answer map by option index (UI) → by option id (API). Unanswered questions are sent as null. */
export function toOptionIdMap(questions: Question[], answers: Record<string, number>): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const q of questions) {
    const i = answers[q.id];
    out[q.id] = typeof i === 'number' && i >= 0 ? (optionIdAt(q, i) ?? null) : null;
  }
  return out;
}

/** Answer map by option id (API) → by option index (UI). */
export function toIndexMap(questions: Question[], answers: Record<string, string | null>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const q of questions) {
    const idx = optionIndex(q, answers[q.id]);
    if (idx >= 0) out[q.id] = idx;
  }
  return out;
}
