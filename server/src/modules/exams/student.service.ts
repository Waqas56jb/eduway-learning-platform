/**
 * Student exams (EXM-01…09, CAT-04). Server-authoritative timer (startedAt/endsAt/serverNow), attempt consumed on
 * start (resume is free), autosave with monotonic `seq` (offline replays safe), idempotent submit, auto-submit of
 * expired attempts (lazily on read + `autoSubmitExpiredAttempts()` for the jobs scheduler), results with topic
 * breakdown, grade bands and revision recommendations; wrong answers → mistakes (source `exam`).
 */
import { T } from '../../config/constants.js';
import { db, tx, type Executor } from '../../config/db.js';
import { logger } from '../../config/logger.js';
import { entitlements, evaluateSubjectAccess } from '../../common/entitlements.js';
import { NotFoundError } from '../../common/errors/index.js';
import type { Localized } from '../../common/i18n/index.js';
import { settingsStore } from '../../common/services/settings-store.js';
import {
  assemblePaper,
  bookmarkedQuestionIds,
  bumpQuestionStats,
  conflictError,
  examTiming,
  findSubject,
  gradeFor,
  notifyExamResult,
  loadQuestions,
  pctScore,
  randomizePaper,
  recordActivity,
  reevaluateAchievementsLater,
  rngFor,
  ruleError,
  scoreExam,
  studentName,
  toPublic,
  type QuestionPublic,
} from '../learning-core/index.js';
import { recordWrongAnswer } from '../mistakes/index.js';
import { answerRecords, type AnswerRecord } from '../quizzes/index.js';
import { blueprintsRepo, toBlueprintDtos, type BpRow, type ExamBlueprintDto } from './blueprints.service.js';

export interface ExamCard {
  id: string;
  subjectId: string;
  subjectSlug: string;
  subjectIds: string[];
  title: Localized;
  description: Localized;
  questionCount: number;
  durationMin: number;
  passMark: number;
  attemptsTotal: number;
  attemptsUsed: number;
  attemptsLeft: number;
  bestScore: number | null;
  lastScore: number | null;
  scoring: 'standard' | 'negative' | 'weighted';
  reviewBeforeSubmit: boolean;
  availableFrom: string;
  availableTo: string;
  available: boolean;
  activeAttempt: { attemptId: string; endsAt: string; answeredCount: number } | null;
  locked: boolean;
}

interface AttemptRow {
  id: string;
  user_id: string;
  blueprint_id: string;
  attempt_number: number;
  status: 'in_progress' | 'submitted' | 'auto_submitted' | 'abandoned';
  question_ids: string[];
  option_orders: Record<string, string[]>;
  started_at: Date;
  deadline_at: Date;
  submitted_at: Date | null;
  last_autosave_at: Date | null;
  time_spent_sec: number;
  score: number | null;
  correct_count: number;
  total_count: number;
  passed: boolean | null;
  breakdown: unknown;
  autosave_seq: number;
  current_index: number;
  mistakes_added: number;
  raw_score: number | null;
  max_score: number | null;
}

const isOpen = (b: Pick<ExamBlueprintDto, 'status' | 'availableFrom' | 'availableTo'>, now = new Date()) => b.status === 'published' && new Date(b.availableFrom) <= now && new Date(b.availableTo) > now;

async function getAttempt(userId: string | null, id: string, ex?: Executor, lock = false): Promise<AttemptRow> {
  const r = await db.maybeOne<AttemptRow>(`SELECT * FROM ${T.exam_attempts} WHERE id = $1 ${userId ? 'AND user_id = $2' : ''} ${lock ? 'FOR UPDATE' : ''}`, userId ? [id, userId] : [id], ex);
  if (!r) throw new NotFoundError('attempt');
  return r;
}

