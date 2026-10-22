/**
 * Admin content structure: subjects (ADM-SUB-*), units (ADM-UNT-*), topics (ADM-TOP-*), teachers (ADM-TCH-*).
 */
import { randomUUID } from 'node:crypto';
import { T } from '../../config/constants.js';
import { db, tx, type Executor } from '../../config/db.js';
import { ConflictError, NotFoundError } from '../../common/errors/index.js';
import { storage } from '../../common/services/storage.js';
import type { z } from '../../common/validation/zod.js';
import { isUuid, ruleError, sqlSearch } from '../learning-core/index.js';
import { contentRepo, type TeacherRow } from './repository.js';
import type { subjectCreateBody, subjectPatchBody, teacherBody, teacherPatchBody } from './schemas.js';
import type { AdminSubject, AdminTeacherDto, AdminTopic, AdminUnit, TeacherDto } from './types.js';

type SubjectCreate = z.infer<typeof subjectCreateBody>;
type SubjectPatch = z.infer<typeof subjectPatchBody>;

// ── repository ──────────────────────────────────────────────────────────────────────────────────────

interface AdminSubjectRow {
  id: string;
  slug: string;
  name_en: string;
  name_ar: string;
  tagline_en: string;
  tagline_ar: string;
  description_en: string;
  description_ar: string;
  color: string;
  icon: string;
  image_url: string | null;
  sort_order: number;
  status: 'active' | 'hidden';
  sequential_unlock: boolean;
  created_at: Date;
  updated_at: Date;
  units: number;
  topics: number;
  lessons: number;
  published: number;
  questions: number;
}

const ADMIN_SUBJECT_SELECT = `s.id, s.slug, s.name_en, s.name_ar, s.tagline_en, s.tagline_ar, s.description_en, s.description_ar, s.color, s.icon, s.image_url,
  s.sort_order, s.status, s.sequential_unlock, s.created_at, s.updated_at,
  (SELECT count(*) FROM ${T.units} u WHERE u.subject_id = s.id AND u.deleted_at IS NULL)::int AS units,
  (SELECT count(*) FROM ${T.topics} tp JOIN ${T.units} u ON u.id = tp.unit_id WHERE u.subject_id = s.id AND tp.deleted_at IS NULL AND u.deleted_at IS NULL)::int AS topics,
  (SELECT count(*) FROM ${T.lessons} l WHERE l.subject_id = s.id AND l.deleted_at IS NULL)::int AS lessons,
  (SELECT count(*) FROM ${T.lessons} l WHERE l.subject_id = s.id AND l.deleted_at IS NULL AND l.status = 'published')::int AS published,
  (SELECT count(*) FROM ${T.questions} q WHERE q.subject_id = s.id AND q.deleted_at IS NULL)::int AS questions`;

const repo = {
  subjects(f: { status?: string; q?: string; ids?: string[] }, ex?: Executor) {
    const params: unknown[] = [];
    const conds = ['s.deleted_at IS NULL'];
    if (f.status) {
      params.push(f.status);
      conds.push(`s.status = $${params.length}`);
    }
    if (f.ids) {
      params.push(f.ids);
      conds.push(`s.id = ANY($${params.length}::uuid[])`);
    }
    const search = sqlSearch(f.q, ['s.name_en', 's.name_ar', 's.slug'], params);
    if (search) conds.push(search);
    return db.many<AdminSubjectRow>(`SELECT ${ADMIN_SUBJECT_SELECT} FROM ${T.subjects} s WHERE ${conds.join(' AND ')} ORDER BY s.sort_order, s.name_en`, params, ex);
  },
  unitsWithCounts(subjectId: string, ex?: Executor) {
    return db.many<{ id: string; subject_id: string; title_en: string; title_ar: string; sort_order: number; lessons: number }>(
      `SELECT u.id, u.subject_id, u.title_en, u.title_ar, u.sort_order,
              (SELECT count(*) FROM ${T.lessons} l WHERE l.unit_id = u.id AND l.deleted_at IS NULL)::int AS lessons
         FROM ${T.units} u WHERE u.subject_id = $1 AND u.deleted_at IS NULL ORDER BY u.sort_order, u.created_at`,
      [subjectId],
      ex,
    );
  },
  topicsWithCounts(unitIds: string[], ex?: Executor) {
    return db.many<{ id: string; unit_id: string; title_en: string; title_ar: string; sort_order: number; lessons: number }>(
      `SELECT tp.id, tp.unit_id, tp.title_en, tp.title_ar, tp.sort_order,
              (SELECT count(*) FROM ${T.lessons} l WHERE l.topic_id = tp.id AND l.deleted_at IS NULL)::int AS lessons
         FROM ${T.topics} tp WHERE tp.unit_id = ANY($1::uuid[]) AND tp.deleted_at IS NULL ORDER BY tp.sort_order, tp.created_at`,
      [unitIds],
      ex,
    );
  },
  unit(id: string, ex?: Executor) {
    return db.maybeOne<{ id: string; subject_id: string; slug: string }>(`SELECT id, subject_id, slug FROM ${T.units} WHERE id = $1 AND deleted_at IS NULL`, [id], ex);
  },
  topic(id: string, ex?: Executor) {
    return db.maybeOne<{ id: string; unit_id: string; slug: string }>(`SELECT id, unit_id, slug FROM ${T.topics} WHERE id = $1 AND deleted_at IS NULL`, [id], ex);
  },
};

