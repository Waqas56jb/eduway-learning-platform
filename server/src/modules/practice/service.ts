/**
 * Practice sessions (PRA-01…05): draw from the bank by filters / bookmarks / mistakes (bookmarks combine with
 * filters — CONTRACT_GAPS E#6), shuffle questions & options, instant feedback with streak, results with
 * topic/difficulty breakdowns. Wrong answers create mistakes (source `bank`).
 */
import { T } from '../../config/constants.js';
import { db, tx } from '../../config/db.js';
import { entitlements, evaluateSubjectAccess } from '../../common/entitlements.js';
import { NotFoundError } from '../../common/errors/index.js';
import type { Localized } from '../../common/i18n/index.js';
import { settingsStore } from '../../common/services/settings-store.js';
import {
  bookmarkedQuestionIds,
  bumpQuestionStats,
  conflictError,
  grade,
  loadQuestions,
  pctScore,
  practiceBand,
  randomizePaper,
  recordActivity,
  reevaluateAchievementsLater,
  rngFor,
  ruleError,
  shuffle,
  toPublic,
} from '../learning-core/index.js';
import { mistakeEntry, recordWrongAnswer, type AnswerFeedback } from '../mistakes/index.js';
import { BANK_FROM, bankFilterOf, bankWhere } from '../questions/index.js';
import { answerRecords, type AnswerRecord } from '../quizzes/index.js';

export interface PracticeStartInput {
  mode: 'filters' | 'bookmarks' | 'mistakes';
  filters?: { subjectId?: string; unitId?: string; topicId?: string; topic?: string; difficulty?: string[] | string; tags?: string[]; q?: string };
  count: number;
  includeQuestionId?: string;
  questionIds?: string[];
  seed?: string;
}

interface Breakdown {
  key: string;
  label: Localized;
  correct: number;
  total: number;
  accuracy: number;
}

interface SessionRow {
  id: string;
  user_id: string;
  subject_id: string | null;
  question_ids: string[];
  option_orders: Record<string, string[]>;
  status: 'in_progress' | 'finished' | 'abandoned';
  attempt_number: number;
  time_spent_sec: number;
  mistakes_added: number;
  started_at: Date;
  finished_at: Date | null;
  title_en: string;
  title_ar: string;
  subtitle_en: string;
  subtitle_ar: string;
}

async function session(userId: string, id: string): Promise<SessionRow> {
  const r = await db.maybeOne<SessionRow>(`SELECT * FROM ${T.practice_sessions} WHERE id = $1 AND user_id = $2`, [id, userId]);
  if (!r) throw new NotFoundError('practice');
  return r;
}

const DIFF_LABEL: Record<string, Localized> = { easy: { en: 'Easy', ar: 'سهل' }, medium: { en: 'Medium', ar: 'متوسط' }, hard: { en: 'Hard', ar: 'صعب' } };

async function result(s: SessionRow) {
  const answers = await db.many<{ question_id: string; selected_option_id: string | null; text_answer: string | null; is_correct: boolean; time_sec: number }>(
    `SELECT question_id, selected_option_id, text_answer, is_correct, time_sec FROM ${T.practice_answers} WHERE session_id = $1`,
    [s.id],
  );
  const records: AnswerRecord[] = await answerRecords(s.question_ids, s.option_orders ?? {}, answers, s.user_id);
  const answered = new Set(answers.map((a) => a.question_id));
  const correct = answers.filter((a) => a.is_correct).length;
  const incorrect = answers.length - correct;
  const total = s.question_ids.length;
  const score = pctScore(correct, total);
  const learning = await settingsStore.get('learning');
  const breakdown = (keyOf: (r: AnswerRecord) => [string, Localized]): Breakdown[] => {
    const m = new Map<string, Breakdown>();
    for (const r of records) {
      const [key, label] = keyOf(r);
      const b = m.get(key) ?? { key, label, correct: 0, total: 0, accuracy: 0 };
      b.total++;
      if (r.correct) b.correct++;
      m.set(key, b);
    }
    return [...m.values()].map((b) => ({ ...b, accuracy: pctScore(b.correct, b.total) }));
  };
  const subj = s.subject_id ? await db.maybeOne<{ slug: string }>(`SELECT slug FROM ${T.subjects} WHERE id = $1`, [s.subject_id]) : null;
  return {
    sessionId: s.id,
    attemptNo: s.attempt_number,
    subjectId: s.subject_id,
    subjectSlug: subj?.slug ?? null,
    score,
    correct,
    incorrect,
    skipped: s.question_ids.filter((id) => !answered.has(id)).length,
    total,
    passed: score >= learning.quizPassMark,
    band: practiceBand(score),
    timeSpentSec: s.time_spent_sec,
    mistakesAdded: s.mistakes_added || incorrect,
    breakdownByTopic: breakdown((r) => [r.question.topicId || r.question.topic.en, r.question.topic]),
    breakdownByDifficulty: breakdown((r) => [r.question.difficulty, DIFF_LABEL[r.question.difficulty] as Localized]),
    answers: records,
    date: (s.finished_at ?? s.started_at).toISOString(),
  };
}