async function cardsFor(userId: string, bps: ExamBlueprintDto[]): Promise<ExamCard[]> {
  if (!bps.length) return [];
  const learning = await settingsStore.get('learning');
  const records = await entitlements.list(userId);
  const stats = await db.many<{ blueprint_id: string; used: number; best: number | null }>(
    `SELECT blueprint_id, count(*) FILTER (WHERE status <> 'abandoned')::int AS used, max(score) FILTER (WHERE status IN ('submitted','auto_submitted')) AS best
       FROM ${T.exam_attempts} WHERE user_id = $1 AND blueprint_id = ANY($2::uuid[]) GROUP BY blueprint_id`,
    [userId, bps.map((b) => b.id)],
  );
  const last = await db.many<{ blueprint_id: string; score: number }>(
    `SELECT DISTINCT ON (blueprint_id) blueprint_id, score FROM ${T.exam_attempts}
      WHERE user_id = $1 AND blueprint_id = ANY($2::uuid[]) AND status IN ('submitted','auto_submitted') ORDER BY blueprint_id, submitted_at DESC`,
    [userId, bps.map((b) => b.id)],
  );
  const active = await db.many<{ id: string; blueprint_id: string; started_at: Date; deadline_at: Date; answered: number }>(
    `SELECT a.id, a.blueprint_id, a.started_at, a.deadline_at,
            (SELECT count(*) FROM ${T.exam_attempt_answers} x WHERE x.attempt_id = a.id AND x.selected_option_id IS NOT NULL)::int AS answered
       FROM ${T.exam_attempts} a WHERE a.user_id = $1 AND a.status = 'in_progress' AND a.blueprint_id = ANY($2::uuid[])`,
    [userId, bps.map((b) => b.id)],
  );
  return bps.map((b) => {
    const st = stats.find((s) => s.blueprint_id === b.id);
    const act = active.find((a) => a.blueprint_id === b.id && !examTiming(a.started_at, b.durationMin, learning.examGraceSeconds, new Date(), a.deadline_at).expired);
    const used = st?.used ?? 0;
    const subjectIds = b.subjects.map((s) => s.id);
    return {
      id: b.id,
      subjectId: b.subjects[0]?.id ?? '',
      subjectSlug: b.subjects[0]?.slug ?? '',
      subjectIds,
      title: b.name,
      description: b.description,
      questionCount: b.questionCount,
      durationMin: b.durationMin,
      passMark: b.passMark,
      attemptsTotal: b.attemptLimit,
      attemptsUsed: used,
      attemptsLeft: Math.max(0, b.attemptLimit - used),
      bestScore: st?.best === null || st?.best === undefined ? null : Number(st.best),
      lastScore: last.find((l) => l.blueprint_id === b.id) ? Number(last.find((l) => l.blueprint_id === b.id)!.score) : null,
      scoring: b.scoring,
      reviewBeforeSubmit: b.reviewBeforeSubmit,
      availableFrom: b.availableFrom,
      availableTo: b.availableTo,
      available: isOpen(b),
      activeAttempt: act ? { attemptId: act.id, endsAt: act.deadline_at.toISOString(), answeredCount: act.answered } : null,
      locked: subjectIds.some((s) => !evaluateSubjectAccess(records, s).allowed),
    };
  });
}

async function blueprint(id: string): Promise<ExamBlueprintDto> {
  const r = await blueprintsRepo.get(id);
  if (!r) throw new NotFoundError('blueprint');
  return (await toBlueprintDtos([r]))[0] as ExamBlueprintDto;
}

