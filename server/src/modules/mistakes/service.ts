/**
 * Mistakes (MST-01…05) + the recorder used by quizzes / practice / exams.
 * One record per (student, question); every miss/retry is kept in mistake_history (mastery history).
 * Correct answers are concealed on MST-03 until a retry (CONTRACT_GAPS G#10) and revealed by MST-05.
 */
import { T } from '../../config/constants.js';
import { db, tx, type Executor } from '../../config/db.js';
import { entitlements } from '../../common/entitlements.js';
import { NotFoundError } from '../../common/errors/index.js';
import type { Localized } from '../../common/i18n/index.js';
import {
  afterRetry,
  findSubject,
  grade,
  indexIn,
  loadQuestions,
  recordActivity,
  reevaluateAchievementsLater,
  ruleError,
  toConcealedReview,
  toReview,
  type LoadedQuestion,
  type MistakeStatus,
  type QuestionReview,
} from '../learning-core/index.js';

export type MistakeSource = 'quiz' | 'bank' | 'exam';

export interface MistakeEntry {
  id: string;
  questionId: string;
  chosenIndex: number;
  chosenOptionId: string | null;
  status: MistakeStatus;
  repeatCount: number;
  date: string;
  firstMissedAt: string;
  source: MistakeSource;
  sourceRefId: string | null;
  question: QuestionReview;
  subject: { id: string; slug: string; name: Localized; color: string };
  unit: { id: string; name: Localized; order: number };
  topic: { id: string; name: Localized; order: number; unitId: string };
  lessonId: string | null;
  history: { date: string; chosenIndex: number; chosenOptionId: string | null; correct: boolean; source: 'retry' | MistakeSource }[];
}

export interface AnswerFeedback {
  questionId: string;
  correct: boolean;
  correctOptionId: string | null;
  correctIndex: number;
  explanation: Localized | null;
  mistake: MistakeEntry | null;
}

const srcOf = (s: string | null): MistakeSource => (s === 'quiz' || s === 'exam' ? s : 'bank');

// ── recorder ────────────────────────────────────────────────────────────────────────────────────────

/** Upsert a mistake for a wrong answer (+ history row). Returns the mistake id. */
export async function recordWrongAnswer(
  userId: string,
  q: LoadedQuestion,
  a: { source: MistakeSource; sourceRefId: string | null; chosenOptionId: string | null; textAnswer?: string | null },
  ex?: Executor,
): Promise<string> {
  const row = await db.one<{ id: string }>(
    `INSERT INTO ${T.mistake_records} (user_id, question_id, subject_id, unit_id, topic_id, lesson_id, source, source_ref_id, chosen_option_id, text_answer, status, repeat_count)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'unresolved',1)
     ON CONFLICT (user_id, question_id) DO UPDATE SET
       repeat_count = ${T.mistake_records}.repeat_count + 1, status = 'unresolved', last_wrong_at = now(), source = EXCLUDED.source,
       source_ref_id = EXCLUDED.source_ref_id, chosen_option_id = EXCLUDED.chosen_option_id, text_answer = EXCLUDED.text_answer,
       mastered_at = NULL, correct_streak = 0, lesson_id = COALESCE(EXCLUDED.lesson_id, ${T.mistake_records}.lesson_id)
     RETURNING id`,
    [userId, q.row.id, q.row.subject_id, q.row.unit_id, q.row.topic_id, q.row.lesson_ref_id, a.source, a.sourceRefId, a.chosenOptionId, a.textAnswer ?? null],
    ex,
  );
  await db.query(`INSERT INTO ${T.mistake_history} (mistake_id, event, source, chosen_option_id, text_answer, correct) VALUES ($1,'wrong',$2,$3,$4,false)`, [row.id, a.source, a.chosenOptionId, a.textAnswer ?? null], ex);
  return row.id;
}

// ── read model ──────────────────────────────────────────────────────────────────────────────────────

