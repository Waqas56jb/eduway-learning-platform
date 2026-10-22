/**
 * Admin exam blueprints (ADM-EBP-*): rows = sections (subject [+ topic], count, difficulty mix in %), availability
 * window, scoring, attempt limit, pass mark (default settings.learning.examDefaultPassMark), publish/archive/duplicate,
 * pool availability (approved + published questions).
 */
import { randomUUID } from 'node:crypto';
import { T } from '../../config/constants.js';
import { db, tx, type Executor } from '../../config/db.js';
import { BusinessRuleError, ConflictError, ForbiddenError, NotFoundError } from '../../common/errors/index.js';
import type { Localized } from '../../common/i18n/index.js';
import { hasPermission } from '../../common/middleware/rbac.js';
import type { AdminPrincipal } from '../../common/types/index.js';
import { orderBy } from '../../common/utils/pagination.js';
import { countsToMix, mixToCounts, ruleError, sqlSearch } from '../learning-core/index.js';

export type BlueprintStatus = 'draft' | 'published' | 'archived';
export type Scoring = 'standard' | 'negative' | 'weighted';

export interface BlueprintRow {
  id: string;
  subjectId: string;
  topicId: string | null;
  count: number;
  easy: number;
  medium: number;
  hard: number;
}

export interface ExamBlueprintDto {
  id: string;
  name: Localized;
  description: Localized;
  rows: BlueprintRow[];
  subjects: { id: string; slug: string; name: Localized; color: string }[];
  questionCount: number;
  durationMin: number;
  randomize: boolean;
  scoring: Scoring;
  attemptLimit: number;
  reviewBeforeSubmit: boolean;
  passMark: number;
  availableFrom: string;
  availableTo: string;
  status: BlueprintStatus;
  attempts: number;
  updatedAt: string;
  createdAt: string;
}

export interface BlueprintWrite {
  name: Localized;
  description?: Localized;
  rows: Omit<BlueprintRow, 'id'>[];
  durationMin: number;
  randomize: boolean;
  scoring: Scoring;
  attemptLimit: number;
  reviewBeforeSubmit: boolean;
  passMark?: number;
  availableFrom: string;
  availableTo: string;
  status: BlueprintStatus;
}

// ── repository ──────────────────────────────────────────────────────────────────────────────────────

export interface BpRow {
  id: string;
  slug: string;
  subject_id: string | null;
  title_en: string;
  title_ar: string;
  description_en: string;
  description_ar: string;
  duration_min: number;
  question_count: number;
  pass_mark: number;
  randomize: boolean;
  scoring: Scoring;
  attempt_limit: number;
  review_before_submit: boolean;
  fixed_question_ids: string[];
  available_from: Date | null;
  available_to: Date | null;
  status: BlueprintStatus;
  created_at: Date;
  updated_at: Date;
  attempts: number;
}

export interface SectionRow {
  id: string;
  blueprint_id: string;
  subject_id: string;
  topic_id: string | null;
  question_count: number;
  easy_count: number;
  medium_count: number;
  hard_count: number;
  sort_order: number;
}

const BP_SELECT = `b.*, (SELECT count(*) FROM ${T.exam_attempts} ea WHERE ea.blueprint_id = b.id)::int AS attempts`;