async function stateOf(a: AttemptRow): Promise<Record<string, unknown>> {
  const learning = await settingsStore.get('learning');
  const bp = await blueprint(a.blueprint_id);
  const [card] = await cardsFor(a.user_id, [bp]);
  const [loaded, bm, answers] = await Promise.all([
    loadQuestions(a.question_ids),
    bookmarkedQuestionIds(a.user_id),
    db.many<{ question_id: string; selected_option_id: string | null; flagged: boolean }>(`SELECT question_id, selected_option_id, flagged FROM ${T.exam_attempt_answers} WHERE attempt_id = $1`, [a.id]),
  ]);
  const questions: QuestionPublic[] = a.question_ids.map((id) => loaded.get(id)).filter((q) => !!q).map((q) => toPublic(q!, { order: a.option_orders?.[q!.row.id], bookmarked: bm.has(q!.row.id) }));
  return {
    attemptId: a.id,
    exam: card,
    attemptNo: a.attempt_number,
    status: a.status === 'abandoned' ? 'submitted' : a.status,
    questions,
    order: a.question_ids,
    answers: Object.fromEntries(a.question_ids.map((id) => [id, answers.find((x) => x.question_id === id)?.selected_option_id ?? null])),
    flagged: answers.filter((x) => x.flagged).map((x) => x.question_id),
    currentIndex: a.current_index,
    startedAt: a.started_at.toISOString(),
    endsAt: a.deadline_at.toISOString(),
    serverNow: new Date().toISOString(),
    autosaveSeconds: learning.examAutosaveSeconds,
    graceSeconds: learning.examGraceSeconds,
    lastSavedAt: a.last_autosave_at?.toISOString() ?? null,
  };
}

async function writeAnswers(a: AttemptRow, answers: Record<string, string | null> | undefined, flagged: string[] | undefined, ex: Executor) {
  const allowed = new Set(a.question_ids);
  if (answers) {
    for (const [qid, opt] of Object.entries(answers)) {
      if (!allowed.has(qid)) continue;
      const order = a.option_orders?.[qid];
      const optionId = opt && (!order || order.includes(opt)) ? opt : null;
      await db.query(
        `INSERT INTO ${T.exam_attempt_answers} (attempt_id, question_id, selected_option_id) VALUES ($1,$2,$3)
         ON CONFLICT (attempt_id, question_id) DO UPDATE SET selected_option_id = EXCLUDED.selected_option_id`,
        [a.id, qid, optionId],
        ex,
      );
    }
  }
  if (flagged) {
    const set = flagged.filter((q) => allowed.has(q));
    await db.query(`UPDATE ${T.exam_attempt_answers} SET flagged = (question_id = ANY($2::uuid[])) WHERE attempt_id = $1`, [a.id, set], ex);
    for (const qid of set) await db.query(`INSERT INTO ${T.exam_attempt_answers} (attempt_id, question_id, flagged) VALUES ($1,$2,true) ON CONFLICT (attempt_id, question_id) DO UPDATE SET flagged = true`, [a.id, qid], ex);
  }
}

