/**
 * Student quizzes (QUZ-01…05, CAT-10): randomized pool → up to 5 alternative sets (rotated per attempt),
 * shuffled questions/options per attempt, instant per-answer feedback, mistakes on wrong answers, retry policy.
 */
import { T } from '../../config/constants.js';
import { db, tx } from '../../config/db.js';
import { entitlements } from '../../common/entitlements.js';
import { NotFoundError } from '../../common/errors/index.js';
import type { Localized } from '../../common/i18n/index.js';
import {
  bookmarkedQuestionIds,
  bumpQuestionStats,
  buildQuizSets,
  conflictError,
  grade,
  loadQuestions,
  pctScore,
  quizRetryState,
  randomizePaper,
  recordActivity,
  reevaluateAchievementsLater,
  rngFor,
  ruleError,
  setForAttempt,
  toPublic,
  toReview,
  type QuestionPublic,
  type QuestionReview,
} from '../learning-core/index.js';
import { assertLessonUnlocked, lessonSummariesFor } from '../content/index.js';
import { mistakeEntry, recordWrongAnswer, type AnswerFeedback } from '../mistakes/index.js';
import { effectiveQuizRuleDto, effectiveRule, lessonPool, requireLiveLesson, type EffectiveQuizRuleDto } from './engine.js';

export interface AnswerRecord {
  questionId: string;
  question: QuestionReview;
  chosenOptionId: string | null;
  chosenIndex: number;
  textAnswer: string | null;
  correct: boolean;
  flagged: boolean;
  timeSec: number | null;
}

export interface QuizResultDto {
  attemptId: string;
  lessonId: string;
  attemptNo: number;
  score: number;
  correct: number;
  total: number;
  passed: boolean;
  passThreshold: number;
  timeSpentSec: number;
  mistakesAdded: number;
  bestScore: number;
  nextLessonId: string | null;
  unlockedNextLesson: boolean;
  answers: AnswerRecord[];
}

interface AttemptRow {
  id: string;
  user_id: string;
  lesson_id: string;
  attempt_number: number;
  question_ids: string[];
  option_orders: Record<string, string[]>;
  status: 'in_progress' | 'passed' | 'failed' | 'abandoned';
  score: number | null;
  correct_count: number;
  total_count: number;
  pass_threshold: number;
  started_at: Date;
  submitted_at: Date | null;
  time_sec: number;
  mistakes_added: number;
}

async function attempt(userId: string, id: string, lock = false, ex?: Parameters<typeof db.maybeOne>[2]): Promise<AttemptRow> {
  const r = await db.maybeOne<AttemptRow>(`SELECT * FROM ${T.quiz_attempts} WHERE id = $1 AND user_id = $2 ${lock ? 'FOR UPDATE' : ''}`, [id, userId], ex);
  if (!r) throw new NotFoundError('attempt');
  return r;
}

async function answersOf(attemptId: string) {
  return db.many<{ question_id: string; selected_option_id: string | null; text_answer: string | null; is_correct: boolean; time_sec: number }>(
    `SELECT question_id, selected_option_id, text_answer, is_correct, time_sec FROM ${T.quiz_attempt_answers} WHERE attempt_id = $1`,
    [attemptId],
  );
}

/** Answer records for review (served order; unanswered → chosenIndex −1). */
export async function answerRecords(questionIds: string[], optionOrders: Record<string, string[]>, answers: { question_id: string; selected_option_id: string | null; text_answer?: string | null; is_correct: boolean | null; time_sec?: number | null; flagged?: boolean }[], userId: string): Promise<AnswerRecord[]> {
  const [loaded, bm] = await Promise.all([loadQuestions(questionIds), bookmarkedQuestionIds(userId)]);
  const byQ = new Map(answers.map((a) => [a.question_id, a]));
  const out: AnswerRecord[] = [];
  for (const id of questionIds) {
    const q = loaded.get(id);
    if (!q) continue;
    const order = optionOrders[id];
    const a = byQ.get(id);
    const review = toReview(q, { order, bookmarked: bm.has(id) });
    out.push({
      questionId: id,
      question: review,
      chosenOptionId: a?.selected_option_id ?? null,
      chosenIndex: a?.selected_option_id ? review.options.findIndex((o) => o.id === a.selected_option_id) : -1,
      textAnswer: a?.text_answer ?? null,
      correct: !!a?.is_correct,
      flagged: !!a?.flagged,
      timeSec: a?.time_sec ?? null,
    });
  }
  return out;
}

