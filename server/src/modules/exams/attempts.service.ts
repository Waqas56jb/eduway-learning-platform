/**
 * Admin attempts (ADM-ATT-*): one list over quiz attempts, exam attempts and practice sessions.
 */
import { T } from '../../config/constants.js';
import { db } from '../../config/db.js';
import { studentRef } from '../../common/dto/refs.js';
import { NotFoundError } from '../../common/errors/index.js';
import type { Localized } from '../../common/i18n/index.js';
import { settingsStore } from '../../common/services/settings-store.js';
import { orderBy } from '../../common/utils/pagination.js';
import { loadQuestions, orderedOptions, sqlSearch } from '../learning-core/index.js';

export type AttemptKind = 'quiz' | 'exam' | 'practice';
export type AttemptStatus = 'passed' | 'failed' | 'in_progress' | 'abandoned';

export interface AttemptRowDto {
  id: string;
  kind: AttemptKind;
  student: { id: string; name: Localized; mobile: string; avatarUrl: string | null };
  refId: string;
  title: Localized;
  score: number;
  correct: number;
  total: number;
  timeSec: number;
  status: AttemptStatus;
  platform: 'web' | 'ios' | 'android' | null;
  date: string;
}

export interface AttemptFilter {
  kind?: AttemptKind;
  status?: AttemptStatus;
  q?: string;
  studentId?: string;
  refId?: string;
  from?: string;
  to?: string;
  platform?: string;
  ids?: string[];
}

/** Unified CTE (`att`) over the three attempt tables. $1 = practice pass mark. */
const UNION = `WITH att AS (
  SELECT qa.id, 'quiz'::text AS kind, qa.user_id, qa.lesson_id AS ref_id, l.title_en, l.title_ar, COALESCE(qa.score, 0)::float AS score,
         qa.correct_count AS correct, qa.total_count AS total, qa.time_sec, qa.status, qa.platform::text AS platform,
         COALESCE(qa.submitted_at, qa.started_at) AS at
    FROM ${T.quiz_attempts} qa JOIN ${T.lessons} l ON l.id = qa.lesson_id
  UNION ALL
  SELECT ea.id, 'exam', ea.user_id, ea.blueprint_id, b.title_en, b.title_ar, COALESCE(ea.score, 0)::float,
         ea.correct_count, ea.total_count, ea.time_spent_sec,
         CASE WHEN ea.status = 'in_progress' THEN 'in_progress' WHEN ea.status = 'abandoned' THEN 'abandoned' WHEN ea.passed THEN 'passed' ELSE 'failed' END,
         ea.platform::text, COALESCE(ea.submitted_at, ea.started_at)
    FROM ${T.exam_attempts} ea JOIN ${T.exam_blueprints} b ON b.id = ea.blueprint_id
  UNION ALL
  SELECT ps.id, 'practice', ps.user_id, COALESCE(ps.subject_id, ps.id),
         COALESCE(NULLIF(ps.title_en, ''), 'Practice session'), COALESCE(NULLIF(ps.title_ar, ''), 'جلسة تدريب'),
         CASE WHEN ps.total_count > 0 THEN round(ps.correct_count * 100.0 / ps.total_count, 1) ELSE 0 END::float,
         ps.correct_count, ps.total_count, ps.time_spent_sec,
         CASE WHEN ps.status = 'in_progress' THEN 'in_progress' WHEN ps.status = 'abandoned' THEN 'abandoned'
              WHEN ps.total_count > 0 AND ps.correct_count * 100.0 / ps.total_count >= $1 THEN 'passed' ELSE 'failed' END,
         ps.platform::text, COALESCE(ps.finished_at, ps.started_at)
    FROM ${T.practice_sessions} ps
)`;

function whereOf(f: AttemptFilter, params: unknown[]) {
  const conds = ['true'];
  const add = (sql: string, v: unknown) => {
    params.push(v);
    conds.push(sql.replaceAll('$?', `$${params.length}`));
  };
  if (f.kind) add('att.kind = $?', f.kind);
  if (f.status) add('att.status = $?', f.status);
  if (f.studentId) add('att.user_id = $?', f.studentId);
  if (f.refId) add('att.ref_id = $?', f.refId);
  if (f.from) add('att.at >= $?', f.from);
  if (f.to) add('att.at <= $?', f.to);
  if (f.platform) add('att.platform = $?', f.platform);
  if (f.ids) add('att.id = ANY($?::uuid[])', f.ids);
  const s = sqlSearch(f.q, ['u.name_en', 'u.name_ar', 'u.phone', 'att.title_en', 'att.title_ar'], params);
  if (s) conds.push(s);
  return conds.join(' AND ');
}

interface Row {
  id: string;
  kind: AttemptKind;
  user_id: string;
  ref_id: string;
  title_en: string;
  title_ar: string;
  score: number;
  correct: number;
  total: number;
  time_sec: number;
  status: AttemptStatus;
  platform: string | null;
  at: Date;
  u_id: string;
  u_name_en: string;
  u_name_ar: string;
  u_phone: string;
  u_avatar_url: string | null;
}

const toDto = (r: Row): AttemptRowDto => ({
  id: r.id,
  kind: r.kind,
  student: studentRef(r as unknown as Record<string, unknown>, 'u_') ?? { id: r.user_id, name: { en: '', ar: '' }, mobile: '', avatarUrl: null },
  refId: r.ref_id,
  title: { en: r.title_en, ar: r.title_ar },
  score: Math.round(Number(r.score) * 10) / 10,
  correct: r.correct,
  total: r.total,
  timeSec: r.time_sec,
  status: r.status,
  platform: r.platform === 'web' || r.platform === 'ios' || r.platform === 'android' ? r.platform : null,
  date: r.at.toISOString(),
});

