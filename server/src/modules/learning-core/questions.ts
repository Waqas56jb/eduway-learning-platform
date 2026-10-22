/**
 * Shared question read-model for every student surface (bank, quizzes, practice, exams, mistakes):
 * load questions + options + tags in bulk, map to QuestionPublic / QuestionReview (API_CONTRACT §1.7) in a given
 * served option order, and grade an answer. The correct answer is ONLY present in QuestionReview.
 */
import { T } from '../../config/constants.js';
import { db, type Executor } from '../../config/db.js';
import type { Localized } from '../../common/i18n/index.js';
import { storage } from '../../common/services/storage.js';
import { answersMatch } from './text.js';

export type QuestionType = 'mcq' | 'true_false' | 'fill_blank';
import type { Difficulty } from './rules.js';
export type { Difficulty };

export interface QuestionRow {
  id: string;
  code: string;
  subject_id: string;
  subject_slug: string;
  subject_name_en: string;
  subject_name_ar: string;
  subject_color: string;
  subject_sort: number;
  unit_id: string | null;
  unit_title_en: string | null;
  unit_title_ar: string | null;
  unit_sort: number | null;
  topic_id: string | null;
  topic_title_en: string | null;
  topic_title_ar: string | null;
  topic_sort: number | null;
  topic_label_en: string;
  topic_label_ar: string;
  lesson_ref_id: string | null;
  type: QuestionType;
  difficulty: Difficulty;
  body_en: string;
  body_ar: string;
  formula: string | null;
  image_url: string | null;
  explanation_en: string;
  explanation_ar: string;
  status: string;
}

export interface OptionRow {
  id: string;
  question_id: string;
  sort_order: number;
  text_en: string;
  text_ar: string;
  is_correct: boolean;
}

export interface LoadedQuestion {
  row: QuestionRow;
  options: OptionRow[];
  tags: string[];
  imageUrl: string | null;
}

export interface QuestionPublic {
  id: string;
  code: string;
  subjectId: string;
  subjectSlug: string;
  unitId: string;
  topicId: string;
  lessonId: string | null;
  topic: Localized;
  difficulty: Difficulty;
  type: QuestionType;
  tags: string[];
  text: Localized;
  formula: string | null;
  imageUrl: string | null;
  options: { id: string; text: Localized }[];
  bookmarked: boolean;
  locked: boolean;
}

export interface QuestionReview extends QuestionPublic {
  correctOptionId: string | null;
  correctIndex: number;
  acceptedAnswers: Localized[];
  explanation: Localized;
}

/** SELECT list for alias `q` (+ joined s/u/tp); `lesson_ref_id` = linked published lesson else first published lesson of the topic. */
export const QUESTION_SELECT = `
  q.id, q.code, q.subject_id, s.slug AS subject_slug, s.name_en AS subject_name_en, s.name_ar AS subject_name_ar, s.color AS subject_color,
  s.sort_order AS subject_sort, q.unit_id, u.title_en AS unit_title_en, u.title_ar AS unit_title_ar, u.sort_order AS unit_sort,
  q.topic_id, tp.title_en AS topic_title_en, tp.title_ar AS topic_title_ar, tp.sort_order AS topic_sort,
  q.topic_label_en, q.topic_label_ar,
  COALESCE(
    (SELECT l1.id FROM ${T.lessons} l1 WHERE l1.id = q.lesson_id AND l1.status = 'published' AND l1.deleted_at IS NULL),
    (SELECT l2.id FROM ${T.lessons} l2 WHERE l2.topic_id = q.topic_id AND l2.status = 'published' AND l2.deleted_at IS NULL ORDER BY l2.sort_order LIMIT 1)
  ) AS lesson_ref_id,
  q.type, q.difficulty, q.body_en, q.body_ar, q.formula, q.image_url, q.explanation_en, q.explanation_ar, q.status`;

export const QUESTION_FROM = `${T.questions} q
  JOIN ${T.subjects} s ON s.id = q.subject_id
  LEFT JOIN ${T.units} u ON u.id = q.unit_id
  LEFT JOIN ${T.topics} tp ON tp.id = q.topic_id`;

