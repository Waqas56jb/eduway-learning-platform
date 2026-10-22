/**
 * Student question bank (BNK-01…03) and bookmarks (BMK-01…04). Answers are only revealed for entitled subjects
 * (`reveal=true` / BNK-03); locked subjects list questions with `locked=true` and never include answers.
 */
import { T } from '../../config/constants.js';
import { db } from '../../config/db.js';
import { entitlements, evaluateSubjectAccess } from '../../common/entitlements.js';
import { NotFoundError } from '../../common/errors/index.js';
import { bookmarkedQuestionIds, findSubject, loadQuestions, sqlSearch, toPublic, toReview, type QuestionPublic, type QuestionReview } from '../learning-core/index.js';
import type { BankQuery } from './schemas.js';

export interface BankFilter {
  subjectId?: string;
  unitId?: string;
  topicId?: string;
  topic?: string;
  difficulty?: string[];
  type?: string[];
  tags?: string[];
  bookmarked?: boolean;
  q?: string;
  questionIds?: string[];
}

/** WHERE for published bank questions (alias q, joined s + tp). */
export function bankWhere(f: BankFilter, userId: string, params: unknown[], omit: (keyof BankFilter)[] = []): string {
  const conds = [`q.deleted_at IS NULL`, `q.status = 'published'`, `s.deleted_at IS NULL`, `s.status = 'active'`];
  const use = (k: keyof BankFilter) => !omit.includes(k) && f[k] !== undefined && f[k] !== null && !(Array.isArray(f[k]) && (f[k] as unknown[]).length === 0);
  const add = (sql: string, v: unknown) => {
    params.push(v);
    conds.push(sql.replaceAll('$?', `$${params.length}`));
  };
  if (use('subjectId')) add('q.subject_id = $?', f.subjectId);
  if (use('unitId')) add('q.unit_id = $?', f.unitId);
  if (use('topicId')) add('q.topic_id = $?', f.topicId);
  if (use('topic')) add(`(lower(tp.title_en) = lower($?) OR lower(q.topic_label_en) = lower($?))`, f.topic);
  const diffs = (f.difficulty ?? []).filter((d) => d !== 'all');
  if (use('difficulty') && diffs.length) add('q.difficulty::text = ANY($?::text[])', diffs);
  if (use('type')) add('q.type = ANY($?::text[])', f.type);
  if (use('tags')) add(`EXISTS (SELECT 1 FROM ${T.question_tags} qt JOIN ${T.tags} tg ON tg.id = qt.tag_id WHERE qt.question_id = q.id AND tg.slug = ANY($?::text[]))`, f.tags);
  if (use('bookmarked') && f.bookmarked) add(`EXISTS (SELECT 1 FROM ${T.bookmarks} b WHERE b.user_id = $? AND b.entity_type = 'question' AND b.entity_id = q.id)`, userId);
  if (use('questionIds')) add('q.id = ANY($?::uuid[])', f.questionIds);
  if (use('q')) {
    const s = sqlSearch(f.q, ['q.body_en', 'q.body_ar', 'q.code', 'tp.title_en', 'tp.title_ar', 'q.topic_label_en', 'q.topic_label_ar'], params);
    if (s) conds.push(s);
  }
  return conds.join(' AND ');
}

export const BANK_FROM = `${T.questions} q JOIN ${T.subjects} s ON s.id = q.subject_id LEFT JOIN ${T.topics} tp ON tp.id = q.topic_id`;

export async function bankFilterOf(q: Partial<BankQuery>): Promise<BankFilter> {
  let subjectId: string | undefined;
  if (q.subjectId) {
    const s = await findSubject(q.subjectId);
    if (!s) throw new NotFoundError('subject');
    subjectId = s.id;
  }
  return { subjectId, unitId: q.unitId, topicId: q.topicId, topic: q.topic, difficulty: q.difficulty, type: q.type, tags: q.tags, bookmarked: q.bookmarked, q: q.q };
}

const SORTS: Record<string, string> = { code: 'q.code ASC', '-code': 'q.code DESC', '-createdAt': 'q.created_at DESC', createdAt: 'q.created_at ASC', difficulty: `array_position(ARRAY['easy','medium','hard'], q.difficulty::text), q.code`, '-difficulty': `array_position(ARRAY['easy','medium','hard'], q.difficulty::text) DESC, q.code` };

async function mapForStudent(ids: string[], userId: string, reveal: boolean): Promise<(QuestionPublic | QuestionReview)[]> {
  const [loaded, bm, records] = await Promise.all([loadQuestions(ids), bookmarkedQuestionIds(userId), entitlements.list(userId)]);
  return ids
    .map((id) => loaded.get(id))
    .filter((q) => !!q)
    .map((q) => {
      const locked = !evaluateSubjectAccess(records, q!.row.subject_id).allowed;
      const opts = { bookmarked: bm.has(q!.row.id), locked };
      return reveal && !locked ? toReview(q!, opts) : toPublic(q!, opts);
    });
}