/** Score + finalize an in-progress attempt (inside a tx). Returns the final status. */
async function finalize(a: AttemptRow, status: 'submitted' | 'auto_submitted', reason: string, ex: Executor, platform: string | null = null) {
  const bpRow = (await db.one<BpRow>(`SELECT b.*, 0 AS attempts FROM ${T.exam_blueprints} b WHERE b.id = $1`, [a.blueprint_id], ex)) as BpRow;
  const loaded = await loadQuestions(a.question_ids, ex);
  const answers = await db.many<{ question_id: string; selected_option_id: string | null }>(`SELECT question_id, selected_option_id FROM ${T.exam_attempt_answers} WHERE attempt_id = $1`, [a.id], ex);
  const byQ = new Map(answers.map((x) => [x.question_id, x.selected_option_id]));
  const items: { qid: string; difficulty: 'easy' | 'medium' | 'hard'; correct: boolean | null }[] = [];
  let mistakes = 0;
  for (const qid of a.question_ids) {
    const q = loaded.get(qid);
    if (!q) continue;
    const chosen = byQ.get(qid) ?? null;
    const correct = chosen ? q.options.some((o) => o.id === chosen && o.is_correct) : null;
    items.push({ qid, difficulty: q.row.difficulty, correct });
    if (chosen) {
      await db.query(`UPDATE ${T.exam_attempt_answers} SET is_correct = $3 WHERE attempt_id = $1 AND question_id = $2`, [a.id, qid, correct], ex);
      await bumpQuestionStats(qid, !!correct, ex);
      if (!correct) {
        await recordWrongAnswer(a.user_id, q, { source: 'exam', sourceRefId: a.id, chosenOptionId: chosen }, ex);
        mistakes++;
      }
    }
  }
  const s = scoreExam(items, bpRow.scoring);
  // Topic breakdown snapshot (kept on the attempt for stable results).
  const topics = new Map<string, { key: string; topic: Localized; correct: number; total: number; missedLessonIds: string[]; lessonId: string | null }>();
  for (const it of items) {
    const q = loaded.get(it.qid)!;
    const key = q.row.topic_id ?? `label:${q.row.topic_label_en}`;
    const t = topics.get(key) ?? { key: q.row.topic_id ?? key, topic: { en: q.row.topic_title_en ?? q.row.topic_label_en, ar: q.row.topic_title_ar ?? q.row.topic_label_ar }, correct: 0, total: 0, missedLessonIds: [], lessonId: q.row.lesson_ref_id };
    t.total++;
    if (it.correct) t.correct++;
    else if (q.row.lesson_ref_id && !t.missedLessonIds.includes(q.row.lesson_ref_id)) t.missedLessonIds.push(q.row.lesson_ref_id);
    topics.set(key, t);
  }
  const timeSpent = Math.max(0, Math.min(Math.round((Date.now() - a.started_at.getTime()) / 1000), bpRow.duration_min * 60 + 600));
  await db.query(
    `UPDATE ${T.exam_attempts} SET status = $2, submitted_at = now(), submit_reason = $3, time_spent_sec = $4, score = $5, correct_count = $6, total_count = $7,
            passed = $8, breakdown = $9::jsonb, mistakes_added = $10, raw_score = $11, max_score = $12
      WHERE id = $1`,
    [a.id, status, reason, timeSpent, s.pct, s.correct, items.length, s.pct >= bpRow.pass_mark, JSON.stringify({ topics: [...topics.values()], unanswered: s.unanswered, incorrect: s.incorrect }), mistakes, s.rawScore, s.maxScore],
    ex,
  );
  await recordActivity(a.user_id, { examsTaken: 1, questionsAnswered: s.correct + s.incorrect, questionsCorrect: s.correct, minutes: Math.round(timeSpent / 60) }, platform, ex);
  return status;
}

async function autoSubmitIfExpired(a: AttemptRow): Promise<AttemptRow> {
  if (a.status !== 'in_progress') return a;
  const learning = await settingsStore.get('learning');
  if (!examTiming(a.started_at, 0, learning.examGraceSeconds, new Date(), a.deadline_at).expired) return a;
  await tx(async (c) => {
    const locked = await getAttempt(null, a.id, c, true);
    if (locked.status === 'in_progress') await finalize(locked, 'auto_submitted', 'timeout', c);
  });
  reevaluateAchievementsLater(a.user_id);
  notifyExamResult(a.user_id, a.id);
  return getAttempt(a.user_id, a.id);
}

/**
 * Job hook (`exam-auto-submit`, scheduled by the jobs agent — e.g. every minute): auto-submits every in-progress
 * attempt whose `deadline + graceSeconds` has passed. Idempotent; returns the number of attempts submitted.
 */
export async function autoSubmitExpiredAttempts(now: Date = new Date()): Promise<number> {
  const learning = await settingsStore.get('learning');
  const due = await db.many<{ id: string; user_id: string }>(
    `SELECT id, user_id FROM ${T.exam_attempts} WHERE status = 'in_progress' AND deadline_at + make_interval(secs => $1) < $2 ORDER BY deadline_at LIMIT 500`,
    [learning.examGraceSeconds, now],
  );
  let n = 0;
  for (const d of due) {
    try {
      await tx(async (c) => {
        const a = await getAttempt(null, d.id, c, true);
        if (a.status !== 'in_progress') return;
        await finalize(a, 'auto_submitted', 'timeout', c);
        n++;
      });
      reevaluateAchievementsLater(d.user_id);
      notifyExamResult(d.user_id, d.id);
    } catch (err) {
      logger.error({ err: (err as Error).message, attemptId: d.id }, 'exam auto-submit failed');
    }
  }
  return n;
}