/** Bulk load (any status, including soft-deleted — attempt history must still render). Order of `ids` preserved. */
export async function loadQuestions(ids: readonly string[], ex?: Executor): Promise<Map<string, LoadedQuestion>> {
  const unique = [...new Set(ids)];
  const out = new Map<string, LoadedQuestion>();
  if (!unique.length) return out;
  const [rows, options, tags] = await Promise.all([
    db.many<QuestionRow>(`SELECT ${QUESTION_SELECT} FROM ${QUESTION_FROM} WHERE q.id = ANY($1::uuid[])`, [unique], ex),
    db.many<OptionRow>(`SELECT id, question_id, sort_order, text_en, text_ar, is_correct FROM ${T.question_options} WHERE question_id = ANY($1::uuid[]) ORDER BY question_id, sort_order`, [unique], ex),
    db.many<{ question_id: string; slug: string }>(`SELECT qt.question_id, t.slug FROM ${T.question_tags} qt JOIN ${T.tags} t ON t.id = qt.tag_id WHERE qt.question_id = ANY($1::uuid[]) ORDER BY t.slug`, [unique], ex),
  ]);
  const images = await storage.resolveMany(rows.map((r) => r.image_url));
  const optBy = new Map<string, OptionRow[]>();
  for (const o of options) optBy.set(o.question_id, [...(optBy.get(o.question_id) ?? []), o]);
  const tagBy = new Map<string, string[]>();
  for (const t of tags) tagBy.set(t.question_id, [...(tagBy.get(t.question_id) ?? []), t.slug]);
  rows.forEach((r, i) => out.set(r.id, { row: r, options: optBy.get(r.id) ?? [], tags: tagBy.get(r.id) ?? [], imageUrl: images[i] ?? null }));
  return out;
}

/** Options in served order (unknown ids ignored, missing ones appended in canonical order). */
export function orderedOptions(q: LoadedQuestion, order?: readonly string[] | null): OptionRow[] {
  if (!order?.length) return q.options;
  const byId = new Map(q.options.map((o) => [o.id, o]));
  const served = order.map((id) => byId.get(id)).filter((o): o is OptionRow => !!o);
  for (const o of q.options) if (!order.includes(o.id)) served.push(o);
  return served;
}

export interface MapOpts {
  order?: readonly string[] | null;
  bookmarked?: boolean;
  locked?: boolean;
}

export function toPublic(q: LoadedQuestion, o: MapOpts = {}): QuestionPublic {
  const r = q.row;
  const opts = r.type === 'fill_blank' ? [] : orderedOptions(q, o.order);
  return {
    id: r.id,
    code: r.code,
    subjectId: r.subject_id,
    subjectSlug: r.subject_slug,
    unitId: r.unit_id ?? '',
    topicId: r.topic_id ?? '',
    lessonId: r.lesson_ref_id,
    topic: { en: r.topic_title_en ?? r.topic_label_en, ar: r.topic_title_ar ?? r.topic_label_ar },
    difficulty: r.difficulty,
    type: r.type,
    tags: q.tags,
    text: { en: r.body_en, ar: r.body_ar },
    formula: r.formula,
    imageUrl: q.imageUrl,
    options: opts.map((x) => ({ id: x.id, text: { en: x.text_en, ar: x.text_ar } })),
    bookmarked: o.bookmarked ?? false,
    locked: o.locked ?? false,
  };
}

export function toReview(q: LoadedQuestion, o: MapOpts & { showExplanation?: boolean } = {}): QuestionReview {
  const pub = toPublic(q, o);
  const correct = q.row.type === 'fill_blank' ? null : (orderedOptions(q, o.order).find((x) => x.is_correct) ?? null);
  return {
    ...pub,
    correctOptionId: correct?.id ?? null,
    correctIndex: correct ? pub.options.findIndex((x) => x.id === correct.id) : -1,
    acceptedAnswers: q.row.type === 'fill_blank' ? q.options.map((x) => ({ en: x.text_en, ar: x.text_ar })) : [],
    explanation: o.showExplanation === false ? { en: '', ar: '' } : { en: q.row.explanation_en, ar: q.row.explanation_ar },
  };
}