async function resultOf(a: AttemptRow): Promise<QuizResultDto> {
  const answers = await answersOf(a.id);
  const best = (await db.scalar<number>(`SELECT max(score) FROM ${T.quiz_attempts} WHERE user_id = $1 AND lesson_id = $2 AND status IN ('passed','failed')`, [a.user_id, a.lesson_id])) ?? 0;
  const lessons = await lessonSummariesFor(a.user_id, [(await requireLiveLesson(a.lesson_id)).subject_id]);
  const idx = lessons.findIndex((l) => l.id === a.lesson_id);
  const next = lessons[idx + 1] ?? null;
  const correct = answers.filter((x) => x.is_correct).length;
  const total = a.question_ids.length;
  const score = a.score !== null ? Number(a.score) : pctScore(correct, total);
  return {
    attemptId: a.id,
    lessonId: a.lesson_id,
    attemptNo: a.attempt_number,
    score,
    correct,
    total,
    passed: a.status === 'passed' || (a.status === 'in_progress' && score >= a.pass_threshold),
    passThreshold: a.pass_threshold,
    timeSpentSec: a.time_sec,
    mistakesAdded: a.mistakes_added,
    bestScore: Number(best),
    nextLessonId: next?.id ?? null,
    unlockedNextLesson: !!next && !next.locked && a.status === 'passed',
    answers: await answerRecords(a.question_ids, a.option_orders ?? {}, answers, a.user_id),
  };
}

