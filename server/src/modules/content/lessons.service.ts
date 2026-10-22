/**
 * Admin lessons (ADM-LSN-*): CRUD, workflow draft → in_review → approved → scheduled → published → archived
 * (content_workflow_log + lesson_versions), bulk ops, reorder, resources, export rows, scheduled publishing.
 */
import { randomUUID } from 'node:crypto';
import { T } from '../../config/constants.js';
import { db, tx, type Executor } from '../../config/db.js';
import { logger } from '../../config/logger.js';
import { BusinessRuleError, ConflictError, ForbiddenError, NotFoundError } from '../../common/errors/index.js';
import { hasAnyPermission, hasPermission } from '../../common/middleware/rbac.js';
import { storage } from '../../common/services/storage.js';
import type { AdminPrincipal } from '../../common/types/index.js';
import { orderBy } from '../../common/utils/pagination.js';
import { notifyNewLessons, ruleError, sqlSearch } from '../learning-core/index.js';
import type { ContentStatus, LessonListQuery, LessonWrite } from './schemas.js';
import type { AdminLesson, AdminLessonResource, LessonVersion, VideoState } from './types.js';

// ── repository ──────────────────────────────────────────────────────────────────────────────────────

export interface AdminLessonRow {
  id: string;
  subject_id: string;
  unit_id: string;
  topic_id: string | null;
  title_en: string;
  title_ar: string;
  description_en: string;
  description_ar: string;
  teacher_id: string | null;
  sort_order: number;
  duration_sec: number;
  thumbnail_url: string | null;
  video_asset_id: string | null;
  completion_threshold: number;
  prerequisite_lesson_id: string | null;
  status: ContentStatus;
  publish_at: Date | null;
  views_count: number;
  current_version: number;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
  s_slug: string;
  s_name_en: string;
  s_name_ar: string;
  s_color: string;
  u_title_en: string;
  u_title_ar: string;
  u_sort: number;
  tp_title_en: string | null;
  tp_title_ar: string | null;
  tp_sort: number | null;
  t_name_en: string | null;
  t_name_ar: string | null;
  t_avatar: string | null;
  va_ref: string | null;
  va_status: string | null;
  va_file: string | null;
  va_size: number | null;
  va_renditions: string[] | null;
  has_quiz_override: boolean;
}

const LESSON_SELECT = `l.id, l.subject_id, l.unit_id, l.topic_id, l.title_en, l.title_ar, l.description_en, l.description_ar, l.teacher_id, l.sort_order,
  l.duration_sec, l.thumbnail_url, l.video_asset_id, l.completion_threshold, l.prerequisite_lesson_id, l.status, l.publish_at, l.views_count,
  l.current_version, l.created_by, l.created_at, l.updated_at,
  s.slug AS s_slug, s.name_en AS s_name_en, s.name_ar AS s_name_ar, s.color AS s_color,
  u.title_en AS u_title_en, u.title_ar AS u_title_ar, u.sort_order AS u_sort,
  tp.title_en AS tp_title_en, tp.title_ar AS tp_title_ar, tp.sort_order AS tp_sort,
  te.name_en AS t_name_en, te.name_ar AS t_name_ar, te.avatar_url AS t_avatar,
  va.asset_ref AS va_ref, va.stream_status AS va_status, va.file_name AS va_file, va.size_bytes AS va_size, va.renditions AS va_renditions,
  EXISTS (SELECT 1 FROM ${T.quiz_rules} qr WHERE qr.scope = 'lesson' AND qr.lesson_id = l.id) AS has_quiz_override`;

const LESSON_FROM = `${T.lessons} l
  JOIN ${T.subjects} s ON s.id = l.subject_id
  JOIN ${T.units} u ON u.id = l.unit_id
  LEFT JOIN ${T.topics} tp ON tp.id = l.topic_id
  LEFT JOIN ${T.teachers} te ON te.id = l.teacher_id
  LEFT JOIN ${T.video_assets} va ON va.id = l.video_asset_id`;

export interface LessonFilter {
  q?: string;
  subjectId?: string;
  unitId?: string;
  topicId?: string;
  status?: ContentStatus[];
  teacherId?: string;
  excludeArchived?: boolean;
  withoutQuizOverride?: boolean;
  ids?: string[];
}

