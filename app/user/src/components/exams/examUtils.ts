import { getQuestion } from '@/data';
import type { AnswerRecord, Attempt } from '@/store';
import type { ExamBlueprint, Localized, Question } from '@/types';

/** Resolve the blueprint's questions in paper order (missing ids are skipped). */
export function examQuestions(exam: ExamBlueprint): Question[] {
  return exam.questionIds.map((id) => getQuestion(id)).filter((q): q is Question => !!q);
}

/** Attempts remaining = blueprint allowance minus attempts used in-app. */
export function attemptsRemaining(exam: ExamBlueprint, used: number | undefined): number {
  return Math.max(0, exam.attemptsLeft - (used ?? 0));
}

export interface ScoredExam {
  answers: AnswerRecord[];
  correct: number;
  total: number;
  score: number;
}

/** Score an answer map (questionId → option index). Unanswered → chosenIndex -1. */
export function scoreExam(questions: Question[], answers: Record<string, number>): ScoredExam {
  const records: AnswerRecord[] = questions.map((q) => {
    const chosen = answers[q.id];
    const chosenIndex = typeof chosen === 'number' && chosen >= 0 ? chosen : -1;
    return { questionId: q.id, chosenIndex, correct: chosenIndex === q.correctIndex };
  });
  const correct = records.filter((r) => r.correct).length;
  const total = questions.length;
  return { answers: records, correct, total, score: total ? Math.round((correct / total) * 100) : 0 };
}

export interface TopicStat {
  key: string;
  topic: Localized;
  correct: number;
  total: number;
  /** 0–100 */
  accuracy: number;
  missed: number;
  /** Lessons linked to the missed questions in this topic (deduped, in paper order). */
  missedLessonIds: string[];
}

/** Group an attempt's answers by question topic. */
export function topicBreakdown(attempt: Attempt): TopicStat[] {
  const map = new Map<string, TopicStat>();
  for (const a of attempt.answers) {
    const q = getQuestion(a.questionId);
    if (!q) continue;
    const key = q.topic.en;
    const stat =
      map.get(key) ??
      ({ key, topic: q.topic, correct: 0, total: 0, accuracy: 0, missed: 0, missedLessonIds: [] } satisfies TopicStat);
    stat.total += 1;
    if (a.correct) stat.correct += 1;
    else {
      stat.missed += 1;
      if (q.lessonId && !stat.missedLessonIds.includes(q.lessonId)) stat.missedLessonIds.push(q.lessonId);
    }
    map.set(key, stat);
  }
  return [...map.values()].map((s) => ({ ...s, accuracy: s.total ? Math.round((s.correct / s.total) * 100) : 0 }));
}