interface Row {
  id: string;
  question_id: string;
  chosen_option_id: string | null;
  status: MistakeStatus;
  repeat_count: number;
  last_wrong_at: Date;
  first_wrong_at: Date;
  source: string;
  source_ref_id: string | null;
  lesson_id: string | null;
  subject_id: string | null;
  s_slug: string | null;
  s_name_en: string | null;
  s_name_ar: string | null;
  s_color: string | null;
  s_sort: number | null;
  unit_id: string | null;
  u_title_en: string | null;
  u_title_ar: string | null;
  u_sort: number | null;
  topic_id: string | null;
  tp_title_en: string | null;
  tp_title_ar: string | null;
  tp_sort: number | null;
}

const SELECT = `m.id, m.question_id, m.chosen_option_id, m.status, m.repeat_count, m.last_wrong_at, m.first_wrong_at, m.source, m.source_ref_id, m.lesson_id,
  m.subject_id, s.slug AS s_slug, s.name_en AS s_name_en, s.name_ar AS s_name_ar, s.color AS s_color, s.sort_order AS s_sort,
  m.unit_id, u.title_en AS u_title_en, u.title_ar AS u_title_ar, u.sort_order AS u_sort,
  m.topic_id, tp.title_en AS tp_title_en, tp.title_ar AS tp_title_ar, tp.sort_order AS tp_sort`;
const FROM = `${T.mistake_records} m
  JOIN ${T.questions} q ON q.id = m.question_id
  LEFT JOIN ${T.subjects} s ON s.id = m.subject_id
  LEFT JOIN ${T.units} u ON u.id = m.unit_id
  LEFT JOIN ${T.topics} tp ON tp.id = m.topic_id`;

async function toEntries(rows: Row[], opts: { conceal?: boolean } = {}, ex?: Executor): Promise<MistakeEntry[]> {
  if (!rows.length) return [];
  const loaded = await loadQuestions(rows.map((r) => r.question_id), ex);
  const hist = await db.many<{ mistake_id: string; event: string; source: string | null; chosen_option_id: string | null; correct: boolean | null; created_at: Date }>(
    `SELECT mistake_id, event, source, chosen_option_id, correct, created_at FROM ${T.mistake_history}
      WHERE mistake_id = ANY($1::uuid[]) AND event IN ('wrong','retry_correct','retry_wrong') ORDER BY created_at`,
    [rows.map((r) => r.id)],
    ex,
  );
  const bm = new Set(
    (await db.many<{ entity_id: string }>(`SELECT entity_id FROM ${T.bookmarks} WHERE entity_type = 'question' AND entity_id = ANY($1::uuid[]) AND user_id = (SELECT user_id FROM ${T.mistake_records} WHERE id = $2)`, [rows.map((r) => r.question_id), rows[0]!.id], ex)).map((b) => b.entity_id),
  );
  const out: MistakeEntry[] = [];
  for (const r of rows) {
    const q = loaded.get(r.question_id);
    if (!q) continue;
    out.push({
      id: r.id,
      questionId: r.question_id,
      chosenIndex: indexIn(q, r.chosen_option_id),
      chosenOptionId: r.chosen_option_id,
      status: r.status,
      repeatCount: r.repeat_count,
      date: r.last_wrong_at.toISOString(),
      firstMissedAt: r.first_wrong_at.toISOString(),
      source: srcOf(r.source),
      sourceRefId: r.source_ref_id,
      question: opts.conceal ? toConcealedReview(q, { bookmarked: bm.has(q.row.id) }) : toReview(q, { bookmarked: bm.has(q.row.id) }),
      subject: { id: r.subject_id ?? q.row.subject_id, slug: r.s_slug ?? q.row.subject_slug, name: { en: r.s_name_en ?? q.row.subject_name_en, ar: r.s_name_ar ?? q.row.subject_name_ar }, color: r.s_color ?? q.row.subject_color },
      unit: { id: r.unit_id ?? '', name: { en: r.u_title_en ?? '', ar: r.u_title_ar ?? '' }, order: r.u_sort ?? 0 },
      topic: { id: r.topic_id ?? '', name: { en: r.tp_title_en ?? q.row.topic_label_en, ar: r.tp_title_ar ?? q.row.topic_label_ar }, order: r.tp_sort ?? 0, unitId: r.unit_id ?? '' },
      lessonId: r.lesson_id ?? q.row.lesson_ref_id,
      history: hist
        .filter((h) => h.mistake_id === r.id)
        .map((h) => ({
          date: h.created_at.toISOString(),
          chosenIndex: indexIn(q, h.chosen_option_id),
          chosenOptionId: h.chosen_option_id,
          correct: h.event === 'retry_correct' || h.correct === true,
          source: h.event === 'wrong' ? srcOf(h.source) : ('retry' as const),
        })),
    });
  }
  return out;
}