function where(f: LessonFilter, params: unknown[], withStatus = true): string {
  const conds = ['l.deleted_at IS NULL'];
  const add = (sql: string, v: unknown) => {
    params.push(v);
    conds.push(sql.replace('$?', `$${params.length}`));
  };
  if (f.subjectId) add('l.subject_id = $?', f.subjectId);
  if (f.unitId) add('l.unit_id = $?', f.unitId);
  if (f.topicId) add('l.topic_id = $?', f.topicId);
  if (f.teacherId) add('l.teacher_id = $?', f.teacherId);
  if (f.ids) add('l.id = ANY($?::uuid[])', f.ids);
  if (withStatus && f.status?.length) add('l.status::text = ANY($?::text[])', f.status);
  if (f.excludeArchived) conds.push(`l.status <> 'archived'`);
  if (f.withoutQuizOverride) conds.push(`NOT EXISTS (SELECT 1 FROM ${T.quiz_rules} qr WHERE qr.scope = 'lesson' AND qr.lesson_id = l.id)`);
  const s = sqlSearch(f.q, ['l.title_en', 'l.title_ar', 'l.id::text', 'l.slug'], params);
  if (s) conds.push(s);
  return conds.join(' AND ');
}

const SORT: Record<string, string> = {
  title: 'l.title_en',
  subject: 's.sort_order',
  order: 'l.sort_order',
  durationSec: 'l.duration_sec',
  views: 'l.views_count',
  status: 'l.status',
  publishAt: 'l.publish_at',
  updatedAt: 'l.updated_at',
  createdAt: 'l.created_at',
};