export const quizzesService = {
  async rule(lessonIdOrSlug: string, userId: string): Promise<EffectiveQuizRuleDto> {
    const lesson = await requireLiveLesson(lessonIdOrSlug);
    return effectiveQuizRuleDto(lesson, userId);
  },

  async start(lessonIdOrSlug: string, userId: string, platform: string | null) {
    const { lesson } = await assertLessonUnlocked(lessonIdOrSlug, userId);
    const { values } = await effectiveRule(lesson);
    const rule = await effectiveQuizRuleDto(lesson, userId);
    const retry = quizRetryState(values, rule.attemptsUsed, (await db.scalar<Date>(`SELECT max(submitted_at) FROM ${T.quiz_attempts} WHERE user_id = $1 AND lesson_id = $2 AND status IN ('passed','failed')`, [userId, lesson.id])) ?? null);
    if (!retry.allowed) throw ruleError(retry.reason ?? 'QUIZ_RETRY_EXHAUSTED', retry.retryAt ? { retryAt: retry.retryAt.toISOString() } : { attemptsUsed: rule.attemptsUsed });
    const pool = await lessonPool(lesson, values.poolSize);
    if (!pool.length) throw ruleError('QUIZ_NO_QUESTIONS', { lessonId: lesson.id });
    const sets = buildQuizSets(pool, values.questionCount, values.alternativeSets, `${lesson.id}:${values.questionCount}:${pool.length}`);
    const attemptNo = rule.attemptsUsed + 1;
    const setNo = setForAttempt(attemptNo, sets.length);
    const set = sets[setNo - 1] as string[];
    const loaded = await loadQuestions(set);
    const created = await tx(async (c) => {
      await db.query(`UPDATE ${T.quiz_attempts} SET status = 'abandoned' WHERE user_id = $1 AND lesson_id = $2 AND status = 'in_progress'`, [userId, lesson.id], c);
      for (const [i, s] of sets.entries()) {
        await db.query(
          `INSERT INTO ${T.quiz_sets} (lesson_id, set_number, question_ids) VALUES ($1,$2,$3)
           ON CONFLICT (lesson_id, set_number) DO UPDATE SET question_ids = EXCLUDED.question_ids`,
          [lesson.id, i + 1, s],
          c,
        );
      }
      const setRow = await db.maybeOne<{ id: string }>(`SELECT id FROM ${T.quiz_sets} WHERE lesson_id = $1 AND set_number = $2`, [lesson.id, setNo], c);
      const a = await db.one<{ id: string; started_at: Date }>(
        `INSERT INTO ${T.quiz_attempts} (user_id, lesson_id, quiz_set_id, set_number, attempt_number, question_ids, option_orders, status, total_count, pass_threshold, platform)
         VALUES ($1,$2,$3,$4,$5,'{}'::uuid[],'{}'::jsonb,'in_progress',$6,$7,$8) RETURNING id, started_at`,
        [userId, lesson.id, setRow?.id ?? null, setNo, attemptNo, set.length, values.passThreshold, platform === 'web' || platform === 'ios' || platform === 'android' ? platform : null],
        c,
      );
      const rnd = rngFor(`quiz:${a.id}`);
      const paper = randomizePaper(set, new Map(set.map((id) => [id, (loaded.get(id)?.options ?? []).map((o) => o.id)])), { randomizeQuestions: values.randomize, randomizeOptions: values.randomize, rnd });
      await db.query(`UPDATE ${T.quiz_attempts} SET question_ids = $2, option_orders = $3::jsonb WHERE id = $1`, [a.id, paper.order, JSON.stringify(paper.optionOrders)], c);
      return { ...a, paper };
    });
    const bm = await bookmarkedQuestionIds(userId);
    const questions: QuestionPublic[] = created.paper.order.map((id) => loaded.get(id)).filter((q) => !!q).map((q) => toPublic(q!, { order: created.paper.optionOrders[q!.row.id], bookmarked: bm.has(q!.row.id) }));
    return { attemptId: created.id, lessonId: lesson.id, setNo, attemptNo, rule, questions, startedAt: created.started_at.toISOString() };
  },

  async answer(attemptId: string, userId: string, body: { questionId: string; optionId?: string; textAnswer?: string; timeSec?: number }, platform: string | null): Promise<AnswerFeedback> {
    const a = await attempt(userId, attemptId);
    if (a.status !== 'in_progress') throw conflictError('ATTEMPT_CLOSED');
    if (!a.question_ids.includes(body.questionId)) throw ruleError('QUESTION_NOT_IN_ATTEMPT');
    const lesson = await requireLiveLesson(a.lesson_id);
    if (!lesson.is_free_preview) await entitlements.assertAccess(userId, lesson.subject_id, { feature: 'quiz' });
    const q = (await loadQuestions([body.questionId])).get(body.questionId);
    if (!q) throw new NotFoundError('question');
    const order = a.option_orders?.[body.questionId];
    const g = grade(q, { optionId: body.optionId, textAnswer: body.textAnswer }, order);
    if (!g.answered) throw ruleError('ANSWER_REQUIRED');
    const { values } = await effectiveRule(lesson);
    const mistakeId = await tx(async (c) => {
      const ins = await db.query(
        `INSERT INTO ${T.quiz_attempt_answers} (attempt_id, question_id, selected_option_id, text_answer, is_correct, time_sec)
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (attempt_id, question_id) DO NOTHING`,
        [a.id, q.row.id, g.chosenOptionId, g.textAnswer, g.correct, Math.max(0, Math.round(body.timeSec ?? 0))],
        c,
      );
      if (!ins.rowCount) throw conflictError('ALREADY_ANSWERED');
      await bumpQuestionStats(q.row.id, g.correct, c);
      await recordActivity(userId, { questionsAnswered: 1, questionsCorrect: g.correct ? 1 : 0 }, platform, c);
      if (g.correct) return null;
      return recordWrongAnswer(userId, q, { source: 'quiz', sourceRefId: a.id, chosenOptionId: g.chosenOptionId, textAnswer: g.textAnswer }, c);
    });
    return {
      questionId: q.row.id,
      correct: g.correct,
      correctOptionId: g.correctOptionId,
      correctIndex: g.correctIndex,
      explanation: values.showExplanation ? ({ en: q.row.explanation_en, ar: q.row.explanation_ar } as Localized) : null,
      mistake: mistakeId ? await mistakeEntry(mistakeId, userId) : null,
    };
  },

  async submit(attemptId: string, userId: string, timeSpentSec: number, platform: string | null): Promise<QuizResultDto> {
    const finished = await tx(async (c) => {
      const a = await attempt(userId, attemptId, true, c);
      if (a.status !== 'in_progress') throw conflictError('ATTEMPT_CLOSED');
      const ans = await db.many<{ is_correct: boolean }>(`SELECT is_correct FROM ${T.quiz_attempt_answers} WHERE attempt_id = $1`, [a.id], c);
      const correct = ans.filter((x) => x.is_correct).length;
      const total = a.question_ids.length;
      const score = pctScore(correct, total);
      const passed = score >= a.pass_threshold;
      await db.query(
        `UPDATE ${T.quiz_attempts} SET status = $2, score = $3, correct_count = $4, total_count = $5, submitted_at = now(), time_sec = $6, mistakes_added = $7 WHERE id = $1`,
        [a.id, passed ? 'passed' : 'failed', score, correct, total, Math.max(0, Math.round(timeSpentSec)), ans.length - correct],
        c,
      );
      if (passed) await db.query(`INSERT INTO ${T.lesson_completions} (user_id, lesson_id, source) VALUES ($1,$2,'quiz') ON CONFLICT (user_id, lesson_id) DO NOTHING`, [userId, a.lesson_id], c);
      await recordActivity(userId, { quizzesTaken: 1, minutes: Math.round(timeSpentSec / 60) }, platform, c);
      return a.id;
    });
    reevaluateAchievementsLater(userId);
    return resultOf(await attempt(userId, finished));
  },

  async attempts(userId: string, lessonId: string | undefined, page: number, pageSize: number) {
    const params: unknown[] = [userId];
    let extra = '';
    if (lessonId) {
      params.push((await requireLiveLesson(lessonId)).id);
      extra = 'AND a.lesson_id = $2';
    }
    const base = `FROM ${T.quiz_attempts} a JOIN ${T.lessons} l ON l.id = a.lesson_id JOIN ${T.subjects} s ON s.id = l.subject_id WHERE a.user_id = $1 AND a.status IN ('passed','failed') ${extra}`;
    const total = (await db.scalar<number>(`SELECT count(*)::int ${base}`, params)) ?? 0;
    params.push(pageSize, (page - 1) * pageSize);
    const rows = await db.many<{ id: string; lesson_id: string; title_en: string; title_ar: string; slug: string; attempt_number: number; score: number; correct_count: number; total_count: number; status: string; submitted_at: Date }>(
      `SELECT a.id, a.lesson_id, l.title_en, l.title_ar, s.slug, a.attempt_number, a.score, a.correct_count, a.total_count, a.status, a.submitted_at ${base}
        ORDER BY a.submitted_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return {
      items: rows.map((r) => ({ id: r.id, lessonId: r.lesson_id, lessonTitle: { en: r.title_en, ar: r.title_ar }, subjectSlug: r.slug, attemptNo: r.attempt_number, score: Number(r.score ?? 0), correct: r.correct_count, total: r.total_count, passed: r.status === 'passed', date: r.submitted_at.toISOString() })),
      meta: { page, pageSize, total, nextCursor: null },
    };
  },

  async result(attemptId: string, userId: string) {
    return resultOf(await attempt(userId, attemptId));
  },
};