// ── mappers ─────────────────────────────────────────────────────────────────────────────────────────

async function toAdminSubjects(rows: AdminSubjectRow[]): Promise<AdminSubject[]> {
  const images = await storage.resolveMany(rows.map((r) => r.image_url));
  return rows.map((r, i) => ({
    id: r.id,
    slug: r.slug,
    name: { en: r.name_en, ar: r.name_ar },
    tagline: { en: r.tagline_en, ar: r.tagline_ar },
    description: { en: r.description_en, ar: r.description_ar },
    color: r.color,
    icon: r.icon,
    imageUrl: images[i] ?? null,
    order: r.sort_order,
    status: r.status,
    sequentialUnlock: r.sequential_unlock,
    stats: { units: r.units, topics: r.topics, lessons: r.lessons, published: r.published, publishedPct: r.lessons ? Math.round((r.published / r.lessons) * 1000) / 10 : 0, questions: r.questions },
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  }));
}

export async function toTeacherDtos(rows: TeacherRow[]): Promise<TeacherDto[]> {
  const avatars = await storage.resolveMany(rows.map((r) => r.avatar_url));
  return rows.map((r, i) => ({
    id: r.id,
    name: { en: r.name_en, ar: r.name_ar },
    bio: { en: r.bio_en, ar: r.bio_ar },
    avatarUrl: avatars[i] ?? null,
    subjectId: r.subject_id ?? '',
    subjectSlug: r.subject_slug ?? '',
    yearsExperience: r.years_experience,
    studentsCount: r.students_count,
    rating: r.rating === null ? null : Number(r.rating),
    active: r.active,
  }));
}

/** Admin teacher rows also carry `lessonsCount` (non-deleted lessons referencing the teacher — delete is blocked while > 0). */
async function withLessonCounts(list: TeacherDto[]): Promise<AdminTeacherDto[]> {
  if (!list.length) return [];
  const rows = await db.many<{ teacher_id: string; n: number }>(
    `SELECT teacher_id, count(*)::int AS n FROM ${T.lessons} WHERE teacher_id = ANY($1::uuid[]) AND deleted_at IS NULL GROUP BY teacher_id`,
    [list.map((x) => x.id)],
  );
  const by = new Map(rows.map((r) => [r.teacher_id, r.n]));
  return list.map((x) => ({ ...x, lessonsCount: by.get(x.id) ?? 0 }));
}

const shortId = () => randomUUID().slice(0, 8);

async function attachImage(fileKey: string | null | undefined, purpose: 'subject_image' | 'teacher_avatar', entityType: string, entityId: string, ex?: Executor): Promise<string | null | undefined> {
  if (fileKey === undefined) return undefined;
  if (fileKey === null) return null;
  const up = await storage.attachUpload(fileKey, { purpose, entityType, entityId }, ex);
  return storage.ref(up.bucket, up.path);
}

/** Validates `ids` is exactly the current set and writes sort_order 1..n. */
async function applyOrder(table: string, scopeCol: string | null, scopeId: string | null, ids: string[], ex: Executor) {
  const params: unknown[] = [];
  let where = 'deleted_at IS NULL';
  if (scopeCol) {
    params.push(scopeId);
    where += ` AND ${scopeCol} = $1`;
  }
  const current = await db.many<{ id: string }>(`SELECT id FROM ${table} WHERE ${where}`, params, ex);
  const set = new Set(current.map((r) => r.id));
  const unique = new Set(ids);
  if (unique.size !== ids.length || ids.some((id) => !set.has(id)) || unique.size !== set.size) throw ruleError('REORDER_INVALID', { expected: set.size, received: ids.length });
  await db.query(`UPDATE ${table} SET sort_order = x.ord FROM unnest($1::uuid[]) WITH ORDINALITY AS x(id, ord) WHERE ${table}.id = x.id`, [ids], ex);
}