export const lessonsRepo = {
  async list(f: LessonFilter, sort: string | undefined, limit: number, offset: number) {
    const params: unknown[] = [];
    const w = where(f, params);
    const order = sort && SORT[sort.replace(/^-/, '')] ? `${orderBy(sort, SORT, 'order')}, l.id` : 's.sort_order, u.sort_order, tp.sort_order NULLS LAST, l.sort_order, l.id';
    const total = (await db.scalar<number>(`SELECT count(*)::int FROM ${LESSON_FROM} WHERE ${w}`, params)) ?? 0;
    const cParams: unknown[] = [];
    const counts = await db.many<{ status: ContentStatus; n: number }>(`SELECT l.status, count(*)::int AS n FROM ${LESSON_FROM} WHERE ${where(f, cParams, false)} GROUP BY l.status`, cParams);
    params.push(limit, offset);
    const rows = await db.many<AdminLessonRow>(`SELECT ${LESSON_SELECT} FROM ${LESSON_FROM} WHERE ${w} ORDER BY ${order} LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
    return { rows, total, counts };
  },
  async get(id: string, ex?: Executor) {
    return db.maybeOne<AdminLessonRow>(`SELECT ${LESSON_SELECT} FROM ${LESSON_FROM} WHERE l.id = $1 AND l.deleted_at IS NULL`, [id], ex);
  },
  versions(lessonId: string) {
    return db.many<{ id: string; version: number; note: string; status: ContentStatus; author_id: string | null; author_name: string; a_name_en: string | null; a_name_ar: string | null; a_avatar: string | null; created_at: Date }>(
      `SELECT v.id, v.version, v.note, v.status, v.author_id, v.author_name, a.name_en AS a_name_en, a.name_ar AS a_name_ar, a.avatar_url AS a_avatar, v.created_at
         FROM ${T.lesson_versions} v LEFT JOIN ${T.users} a ON a.id = v.author_id WHERE v.lesson_id = $1 ORDER BY v.version DESC`,
      [lessonId],
    );
  },
};

// ── mapping ─────────────────────────────────────────────────────────────────────────────────────────

const videoStateOf = (r: AdminLessonRow): VideoState => (!r.video_asset_id ? 'none' : ((r.va_status as VideoState | null) ?? 'none'));

export async function adminResourcesOf(lessonIds: string[]): Promise<Map<string, AdminLessonResource[]>> {
  const rows = lessonIds.length
    ? await db.many<{ id: string; lesson_id: string; title_en: string; title_ar: string; storage_bucket: string | null; storage_path: string | null; external_url: string | null; mime_type: string | null; size_bytes: number; pages: number | null }>(
        `SELECT id, lesson_id, title_en, title_ar, storage_bucket, storage_path, external_url, mime_type, size_bytes, pages FROM ${T.lesson_resources}
          WHERE lesson_id = ANY($1::uuid[]) ORDER BY sort_order, created_at`,
        [lessonIds],
      )
    : [];
  const urls = await storage.resolveMany(rows.map((r) => (r.storage_bucket && r.storage_path ? `storage://${r.storage_bucket}/${r.storage_path}` : r.external_url)));
  const out = new Map<string, AdminLessonResource[]>();
  rows.forEach((r, i) => {
    const name = r.storage_path ? (r.storage_path.split('/').pop() ?? '').replace(/^[0-9a-f-]{36}-/, '') : (r.external_url?.split('/').pop() ?? 'resource.pdf');
    out.set(r.lesson_id, [...(out.get(r.lesson_id) ?? []), { id: r.id, name, title: { en: r.title_en, ar: r.title_ar }, sizeKb: Math.round(Number(r.size_bytes) / 1024), pages: r.pages, mimeType: r.mime_type ?? 'application/pdf', url: urls[i] ?? '' }]);
  });
  return out;
}

async function toAdminLessons(rows: AdminLessonRow[], opts: { full?: boolean } = {}): Promise<AdminLesson[]> {
  const ids = rows.map((r) => r.id);
  const [thumbs, avatars] = await Promise.all([storage.resolveMany(rows.map((r) => r.thumbnail_url)), storage.resolveMany(rows.map((r) => r.t_avatar))]);
  const resources = opts.full ? await adminResourcesOf(ids) : new Map<string, AdminLessonResource[]>();
  const caps = opts.full && ids.length
    ? await db.many<{ lesson_id: string; lang: 'en' | 'ar'; storage_bucket: string | null; storage_path: string | null; external_url: string | null }>(
        `SELECT lesson_id, lang, storage_bucket, storage_path, external_url FROM ${T.lesson_caption_tracks} WHERE lesson_id = ANY($1::uuid[]) ORDER BY lang`,
        [ids],
      )
    : [];
  const capUrls = await storage.resolveMany(caps.map((c) => (c.storage_bucket && c.storage_path ? `storage://${c.storage_bucket}/${c.storage_path}` : c.external_url)));
  const out: AdminLesson[] = [];
  for (const [i, r] of rows.entries()) {
    const tracks = caps
      .map((c, k) => ({ c, url: capUrls[k] ?? '' }))
      .filter((x) => x.c.lesson_id === r.id)
      .map((x) => ({ lang: x.c.lang, fileName: (x.c.storage_path ?? x.c.external_url ?? '').split('/').pop()?.replace(/^[0-9a-f-]{36}-/, '') ?? '', url: x.url }));
    let versions: LessonVersion[] = [];
    if (opts.full) {
      versions = (await lessonsRepo.versions(r.id)).map((v) => ({
        id: v.id,
        version: v.version,
        author: { id: v.author_id ?? '', name: { en: v.a_name_en ?? v.author_name, ar: v.a_name_ar || v.a_name_en || v.author_name }, avatarUrl: v.a_avatar },
        note: v.note,
        status: v.status,
        createdAt: v.created_at.toISOString(),
      }));
    }
    const state = videoStateOf(r);
    out.push({
      id: r.id,
      subjectId: r.subject_id,
      unitId: r.unit_id,
      topicId: r.topic_id ?? '',
      subject: { id: r.subject_id, slug: r.s_slug, name: { en: r.s_name_en, ar: r.s_name_ar }, color: r.s_color },
      unit: { id: r.unit_id, name: { en: r.u_title_en, ar: r.u_title_ar }, order: r.u_sort },
      topic: { id: r.topic_id ?? '', name: { en: r.tp_title_en ?? '', ar: r.tp_title_ar ?? '' }, order: r.tp_sort ?? 0, unitId: r.unit_id },
      title: { en: r.title_en, ar: r.title_ar },
      description: { en: r.description_en, ar: r.description_ar },
      teacherId: r.teacher_id ?? '',
      teacher: { id: r.teacher_id ?? '', name: { en: r.t_name_en ?? '', ar: r.t_name_ar ?? '' }, avatarUrl: avatars[i] ?? null },
      order: r.sort_order,
      durationSec: r.duration_sec,
      thumbnailUrl: thumbs[i] ?? null,
      videoState: state,
      video: r.video_asset_id
        ? { id: r.video_asset_id, assetId: r.va_ref ?? '', streamStatus: (r.va_status === 'ready' || r.va_status === 'failed' ? r.va_status : 'processing') as 'ready' | 'processing' | 'failed', fileName: r.va_file, sizeMb: Math.round((Number(r.va_size ?? 0) / 1048576) * 10) / 10, renditions: r.va_renditions ?? [] }
        : null,
      captions: tracks[0]?.fileName ?? null,
      captionTracks: tracks,
      resources: resources.get(r.id) ?? [],
      completionThreshold: r.completion_threshold,
      prerequisiteId: r.prerequisite_lesson_id,
      status: r.status,
      publishAt: r.publish_at?.toISOString() ?? null,
      views: r.views_count,
      versions,
      createdAt: r.created_at.toISOString(),
      updatedAt: r.updated_at.toISOString(),
    });
  }
  return out;
}

// ── workflow ────────────────────────────────────────────────────────────────────────────────────────

export const LESSON_TRANSITIONS: Record<ContentStatus, ContentStatus[]> = {
  draft: ['in_review', 'approved', 'archived'],
  in_review: ['draft', 'approved', 'archived'],
  approved: ['draft', 'in_review', 'scheduled', 'published', 'archived'],
  scheduled: ['draft', 'approved', 'published', 'archived'],
  published: ['draft', 'archived', 'scheduled'],
  archived: ['draft'],
};

export const canTransition = (from: ContentStatus, to: ContentStatus) => LESSON_TRANSITIONS[from].includes(to);

const TRANSITION_ACTION: Record<ContentStatus, string> = { draft: 'revert_draft', in_review: 'submit', approved: 'approve', scheduled: 'schedule', published: 'publish', archived: 'archive' };
const TRANSITION_NOTE: Record<ContentStatus, string> = {
  draft: 'Reverted to draft',
  in_review: 'Submitted for review',
  approved: 'Approved',
  scheduled: 'Scheduled for publishing',
  published: 'Published',
  archived: 'Archived',
};
export const transitionAction = (to: ContentStatus) => TRANSITION_ACTION[to];

function assertTransitionPermission(admin: AdminPrincipal, to: ContentStatus, createdBy: string | null) {
  if (to === 'draft' || to === 'in_review') {
    if (hasPermission(admin, 'content.edit') || hasPermission(admin, 'content.approve')) return;
    if (hasPermission(admin, 'content.create') && createdBy === admin.userId) return;
    throw new ForbiddenError(undefined, { permission: 'content.edit' });
  }
  if (!hasPermission(admin, 'content.approve')) throw new ForbiddenError(undefined, { permission: 'content.approve' });
}

async function snapshot(lessonId: string, ex: Executor) {
  return db.one<Record<string, unknown>>(
    `SELECT title_en, title_ar, description_en, description_ar, subject_id, unit_id, topic_id, teacher_id, sort_order, duration_sec,
            thumbnail_url, video_asset_id, completion_threshold, prerequisite_lesson_id, status, publish_at
       FROM ${T.lessons} WHERE id = $1`,
    [lessonId],
    ex,
  );
}

async function addVersion(lessonId: string, note: string, admin: AdminPrincipal, ex: Executor) {
  const snap = await snapshot(lessonId, ex);
  const v = await db.one<{ current_version: number }>(`UPDATE ${T.lessons} SET current_version = current_version + 1, updated_by = $2 WHERE id = $1 RETURNING current_version`, [lessonId, admin.userId], ex);
  await db.query(
    `INSERT INTO ${T.lesson_versions} (lesson_id, version, snapshot, note, status, author_id, author_name)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7) ON CONFLICT (lesson_id, version) DO NOTHING`,
    [lessonId, v.current_version, JSON.stringify(snap), note, snap.status, admin.userId, admin.name],
    ex,
  );
}

async function logWorkflow(entityType: string, entityId: string, from: string | null, to: string, admin: AdminPrincipal | null, note: string, ex?: Executor) {
  await db.query(
    `INSERT INTO ${T.content_workflow_log} (entity_type, entity_id, from_status, to_status, actor_id, actor_name, note) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [entityType, entityId, from, to, admin?.userId ?? null, admin?.name ?? 'system', note],
    ex,
  );
}

/** Validate subject/unit/topic/teacher/prerequisite placement. */
async function validatePlacement(p: { subjectId: string; unitId: string; topicId: string; teacherId?: string; prerequisiteId?: string | null; lessonId?: string }, ex?: Executor) {
  const ok = await db.maybeOne<{ ok: boolean }>(
    `SELECT true AS ok FROM ${T.units} u JOIN ${T.topics} tp ON tp.unit_id = u.id
      WHERE u.id = $1 AND tp.id = $2 AND u.subject_id = $3 AND u.deleted_at IS NULL AND tp.deleted_at IS NULL`,
    [p.unitId, p.topicId, p.subjectId],
    ex,
  );
  if (!ok) throw ruleError('PLACEMENT_INVALID', { subjectId: p.subjectId, unitId: p.unitId, topicId: p.topicId });
  if (p.teacherId && !(await db.scalar<number>(`SELECT count(*)::int FROM ${T.teachers} WHERE id = $1`, [p.teacherId], ex))) throw new NotFoundError('teacher');
  if (p.prerequisiteId) {
    if (p.prerequisiteId === p.lessonId) throw ruleError('PLACEMENT_INVALID', { prerequisiteId: p.prerequisiteId });
    if (!(await db.scalar<number>(`SELECT count(*)::int FROM ${T.lessons} WHERE id = $1 AND deleted_at IS NULL`, [p.prerequisiteId], ex))) throw new NotFoundError('lesson');
  }
}

async function applyWrite(lessonId: string, b: LessonWrite, ex: Executor) {
  const sets: string[] = [];
  const params: unknown[] = [lessonId];
  const set = (col: string, v: unknown) => {
    if (v === undefined) return;
    params.push(v);
    sets.push(`${col} = $${params.length}`);
  };
  set('title_en', b.title?.en);
  set('title_ar', b.title?.ar);
  set('description_en', b.description?.en);
  set('description_ar', b.description?.ar);
  set('subject_id', b.subjectId);
  set('unit_id', b.unitId);
  set('topic_id', b.topicId);
  set('teacher_id', b.teacherId);
  set('sort_order', b.order);
  set('duration_sec', b.durationSec);
  set('completion_threshold', b.completionThreshold);
  set('prerequisite_lesson_id', b.prerequisiteId);
  if (b.thumbnailFileKey !== undefined) {
    if (b.thumbnailFileKey === null) set('thumbnail_url', null);
    else {
      const up = await storage.attachUpload(b.thumbnailFileKey, { purpose: 'lesson_thumbnail', entityType: 'lesson', entityId: lessonId }, ex);
      set('thumbnail_url', storage.ref(up.bucket, up.path));
    }
  }
  if (sets.length) await db.query(`UPDATE ${T.lessons} SET ${sets.join(', ')} WHERE id = $1`, params, ex);
  if (b.captions !== undefined) {
    if (b.captions === null) await db.query(`DELETE FROM ${T.lesson_caption_tracks} WHERE lesson_id = $1`, [lessonId], ex);
    else
      for (const c of b.captions) {
        const up = await storage.attachUpload(c.fileKey, { purpose: 'lesson_captions', entityType: 'lesson', entityId: lessonId }, ex);
        await db.query(
          `INSERT INTO ${T.lesson_caption_tracks} (lesson_id, lang, label_en, label_ar, storage_bucket, storage_path)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (lesson_id, lang) DO UPDATE SET storage_bucket = EXCLUDED.storage_bucket, storage_path = EXCLUDED.storage_path, external_url = NULL`,
          [lessonId, c.lang, c.lang === 'ar' ? 'Arabic' : 'English', c.lang === 'ar' ? 'العربية' : 'الإنجليزية', up.bucket, up.path],
          ex,
        );
      }
  }
}

// ── service ─────────────────────────────────────────────────────────────────────────────────────────

export const lessonsAdminService = {
  async list(q: LessonListQuery) {
    const f: LessonFilter = { q: q.q, subjectId: q.subjectId, unitId: q.unitId, topicId: q.topicId, status: q.status, teacherId: q.teacherId, excludeArchived: q.excludeArchived, withoutQuizOverride: q.withoutQuizOverride };
    const light = q.view === 'board' || q.view === 'options';
    const pageSize = light ? q.pageSize : Math.min(q.pageSize, 100);
    const { rows, total, counts } = await lessonsRepo.list(f, q.sort, pageSize, (q.page - 1) * pageSize);
    const countMap: Record<ContentStatus, number> = { draft: 0, in_review: 0, approved: 0, scheduled: 0, published: 0, archived: 0 };
    for (const c of counts) countMap[c.status] = c.n;
    const meta = { page: q.page, pageSize, total, nextCursor: null, counts: countMap };
    if (light) {
      const items = rows.map((r) => ({
        id: r.id,
        title: { en: r.title_en, ar: r.title_ar },
        subjectId: r.subject_id,
        subject: { id: r.subject_id, slug: r.s_slug, name: { en: r.s_name_en, ar: r.s_name_ar }, color: r.s_color },
        unit: { id: r.unit_id, name: { en: r.u_title_en, ar: r.u_title_ar }, order: r.u_sort },
        topic: { id: r.topic_id ?? '', name: { en: r.tp_title_en ?? '', ar: r.tp_title_ar ?? '' }, order: r.tp_sort ?? 0, unitId: r.unit_id },
        teacherId: r.teacher_id ?? '',
        teacher: { id: r.teacher_id ?? '', name: { en: r.t_name_en ?? '', ar: r.t_name_ar ?? '' }, avatarUrl: null },
        durationSec: r.duration_sec,
        status: r.status,
        publishAt: r.publish_at?.toISOString() ?? null,
        updatedAt: r.updated_at.toISOString(),
        order: r.sort_order,
      }));
      return { items, meta };
    }
    return { items: await toAdminLessons(rows), meta };
  },

  async get(id: string): Promise<AdminLesson> {
    const r = await lessonsRepo.get(id);
    if (!r) throw new NotFoundError('lesson');
    return (await toAdminLessons([r], { full: true }))[0] as AdminLesson;
  },

  async exportRows(f: LessonFilter, sort?: string) {
    const { rows } = await lessonsRepo.list(f, sort, 50_000, 0);
    return toAdminLessons(rows);
  },

  async create(b: LessonWrite & { status?: 'draft' | 'in_review' }, admin: AdminPrincipal) {
    if (!b.title || !b.subjectId || !b.unitId || !b.topicId || !b.teacherId) throw ruleError('PLACEMENT_INVALID');
    await validatePlacement({ subjectId: b.subjectId, unitId: b.unitId, topicId: b.topicId, teacherId: b.teacherId, prerequisiteId: b.prerequisiteId });
    const id = randomUUID();
    const status = b.status ?? 'draft';
    await tx(async (c) => {
      const slugBase = (await db.scalar<string>(`SELECT slug FROM ${T.subjects} WHERE id = $1`, [b.subjectId], c)) ?? 'lesson';
      const order = b.order ?? (await db.scalar<number>(`SELECT COALESCE(max(sort_order), 0) + 1 FROM ${T.lessons} WHERE topic_id = $1 AND deleted_at IS NULL`, [b.topicId], c)) ?? 1;
      await db.query(
        `INSERT INTO ${T.lessons} (id, subject_id, unit_id, topic_id, slug, title_en, title_ar, teacher_id, sort_order, status, current_version, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,0,$11,$11)`,
        [id, b.subjectId, b.unitId, b.topicId, `${slugBase}-${randomUUID().slice(0, 8)}`, b.title!.en, b.title!.ar, b.teacherId, order, status, admin.userId],
        c,
      );
      await applyWrite(id, { ...b, order }, c);
      await addVersion(id, b.versionNote || (status === 'in_review' ? 'Lesson created and submitted for review' : 'Lesson created'), admin, c);
      await logWorkflow('lesson', id, null, status, admin, 'created', c);
    });
    return this.get(id);
  },

  async update(id: string, b: LessonWrite, admin: AdminPrincipal) {
    const cur = await lessonsRepo.get(id);
    if (!cur) throw new NotFoundError('lesson');
    if (cur.status === 'published' || cur.status === 'scheduled') {
      if (!hasAnyPermission(admin, ['content.edit', 'content.approve'])) throw new ForbiddenError(undefined, { permission: 'content.edit' });
    }
    if (b.subjectId || b.unitId || b.topicId || b.teacherId || b.prerequisiteId) {
      await validatePlacement({ subjectId: b.subjectId ?? cur.subject_id, unitId: b.unitId ?? cur.unit_id, topicId: b.topicId ?? cur.topic_id ?? '', teacherId: b.teacherId, prerequisiteId: b.prerequisiteId, lessonId: id });
    }
    await tx(async (c) => {
      await applyWrite(id, b, c);
      await addVersion(id, b.versionNote || 'Content updated', admin, c);
    });
    return this.get(id);
  },

  async remove(id: string) {
    const cur = await lessonsRepo.get(id);
    if (!cur) throw new NotFoundError('lesson');
    await db.query(`UPDATE ${T.lessons} SET deleted_at = now() WHERE id = $1`, [id]);
    await db.query(`UPDATE ${T.lessons} SET prerequisite_lesson_id = NULL WHERE prerequisite_lesson_id = $1`, [id]);
    return cur;
  },

  async transition(id: string, b: { to: ContentStatus; publishAt?: string; note?: string; patch?: LessonWrite }, admin: AdminPrincipal) {
    const cur = await lessonsRepo.get(id);
    if (!cur) throw new NotFoundError('lesson');
    assertTransitionPermission(admin, b.to, cur.created_by);
    if (!canTransition(cur.status, b.to)) throw new BusinessRuleError('INVALID_TRANSITION', { from: cur.status, to: b.to });
    let publishAt: Date | null | undefined;
    if (b.to === 'scheduled') {
      if (!b.publishAt) throw new BusinessRuleError('INVALID_TRANSITION', { from: cur.status, to: b.to, field: 'publishAt' });
      publishAt = new Date(b.publishAt);
      if (publishAt.getTime() < Date.now() - 60_000) throw new BusinessRuleError('INVALID_TRANSITION', { from: cur.status, to: b.to, field: 'publishAt' });
    } else if (b.to === 'published') publishAt = new Date();
    else if (b.to !== 'archived') publishAt = null;
    await tx(async (c) => {
      if (b.patch) await applyWrite(id, b.patch, c);
      if (b.to === 'published' || b.to === 'scheduled') {
        const vs = await db.scalar<string | null>(`SELECT va.stream_status FROM ${T.lessons} l LEFT JOIN ${T.video_assets} va ON va.id = l.video_asset_id WHERE l.id = $1`, [id], c);
        if (vs !== 'ready') throw new BusinessRuleError('INVALID_TRANSITION', { reason: 'VIDEO_NOT_READY', from: cur.status, to: b.to });
      }
      await db.query(
        `UPDATE ${T.lessons} SET status = $2, publish_at = CASE WHEN $3::boolean THEN $4::timestamptz ELSE publish_at END,
                published_at = CASE WHEN $5::boolean THEN now() ELSE published_at END WHERE id = $1`,
        [id, b.to, publishAt !== undefined, publishAt ?? null, b.to === 'published'],
        c,
      );
      const note = b.note || (b.to === 'scheduled' && publishAt ? `${TRANSITION_NOTE.scheduled} ${publishAt.toISOString()}` : TRANSITION_NOTE[b.to]);
      await addVersion(id, note, admin, c);
      await logWorkflow('lesson', id, cur.status, b.to, admin, note, c);
    });
    if (b.to === 'published') notifyNewLessons([id]);
    return { before: cur.status, lesson: await this.get(id) };
  },

  async bulkTransition(ids: string[], to: ContentStatus, admin: AdminPrincipal, reason?: string) {
    const succeeded: string[] = [];
    const failed: { id: string; code: string; reason?: string; message: string }[] = [];
    for (const id of ids) {
      try {
        await this.transition(id, { to, note: reason }, admin);
        succeeded.push(id);
      } catch (err) {
        const e = err as { code?: string; reason?: string; details?: { reason?: string }; message: string };
        failed.push({ id, code: e.code ?? 'INTERNAL', reason: e.details?.reason ?? e.reason, message: e.message });
      }
    }
    return { succeeded, failed };
  },

  async bulkDelete(ids: string[]) {
    const rows = await db.many<{ id: string }>(`UPDATE ${T.lessons} SET deleted_at = now() WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL RETURNING id`, [ids]);
    const ok = new Set(rows.map((r) => r.id));
    return { succeeded: [...ok], failed: ids.filter((id) => !ok.has(id)).map((id) => ({ id, code: 'NOT_FOUND', message: 'lesson not found' })) };
  },

  async versions(id: string) {
    const l = await this.get(id);
    return l.versions;
  },

  async reorderTopicLessons(topicId: string, ids: string[]) {
    const current = await db.many<{ id: string }>(`SELECT id FROM ${T.lessons} WHERE topic_id = $1 AND deleted_at IS NULL`, [topicId]);
    const set = new Set(current.map((r) => r.id));
    if (new Set(ids).size !== ids.length || ids.length !== set.size || ids.some((i) => !set.has(i))) throw ruleError('REORDER_INVALID', { expected: set.size, received: ids.length });
    await db.query(`UPDATE ${T.lessons} SET sort_order = x.ord FROM unnest($1::uuid[]) WITH ORDINALITY AS x(id, ord) WHERE ${T.lessons}.id = x.id`, [ids]);
    return ids.map((id, i) => ({ id, order: i + 1 }));
  },

  // ── resources ──
  async addResource(lessonId: string, b: { fileKey: string; title?: { en: string; ar: string }; pages?: number | null }) {
    if (!(await lessonsRepo.get(lessonId))) throw new NotFoundError('lesson');
    const id = randomUUID();
    await tx(async (c) => {
      const up = await storage.attachUpload(b.fileKey, { purpose: 'lesson_resource', entityType: 'lesson_resource', entityId: id }, c);
      const base = up.file_name.replace(/\.[^.]+$/, '');
      await db.query(
        `INSERT INTO ${T.lesson_resources} (id, lesson_id, title_en, title_ar, kind, storage_bucket, storage_path, mime_type, size_bytes, pages, sort_order)
         VALUES ($1,$2,$3,$4,'pdf',$5,$6,$7,$8,$9,(SELECT COALESCE(max(sort_order), 0) + 1 FROM ${T.lesson_resources} WHERE lesson_id = $2))`,
        [id, lessonId, b.title?.en || base, b.title?.ar || b.title?.en || base, up.bucket, up.path, up.content_type, up.size_bytes, b.pages ?? null],
        c,
      );
    });
    return this.resource(lessonId, id);
  },
  async resource(lessonId: string, resourceId: string): Promise<AdminLessonResource> {
    const r = (await adminResourcesOf([lessonId])).get(lessonId)?.find((x) => x.id === resourceId);
    if (!r) throw new NotFoundError('file');
    return r;
  },
  async updateResource(lessonId: string, resourceId: string, b: { title?: { en: string; ar: string }; pages?: number | null; order?: number }) {
    await this.resource(lessonId, resourceId);
    const sets: string[] = [];
    const params: unknown[] = [resourceId];
    const set = (col: string, v: unknown) => {
      if (v === undefined) return;
      params.push(v);
      sets.push(`${col} = $${params.length}`);
    };
    set('title_en', b.title?.en);
    set('title_ar', b.title?.ar);
    set('pages', b.pages);
    set('sort_order', b.order);
    if (sets.length) await db.query(`UPDATE ${T.lesson_resources} SET ${sets.join(', ')} WHERE id = $1`, params);
    return this.resource(lessonId, resourceId);
  },
  async removeResource(lessonId: string, resourceId: string) {
    const n = await db.exec(`DELETE FROM ${T.lesson_resources} WHERE id = $1 AND lesson_id = $2`, [resourceId, lessonId]);
    if (!n) throw new NotFoundError('file');
  },

  async quizOverrideConflict(lessonId: string) {
    const n = await db.scalar<number>(`SELECT count(*)::int FROM ${T.quiz_rules} WHERE scope = 'lesson' AND lesson_id = $1`, [lessonId]);
    if (n) throw new ConflictError('ALREADY_EXISTS');
  },
};

/**
 * Job hook (`lesson-publish-scheduled`, every minute — scheduled by the jobs agent):
 * flips `scheduled → published` at `publish_at`. Returns the published lesson ids (for new_lesson notifications).
 */
export async function publishScheduledLessons(now = new Date()): Promise<string[]> {
  const rows = await db.many<{ id: string }>(
    `UPDATE ${T.lessons} SET status = 'published', published_at = now()
      WHERE status = 'scheduled' AND deleted_at IS NULL AND publish_at <= $1 RETURNING id`,
    [now],
  );
  for (const r of rows) await logWorkflow('lesson', r.id, 'scheduled', 'published', null, 'Published by schedule');
  if (rows.length) {
    logger.info({ count: rows.length }, 'scheduled lessons published');
    notifyNewLessons(rows.map((r) => r.id));
  }
  return rows.map((r) => r.id);
}
