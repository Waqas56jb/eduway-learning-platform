/**
 * Admin question bank (ADM-QST-*): CRUD with validation (LaTeX/markdown bodies kept verbatim), tags, images,
 * duplicate/similarity detection, review workflow (draft → in_review → approved → published → archived),
 * bulk ops, student preview, tags autocomplete, export rows.
 */
import { createHash, randomUUID } from 'node:crypto';
import { T } from '../../config/constants.js';
import { db, tx, type Executor } from '../../config/db.js';
import { adminRef, type AdminRef } from '../../common/dto/refs.js';
import { BusinessRuleError, ForbiddenError, NotFoundError, bulkItemError } from '../../common/errors/index.js';
import type { Localized } from '../../common/i18n/index.js';
import { hasPermission } from '../../common/middleware/rbac.js';
import { storage } from '../../common/services/storage.js';
import type { AdminPrincipal } from '../../common/types/index.js';
import { orderBy } from '../../common/utils/pagination.js';
import { loadQuestions, normalizeText, ruleError, similarity, sqlSearch, toReview, type QuestionReview } from '../learning-core/index.js';
import type { QuestionListQuery, QuestionStatus, QuestionWrite } from './schemas.js';
import { likePrefix } from '../../common/utils/like.js';

export interface AdminQuestion {
  id: string;
  code: string;
  subjectId: string;
  unitId: string;
  topicId: string;
  subject: { id: string; slug: string; name: Localized; color: string };
  unit: { id: string; name: Localized; order: number };
  topic: { id: string; name: Localized; order: number; unitId: string };
  type: 'mcq' | 'true_false' | 'fill_blank';
  difficulty: 'easy' | 'medium' | 'hard';
  body: Localized;
  formula: string | null;
  imageUrl: string | null;
  options: { id: string; text: Localized; correct: boolean }[];
  explanation: Localized;
  tags: string[];
  source: string;
  year: number | null;
  status: QuestionStatus;
  author: AdminRef;
  reviewer: AdminRef | null;
  usageCount: number;
  accuracy: number | null;
  duplicateOf: { id: string; code: string; text: Localized } | null;
  reviewComment: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── repository ──────────────────────────────────────────────────────────────────────────────────────

interface Row {
  id: string;
  code: string;
  subject_id: string;
  unit_id: string | null;
  topic_id: string | null;
  type: AdminQuestion['type'];
  difficulty: AdminQuestion['difficulty'];
  body_en: string;
  body_ar: string;
  formula: string | null;
  image_url: string | null;
  explanation_en: string;
  explanation_ar: string;
  source: string;
  year: number | null;
  status: QuestionStatus;
  duplicate_of: string | null;
  review_comment: string | null;
  usage_count: number;
  attempts_count: number;
  correct_count: number;
  created_at: Date;
  updated_at: Date;
  s_slug: string;
  s_name_en: string;
  s_name_ar: string;
  s_color: string;
  u_title_en: string | null;
  u_title_ar: string | null;
  u_sort: number | null;
  tp_title_en: string | null;
  tp_title_ar: string | null;
  tp_sort: number | null;
  a_id: string | null;
  a_name_en: string | null;
  a_name_ar: string | null;
  a_avatar_url: string | null;
  r_id: string | null;
  r_name_en: string | null;
  r_name_ar: string | null;
  r_avatar_url: string | null;
  d_code: string | null;
  d_body_en: string | null;
  d_body_ar: string | null;
}

const SELECT = `q.id, q.code, q.subject_id, q.unit_id, q.topic_id, q.type, q.difficulty, q.body_en, q.body_ar, q.formula, q.image_url,
  q.explanation_en, q.explanation_ar, q.source, q.year, q.status, q.duplicate_of, q.review_comment, q.usage_count, q.attempts_count, q.correct_count,
  q.created_at, q.updated_at, s.slug AS s_slug, s.name_en AS s_name_en, s.name_ar AS s_name_ar, s.color AS s_color,
  u.title_en AS u_title_en, u.title_ar AS u_title_ar, u.sort_order AS u_sort, tp.title_en AS tp_title_en, tp.title_ar AS tp_title_ar, tp.sort_order AS tp_sort,
  a.id AS a_id, a.name_en AS a_name_en, a.name_ar AS a_name_ar, a.avatar_url AS a_avatar_url,
  r.id AS r_id, r.name_en AS r_name_en, r.name_ar AS r_name_ar, r.avatar_url AS r_avatar_url,
  d.code AS d_code, d.body_en AS d_body_en, d.body_ar AS d_body_ar`;
const FROM = `${T.questions} q
  JOIN ${T.subjects} s ON s.id = q.subject_id
  LEFT JOIN ${T.units} u ON u.id = q.unit_id
  LEFT JOIN ${T.topics} tp ON tp.id = q.topic_id
  LEFT JOIN ${T.users} a ON a.id = q.author_id
  LEFT JOIN ${T.users} r ON r.id = q.reviewer_id
  LEFT JOIN ${T.questions} d ON d.id = q.duplicate_of`;

const SORT: Record<string, string> = {
  code: 'q.code',
  difficulty: 'q.difficulty',
  type: 'q.type',
  status: 'q.status',
  usageCount: 'q.usage_count',
  accuracy: '(CASE WHEN q.attempts_count > 0 THEN q.correct_count::numeric / q.attempts_count END)',
  updatedAt: 'q.updated_at',
  createdAt: 'q.created_at',
};

export interface QuestionFilter {
  q?: string;
  subjectId?: string;
  unitId?: string;
  topicId?: string;
  difficulty?: string[];
  type?: string[];
  status?: string[];
  duplicatesOnly?: boolean;
  authorId?: string;
  tags?: string[];
  ids?: string[];
}

function whereOf(f: QuestionFilter, params: unknown[]) {
  const conds = ['q.deleted_at IS NULL'];
  const add = (sql: string, v: unknown) => {
    params.push(v);
    conds.push(sql.replaceAll('$?', `$${params.length}`));
  };
  if (f.subjectId) add('q.subject_id = $?', f.subjectId);
  if (f.unitId) add('q.unit_id = $?', f.unitId);
  if (f.topicId) add('q.topic_id = $?', f.topicId);
  if (f.difficulty?.length) add('q.difficulty::text = ANY($?::text[])', f.difficulty);
  if (f.type?.length) add('q.type = ANY($?::text[])', f.type);
  if (f.status?.length) add('q.status = ANY($?::text[])', f.status);
  if (f.duplicatesOnly) conds.push('q.duplicate_of IS NOT NULL');
  if (f.authorId) add('q.author_id = $?', f.authorId);
  if (f.ids) add('q.id = ANY($?::uuid[])', f.ids);
  if (f.tags?.length) add(`EXISTS (SELECT 1 FROM ${T.question_tags} qt JOIN ${T.tags} tg ON tg.id = qt.tag_id WHERE qt.question_id = q.id AND tg.slug = ANY($?::text[]))`, f.tags);
  const s = sqlSearch(f.q, ['q.code', 'q.body_en', 'q.body_ar', 'q.source', 'q.year::text', `(SELECT string_agg(tg2.slug, ' ') FROM ${T.question_tags} qt2 JOIN ${T.tags} tg2 ON tg2.id = qt2.tag_id WHERE qt2.question_id = q.id)`], params);
  if (s) conds.push(s);
  return conds.join(' AND ');
}

export const questionsRepo = {
  async list(f: QuestionFilter, sort: string | undefined, limit: number, offset: number) {
    const params: unknown[] = [];
    const w = whereOf(f, params);
    const total = (await db.scalar<number>(`SELECT count(*)::int FROM ${FROM} WHERE ${w}`, params)) ?? 0;
    params.push(limit, offset);
    const rows = await db.many<Row>(`SELECT ${SELECT} FROM ${FROM} WHERE ${w} ORDER BY ${orderBy(sort, SORT, 'code')}, q.id LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
    return { rows, total };
  },
  get(id: string, ex?: Executor) {
    return db.maybeOne<Row>(`SELECT ${SELECT} FROM ${FROM} WHERE q.id = $1 AND q.deleted_at IS NULL`, [id], ex);
  },
  /** Candidates for similarity (same topic). */
  topicBodies(topicId: string, excludeId?: string, ex?: Executor) {
    return db.many<{ id: string; code: string; body_en: string; body_ar: string; status: QuestionStatus }>(
      `SELECT id, code, body_en, body_ar, status FROM ${T.questions} WHERE topic_id = $1 AND deleted_at IS NULL ${excludeId ? 'AND id <> $2' : ''}`,
      excludeId ? [topicId, excludeId] : [topicId],
      ex,
    );
  },
};

// ── mapping ─────────────────────────────────────────────────────────────────────────────────────────

export async function toAdminQuestions(rows: Row[], ex?: Executor): Promise<AdminQuestion[]> {
  const ids = rows.map((r) => r.id);
  const [opts, tags, images] = await Promise.all([
    ids.length ? db.many<{ id: string; question_id: string; text_en: string; text_ar: string; is_correct: boolean }>(`SELECT id, question_id, text_en, text_ar, is_correct FROM ${T.question_options} WHERE question_id = ANY($1::uuid[]) ORDER BY sort_order`, [ids], ex) : [],
    ids.length ? db.many<{ question_id: string; slug: string }>(`SELECT qt.question_id, t.slug FROM ${T.question_tags} qt JOIN ${T.tags} t ON t.id = qt.tag_id WHERE qt.question_id = ANY($1::uuid[]) ORDER BY t.slug`, [ids], ex) : [],
    storage.resolveMany(rows.map((r) => r.image_url)),
  ]);
  return rows.map((r, i) => ({
    id: r.id,
    code: r.code,
    subjectId: r.subject_id,
    unitId: r.unit_id ?? '',
    topicId: r.topic_id ?? '',
    subject: { id: r.subject_id, slug: r.s_slug, name: { en: r.s_name_en, ar: r.s_name_ar }, color: r.s_color },
    unit: { id: r.unit_id ?? '', name: { en: r.u_title_en ?? '', ar: r.u_title_ar ?? '' }, order: r.u_sort ?? 0 },
    topic: { id: r.topic_id ?? '', name: { en: r.tp_title_en ?? '', ar: r.tp_title_ar ?? '' }, order: r.tp_sort ?? 0, unitId: r.unit_id ?? '' },
    type: r.type,
    difficulty: r.difficulty,
    body: { en: r.body_en, ar: r.body_ar },
    formula: r.formula,
    imageUrl: images[i] ?? null,
    options: opts.filter((o) => o.question_id === r.id).map((o) => ({ id: o.id, text: { en: o.text_en, ar: o.text_ar }, correct: o.is_correct })),
    explanation: { en: r.explanation_en, ar: r.explanation_ar },
    tags: tags.filter((t) => t.question_id === r.id).map((t) => t.slug),
    source: r.source,
    year: r.year,
    status: r.status,
    author: adminRef(r as unknown as Record<string, unknown>, 'a_') ?? { id: '', name: { en: 'EDUWAY Content Team', ar: 'فريق محتوى إيدوواي' }, avatarUrl: null },
    reviewer: adminRef(r as unknown as Record<string, unknown>, 'r_'),
    usageCount: r.usage_count,
    accuracy: r.attempts_count > 0 ? Math.round((r.correct_count / r.attempts_count) * 1000) / 10 : null,
    duplicateOf: r.duplicate_of ? { id: r.duplicate_of, code: r.d_code ?? '', text: { en: r.d_body_en ?? '', ar: r.d_body_ar ?? '' } } : null,
    reviewComment: r.review_comment,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  }));
}

// ── validation & writes ─────────────────────────────────────────────────────────────────────────────

export const contentHash = (bodyEn: string) => createHash('sha256').update(normalizeText(bodyEn)).digest('hex');

/** Option rules: mcq 2..6 exactly one correct; true_false 2 exactly one correct; fill_blank 1..4 (all accepted). */
export function validateOptions(type: AdminQuestion['type'], options: { text: Localized; correct: boolean }[]): { text: Localized; correct: boolean }[] {
  const fail = (why: string) => {
    throw ruleError('QUESTION_INVALID', { why });
  };
  if (type === 'fill_blank') {
    if (options.length < 1 || options.length > 4) fail('fill_blank needs 1..4 accepted answers');
    return options.map((o) => ({ ...o, correct: true }));
  }
  if (type === 'true_false' && options.length !== 2) fail('true_false needs exactly 2 options');
  if (type === 'mcq' && (options.length < 2 || options.length > 6)) fail('mcq needs 2..6 options');
  if (options.filter((o) => o.correct).length !== 1) fail('exactly one option must be correct');
  const texts = new Set(options.map((o) => normalizeText(o.text.en)));
  if (texts.size !== options.length) fail('option texts must be unique');
  return options;
}

async function nextCode(subjectId: string, unitId: string, ex: Executor): Promise<string> {
  const s = await db.one<{ slug: string; title_en: string | null }>(`SELECT s.slug, u.title_en FROM ${T.subjects} s LEFT JOIN ${T.units} u ON u.id = $2 WHERE s.id = $1`, [subjectId, unitId], ex);
  const initials = (s.title_en ?? 'GEN').split(/\s+/).filter((w) => /^[A-Za-z]/.test(w)).map((w) => w[0]!.toUpperCase()).join('').slice(0, 3) || 'GEN';
  const prefix = `${s.slug.slice(0, 4).toUpperCase()}-${initials}-`;
  const n = (await db.scalar<number>(`SELECT count(*)::int FROM ${T.questions} WHERE code LIKE $1`, [likePrefix(prefix)], ex)) ?? 0;
  for (let k = n + 1; k < n + 1000; k++) {
    const code = `${prefix}${String(k).padStart(4, '0')}`;
    if (!(await db.scalar<number>(`SELECT count(*)::int FROM ${T.questions} WHERE code = $1`, [code], ex))) return code;
  }
  return `${prefix}${randomUUID().slice(0, 6).toUpperCase()}`;
}

async function setTags(questionId: string, tags: string[], ex: Executor) {
  await db.query(`DELETE FROM ${T.question_tags} WHERE question_id = $1`, [questionId], ex);
  for (const raw of tags) {
    const slug = raw.toLowerCase().trim().replace(/\s+/g, '-').slice(0, 40);
    if (!slug) continue;
    const label = slug.replace(/(^|-)(\w)/g, (_m, sep: string, ch: string) => `${sep ? ' ' : ''}${ch.toUpperCase()}`);
    const tag = await db.one<{ id: string }>(
      `INSERT INTO ${T.tags} (slug, name_en, name_ar) VALUES ($1,$2,$3) ON CONFLICT (slug) DO UPDATE SET slug = EXCLUDED.slug RETURNING id`,
      [slug, label, ''],
      ex,
    );
    await db.query(`INSERT INTO ${T.question_tags} (question_id, tag_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [questionId, tag.id], ex);
  }
}

async function setOptions(questionId: string, options: { id?: string; text: Localized; correct: boolean }[], ex: Executor) {
  const existing = await db.many<{ id: string }>(`SELECT id FROM ${T.question_options} WHERE question_id = $1`, [questionId], ex);
  const keep = new Set(options.map((o) => o.id).filter((x): x is string => !!x && existing.some((e) => e.id === x)));
  await db.query(`DELETE FROM ${T.question_options} WHERE question_id = $1 AND NOT (id = ANY($2::uuid[]))`, [questionId, [...keep]], ex);
  // Shift orders out of the way to keep (question_id, sort_order) unique while re-numbering.
  await db.query(`UPDATE ${T.question_options} SET sort_order = sort_order + 1000 WHERE question_id = $1`, [questionId], ex);
  for (const [i, o] of options.entries()) {
    if (o.id && keep.has(o.id)) await db.query(`UPDATE ${T.question_options} SET sort_order = $2, text_en = $3, text_ar = $4, is_correct = $5 WHERE id = $1`, [o.id, i + 1, o.text.en, o.text.ar, o.correct], ex);
    else await db.query(`INSERT INTO ${T.question_options} (question_id, sort_order, text_en, text_ar, is_correct) VALUES ($1,$2,$3,$4,$5)`, [questionId, i + 1, o.text.en, o.text.ar, o.correct], ex);
  }
}

async function validatePlacement(subjectId: string, unitId: string, topicId: string, ex?: Executor) {
  const ok = await db.maybeOne(
    `SELECT 1 AS ok FROM ${T.units} u JOIN ${T.topics} tp ON tp.unit_id = u.id WHERE u.id = $1 AND tp.id = $2 AND u.subject_id = $3 AND u.deleted_at IS NULL AND tp.deleted_at IS NULL`,
    [unitId, topicId, subjectId],
    ex,
  );
  if (!ok) throw ruleError('PLACEMENT_INVALID', { subjectId, unitId, topicId });
}

/** Best similar question in the topic (≥ threshold). */
export async function bestSimilar(topicId: string, body: { en: string; ar?: string }, excludeId?: string, threshold = 0.72, limit = 3, ex?: Executor) {
  const cands = await questionsRepo.topicBodies(topicId, excludeId, ex);
  return cands
    .map((c) => ({ c, score: Math.max(similarity(body.en, c.body_en), body.ar ? similarity(body.ar, c.body_ar) : 0) }))
    .filter((x) => x.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => ({ question: { id: x.c.id, code: x.c.code, body: { en: x.c.body_en, ar: x.c.body_ar }, status: x.c.status }, score: Math.round(x.score * 1000) / 1000 }));
}

export interface CreateQuestionInput extends Required<Pick<QuestionWrite, 'type' | 'difficulty' | 'subjectId' | 'unitId' | 'topicId' | 'body' | 'explanation' | 'options'>> {
  imageFileKey?: string | null;
  formula?: string | null;
  tags?: string[];
  source?: string;
  year?: number | null;
  status?: 'draft' | 'in_review';
}

/** Insert a question (used by ADM-QST-04 and import commit). */
export async function insertQuestion(b: CreateQuestionInput, authorId: string, ex: Executor, extra: { code?: string; duplicateOf?: string | null } = {}): Promise<string> {
  await validatePlacement(b.subjectId, b.unitId, b.topicId, ex);
  const options = validateOptions(b.type, b.options);
  const id = randomUUID();
  const code = extra.code ?? (await nextCode(b.subjectId, b.unitId, ex));
  const topic = await db.one<{ title_en: string; title_ar: string }>(`SELECT title_en, title_ar FROM ${T.topics} WHERE id = $1`, [b.topicId], ex);
  const dup = extra.duplicateOf !== undefined ? extra.duplicateOf : ((await bestSimilar(b.topicId, b.body, undefined, 0.8, 1, ex))[0]?.question.id ?? null);
  let image: string | null = null;
  if (b.imageFileKey) {
    const up = await storage.attachUpload(b.imageFileKey, { purpose: 'question_image', entityType: 'question', entityId: id }, ex);
    image = storage.ref(up.bucket, up.path);
  }
  await db.query(
    `INSERT INTO ${T.questions} (id, code, subject_id, unit_id, topic_id, type, difficulty, topic_label_en, topic_label_ar, body_en, body_ar, formula, image_url,
                                 explanation_en, explanation_ar, source, year, status, content_hash, duplicate_of, author_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
    [id, code, b.subjectId, b.unitId, b.topicId, b.type, b.difficulty, topic.title_en, topic.title_ar, b.body.en, b.body.ar, b.formula ?? null, image, b.explanation.en, b.explanation.ar, b.source || 'EDUWAY Original', b.year ?? null, b.status ?? 'draft', contentHash(b.body.en), dup, authorId],
    ex,
  );
  await setOptions(id, options, ex);
  if (b.tags?.length) await setTags(id, b.tags, ex);
  return id;
}

async function logWorkflow(id: string, from: string | null, to: string, admin: AdminPrincipal, note: string, ex: Executor) {
  await db.query(`INSERT INTO ${T.content_workflow_log} (entity_type, entity_id, from_status, to_status, actor_id, actor_name, note) VALUES ('question',$1,$2,$3,$4,$5,$6)`, [id, from, to, admin.userId, admin.name, note], ex);
}

type QAction = 'submit' | 'approve' | 'reject' | 'publish' | 'archive' | 'restore';
const ACTIONS: Record<QAction, { from: QuestionStatus[]; to: QuestionStatus; perm: 'questions.edit' | 'questions.approve' }> = {
  submit: { from: ['draft'], to: 'in_review', perm: 'questions.edit' },
  approve: { from: ['in_review'], to: 'approved', perm: 'questions.approve' },
  reject: { from: ['in_review'], to: 'draft', perm: 'questions.approve' },
  publish: { from: ['approved'], to: 'published', perm: 'questions.approve' },
  archive: { from: ['approved', 'published'], to: 'archived', perm: 'questions.approve' },
  restore: { from: ['archived'], to: 'draft', perm: 'questions.edit' },
};
export const questionTransitionTarget = (a: QAction) => ACTIONS[a].to;

// ── service ─────────────────────────────────────────────────────────────────────────────────────────

export const questionsAdminService = {
  async list(q: QuestionListQuery) {
    const { rows, total } = await questionsRepo.list(filterOf(q), q.sort, q.pageSize, (q.page - 1) * q.pageSize);
    return { items: await toAdminQuestions(rows), total };
  },
  async exportRows(f: QuestionFilter, sort?: string) {
    const { rows } = await questionsRepo.list(f, sort, 50_000, 0);
    return toAdminQuestions(rows);
  },
  async get(id: string, ex?: Executor): Promise<AdminQuestion> {
    const r = await questionsRepo.get(id, ex);
    if (!r) throw new NotFoundError('question');
    return (await toAdminQuestions([r], ex))[0] as AdminQuestion;
  },
  async stats() {
    const rows = await db.many<{ status: QuestionStatus; n: number }>(`SELECT status, count(*)::int AS n FROM ${T.questions} WHERE deleted_at IS NULL GROUP BY status`);
    const extra = await db.one<{ duplicates: number; subjects: number }>(`SELECT count(*) FILTER (WHERE duplicate_of IS NOT NULL)::int AS duplicates, count(DISTINCT subject_id)::int AS subjects FROM ${T.questions} WHERE deleted_at IS NULL`);
    const byStatus: Record<QuestionStatus, number> = { draft: 0, in_review: 0, approved: 0, published: 0, archived: 0 };
    for (const r of rows) byStatus[r.status] = r.n;
    const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
    return { total, published: byStatus.published, publishedPct: total ? Math.round((byStatus.published / total) * 1000) / 10 : 0, inReview: byStatus.in_review, duplicates: extra.duplicates, subjectCount: extra.subjects, byStatus };
  },
  async create(b: CreateQuestionInput, admin: AdminPrincipal) {
    const id = await tx(async (c) => {
      const qid = await insertQuestion(b, admin.userId, c);
      await logWorkflow(qid, null, b.status ?? 'draft', admin, 'created', c);
      return qid;
    });
    return this.get(id);
  },
  async update(id: string, b: QuestionWrite, admin: AdminPrincipal, ex?: Executor) {
    const run = async (c: Executor) => {
      const cur = await questionsRepo.get(id, c);
      if (!cur) throw new NotFoundError('question');
      if ((cur.status === 'published' || cur.status === 'archived') && !hasPermission(admin, 'questions.approve')) throw new ForbiddenError(undefined, { permission: 'questions.approve' });
      const subjectId = b.subjectId ?? cur.subject_id;
      const unitId = b.unitId ?? cur.unit_id ?? '';
      const topicId = b.topicId ?? cur.topic_id ?? '';
      if (b.subjectId || b.unitId || b.topicId) await validatePlacement(subjectId, unitId, topicId, c);
      const type = b.type ?? cur.type;
      if (b.options || b.type) {
        const opts = b.options ?? (await db.many<{ id: string; text_en: string; text_ar: string; is_correct: boolean }>(`SELECT id, text_en, text_ar, is_correct FROM ${T.question_options} WHERE question_id = $1 ORDER BY sort_order`, [id], c)).map((o) => ({ id: o.id, text: { en: o.text_en, ar: o.text_ar }, correct: o.is_correct }));
        await setOptions(id, validateOptions(type, opts).map((o, i) => ({ ...o, id: opts[i]?.id })), c);
      }
      const sets: string[] = [];
      const params: unknown[] = [id];
      const set = (col: string, v: unknown) => {
        if (v === undefined) return;
        params.push(v);
        sets.push(`${col} = $${params.length}`);
      };
      set('type', b.type);
      set('difficulty', b.difficulty);
      set('subject_id', b.subjectId);
      set('unit_id', b.unitId);
      set('topic_id', b.topicId);
      set('body_en', b.body?.en);
      set('body_ar', b.body?.ar);
      if (b.body) set('content_hash', contentHash(b.body.en));
      set('explanation_en', b.explanation?.en);
      set('explanation_ar', b.explanation?.ar);
      set('formula', b.formula);
      set('source', b.source);
      set('year', b.year);
      if (b.topicId) {
        const t = await db.one<{ title_en: string; title_ar: string }>(`SELECT title_en, title_ar FROM ${T.topics} WHERE id = $1`, [b.topicId], c);
        set('topic_label_en', t.title_en);
        set('topic_label_ar', t.title_ar);
      }
      if (b.imageFileKey !== undefined) {
        if (b.imageFileKey === null) set('image_url', null);
        else {
          const up = await storage.attachUpload(b.imageFileKey, { purpose: 'question_image', entityType: 'question', entityId: id }, c);
          set('image_url', storage.ref(up.bucket, up.path));
        }
      }
      if (sets.length) await db.query(`UPDATE ${T.questions} SET ${sets.join(', ')} WHERE id = $1`, params, c);
      if (b.tags) await setTags(id, b.tags, c);
    };
    if (ex) await run(ex);
    else await tx(run);
    return this.get(id, ex);
  },
  async remove(id: string) {
    const q = await this.get(id);
    await db.query(`UPDATE ${T.questions} SET deleted_at = now() WHERE id = $1`, [id]);
    return q;
  },
  async transition(id: string, b: { action: QAction; comment?: string; patch?: QuestionWrite }, admin: AdminPrincipal) {
    const rule = ACTIONS[b.action];
    if (!hasPermission(admin, rule.perm)) throw new ForbiddenError(undefined, { permission: rule.perm });
    const result = await tx(async (c) => {
      const cur = await questionsRepo.get(id, c);
      if (!cur) throw new NotFoundError('question');
      if (!rule.from.includes(cur.status)) throw new BusinessRuleError('INVALID_TRANSITION', { from: cur.status, to: rule.to });
      if (b.action === 'reject' && (!b.comment || b.comment.trim().length < 5)) throw new BusinessRuleError('INVALID_TRANSITION', { from: cur.status, to: rule.to, field: 'comment' });
      if (b.patch) await this.update(id, b.patch, admin, c);
      const comment = b.action === 'reject' ? b.comment!.trim() : b.action === 'submit' ? null : cur.review_comment;
      await db.query(
        `UPDATE ${T.questions} SET status = $2, review_comment = $3,
                reviewer_id = CASE WHEN $4 THEN $5::uuid ELSE reviewer_id END,
                published_at = CASE WHEN $2 = 'published' THEN now() ELSE published_at END WHERE id = $1`,
        [id, rule.to, comment, b.action === 'approve' || b.action === 'reject', admin.userId],
        c,
      );
      if (b.action === 'approve' || b.action === 'reject') {
        await db.query(`INSERT INTO ${T.question_reviews} (question_id, reviewer_id, decision, comment) VALUES ($1,$2,$3,$4)`, [id, admin.userId, b.action === 'approve' ? 'approved' : 'rejected', b.comment ?? ''], c);
      }
      await logWorkflow(id, cur.status, rule.to, admin, b.comment ?? b.action, c);
      return cur.status;
    });
    return { before: result, question: await this.get(id) };
  },
  async bulkTransition(ids: string[], action: 'submit' | 'approve' | 'publish' | 'archive', admin: AdminPrincipal) {
    const succeeded: string[] = [];
    const failed: { id: string; code: string; reason?: string; message: string }[] = [];
    for (const id of ids) {
      try {
        await this.transition(id, { action }, admin);
        succeeded.push(id);
      } catch (err) {
        const e = err as { code?: string; reason?: string; message: string };
        failed.push({ id, ...bulkItemError(e) });
      }
    }
    return { succeeded, failed };
  },
  async bulkDelete(ids: string[]) {
    const rows = await db.many<{ id: string }>(`UPDATE ${T.questions} SET deleted_at = now() WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL RETURNING id`, [ids]);
    const ok = new Set(rows.map((r) => r.id));
    return { succeeded: [...ok], failed: ids.filter((i) => !ok.has(i)).map((id) => ({ id, code: 'NOT_FOUND', message: 'question not found' })) };
  },
  async duplicate(id: string, admin: AdminPrincipal) {
    const src = await this.get(id);
    const newId = await tx(async (c) => {
      const n = (await db.scalar<number>(`SELECT count(*)::int FROM ${T.questions} WHERE code LIKE $1`, [likePrefix(`${src.code}-C`)], c)) ?? 0;
      let k = n + 1;
      while (await db.scalar<number>(`SELECT count(*)::int FROM ${T.questions} WHERE code = $1`, [`${src.code}-C${k}`], c)) k++;
      const qid = await insertQuestion(
        { type: src.type, difficulty: src.difficulty, subjectId: src.subjectId, unitId: src.unitId, topicId: src.topicId, body: src.body, explanation: src.explanation, options: src.options.map((o) => ({ text: o.text, correct: o.correct })), formula: src.formula, tags: src.tags, source: src.source, year: src.year },
        admin.userId,
        c,
        { code: `${src.code}-C${k}`, duplicateOf: src.id },
      );
      await db.query(`UPDATE ${T.questions} SET image_url = (SELECT image_url FROM ${T.questions} WHERE id = $2) WHERE id = $1`, [qid, src.id], c);
      return qid;
    });
    return this.get(newId);
  },
  similar: (b: { topicId: string; body: { en: string; ar?: string }; excludeId?: string; threshold?: number; limit?: number }) => bestSimilar(b.topicId, b.body, b.excludeId, b.threshold ?? 0.72, b.limit ?? 3),
  async reviewQueue(f: { subjectId?: string; q?: string }) {
    const { rows, total } = await questionsRepo.list({ status: ['in_review'], subjectId: f.subjectId, q: f.q }, 'updatedAt', 500, 0);
    const items = await toAdminQuestions(rows);
    const out = [];
    for (const q of items) {
      const best = q.topicId ? (await bestSimilar(q.topicId, q.body, q.id, 0.72, 1))[0] : undefined;
      out.push({ ...q, similar: best ? { id: best.question.id, code: best.question.code, body: best.question.body, score: best.score } : null });
    }
    return { items: out, total };
  },
  async preview(id: string): Promise<QuestionReview> {
    const loaded = await loadQuestions([id]);
    const q = loaded.get(id);
    if (!q) throw new NotFoundError('question');
    return toReview(q);
  },
  async tags(q: string | undefined, limit: number) {
    const params: unknown[] = [];
    const s = sqlSearch(q, ['t.slug', 't.name_en', 't.name_ar'], params);
    params.push(limit);
    const rows = await db.many<{ slug: string; name_en: string; name_ar: string; n: number }>(
      `SELECT t.slug, t.name_en, t.name_ar, count(qt.question_id)::int AS n FROM ${T.tags} t LEFT JOIN ${T.question_tags} qt ON qt.tag_id = t.id
        ${s ? `WHERE ${s}` : ''} GROUP BY t.id ORDER BY n DESC, t.slug LIMIT $${params.length}`,
      params,
    );
    return rows.map((r) => ({ slug: r.slug, label: r.name_en ? { en: r.name_en, ar: r.name_ar || r.name_en } : null, count: r.n }));
  },
};

export function filterOf(q: Partial<QuestionListQuery> & Record<string, unknown>): QuestionFilter {
  const arr = (v: unknown) => (Array.isArray(v) ? (v as string[]) : typeof v === 'string' && v ? v.split(',') : undefined);
  return {
    q: q.q,
    subjectId: q.subjectId,
    unitId: q.unitId,
    topicId: q.topicId,
    difficulty: arr(q.difficulty),
    type: arr(q.type),
    status: arr(q.status),
    duplicatesOnly: q.duplicatesOnly === true || (q.duplicatesOnly as unknown) === 'true',
    authorId: q.authorId,
    tags: arr(q.tags),
  };
}