// ── service ─────────────────────────────────────────────────────────────────────────────────────────

export const structureService = {
  async subjects(f: { status?: string; q?: string }) {
    return toAdminSubjects(await repo.subjects(f));
  },
  async subject(id: string) {
    const [row] = await repo.subjects({ ids: [id] });
    if (!row) throw new NotFoundError('subject');
    return (await toAdminSubjects([row]))[0] as AdminSubject;
  },
  async createSubject(b: SubjectCreate) {
    const exists = await db.scalar<number>(`SELECT count(*)::int FROM ${T.subjects} WHERE slug = $1`, [b.slug]);
    if (exists) throw new ConflictError('ALREADY_EXISTS', { field: 'slug' });
    const id = randomUUID();
    await tx(async (c) => {
      const image = await attachImage(b.imageFileKey, 'subject_image', 'subject', id, c);
      const order = b.order ?? (await db.scalar<number>(`SELECT COALESCE(max(sort_order), 0) + 1 FROM ${T.subjects} WHERE deleted_at IS NULL`, [], c)) ?? 1;
      await db.query(
        `INSERT INTO ${T.subjects} (id, slug, name_en, name_ar, tagline_en, tagline_ar, description_en, description_ar, color, icon, image_url, sort_order, status, sequential_unlock)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [id, b.slug, b.name.en, b.name.ar, b.tagline?.en ?? '', b.tagline?.ar ?? '', b.description?.en ?? '', b.description?.ar ?? '', b.color, b.icon ?? 'Book', image ?? null, order, b.status, b.sequentialUnlock],
        c,
      );
    });
    return this.subject(id);
  },
  async updateSubject(id: string, b: SubjectPatch) {
    await this.subject(id);
    if (b.slug) {
      const taken = await db.scalar<number>(`SELECT count(*)::int FROM ${T.subjects} WHERE slug = $1 AND id <> $2`, [b.slug, id]);
      if (taken) throw new ConflictError('ALREADY_EXISTS', { field: 'slug' });
    }
    await tx(async (c) => {
      const sets: string[] = [];
      const params: unknown[] = [id];
      const set = (col: string, v: unknown) => {
        if (v === undefined) return;
        params.push(v);
        sets.push(`${col} = $${params.length}`);
      };
      set('slug', b.slug);
      set('name_en', b.name?.en);
      set('name_ar', b.name?.ar);
      set('tagline_en', b.tagline?.en);
      set('tagline_ar', b.tagline?.ar);
      set('description_en', b.description?.en);
      set('description_ar', b.description?.ar);
      set('color', b.color);
      set('icon', b.icon);
      set('sort_order', b.order);
      set('status', b.status);
      set('sequential_unlock', b.sequentialUnlock);
      set('image_url', await attachImage(b.imageFileKey, 'subject_image', 'subject', id, c));
      if (sets.length) await db.query(`UPDATE ${T.subjects} SET ${sets.join(', ')} WHERE id = $1`, params, c);
    });
    return this.subject(id);
  },
  async deleteSubject(id: string) {
    const s = await this.subject(id);
    const deps = s.stats.units + s.stats.lessons;
    if (deps > 0) throw new ConflictError('HAS_DEPENDENTS', { count: deps, units: s.stats.units, lessons: s.stats.lessons });
    if (s.stats.questions > 0) throw new ConflictError('HAS_DEPENDENTS', { count: s.stats.questions, questions: s.stats.questions });
    await db.query(`UPDATE ${T.subjects} SET deleted_at = now(), slug = slug || '-deleted-' || substr(md5(random()::text), 1, 6) WHERE id = $1`, [id]);
    return s;
  },
  async reorderSubjects(ids: string[]) {
    await tx((c) => applyOrder(T.subjects, null, null, ids, c));
    return this.subjects({});
  },

  // ── units & topics ──
  async units(subjectIdOrSlug: string): Promise<AdminUnit[]> {
    const subjectId = isUuid(subjectIdOrSlug) ? subjectIdOrSlug : (await contentRepo.subject(subjectIdOrSlug))?.id;
    if (!subjectId) throw new NotFoundError('subject');
    const units = await repo.unitsWithCounts(subjectId);
    const topics = units.length ? await repo.topicsWithCounts(units.map((u) => u.id)) : [];
    return units.map((u, i) => {
      const ts: AdminTopic[] = topics.filter((t) => t.unit_id === u.id).map((t, k) => ({ id: t.id, unitId: t.unit_id, name: { en: t.title_en, ar: t.title_ar }, order: k + 1, lessonCount: t.lessons }));
      return { id: u.id, subjectId: u.subject_id, name: { en: u.title_en, ar: u.title_ar }, order: i + 1, topicCount: ts.length, lessonCount: u.lessons, topics: ts };
    });
  },
  async unitDto(id: string): Promise<AdminUnit> {
    const u = await repo.unit(id);
    if (!u) throw new NotFoundError('unit');
    const all = await this.units(u.subject_id);
    return all.find((x) => x.id === id) as AdminUnit;
  },
  async createUnit(subjectId: string, name: { en: string; ar: string }) {
    const s = await contentRepo.subject(subjectId);
    if (!s) throw new NotFoundError('subject');
    const id = randomUUID();
    await db.query(
      `INSERT INTO ${T.units} (id, subject_id, slug, title_en, title_ar, sort_order)
       VALUES ($1,$2,$3,$4,$5,(SELECT COALESCE(max(sort_order), 0) + 1 FROM ${T.units} WHERE subject_id = $2 AND deleted_at IS NULL))`,
      [id, s.id, `${s.slug}-u-${shortId()}`, name.en, name.ar],
    );
    return this.unitDto(id);
  },
  async renameUnit(id: string, name: { en: string; ar: string }) {
    const n = await db.exec(`UPDATE ${T.units} SET title_en = $2, title_ar = $3 WHERE id = $1 AND deleted_at IS NULL`, [id, name.en, name.ar]);
    if (!n) throw new NotFoundError('unit');
    return this.unitDto(id);
  },
  async deleteUnit(id: string) {
    const u = await repo.unit(id);
    if (!u) throw new NotFoundError('unit');
    const lessons = (await db.scalar<number>(`SELECT count(*)::int FROM ${T.lessons} WHERE unit_id = $1 AND deleted_at IS NULL`, [id])) ?? 0;
    if (lessons) throw new ConflictError('HAS_DEPENDENTS', { count: lessons });
    await tx(async (c) => {
      await db.query(`UPDATE ${T.topics} SET deleted_at = now(), slug = slug || '-deleted-' || substr(md5(random()::text), 1, 6) WHERE unit_id = $1 AND deleted_at IS NULL`, [id], c);
      await db.query(`UPDATE ${T.units} SET deleted_at = now(), slug = slug || '-deleted-' || substr(md5(random()::text), 1, 6) WHERE id = $1`, [id], c);
      const rest = await db.many<{ id: string }>(`SELECT id FROM ${T.units} WHERE subject_id = $1 AND deleted_at IS NULL ORDER BY sort_order, created_at`, [u.subject_id], c);
      if (rest.length) await applyOrder(T.units, 'subject_id', u.subject_id, rest.map((r) => r.id), c);
    });
  },
  async reorderUnits(subjectId: string, ids: string[]) {
    await tx((c) => applyOrder(T.units, 'subject_id', subjectId, ids, c));
    return this.units(subjectId);
  },
  async topicDto(id: string): Promise<AdminTopic> {
    const t = await repo.topic(id);
    if (!t) throw new NotFoundError('topic');
    const unit = await this.unitDto(t.unit_id);
    return unit.topics.find((x) => x.id === id) as AdminTopic;
  },
  async createTopic(unitId: string, name: { en: string; ar: string }) {
    const u = await repo.unit(unitId);
    if (!u) throw new NotFoundError('unit');
    const id = randomUUID();
    await db.query(
      `INSERT INTO ${T.topics} (id, unit_id, slug, title_en, title_ar, sort_order)
       VALUES ($1,$2,$3,$4,$5,(SELECT COALESCE(max(sort_order), 0) + 1 FROM ${T.topics} WHERE unit_id = $2 AND deleted_at IS NULL))`,
      [id, unitId, `${u.slug}-c-${shortId()}`, name.en, name.ar],
    );
    return this.topicDto(id);
  },
  async renameTopic(id: string, name: { en: string; ar: string }) {
    const n = await db.exec(`UPDATE ${T.topics} SET title_en = $2, title_ar = $3 WHERE id = $1 AND deleted_at IS NULL`, [id, name.en, name.ar]);
    if (!n) throw new NotFoundError('topic');
    return this.topicDto(id);
  },
  async deleteTopic(id: string) {
    const t = await repo.topic(id);
    if (!t) throw new NotFoundError('topic');
    const lessons = (await db.scalar<number>(`SELECT count(*)::int FROM ${T.lessons} WHERE topic_id = $1 AND deleted_at IS NULL`, [id])) ?? 0;
    const questions = (await db.scalar<number>(`SELECT count(*)::int FROM ${T.questions} WHERE topic_id = $1 AND deleted_at IS NULL`, [id])) ?? 0;
    if (lessons || questions) throw new ConflictError('HAS_DEPENDENTS', { count: lessons + questions, lessons, questions });
    await tx(async (c) => {
      await db.query(`UPDATE ${T.topics} SET deleted_at = now(), slug = slug || '-deleted-' || substr(md5(random()::text), 1, 6) WHERE id = $1`, [id], c);
      const rest = await db.many<{ id: string }>(`SELECT id FROM ${T.topics} WHERE unit_id = $1 AND deleted_at IS NULL ORDER BY sort_order, created_at`, [t.unit_id], c);
      if (rest.length) await applyOrder(T.topics, 'unit_id', t.unit_id, rest.map((r) => r.id), c);
    });
  },
  async reorderTopics(unitId: string, ids: string[]) {
    if (!(await repo.unit(unitId))) throw new NotFoundError('unit');
    await tx((c) => applyOrder(T.topics, 'unit_id', unitId, ids, c));
    return (await this.unitDto(unitId)).topics;
  },

  // ── teachers ──
  async teachers(f: { subjectId?: string; active?: boolean }) {
    const subjectId = f.subjectId ? (await contentRepo.subject(f.subjectId))?.id : undefined;
    if (f.subjectId && !subjectId) throw new NotFoundError('subject');
    return withLessonCounts(await toTeacherDtos(await contentRepo.teachers({ subjectId, active: f.active })));
  },
  async teacher(id: string) {
    const [row] = await contentRepo.teachers({ ids: [id] });
    if (!row) throw new NotFoundError('teacher');
    return (await withLessonCounts(await toTeacherDtos([row])))[0] as AdminTeacherDto;
  },
  async createTeacher(b: z.infer<typeof teacherBody>) {
    if (!(await contentRepo.subject(b.subjectId))) throw new NotFoundError('subject');
    const id = randomUUID();
    await tx(async (c) => {
      const avatar = await attachImage(b.avatarFileKey, 'teacher_avatar', 'teacher', id, c);
      await db.query(
        `INSERT INTO ${T.teachers} (id, slug, name_en, name_ar, subject_id, avatar_url, bio_en, bio_ar, years_experience, students_count, rating, active, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,(SELECT COALESCE(max(sort_order), 0) + 1 FROM ${T.teachers}))`,
        [id, `teacher-${shortId()}`, b.name.en, b.name.ar, b.subjectId, avatar ?? null, b.bio?.en ?? '', b.bio?.ar ?? '', b.yearsExperience ?? null, b.studentsCount ?? null, b.rating ?? null, b.active ?? true],
        c,
      );
    });
    return this.teacher(id);
  },
  async updateTeacher(id: string, b: z.infer<typeof teacherPatchBody>) {
    await this.teacher(id);
    if (b.subjectId && !(await contentRepo.subject(b.subjectId))) throw new NotFoundError('subject');
    await tx(async (c) => {
      const sets: string[] = [];
      const params: unknown[] = [id];
      const set = (col: string, v: unknown) => {
        if (v === undefined) return;
        params.push(v);
        sets.push(`${col} = $${params.length}`);
      };
      set('name_en', b.name?.en);
      set('name_ar', b.name?.ar);
      set('bio_en', b.bio?.en);
      set('bio_ar', b.bio?.ar);
      set('subject_id', b.subjectId);
      set('years_experience', b.yearsExperience);
      set('students_count', b.studentsCount);
      set('rating', b.rating);
      set('active', b.active);
      set('avatar_url', await attachImage(b.avatarFileKey, 'teacher_avatar', 'teacher', id, c));
      if (sets.length) await db.query(`UPDATE ${T.teachers} SET ${sets.join(', ')} WHERE id = $1`, params, c);
    });
    return this.teacher(id);
  },
  async deleteTeacher(id: string) {
    const t = await this.teacher(id);
    const lessons = (await db.scalar<number>(`SELECT count(*)::int FROM ${T.lessons} WHERE teacher_id = $1 AND deleted_at IS NULL`, [id])) ?? 0;
    if (lessons) throw new ConflictError('HAS_DEPENDENTS', { count: lessons });
    await db.query(`DELETE FROM ${T.teachers} WHERE id = $1`, [id]);
    return t;
  },
};