export const blueprintsRepo = {
  async list(f: { status?: string; q?: string; subjectId?: string; ids?: string[]; publishedOnly?: boolean }, sort: string | undefined, limit: number, offset: number, ex?: Executor) {
    const params: unknown[] = [];
    const conds = ['b.deleted_at IS NULL'];
    const add = (sql: string, v: unknown) => {
      params.push(v);
      conds.push(sql.replaceAll('$?', `$${params.length}`));
    };
    if (f.status) add('b.status = $?', f.status);
    if (f.publishedOnly) conds.push(`b.status = 'published'`);
    if (f.subjectId) add(`(b.subject_id = $? OR EXISTS (SELECT 1 FROM ${T.exam_blueprint_sections} bs WHERE bs.blueprint_id = b.id AND bs.subject_id = $?))`, f.subjectId);
    if (f.ids) add('b.id = ANY($?::uuid[])', f.ids);
    const s = sqlSearch(f.q, ['b.title_en', 'b.title_ar', 'b.slug'], params);
    if (s) conds.push(s);
    const w = conds.join(' AND ');
    const total = (await db.scalar<number>(`SELECT count(*)::int FROM ${T.exam_blueprints} b WHERE ${w}`, params, ex)) ?? 0;
    const SORT = { name: 'b.title_en', questionCount: 'b.question_count', durationMin: 'b.duration_min', attemptLimit: 'b.attempt_limit', availableFrom: 'b.available_from', status: 'b.status', attempts: 'attempts', updatedAt: 'b.updated_at' };
    params.push(limit, offset);
    const rows = await db.many<BpRow>(`SELECT ${BP_SELECT} FROM ${T.exam_blueprints} b WHERE ${w} ORDER BY ${orderBy(sort, SORT, '-updatedAt')}, b.id LIMIT $${params.length - 1} OFFSET $${params.length}`, params, ex);
    return { rows, total };
  },
  get(id: string, ex?: Executor) {
    return db.maybeOne<BpRow>(`SELECT ${BP_SELECT} FROM ${T.exam_blueprints} b WHERE b.id = $1 AND b.deleted_at IS NULL`, [id], ex);
  },
  sections(ids: string[], ex?: Executor) {
    return ids.length ? db.many<SectionRow>(`SELECT * FROM ${T.exam_blueprint_sections} WHERE blueprint_id = ANY($1::uuid[]) ORDER BY blueprint_id, sort_order`, [ids], ex) : Promise.resolve([] as SectionRow[]);
  },
};

// ── mapping ─────────────────────────────────────────────────────────────────────────────────────────

export async function toBlueprintDtos(rows: BpRow[], ex?: Executor): Promise<ExamBlueprintDto[]> {
  const sections = await blueprintsRepo.sections(rows.map((r) => r.id), ex);
  const subjIds = [...new Set([...sections.map((s) => s.subject_id), ...rows.map((r) => r.subject_id).filter((x): x is string => !!x)])];
  const subjects = subjIds.length ? await db.many<{ id: string; slug: string; name_en: string; name_ar: string; color: string; sort_order: number }>(`SELECT id, slug, name_en, name_ar, color, sort_order FROM ${T.subjects} WHERE id = ANY($1::uuid[])`, [subjIds], ex) : [];
  const subjBy = new Map(subjects.map((s) => [s.id, s]));
  return rows.map((r) => {
    const secs = sections.filter((s) => s.blueprint_id === r.id);
    const totals = new Map<string, number>();
    for (const s of secs) totals.set(s.subject_id, (totals.get(s.subject_id) ?? 0) + s.question_count);
    const subjectOrder = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
    if (!subjectOrder.length && r.subject_id) subjectOrder.push(r.subject_id);
    return {
      id: r.id,
      name: { en: r.title_en, ar: r.title_ar },
      description: { en: r.description_en, ar: r.description_ar },
      rows: secs.map((s) => ({ id: s.id, subjectId: s.subject_id, topicId: s.topic_id, count: s.question_count, ...countsToMix(s.easy_count, s.medium_count, s.hard_count) })),
      subjects: subjectOrder.map((id) => subjBy.get(id)).filter((s) => !!s).map((s) => ({ id: s!.id, slug: s!.slug, name: { en: s!.name_en, ar: s!.name_ar }, color: s!.color })),
      questionCount: secs.length ? secs.reduce((a, s) => a + s.question_count, 0) : r.question_count,
      durationMin: r.duration_min,
      randomize: r.randomize,
      scoring: r.scoring,
      attemptLimit: r.attempt_limit,
      reviewBeforeSubmit: r.review_before_submit,
      passMark: r.pass_mark,
      availableFrom: (r.available_from ?? r.created_at).toISOString(),
      availableTo: (r.available_to ?? new Date(r.created_at.getTime() + 365 * 86_400_000)).toISOString(),
      status: r.status,
      attempts: r.attempts,
      updatedAt: r.updated_at.toISOString(),
      createdAt: r.created_at.toISOString(),
    };
  });
}

// ── availability ────────────────────────────────────────────────────────────────────────────────────

export async function availability(rows: Omit<BlueprintRow, 'id'>[]) {
  const out = [];
  let shortRows = 0;
  for (const [index, r] of rows.entries()) {
    const counts = await db.many<{ difficulty: 'easy' | 'medium' | 'hard'; n: number }>(
      `SELECT difficulty, count(*)::int AS n FROM ${T.questions}
        WHERE subject_id = $1 AND ($2::uuid IS NULL OR topic_id = $2) AND status IN ('approved','published') AND deleted_at IS NULL AND type IN ('mcq','true_false')
        GROUP BY difficulty`,
      [r.subjectId, r.topicId ?? null],
    );
    const avail = { easy: 0, medium: 0, hard: 0 };
    for (const c of counts) avail[c.difficulty] = c.n;
    const req = mixToCounts(r.count, r.easy, r.hard);
    const ok = avail.easy >= req.easy && avail.medium >= req.medium && avail.hard >= req.hard;
    if (!ok) shortRows++;
    out.push({ index, pool: avail.easy + avail.medium + avail.hard, ok, easy: { required: req.easy, available: avail.easy }, medium: { required: req.medium, available: avail.medium }, hard: { required: req.hard, available: avail.hard } });
  }
  return { rows: out, shortRows };
}