export const practiceService = {
  async start(userId: string, b: PracticeStartInput, platform: string | null) {
    const learning = await settingsStore.get('learning');
    const count = Math.max(1, Math.min(b.count, learning.practiceMaxSize));
    const f = await bankFilterOf({ ...(b.filters ?? {}), difficulty: b.filters?.difficulty === undefined ? undefined : Array.isArray(b.filters.difficulty) ? (b.filters.difficulty as ('easy' | 'medium' | 'hard' | 'all')[]) : [b.filters.difficulty as 'easy'] });
    if (b.mode === 'bookmarks') f.bookmarked = true;
    if (b.questionIds?.length) f.questionIds = b.questionIds;
    const params: unknown[] = [];
    let where = bankWhere(f, userId, params);
    if (b.mode === 'mistakes') {
      params.push(userId);
      where += ` AND EXISTS (SELECT 1 FROM ${T.mistake_records} mr WHERE mr.user_id = $${params.length} AND mr.question_id = q.id AND mr.status <> 'mastered')`;
    }
    const cands = await db.many<{ id: string; subject_id: string }>(`SELECT q.id, q.subject_id FROM ${BANK_FROM} WHERE ${where} ORDER BY q.code LIMIT 5000`, params);
    if (f.subjectId) await entitlements.assertAccess(userId, f.subjectId, { feature: 'practice' });
    const records = await entitlements.list(userId);
    const entitled = cands.filter((c) => evaluateSubjectAccess(records, c.subject_id).allowed);
    if (cands.length && !entitled.length) await entitlements.assertAccess(userId, (cands[0] as { subject_id: string }).subject_id, { feature: 'practice' });
    if (!entitled.length) throw ruleError('NO_QUESTIONS');
    const rnd = rngFor(b.seed ? `${userId}:${b.seed}` : `${userId}:${Date.now()}:${Math.random()}`);
    let ids = shuffle(entitled.map((c) => c.id), rnd);
    if (b.includeQuestionId && ids.includes(b.includeQuestionId)) ids = [b.includeQuestionId, ...ids.filter((i) => i !== b.includeQuestionId)];
    ids = ids.slice(0, count);
    const loaded = await loadQuestions(ids);
    const paper = randomizePaper(ids, new Map(ids.map((id) => [id, (loaded.get(id)?.options ?? []).map((o) => o.id)])), { randomizeQuestions: false, randomizeOptions: true, rnd });
    const subjectIds = [...new Set(ids.map((id) => loaded.get(id)?.row.subject_id).filter((x): x is string => !!x))];
    const singleSubject = subjectIds.length === 1 ? (subjectIds[0] as string) : null;
    const subjRow = singleSubject ? await db.maybeOne<{ name_en: string; name_ar: string }>(`SELECT name_en, name_ar FROM ${T.subjects} WHERE id = $1`, [singleSubject]) : null;
    const title: Localized =
      b.mode === 'mistakes' ? { en: 'Mistakes review', ar: 'مراجعة الأخطاء' } : b.mode === 'bookmarks' ? { en: 'Bookmarked questions', ar: 'الأسئلة المحفوظة' } : subjRow ? { en: `${subjRow.name_en} practice`, ar: `تدريب ${subjRow.name_ar}` } : { en: 'Mixed practice', ar: 'تدريب متنوع' };
    const rawDiff = b.filters?.difficulty;
    const diffs = (Array.isArray(rawDiff) ? rawDiff : rawDiff ? [rawDiff] : []).filter((d) => d !== 'all');
    const subtitle: Localized = {
      en: `${ids.length} questions${diffs.length ? ` · ${diffs.map((d) => DIFF_LABEL[d]?.en ?? d).join(', ')}` : ''}`,
      ar: `${ids.length} سؤال${diffs.length ? ` · ${diffs.map((d) => DIFF_LABEL[d]?.ar ?? d).join('، ')}` : ''}`,
    };
    const attemptNo = ((await db.scalar<number>(`SELECT count(*)::int FROM ${T.practice_sessions} WHERE user_id = $1 AND subject_id IS NOT DISTINCT FROM $2::uuid AND status = 'finished'`, [userId, singleSubject])) ?? 0) + 1;
    const row = await db.one<{ id: string; started_at: Date }>(
      `INSERT INTO ${T.practice_sessions} (user_id, subject_id, mode, filters, question_ids, option_orders, total_count, platform, attempt_number, title_en, title_ar, subtitle_en, subtitle_ar)
       VALUES ($1,$2,$3,$4::jsonb,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13) RETURNING id, started_at`,
      [userId, singleSubject, b.mode === 'filters' ? 'custom' : b.mode, JSON.stringify(b.filters ?? {}), paper.order, JSON.stringify(paper.optionOrders), ids.length, platform === 'web' || platform === 'ios' || platform === 'android' ? platform : null, attemptNo, title.en, title.ar, subtitle.en, subtitle.ar],
    );
    const bm = await bookmarkedQuestionIds(userId);
    return {
      sessionId: row.id,
      title,
      subtitle,
      startedAt: row.started_at.toISOString(),
      questions: paper.order.map((id) => loaded.get(id)).filter((q) => !!q).map((q) => toPublic(q!, { order: paper.optionOrders[q!.row.id], bookmarked: bm.has(q!.row.id) })),
    };
  },

  async answer(userId: string, sessionId: string, b: { questionId: string; optionId?: string; textAnswer?: string; timeSec?: number }, platform: string | null): Promise<AnswerFeedback & { streak: number }> {
    const s = await session(userId, sessionId);
    if (s.status !== 'in_progress') throw conflictError('ATTEMPT_CLOSED');
    if (!s.question_ids.includes(b.questionId)) throw ruleError('QUESTION_NOT_IN_ATTEMPT');
    const q = (await loadQuestions([b.questionId])).get(b.questionId);
    if (!q) throw new NotFoundError('question');
    await entitlements.assertAccess(userId, q.row.subject_id, { feature: 'practice' });
    const g = grade(q, b, s.option_orders?.[b.questionId]);
    if (!g.answered) throw ruleError('ANSWER_REQUIRED');
    const mistakeId = await tx(async (c) => {
      const ins = await db.query(
        `INSERT INTO ${T.practice_answers} (session_id, question_id, selected_option_id, text_answer, is_correct, time_sec) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (session_id, question_id) DO NOTHING`,
        [s.id, q.row.id, g.chosenOptionId, g.textAnswer, g.correct, Math.max(0, Math.round(b.timeSec ?? 0))],
        c,
      );
      if (!ins.rowCount) throw conflictError('ALREADY_ANSWERED');
      await db.query(`UPDATE ${T.practice_sessions} SET correct_count = correct_count + $2 WHERE id = $1`, [s.id, g.correct ? 1 : 0], c);
      await bumpQuestionStats(q.row.id, g.correct, c);
      await recordActivity(userId, { questionsAnswered: 1, questionsCorrect: g.correct ? 1 : 0 }, platform, c);
      if (g.correct) return null;
      await db.query(`UPDATE ${T.practice_sessions} SET mistakes_added = mistakes_added + 1 WHERE id = $1`, [s.id], c);
      return recordWrongAnswer(userId, q, { source: 'bank', sourceRefId: s.id, chosenOptionId: g.chosenOptionId, textAnswer: g.textAnswer }, c);
    });
    const seq = await db.many<{ is_correct: boolean }>(`SELECT is_correct FROM ${T.practice_answers} WHERE session_id = $1 ORDER BY answered_at DESC, id DESC`, [s.id]);
    let streak = 0;
    for (const a of seq) {
      if (!a.is_correct) break;
      streak++;
    }
    return {
      questionId: q.row.id,
      correct: g.correct,
      correctOptionId: g.correctOptionId,
      correctIndex: g.correctIndex,
      explanation: { en: q.row.explanation_en, ar: q.row.explanation_ar },
      mistake: mistakeId ? await mistakeEntry(mistakeId, userId) : null,
      streak,
    };
  },

  async finish(userId: string, sessionId: string, timeSpentSec: number, platform: string | null) {
    const s = await session(userId, sessionId);
    if (s.status === 'in_progress') {
      await db.query(`UPDATE ${T.practice_sessions} SET status = 'finished', finished_at = now(), time_spent_sec = $2 WHERE id = $1 AND status = 'in_progress'`, [s.id, Math.max(0, Math.round(timeSpentSec))]);
      await recordActivity(userId, { minutes: Math.round(timeSpentSec / 60) }, platform);
      reevaluateAchievementsLater(userId);
    }
    return result(await session(userId, sessionId));
  },

  async result(userId: string, sessionId: string) {
    const s = await session(userId, sessionId);
    // SEC-33: the result carries every correct answer — only once the session is finished (finish returns it too).
    if (s.status === 'in_progress') throw conflictError('ATTEMPT_IN_PROGRESS', { sessionId });
    return result(s);
  },

  async sessions(userId: string, page: number, limit: number) {
    const rows = await db.many<{ id: string; subject_id: string | null; slug: string | null; attempt_number: number; correct_count: number; total_count: number; finished_at: Date }>(
      `SELECT p.id, p.subject_id, s.slug, p.attempt_number, p.correct_count, p.total_count, p.finished_at FROM ${T.practice_sessions} p LEFT JOIN ${T.subjects} s ON s.id = p.subject_id
        WHERE p.user_id = $1 AND p.status = 'finished' ORDER BY p.finished_at DESC LIMIT $2 OFFSET $3`,
      [userId, limit, (page - 1) * limit],
    );
    const total = (await db.scalar<number>(`SELECT count(*)::int FROM ${T.practice_sessions} WHERE user_id = $1 AND status = 'finished'`, [userId])) ?? 0;
    return {
      items: rows.map((r) => ({ id: r.id, subjectId: r.subject_id, subjectSlug: r.slug, attemptNo: r.attempt_number, correct: r.correct_count, total: r.total_count, score: pctScore(r.correct_count, r.total_count), date: r.finished_at.toISOString() })),
      meta: { page, pageSize: limit, total, nextCursor: null },
    };
  },
};