export async function mistakeEntry(id: string, userId: string, opts: { conceal?: boolean } = {}, ex?: Executor): Promise<MistakeEntry> {
  const r = await db.maybeOne<Row>(`SELECT ${SELECT} FROM ${FROM} WHERE m.id = $1 AND m.user_id = $2`, [id, userId], ex);
  if (!r) throw new NotFoundError('mistake');
  return (await toEntries([r], opts, ex))[0] as MistakeEntry;
}

export interface MistakeListQuery {
  status?: MistakeStatus | 'repeated';
  subjectId?: string;
  unitId?: string;
  topicId?: string;
  source?: MistakeSource;
  from?: string;
  to?: string;
  groupBy?: 'subject' | 'unit' | 'topic' | 'date';
  sort?: string;
  page: number;
  pageSize: number;
}

async function nextUnresolvedId(userId: string, exceptId: string): Promise<string | null> {
  return db.scalar<string>(`SELECT id FROM ${T.mistake_records} WHERE user_id = $1 AND status = 'unresolved' AND id <> $2 ORDER BY last_wrong_at DESC LIMIT 1`, [userId, exceptId]);
}

export const mistakesService = {
  async list(userId: string, q: MistakeListQuery) {
    const params: unknown[] = [userId];
    const conds = ['m.user_id = $1', 'q.deleted_at IS NULL'];
    const add = (sql: string, v: unknown) => {
      params.push(v);
      conds.push(sql.replace('$?', `$${params.length}`));
    };
    if (q.status === 'repeated') conds.push('m.repeat_count >= 2');
    else if (q.status) add('m.status = $?', q.status);
    if (q.subjectId) {
      const s = await findSubject(q.subjectId);
      if (!s) throw new NotFoundError('subject');
      add('m.subject_id = $?', s.id);
    }
    if (q.unitId) add('m.unit_id = $?', q.unitId);
    if (q.topicId) add('m.topic_id = $?', q.topicId);
    if (q.source) add(q.source === 'bank' ? `m.source IN ('bank','practice') AND $?::text IS NOT NULL` : 'm.source = $?', q.source);
    if (q.from) add('m.last_wrong_at >= $?', q.from);
    if (q.to) add('m.last_wrong_at <= $?', q.to);
    const where = conds.join(' AND ');
    const order = q.groupBy
      ? 's.sort_order NULLS LAST, u.sort_order NULLS LAST, m.last_wrong_at DESC'
      : q.sort === 'repeatCount'
        ? 'm.repeat_count ASC, m.last_wrong_at DESC'
        : q.sort === '-repeatCount'
          ? 'm.repeat_count DESC, m.last_wrong_at DESC'
          : 'm.last_wrong_at DESC';
    const total = (await db.scalar<number>(`SELECT count(*)::int FROM ${FROM} WHERE ${where}`, params)) ?? 0;
    const pageParams = [...params, q.pageSize, (q.page - 1) * q.pageSize];
    const rows = await db.many<Row>(`SELECT ${SELECT} FROM ${FROM} WHERE ${where} ORDER BY ${order}, m.id LIMIT $${pageParams.length - 1} OFFSET $${pageParams.length}`, pageParams);
    const items = await toEntries(rows);
    const counts = await this.summary(userId);
    const bySubject = await db.many<{ subject_id: string; slug: string; n: number }>(
      `SELECT m.subject_id, s.slug, count(*)::int AS n FROM ${FROM} WHERE m.user_id = $1 AND q.deleted_at IS NULL AND m.subject_id IS NOT NULL GROUP BY m.subject_id, s.slug, s.sort_order ORDER BY s.sort_order`,
      [userId],
    );
    let groups: { key: string; label: Localized; count: number; ids: string[] }[] | undefined;
    if (q.groupBy) {
      const all = await db.many<Row>(`SELECT ${SELECT} FROM ${FROM} WHERE ${where} ORDER BY ${order}`, params);
      const map = new Map<string, { key: string; label: Localized; count: number; ids: string[] }>();
      for (const r of all) {
        const [key, label]: [string, Localized] =
          q.groupBy === 'subject'
            ? [r.subject_id ?? '', { en: r.s_name_en ?? '', ar: r.s_name_ar ?? '' }]
            : q.groupBy === 'unit'
              ? [r.unit_id ?? '', { en: r.u_title_en ?? '', ar: r.u_title_ar ?? '' }]
              : q.groupBy === 'topic'
                ? [r.topic_id ?? '', { en: r.tp_title_en ?? '', ar: r.tp_title_ar ?? '' }]
                : (() => {
                    const d = r.last_wrong_at.toISOString().slice(0, 10);
                    return [d, { en: d, ar: d }] as [string, Localized];
                  })();
        const g = map.get(key) ?? { key, label, count: 0, ids: [] };
        g.count++;
        g.ids.push(r.id);
        map.set(key, g);
      }
      groups = [...map.values()];
      if (q.groupBy === 'date') groups.sort((a, b) => b.key.localeCompare(a.key));
    }
    return {
      items,
      meta: {
        page: q.page,
        pageSize: q.pageSize,
        total,
        nextCursor: null,
        counts: { unresolved: counts.unresolved, reviewed: counts.reviewed, mastered: counts.mastered, repeated: counts.repeated, total: counts.total },
        bySubject: bySubject.map((b) => ({ subjectId: b.subject_id, slug: b.slug, count: b.n })),
        ...(groups ? { groups } : {}),
      },
    };
  },

  async summary(userId: string) {
    const r = await db.one<{ unresolved: number; reviewed: number; mastered: number; repeated: number; total: number }>(
      `SELECT count(*) FILTER (WHERE m.status = 'unresolved')::int AS unresolved, count(*) FILTER (WHERE m.status = 'reviewed')::int AS reviewed,
              count(*) FILTER (WHERE m.status = 'mastered')::int AS mastered, count(*) FILTER (WHERE m.repeat_count >= 2)::int AS repeated, count(*)::int AS total
         FROM ${T.mistake_records} m JOIN ${T.questions} q ON q.id = m.question_id WHERE m.user_id = $1 AND q.deleted_at IS NULL`,
      [userId],
    );
    return { ...r, masteryPct: r.total ? Math.round((r.mastered / r.total) * 1000) / 10 : 0 };
  },

  async detail(userId: string, id: string, reveal = false) {
    const m = await mistakeEntry(id, userId);
    const conceal = !reveal && m.status !== 'mastered';
    const entry = conceal ? await mistakeEntry(id, userId, { conceal: true }) : m;
    return { ...entry, nextUnresolvedId: await nextUnresolvedId(userId, id) };
  },

  async setStatus(userId: string, id: string, status: MistakeStatus) {
    await tx(async (c) => {
      const cur = await db.maybeOne<{ status: MistakeStatus }>(`SELECT status FROM ${T.mistake_records} WHERE id = $1 AND user_id = $2 FOR UPDATE`, [id, userId], c);
      if (!cur) throw new NotFoundError('mistake');
      if (cur.status === status) return;
      await db.query(
        `UPDATE ${T.mistake_records} SET status = $3,
                last_reviewed_at = CASE WHEN $3 IN ('reviewed','mastered') THEN now() ELSE last_reviewed_at END,
                mastered_at = CASE WHEN $3 = 'mastered' THEN now() ELSE NULL END,
                mastery_level = CASE WHEN $3 = 'mastered' THEN 3 WHEN $3 = 'reviewed' THEN GREATEST(mastery_level, 1) ELSE mastery_level END
          WHERE id = $1 AND user_id = $2`,
        [id, userId, status],
        c,
      );
      await db.query(`INSERT INTO ${T.mistake_history} (mistake_id, event, status_to) VALUES ($1, 'status_change', $2)`, [id, status], c);
    });
    if (status === 'mastered') reevaluateAchievementsLater(userId);
    return mistakeEntry(id, userId);
  },

  async retry(userId: string, id: string, body: { optionId?: string; chosenIndex?: number; textAnswer?: string }, platform: string | null) {
    const m = await db.maybeOne<{ question_id: string; subject_id: string | null; status: MistakeStatus; repeat_count: number }>(
      `SELECT question_id, subject_id, status, repeat_count FROM ${T.mistake_records} WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    if (!m) throw new NotFoundError('mistake');
    const q = (await loadQuestions([m.question_id])).get(m.question_id);
    if (!q) throw new NotFoundError('question');
    await entitlements.assertAccess(userId, q.row.subject_id, { feature: 'mistakes' });
    const g = grade(q, body);
    if (!g.answered) throw ruleError('ANSWER_REQUIRED');
    const next = afterRetry({ status: m.status, repeatCount: m.repeat_count }, g.correct);
    await tx(async (c) => {
      await db.query(
        `UPDATE ${T.mistake_records} SET status = $3, repeat_count = $4, last_reviewed_at = now(),
                chosen_option_id = CASE WHEN $5 THEN chosen_option_id ELSE $6::uuid END,
                text_answer = CASE WHEN $5 THEN text_answer ELSE $7 END,
                last_wrong_at = CASE WHEN $5 THEN last_wrong_at ELSE now() END,
                mastered_at = CASE WHEN $5 THEN now() ELSE NULL END,
                correct_streak = CASE WHEN $5 THEN correct_streak + 1 ELSE 0 END,
                mastery_level = CASE WHEN $5 THEN 3 ELSE 0 END
          WHERE id = $1 AND user_id = $2`,
        [id, userId, next.status, next.repeatCount, g.correct, g.chosenOptionId, g.textAnswer],
        c,
      );
      await db.query(`INSERT INTO ${T.mistake_history} (mistake_id, event, source, chosen_option_id, text_answer, correct) VALUES ($1,$2,'retry',$3,$4,$5)`, [id, g.correct ? 'retry_correct' : 'retry_wrong', g.chosenOptionId, g.textAnswer, g.correct], c);
      await recordActivity(userId, { questionsAnswered: 1, questionsCorrect: g.correct ? 1 : 0 }, platform, c);
    });
    if (g.correct) reevaluateAchievementsLater(userId);
    const entry = await mistakeEntry(id, userId);
    const fb: AnswerFeedback = { questionId: q.row.id, correct: g.correct, correctOptionId: g.correctOptionId, correctIndex: g.correctIndex, explanation: { en: q.row.explanation_en, ar: q.row.explanation_ar }, mistake: entry };
    return { ...fb, mistake: entry, nextUnresolvedId: await nextUnresolvedId(userId, id) };
  },
};