export interface UpcomingExamDto {
  id: string;
  examId: string;
  title: Localized;
  date: string;
  kind: 'opens' | 'closes';
  subjectSlug: string;
}

export const examsService = {
  async available(userId: string, subjectIdOrSlug?: string): Promise<ExamCard[]> {
    let subjectId: string | undefined;
    if (subjectIdOrSlug) {
      const s = await findSubject(subjectIdOrSlug);
      if (!s) throw new NotFoundError('subject');
      subjectId = s.id;
    }
    const { rows } = await blueprintsRepo.list({ publishedOnly: true, subjectId }, 'availableFrom', 500, 0);
    const now = Date.now();
    const in30 = now + 30 * 86_400_000;
    const dtos = (await toBlueprintDtos(rows)).filter((b) => new Date(b.availableTo).getTime() > now && new Date(b.availableFrom).getTime() <= in30);
    return cardsFor(userId, dtos);
  },

  async upcoming(userId: string, limit: number): Promise<UpcomingExamDto[]> {
    const { rows } = await blueprintsRepo.list({ publishedOnly: true }, 'availableFrom', 500, 0);
    const dtos = await toBlueprintDtos(rows);
    const now = Date.now();
    const out: UpcomingExamDto[] = [];
    for (const b of dtos) {
      const from = new Date(b.availableFrom).getTime();
      const to = new Date(b.availableTo).getTime();
      if (from > now) out.push({ id: `${b.id}:opens`, examId: b.id, title: b.name, date: b.availableFrom, kind: 'opens', subjectSlug: b.subjects[0]?.slug ?? '' });
      else if (to > now && to - now <= 14 * 86_400_000) out.push({ id: `${b.id}:closes`, examId: b.id, title: b.name, date: b.availableTo, kind: 'closes', subjectSlug: b.subjects[0]?.slug ?? '' });
    }
    void userId;
    return out.sort((a, b) => a.date.localeCompare(b.date)).slice(0, limit);
  },

  async start(userId: string, blueprintId: string, platform: string | null) {
    const bp = await blueprint(blueprintId);
    for (const s of bp.subjects) await entitlements.assertAccess(userId, s.id, { feature: 'exam' });
    const active = await db.maybeOne<AttemptRow>(`SELECT * FROM ${T.exam_attempts} WHERE user_id = $1 AND blueprint_id = $2 AND status = 'in_progress' ORDER BY started_at DESC LIMIT 1`, [userId, bp.id]);
    if (active) {
      const cur = await autoSubmitIfExpired(active);
      if (cur.status === 'in_progress') return stateOf(cur);
    }
    if (!isOpen(bp)) throw ruleError('EXAM_NOT_AVAILABLE', { availableFrom: bp.availableFrom, availableTo: bp.availableTo });
    const used = (await db.scalar<number>(`SELECT count(*)::int FROM ${T.exam_attempts} WHERE user_id = $1 AND blueprint_id = $2 AND status <> 'abandoned'`, [userId, bp.id])) ?? 0;
    if (used >= bp.attemptLimit) throw ruleError('EXAM_ATTEMPTS_EXHAUSTED', { attemptsTotal: bp.attemptLimit });
    const bpRow = (await blueprintsRepo.get(bp.id)) as BpRow;
    const id = await tx(async (c) => {
      // Serialize concurrent starts for the same student/blueprint.
      await db.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`${userId}:${bp.id}`], c);
      const again = await db.maybeOne<{ id: string }>(`SELECT id FROM ${T.exam_attempts} WHERE user_id = $1 AND blueprint_id = $2 AND status = 'in_progress'`, [userId, bp.id], c);
      if (again) return again.id;
      const a = await db.one<{ id: string }>(
        `INSERT INTO ${T.exam_attempts} (user_id, blueprint_id, attempt_number, status, deadline_at, total_count, platform)
         VALUES ($1,$2,$3,'in_progress', now() + make_interval(mins => $4), $5, $6) RETURNING id`,
        [userId, bp.id, used + 1, bp.durationMin, bp.questionCount, platform === 'web' || platform === 'ios' || platform === 'android' ? platform : null],
        c,
      );
      const rnd = rngFor(`exam:${a.id}`);
      let ids: string[];
      if (bpRow.fixed_question_ids?.length) ids = bpRow.fixed_question_ids;
      else {
        const pool = await db.many<{ id: string; subject_id: string; topic_id: string | null; difficulty: 'easy' | 'medium' | 'hard' }>(
          `SELECT id, subject_id, topic_id, difficulty FROM ${T.questions} WHERE subject_id = ANY($1::uuid[]) AND status IN ('approved','published') AND deleted_at IS NULL AND type IN ('mcq','true_false')`,
          [bp.subjects.map((s) => s.id)],
          c,
        );
        const secs = await blueprintsRepo.sections([bp.id], c);
        ids = assemblePaper(secs.map((s) => ({ subjectId: s.subject_id, topicId: s.topic_id, easy: s.easy_count, medium: s.medium_count, hard: s.hard_count })), pool.map((q) => ({ id: q.id, subjectId: q.subject_id, topicId: q.topic_id, difficulty: q.difficulty })), rnd);
      }
      if (!ids.length) throw ruleError('EXAM_NOT_AVAILABLE', { why: 'no questions' });
      const loaded = await loadQuestions(ids, c);
      const paper = randomizePaper(ids, new Map(ids.map((q) => [q, (loaded.get(q)?.options ?? []).map((o) => o.id)])), { randomizeQuestions: bp.randomize, randomizeOptions: bp.randomize, rnd });
      await db.query(`UPDATE ${T.exam_attempts} SET question_ids = $2, option_orders = $3::jsonb, total_count = $4 WHERE id = $1`, [a.id, paper.order, JSON.stringify(paper.optionOrders), paper.order.length], c);
      return a.id;
    });
    return stateOf(await getAttempt(userId, id));
  },

  async state(userId: string, attemptId: string) {
    return stateOf(await autoSubmitIfExpired(await getAttempt(userId, attemptId)));
  },

  async autosave(userId: string, attemptId: string, b: { answers: Record<string, string | null>; flagged: string[]; currentIndex: number; clientSavedAt: string; seq: number }) {
    const learning = await settingsStore.get('learning');
    const res = await tx(async (c) => {
      const a = await getAttempt(userId, attemptId, c, true);
      if (a.status !== 'in_progress') return { kind: 'submitted' as const };
      if (examTiming(a.started_at, 0, learning.examGraceSeconds, new Date(), a.deadline_at).expired) {
        await finalize(a, 'auto_submitted', 'timeout', c);
        return { kind: 'expired' as const };
      }
      if (b.seq > a.autosave_seq) {
        await writeAnswers(a, b.answers, b.flagged, c);
        await db.query(
          `UPDATE ${T.exam_attempts} SET autosave_seq = $2, current_index = $3, client_saved_at = $4, last_autosave_at = now() WHERE id = $1`,
          [a.id, b.seq, Math.max(0, Math.min(b.currentIndex, a.question_ids.length - 1)), b.clientSavedAt],
          c,
        );
      }
      return { kind: 'ok' as const };
    });
    if (res.kind === 'submitted') throw conflictError('EXAM_ALREADY_SUBMITTED', { attemptId });
    if (res.kind === 'expired') {
      reevaluateAchievementsLater(userId);
      throw ruleError('EXAM_TIME_OVER', { attemptId, resultUrl: `/exams/result/${attemptId}` });
    }
    const a = await getAttempt(userId, attemptId);
    const savedAt = (a.last_autosave_at ?? new Date()).toISOString();
    return { savedAt, lastSavedAt: savedAt, serverNow: new Date().toISOString(), endsAt: a.deadline_at.toISOString(), seq: a.autosave_seq };
  },

  async flag(userId: string, attemptId: string, questionId: string, flagged: boolean) {
    const a = await autoSubmitIfExpired(await getAttempt(userId, attemptId));
    if (a.status !== 'in_progress') throw conflictError('EXAM_ALREADY_SUBMITTED', { attemptId });
    if (!a.question_ids.includes(questionId)) throw ruleError('QUESTION_NOT_IN_ATTEMPT');
    await db.query(
      `INSERT INTO ${T.exam_attempt_answers} (attempt_id, question_id, flagged) VALUES ($1,$2,$3) ON CONFLICT (attempt_id, question_id) DO UPDATE SET flagged = EXCLUDED.flagged`,
      [a.id, questionId, flagged],
    );
    const rows = await db.many<{ question_id: string }>(`SELECT question_id FROM ${T.exam_attempt_answers} WHERE attempt_id = $1 AND flagged`, [a.id]);
    return { flagged: rows.map((r) => r.question_id) };
  },

  async submit(userId: string, attemptId: string, b: { reason: 'manual' | 'timeout'; answers?: Record<string, string | null>; flagged?: string[]; seq?: number }, platform: string | null) {
    const learning = await settingsStore.get('learning');
    const status = await tx(async (c) => {
      const a = await getAttempt(userId, attemptId, c, true);
      if (a.status !== 'in_progress') return a.status === 'abandoned' ? 'submitted' : a.status;
      const timing = examTiming(a.started_at, 0, learning.examGraceSeconds, new Date(), a.deadline_at);
      if (!timing.expired && (b.answers || b.flagged) && (b.seq === undefined || b.seq > a.autosave_seq)) {
        await writeAnswers(a, b.answers, b.flagged, c);
        if (b.seq !== undefined) await db.query(`UPDATE ${T.exam_attempts} SET autosave_seq = $2, last_autosave_at = now() WHERE id = $1`, [a.id, b.seq], c);
      }
      const final = timing.expired || b.reason === 'timeout' ? 'auto_submitted' : 'submitted';
      return finalize(a, final, b.reason, c, platform);
    });
    reevaluateAchievementsLater(userId);
    notifyExamResult(userId, attemptId);
    return { attemptId, status, resultUrl: `/exams/result/${attemptId}` };
  },

  async result(userId: string, attemptId: string) {
    const a = await autoSubmitIfExpired(await getAttempt(userId, attemptId));
    if (a.status === 'in_progress') throw conflictError('EXAM_IN_PROGRESS', { attemptId, endsAt: a.deadline_at.toISOString() });
    const learning = await settingsStore.get('learning');
    const bp = await blueprint(a.blueprint_id);
    const answers = await db.many<{ question_id: string; selected_option_id: string | null; is_correct: boolean | null; flagged: boolean; time_sec: number }>(
      `SELECT question_id, selected_option_id, is_correct, flagged, time_sec FROM ${T.exam_attempt_answers} WHERE attempt_id = $1`,
      [a.id],
    );
    const records: AnswerRecord[] = await answerRecords(a.question_ids, a.option_orders ?? {}, answers.map((x) => ({ ...x, is_correct: x.selected_option_id ? !!x.is_correct : null })), userId);
    const answered = records.filter((r) => r.chosenOptionId).length;
    const correct = records.filter((r) => r.correct).length;
    const pct = a.score !== null ? Number(a.score) : pctScore(correct, records.length);
    const topicsRaw = ((a.breakdown as { topics?: { key: string; topic: Localized; correct: number; total: number; missedLessonIds: string[]; lessonId: string | null }[] } | null)?.topics ?? []);
    const topicBreakdown = topicsRaw.map((t) => {
      const p = pctScore(t.correct, t.total);
      return { key: t.key, topic: t.topic, correct: t.correct, total: t.total, pct: p, accuracy: p, missed: t.total - t.correct, missedLessonIds: t.missedLessonIds };
    });
    const lessonIds = [...new Set(topicsRaw.filter((t) => t.total > t.correct).map((t) => t.missedLessonIds[0] ?? t.lessonId).filter((x): x is string => !!x))];
    const lessons = lessonIds.length ? await db.many<{ id: string; title_en: string; title_ar: string }>(`SELECT id, title_en, title_ar FROM ${T.lessons} WHERE id = ANY($1::uuid[])`, [lessonIds]) : [];
    const recommendations = topicBreakdown
      .filter((t) => t.missed > 0)
      .sort((x, y) => x.pct - y.pct || y.missed - x.missed)
      .map((t) => {
        const raw = topicsRaw.find((r) => r.key === t.key);
        const lid = raw?.missedLessonIds[0] ?? raw?.lessonId ?? null;
        const l = lessons.find((x) => x.id === lid);
        return l ? { lessonId: l.id, title: { en: l.title_en, ar: l.title_ar }, topic: t.topic, missed: t.missed, topicPct: t.pct } : null;
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .slice(0, 4);
    const used = (await db.scalar<number>(`SELECT count(*)::int FROM ${T.exam_attempts} WHERE user_id = $1 AND blueprint_id = $2 AND status <> 'abandoned'`, [userId, bp.id])) ?? 0;
    const who = await studentName(userId);
    return {
      attemptId: a.id,
      attemptNo: a.attempt_number,
      exam: { id: bp.id, title: bp.name, passMark: bp.passMark, durationMin: bp.durationMin, subjectId: bp.subjects[0]?.id ?? '', subjectSlug: bp.subjects[0]?.slug ?? '', scoring: bp.scoring },
      student: { name: who.name },
      score: { total: records.length, correct, incorrect: answered - correct, unanswered: records.length - answered, pct, rawScore: a.raw_score !== null ? Number(a.raw_score) : correct, maxScore: a.max_score !== null ? Number(a.max_score) : records.length },
      passed: a.passed ?? pct >= bp.passMark,
      grade: gradeFor(pct, learning.gradeBands),
      accuracy: pctScore(correct, answered),
      timeSpentSec: a.time_spent_sec,
      autoSubmitted: a.status === 'auto_submitted',
      finishedAt: (a.submitted_at ?? a.deadline_at).toISOString(),
      attemptsLeft: Math.max(0, bp.attemptLimit - used),
      topicBreakdown,
      recommendations,
      answers: records,
      mistakesAdded: a.mistakes_added,
    };
  },

  async attempts(userId: string, f: { examId?: string; status?: string; page: number; pageSize: number }) {
    const params: unknown[] = [userId];
    const conds = ['a.user_id = $1', `a.status <> 'abandoned'`];
    if (f.examId) {
      params.push(f.examId);
      conds.push(`a.blueprint_id = $${params.length}`);
    }
    if (f.status) {
      params.push(f.status);
      conds.push(`a.status = $${params.length}`);
    }
    const base = `FROM ${T.exam_attempts} a JOIN ${T.exam_blueprints} b ON b.id = a.blueprint_id LEFT JOIN ${T.subjects} s ON s.id = b.subject_id WHERE ${conds.join(' AND ')}`;
    const total = (await db.scalar<number>(`SELECT count(*)::int ${base}`, params)) ?? 0;
    params.push(f.pageSize, (f.page - 1) * f.pageSize);
    const rows = await db.many<{ id: string; blueprint_id: string; title_en: string; title_ar: string; slug: string | null; attempt_number: number; score: number | null; passed: boolean | null; status: string; started_at: Date; submitted_at: Date | null }>(
      `SELECT a.id, a.blueprint_id, b.title_en, b.title_ar, s.slug, a.attempt_number, a.score, a.passed, a.status, a.started_at, a.submitted_at ${base}
        ORDER BY a.started_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return {
      items: rows.map((r) => ({ id: r.id, examId: r.blueprint_id, title: { en: r.title_en, ar: r.title_ar }, subjectSlug: r.slug ?? '', attemptNo: r.attempt_number, score: Number(r.score ?? 0), passed: !!r.passed, status: r.status as 'in_progress' | 'submitted' | 'auto_submitted', date: (r.submitted_at ?? r.started_at).toISOString() })),
      meta: { page: f.page, pageSize: f.pageSize, total, nextCursor: null },
    };
  },
};