const SORT = { score: 'att.score', timeSec: 'att.time_sec', date: 'att.at', status: 'att.status' };
const FROM = `att JOIN ${T.users} u ON u.id = att.user_id`;

export const attemptsAdminService = {
  async list(f: AttemptFilter, sort: string | undefined, limit: number, offset: number) {
    const learning = await settingsStore.get('learning');
    const params: unknown[] = [learning.quizPassMark];
    const w = whereOf(f, params);
    const total = (await db.scalar<number>(`${UNION} SELECT count(*)::int FROM ${FROM} WHERE ${w}`, params)) ?? 0;
    params.push(limit, offset);
    const rows = await db.many<Row>(
      `${UNION} SELECT att.*, u.id AS u_id, u.name_en AS u_name_en, u.name_ar AS u_name_ar, u.phone AS u_phone, u.avatar_url AS u_avatar_url
         FROM ${FROM} WHERE ${w} ORDER BY ${orderBy(sort, SORT, '-date')}, att.id LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return { items: rows.map(toDto), total };
  },

  async stats(f: AttemptFilter) {
    const learning = await settingsStore.get('learning');
    const params: unknown[] = [learning.quizPassMark];
    const w = whereOf(f, params);
    const r = await db.one<{ total: number; avg_score: number | null; passed: number; finished: number; avg_time: number | null }>(
      `${UNION} SELECT count(*)::int AS total, avg(att.score) FILTER (WHERE att.status IN ('passed','failed')) AS avg_score,
              count(*) FILTER (WHERE att.status = 'passed')::int AS passed, count(*) FILTER (WHERE att.status IN ('passed','failed'))::int AS finished,
              avg(att.time_sec) FILTER (WHERE att.status IN ('passed','failed')) AS avg_time
         FROM ${FROM} WHERE ${w}`,
      params,
    );
    return { total: r.total, avgScore: r.avg_score ? Math.round(Number(r.avg_score) * 10) / 10 : 0, passRate: r.finished ? Math.round((r.passed / r.finished) * 1000) / 10 : 0, avgTimeSec: r.avg_time ? Math.round(Number(r.avg_time)) : 0 };
  },

  async detail(id: string) {
    const { items } = await this.list({ ids: [id] }, undefined, 1, 0);
    const row = items[0];
    if (!row) throw new NotFoundError('attempt');
    let qids: string[] = [];
    let orders: Record<string, string[]> = {};
    let answers: { question_id: string; selected_option_id: string | null; is_correct: boolean | null; flagged?: boolean; time_sec: number | null }[] = [];
    if (row.kind === 'quiz') {
      const a = await db.one<{ question_ids: string[]; option_orders: Record<string, string[]> }>(`SELECT question_ids, option_orders FROM ${T.quiz_attempts} WHERE id = $1`, [id]);
      qids = a.question_ids;
      orders = a.option_orders ?? {};
      answers = await db.many(`SELECT question_id, selected_option_id, is_correct, time_sec FROM ${T.quiz_attempt_answers} WHERE attempt_id = $1`, [id]);
    } else if (row.kind === 'exam') {
      const a = await db.one<{ question_ids: string[]; option_orders: Record<string, string[]> }>(`SELECT question_ids, option_orders FROM ${T.exam_attempts} WHERE id = $1`, [id]);
      qids = a.question_ids;
      orders = a.option_orders ?? {};
      answers = await db.many(`SELECT question_id, selected_option_id, is_correct, flagged, time_sec FROM ${T.exam_attempt_answers} WHERE attempt_id = $1`, [id]);
    } else {
      const a = await db.one<{ question_ids: string[]; option_orders: Record<string, string[]> }>(`SELECT question_ids, option_orders FROM ${T.practice_sessions} WHERE id = $1`, [id]);
      qids = a.question_ids;
      orders = a.option_orders ?? {};
      answers = await db.many(`SELECT question_id, selected_option_id, is_correct, time_sec FROM ${T.practice_answers} WHERE session_id = $1`, [id]);
    }
    const loaded = await loadQuestions(qids);
    const byQ = new Map(answers.map((a) => [a.question_id, a]));
    return {
      ...row,
      answers: qids.map((qid) => {
        const q = loaded.get(qid);
        const a = byQ.get(qid);
        const opts = q ? orderedOptions(q, orders[qid]) : [];
        const sel = opts.find((o) => o.id === a?.selected_option_id) ?? null;
        const cor = opts.find((o) => o.is_correct) ?? null;
        return {
          questionId: qid,
          code: q?.row.code ?? null,
          difficulty: q?.row.difficulty ?? null,
          body: q ? { en: q.row.body_en, ar: q.row.body_ar } : null,
          selectedOptionId: a?.selected_option_id ?? null,
          selectedText: sel ? { en: sel.text_en, ar: sel.text_ar } : null,
          correctOptionId: cor?.id ?? null,
          correctText: cor ? { en: cor.text_en, ar: cor.text_ar } : null,
          correct: !!a?.is_correct,
          flagged: !!a?.flagged,
          timeSec: a?.time_sec ?? null,
        };
      }),
    };
  },
};