/** Review with the answer withheld (mistake detail before a retry — CONTRACT_GAPS G#10). */
export function toConcealedReview(q: LoadedQuestion, o: MapOpts = {}): QuestionReview {
  return { ...toPublic(q, o), correctOptionId: null, correctIndex: -1, acceptedAnswers: [], explanation: { en: '', ar: '' } };
}

export interface AnswerInput {
  optionId?: string | null;
  /** index in the served options */
  chosenIndex?: number | null;
  textAnswer?: string | null;
}

export interface Graded {
  correct: boolean;
  answered: boolean;
  chosenOptionId: string | null;
  chosenIndex: number;
  textAnswer: string | null;
  correctOptionId: string | null;
  correctIndex: number;
}

export function grade(q: LoadedQuestion, a: AnswerInput, order?: readonly string[] | null): Graded {
  const served = orderedOptions(q, order);
  const correctOpt = served.find((x) => x.is_correct) ?? null;
  const correctIndex = correctOpt ? served.indexOf(correctOpt) : -1;
  if (q.row.type === 'fill_blank') {
    const text = (a.textAnswer ?? '').trim();
    const ok = !!text && q.options.some((x) => answersMatch(text, x.text_en) || answersMatch(text, x.text_ar));
    return { correct: ok, answered: !!text, chosenOptionId: null, chosenIndex: -1, textAnswer: text || null, correctOptionId: null, correctIndex: -1 };
  }
  let chosen: OptionRow | null = null;
  if (a.optionId) chosen = served.find((x) => x.id === a.optionId) ?? null;
  else if (a.chosenIndex !== undefined && a.chosenIndex !== null && a.chosenIndex >= 0) chosen = served[a.chosenIndex] ?? null;
  return {
    correct: !!chosen?.is_correct,
    answered: !!chosen,
    chosenOptionId: chosen?.id ?? null,
    chosenIndex: chosen ? served.indexOf(chosen) : -1,
    textAnswer: null,
    correctOptionId: correctOpt?.id ?? null,
    correctIndex,
  };
}

/** Index of an option id in the served order (−1 when null/unknown). */
export const indexIn = (q: LoadedQuestion, optionId: string | null, order?: readonly string[] | null) => (optionId ? orderedOptions(q, order).findIndex((x) => x.id === optionId) : -1);

/** Published question ids for a pool query (status filter applied by caller via `statuses`). */
export async function questionPool(
  where: { subjectIds?: string[]; topicIds?: string[]; unitIds?: string[]; types?: QuestionType[]; statuses?: string[] },
  limit = 5000,
  ex?: Executor,
): Promise<{ id: string; subject_id: string; unit_id: string | null; topic_id: string | null; difficulty: Difficulty; lesson_id: string | null; code: string }[]> {
  const conds = ['q.deleted_at IS NULL'];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => {
    params.push(v);
    conds.push(sql.replace('$?', `$${params.length}`));
  };
  add('q.status = ANY($?::text[])', where.statuses ?? ['published']);
  if (where.subjectIds) add('q.subject_id = ANY($?::uuid[])', where.subjectIds);
  if (where.unitIds) add('q.unit_id = ANY($?::uuid[])', where.unitIds);
  if (where.topicIds) add('q.topic_id = ANY($?::uuid[])', where.topicIds);
  if (where.types) add('q.type = ANY($?::text[])', where.types);
  params.push(limit);
  return db.many(`SELECT q.id, q.subject_id, q.unit_id, q.topic_id, q.difficulty, q.lesson_id, q.code FROM ${T.questions} q WHERE ${conds.join(' AND ')} ORDER BY q.code LIMIT $${params.length}`, params, ex);
}

/** Usage counters (bank analytics / admin accuracy). Best effort. */
export async function bumpQuestionStats(questionId: string, correct: boolean, ex?: Executor): Promise<void> {
  await db.query(
    `UPDATE ${T.questions} SET attempts_count = attempts_count + 1, correct_count = correct_count + $2, usage_count = usage_count + 1 WHERE id = $1`,
    [questionId, correct ? 1 : 0],
    ex,
  );
}