export const bankService = {
  async list(userId: string, query: BankQuery) {
    const f = await bankFilterOf(query);
    const params: unknown[] = [];
    const w = bankWhere(f, userId, params);
    const total = (await db.scalar<number>(`SELECT count(*)::int FROM ${BANK_FROM} WHERE ${w}`, params)) ?? 0;
    const order = (query.sort && SORTS[query.sort]) || `md5(q.id::text || current_date::text)`;
    params.push(query.pageSize, (query.page - 1) * query.pageSize);
    const rows = await db.many<{ id: string }>(`SELECT q.id FROM ${BANK_FROM} WHERE ${w} ORDER BY ${order}, q.id LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
    const items = await mapForStudent(rows.map((r) => r.id), userId, !!query.reveal);
    const bookmarkedCount = (await db.scalar<number>(`SELECT count(*)::int FROM ${T.bookmarks} WHERE user_id = $1 AND entity_type = 'question'`, [userId])) ?? 0;
    return { items, meta: { page: query.page, pageSize: query.pageSize, total, nextCursor: null, bookmarkedCount } };
  },

  async facets(userId: string, query: Partial<BankQuery>) {
    const f = await bankFilterOf(query);
    const count = async (omit: (keyof BankFilter)[] = []) => {
      const p: unknown[] = [];
      return (await db.scalar<number>(`SELECT count(*)::int FROM ${BANK_FROM} WHERE ${bankWhere(f, userId, p, omit)}`, p)) ?? 0;
    };
    const group = async <R extends Record<string, unknown>>(select: string, groupBy: string, omit: (keyof BankFilter)[], orderSql: string) => {
      const p: unknown[] = [];
      return db.many<R>(`SELECT ${select}, count(*)::int AS n FROM ${BANK_FROM} WHERE ${bankWhere(f, userId, p, omit)} GROUP BY ${groupBy} ORDER BY ${orderSql}`, p);
    };
    const [total, matchCount, records] = await Promise.all([
      db.scalar<number>(`SELECT count(*)::int FROM ${BANK_FROM} WHERE ${bankWhere({}, userId, [])}`, []),
      count(),
      entitlements.list(userId),
    ]);
    const subjects = await db.many<{ id: string; slug: string; name_en: string; name_ar: string; n: number; answered: number; correct: number }>(
      `SELECT s.id, s.slug, s.name_en, s.name_ar,
              (SELECT count(*) FROM ${T.questions} q WHERE q.subject_id = s.id AND q.status = 'published' AND q.deleted_at IS NULL)::int AS n,
              (SELECT count(*) FROM ${T.practice_answers} pa JOIN ${T.practice_sessions} ps ON ps.id = pa.session_id JOIN ${T.questions} q2 ON q2.id = pa.question_id
                WHERE ps.user_id = $1 AND q2.subject_id = s.id)::int AS answered,
              (SELECT count(*) FROM ${T.practice_answers} pa JOIN ${T.practice_sessions} ps ON ps.id = pa.session_id JOIN ${T.questions} q2 ON q2.id = pa.question_id
                WHERE ps.user_id = $1 AND q2.subject_id = s.id AND pa.is_correct)::int AS correct
         FROM ${T.subjects} s WHERE s.deleted_at IS NULL AND s.status = 'active' ORDER BY s.sort_order`,
      [userId],
    );
    const units = f.subjectId
      ? await group<{ unit_id: string; title_en: string; title_ar: string; ord: number }>(
          `q.unit_id, (SELECT u.title_en FROM ${T.units} u WHERE u.id = q.unit_id) AS title_en, (SELECT u.title_ar FROM ${T.units} u WHERE u.id = q.unit_id) AS title_ar, (SELECT u.sort_order FROM ${T.units} u WHERE u.id = q.unit_id) AS ord`,
          'q.unit_id',
          ['unitId', 'topicId', 'topic'],
          'ord NULLS LAST',
        )
      : [];
    const topics = f.subjectId || f.unitId
      ? await group<{ topic_id: string; title_en: string | null; title_ar: string | null; label_en: string; label_ar: string }>(
          'q.topic_id, tp.title_en, tp.title_ar, max(q.topic_label_en) AS label_en, max(q.topic_label_ar) AS label_ar',
          'q.topic_id, tp.title_en, tp.title_ar, tp.sort_order',
          ['topicId', 'topic'],
          'tp.sort_order NULLS LAST',
        )
      : [];
    const diffs = await group<{ difficulty: 'easy' | 'medium' | 'hard' }>('q.difficulty', 'q.difficulty', ['difficulty'], 'q.difficulty');
    const tp: unknown[] = [];
    const tags = await db.many<{ slug: string; name_en: string; name_ar: string; n: number }>(
      `SELECT tg.slug, tg.name_en, tg.name_ar, count(*)::int AS n FROM ${BANK_FROM}
         JOIN ${T.question_tags} qt ON qt.question_id = q.id JOIN ${T.tags} tg ON tg.id = qt.tag_id
        WHERE ${bankWhere(f, userId, tp, ['tags'])} GROUP BY tg.slug, tg.name_en, tg.name_ar ORDER BY n DESC, tg.slug`,
      tp,
    );
    const difficulties = { easy: 0, medium: 0, hard: 0 };
    for (const d of diffs) difficulties[d.difficulty] = (d as unknown as { n: number }).n;
    const bookmarkedCount = (await db.scalar<number>(`SELECT count(*)::int FROM ${T.bookmarks} WHERE user_id = $1 AND entity_type = 'question'`, [userId])) ?? 0;
    return {
      total: total ?? 0,
      matchCount,
      subjects: subjects.map((s) => ({ subjectId: s.id, slug: s.slug, name: { en: s.name_en, ar: s.name_ar }, count: s.n, locked: !evaluateSubjectAccess(records, s.id).allowed, mastery: s.answered ? Math.round((s.correct / s.answered) * 100) : null })),
      units: units.filter((u) => u.unit_id).map((u) => ({ unitId: u.unit_id, title: { en: u.title_en, ar: u.title_ar }, order: u.ord, count: (u as unknown as { n: number }).n })),
      topics: topics.filter((t) => t.topic_id).map((t) => ({ topicId: t.topic_id, key: t.title_en ?? t.label_en, label: { en: t.title_en ?? t.label_en, ar: t.title_ar ?? t.label_ar }, count: (t as unknown as { n: number }).n })),
      difficulties,
      tags: tags.map((t) => ({ slug: t.slug, label: t.name_en ? { en: t.name_en, ar: t.name_ar || t.name_en } : null, count: t.n })),
      bookmarkedCount,
    };
  },

  async question(userId: string, questionId: string): Promise<QuestionReview> {
    const loaded = await loadQuestions([questionId]);
    const q = loaded.get(questionId);
    if (!q || q.row.status !== 'published') throw new NotFoundError('question');
    await entitlements.assertAccess(userId, q.row.subject_id, { feature: 'question_bank' });
    const bm = await bookmarkedQuestionIds(userId);
    return toReview(q, { bookmarked: bm.has(questionId) });
  },

  // ── bookmarks ──
  async bookmarks(userId: string, subjectIdOrSlug: string | undefined, page: number, pageSize: number) {
    const params: unknown[] = [userId];
    let extra = '';
    if (subjectIdOrSlug) {
      const s = await findSubject(subjectIdOrSlug);
      if (!s) throw new NotFoundError('subject');
      params.push(s.id);
      extra = `AND q.subject_id = $2`;
    }
    const base = `FROM ${T.bookmarks} b JOIN ${T.questions} q ON q.id = b.entity_id WHERE b.user_id = $1 AND b.entity_type = 'question' AND q.deleted_at IS NULL ${extra}`;
    const total = (await db.scalar<number>(`SELECT count(*)::int ${base}`, params)) ?? 0;
    params.push(pageSize, (page - 1) * pageSize);
    const rows = await db.many<{ id: string }>(`SELECT q.id ${base} ORDER BY b.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
    return { items: (await mapForStudent(rows.map((r) => r.id), userId, false)) as QuestionPublic[], meta: { page, pageSize, total, nextCursor: null } };
  },
  async bookmarkIds(userId: string) {
    return [...(await bookmarkedQuestionIds(userId))];
  },
  async bookmark(userId: string, questionId: string) {
    const ok = await db.scalar<number>(`SELECT count(*)::int FROM ${T.questions} WHERE id = $1 AND deleted_at IS NULL`, [questionId]);
    if (!ok) throw new NotFoundError('question');
    await db.query(`INSERT INTO ${T.bookmarks} (user_id, entity_type, entity_id) VALUES ($1, 'question', $2) ON CONFLICT DO NOTHING`, [userId, questionId]);
    return { questionId, bookmarked: true as const };
  },
  async unbookmark(userId: string, questionId: string) {
    await db.query(`DELETE FROM ${T.bookmarks} WHERE user_id = $1 AND entity_type = 'question' AND entity_id = $2`, [userId, questionId]);
    return { questionId, bookmarked: false as const };
  },
};