// ── writes ──────────────────────────────────────────────────────────────────────────────────────────

function validate(b: BlueprintWrite) {
  if (!b.rows.length) throw ruleError('ROWS_INVALID', { why: 'at least one row' });
  b.rows.forEach((r, i) => {
    if (r.easy + r.medium + r.hard !== 100) throw ruleError('ROWS_INVALID', { index: i });
  });
  if (new Date(b.availableTo).getTime() <= new Date(b.availableFrom).getTime()) throw ruleError('WINDOW_INVALID');
}

async function writeSections(id: string, rows: Omit<BlueprintRow, 'id'>[], ex: Executor) {
  await db.query(`DELETE FROM ${T.exam_blueprint_sections} WHERE blueprint_id = $1`, [id], ex);
  for (const [i, r] of rows.entries()) {
    const c = mixToCounts(r.count, r.easy, r.hard);
    await db.query(
      `INSERT INTO ${T.exam_blueprint_sections} (blueprint_id, subject_id, topic_id, question_count, easy_count, medium_count, hard_count, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, r.subjectId, r.topicId ?? null, r.count, c.easy, c.medium, c.hard, i + 1],
      ex,
    );
  }
}

const primarySubject = (rows: Omit<BlueprintRow, 'id'>[]) => {
  const t = new Map<string, number>();
  for (const r of rows) t.set(r.subjectId, (t.get(r.subjectId) ?? 0) + r.count);
  return [...t.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
};

async function logWorkflow(id: string, from: string | null, to: string, admin: AdminPrincipal, ex?: Executor) {
  await db.query(`INSERT INTO ${T.content_workflow_log} (entity_type, entity_id, from_status, to_status, actor_id, actor_name, note) VALUES ('exam_blueprint',$1,$2,$3,$4,$5,'')`, [id, from, to, admin.userId, admin.name], ex);
}

export const blueprintsService = {
  async list(f: { status?: string; q?: string; subjectId?: string; ids?: string[] }, sort: string | undefined, limit: number, offset: number) {
    const { rows, total } = await blueprintsRepo.list(f, sort, limit, offset);
    return { items: await toBlueprintDtos(rows), total };
  },
  async get(id: string, ex?: Executor): Promise<ExamBlueprintDto> {
    const r = await blueprintsRepo.get(id, ex);
    if (!r) throw new NotFoundError('blueprint');
    return (await toBlueprintDtos([r], ex))[0] as ExamBlueprintDto;
  },
  async stats() {
    const r = await db.one<{ total: number; published: number; attempts: number; avg: number | null }>(
      `SELECT count(*)::int AS total, count(*) FILTER (WHERE status = 'published')::int AS published,
              (SELECT count(*) FROM ${T.exam_attempts})::int AS attempts, avg(duration_min) AS avg
         FROM ${T.exam_blueprints} WHERE deleted_at IS NULL`,
    );
    return { total: r.total, published: r.published, totalAttempts: r.attempts, avgDurationMin: r.avg ? Math.round(Number(r.avg)) : 0 };
  },
  async create(b: BlueprintWrite, admin: AdminPrincipal, defaultPassMark: number) {
    validate(b);
    if (b.status === 'published' && !hasPermission(admin, 'assessments.approve')) throw new ForbiddenError(undefined, { permission: 'assessments.approve' });
    const id = randomUUID();
    await tx(async (c) => {
      await db.query(
        `INSERT INTO ${T.exam_blueprints} (id, slug, subject_id, title_en, title_ar, description_en, description_ar, duration_min, question_count, pass_mark, randomize, scoring,
                                          attempt_limit, review_before_submit, available_from, available_to, status, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
        [id, `bp-${id.slice(0, 8)}`, primarySubject(b.rows), b.name.en, b.name.ar, b.description?.en ?? '', b.description?.ar ?? '', b.durationMin, b.rows.reduce((a, r) => a + r.count, 0), b.passMark ?? defaultPassMark, b.randomize, b.scoring, b.attemptLimit, b.reviewBeforeSubmit, b.availableFrom, b.availableTo, b.status, admin.userId],
        c,
      );
      await writeSections(id, b.rows, c);
      await logWorkflow(id, null, b.status, admin, c);
    });
    return this.get(id);
  },
  async update(id: string, b: BlueprintWrite, admin: AdminPrincipal, defaultPassMark: number) {
    validate(b);
    const cur = await blueprintsRepo.get(id);
    if (!cur) throw new NotFoundError('blueprint');
    if (b.status === 'published' && cur.status !== 'published' && !hasPermission(admin, 'assessments.approve')) throw new ForbiddenError(undefined, { permission: 'assessments.approve' });
    await tx(async (c) => {
      await db.query(
        `UPDATE ${T.exam_blueprints} SET subject_id = $2, title_en = $3, title_ar = $4, description_en = $5, description_ar = $6, duration_min = $7, question_count = $8,
                pass_mark = $9, randomize = $10, scoring = $11, attempt_limit = $12, review_before_submit = $13, available_from = $14, available_to = $15, status = $16,
                fixed_question_ids = '{}'
          WHERE id = $1`,
        [id, primarySubject(b.rows), b.name.en, b.name.ar, b.description?.en ?? cur.description_en, b.description?.ar ?? cur.description_ar, b.durationMin, b.rows.reduce((a, r) => a + r.count, 0), b.passMark ?? cur.pass_mark ?? defaultPassMark, b.randomize, b.scoring, b.attemptLimit, b.reviewBeforeSubmit, b.availableFrom, b.availableTo, b.status],
        c,
      );
      await writeSections(id, b.rows, c);
      if (b.status !== cur.status) await logWorkflow(id, cur.status, b.status, admin, c);
    });
    return { before: cur.status, blueprint: await this.get(id) };
  },
  async remove(id: string) {
    const cur = await this.get(id);
    if (cur.attempts > 0) throw new ConflictError('HAS_DEPENDENTS', { count: cur.attempts });
    await db.query(`UPDATE ${T.exam_blueprints} SET deleted_at = now(), slug = slug || '-deleted-' || substr(md5(random()::text), 1, 6) WHERE id = $1`, [id]);
    return cur;
  },
  async publish(id: string, admin: AdminPrincipal, force = false) {
    const cur = await this.get(id);
    if (cur.status === 'published') return cur;
    const fixed = (await blueprintsRepo.get(id))?.fixed_question_ids ?? [];
    if (!force && !fixed.length) {
      const av = await availability(cur.rows);
      if (av.shortRows > 0) throw ruleError('POOL_SHORT', { shortRows: av.rows.filter((r) => !r.ok).map((r) => r.index), availability: av.rows });
    }
    await db.query(`UPDATE ${T.exam_blueprints} SET status = 'published' WHERE id = $1`, [id]);
    await logWorkflow(id, cur.status, 'published', admin);
    return this.get(id);
  },
  async archive(id: string, admin: AdminPrincipal) {
    const cur = await this.get(id);
    if (cur.status === 'archived') return cur;
    await db.query(`UPDATE ${T.exam_blueprints} SET status = 'archived' WHERE id = $1`, [id]);
    await logWorkflow(id, cur.status, 'archived', admin);
    return this.get(id);
  },
  async duplicate(id: string, admin: AdminPrincipal) {
    const cur = await this.get(id);
    const created = await this.create(
      {
        name: { en: `${cur.name.en} (copy)`, ar: `${cur.name.ar} (نسخة)` },
        description: cur.description,
        rows: cur.rows.map(({ subjectId, topicId, count, easy, medium, hard }) => ({ subjectId, topicId, count, easy, medium, hard })),
        durationMin: cur.durationMin,
        randomize: cur.randomize,
        scoring: cur.scoring,
        attemptLimit: cur.attemptLimit,
        reviewBeforeSubmit: cur.reviewBeforeSubmit,
        passMark: cur.passMark,
        availableFrom: cur.availableFrom,
        availableTo: cur.availableTo,
        status: 'draft',
      },
      admin,
      cur.passMark,
    );
    return created;
  },
  assertTransition(from: BlueprintStatus, to: BlueprintStatus) {
    if (from === to) return;
    if (from === 'archived' && to === 'published') throw new BusinessRuleError('INVALID_TRANSITION', { from, to });
  },
};
