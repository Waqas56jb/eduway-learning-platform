/** Content SQL (subjects, units, topics, teachers, lessons, resources, captions, videos, notes). */
import { T } from '../../config/constants.js';
import { db, type Executor } from '../../config/db.js';
import { isUuid, LESSON_LIVE } from '../learning-core/index.js';

export interface SubjectRow {
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
  teacher_name_en: string;
  teacher_name_ar: string;
  sort_order: number;
  status: 'active' | 'hidden';
  sequential_unlock: boolean;
  created_at: Date;
  updated_at: Date;
  lessons_count: number;
  total_sec: number;
  questions_count: number;
  exams_count: number;
  t_id: string | null;
  t_name_en: string | null;
  t_name_ar: string | null;
  t_avatar_url: string | null;
}

const SUBJECT_STATS = `
  (SELECT count(*) FROM ${T.lessons} l WHERE l.subject_id = s.id AND ${LESSON_LIVE})::int AS lessons_count,
  (SELECT COALESCE(sum(l.duration_sec), 0) FROM ${T.lessons} l WHERE l.subject_id = s.id AND ${LESSON_LIVE})::int AS total_sec,
  (SELECT count(*) FROM ${T.questions} q WHERE q.subject_id = s.id AND q.status = 'published' AND q.deleted_at IS NULL)::int AS questions_count,
  (SELECT count(DISTINCT b.id) FROM ${T.exam_blueprints} b LEFT JOIN ${T.exam_blueprint_sections} bs ON bs.blueprint_id = b.id
    WHERE b.deleted_at IS NULL AND b.status = 'published' AND (b.subject_id = s.id OR bs.subject_id = s.id)
      AND (b.available_from IS NULL OR b.available_from <= now()) AND (b.available_to IS NULL OR b.available_to > now()))::int AS exams_count,
  t.id AS t_id, t.name_en AS t_name_en, t.name_ar AS t_name_ar, t.avatar_url AS t_avatar_url`;

const SUBJECT_TEACHER_JOIN = `LEFT JOIN LATERAL (SELECT t.id, t.name_en, t.name_ar, t.avatar_url FROM ${T.teachers} t WHERE t.subject_id = s.id AND t.active ORDER BY t.sort_order, t.name_en LIMIT 1) t ON true`;

export interface CatalogLessonRow {
  id: string;
  slug: string;
  subject_id: string;
  subject_slug: string;
  unit_id: string;
  topic_id: string | null;
  sort_order: number;
  title_en: string;
  title_ar: string;
  description_en: string;
  description_ar: string;
  duration_sec: number;
  thumbnail_url: string | null;
  teacher_id: string | null;
  teacher_name_en: string | null;
  teacher_name_ar: string | null;
  teacher_avatar_url: string | null;
  prerequisite_lesson_id: string | null;
  is_free_preview: boolean;
  completion_threshold: number;
  video_asset_id: string | null;
  stream_status: string | null;
  unit_sort: number;
  unit_title_en: string;
  unit_title_ar: string;
  topic_sort: number | null;
}

export interface UnitRow {
  id: string;
  subject_id: string;
  title_en: string;
  title_ar: string;
  sort_order: number;
}
export interface TopicRow {
  id: string;
  unit_id: string;
  title_en: string;
  title_ar: string;
  sort_order: number;
}

export interface TeacherRow {
  id: string;
  slug: string;
  name_en: string;
  name_ar: string;
  bio_en: string;
  bio_ar: string;
  avatar_url: string | null;
  subject_id: string | null;
  subject_slug: string | null;
  years_experience: number | null;
  students_count: number | null;
  rating: number | null;
  active: boolean;
}

export interface ResourceRow {
  id: string;
  lesson_id: string;
  title_en: string;
  title_ar: string;
  kind: string;
  storage_bucket: string | null;
  storage_path: string | null;
  external_url: string | null;
  mime_type: string | null;
  size_bytes: number;
  pages: number | null;
  sort_order: number;
}

export interface CaptionRow {
  id: string;
  lesson_id: string;
  lang: 'en' | 'ar';
  label_en: string;
  label_ar: string;
  storage_bucket: string | null;
  storage_path: string | null;
  external_url: string | null;
}

export interface VideoRow {
  id: string;
  asset_ref: string;
  provider: 'storage' | 'external';
  source_url: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  hls_path: string | null;
  size_bytes: number;
  duration_sec: number;
  resolution: string | null;
  stream_status: 'uploading' | 'processing' | 'ready' | 'failed';
  cdn_status: 'synced' | 'pending' | 'error';
  views: number;
  replays: number;
  error: string | null;
  uploaded_at: Date;
  updated_at: Date;
  lesson_id: string | null;
  file_name: string | null;
  renditions: string[];
  processing_progress: number | null;
  detached_at: Date | null;
}

export const contentRepo = {
  // ── subjects ──
  subjects(opts: { includeHidden?: boolean; status?: string; ids?: string[]; search?: { sql: string; params: unknown[] } } = {}, ex?: Executor) {
    const conds = ['s.deleted_at IS NULL'];
    const params: unknown[] = opts.search?.params ?? [];
    if (!opts.includeHidden) conds.push(`s.status = 'active'`);
    if (opts.status) {
      params.push(opts.status);
      conds.push(`s.status = $${params.length}`);
    }
    if (opts.ids) {
      params.push(opts.ids);
      conds.push(`s.id = ANY($${params.length}::uuid[])`);
    }
    if (opts.search?.sql) conds.push(opts.search.sql);
    return db.many<SubjectRow>(`SELECT s.*, ${SUBJECT_STATS} FROM ${T.subjects} s ${SUBJECT_TEACHER_JOIN} WHERE ${conds.join(' AND ')} ORDER BY s.sort_order, s.name_en`, params, ex);
  },
  subject(idOrSlug: string, ex?: Executor) {
    return db.maybeOne<SubjectRow>(
      `SELECT s.*, ${SUBJECT_STATS} FROM ${T.subjects} s ${SUBJECT_TEACHER_JOIN} WHERE s.deleted_at IS NULL AND ${isUuid(idOrSlug) ? 's.id = $1::uuid' : 's.slug = $1'}`,
      [idOrSlug],
      ex,
    );
  },

  /** Published lessons for subjects in student order (unit → topic → lesson). */
  catalogLessons(where: { subjectIds?: string[]; lessonIds?: string[] }, ex?: Executor) {
    const conds = [LESSON_LIVE, 'u.deleted_at IS NULL'];
    const params: unknown[] = [];
    if (where.subjectIds) {
      params.push(where.subjectIds);
      conds.push(`l.subject_id = ANY($${params.length}::uuid[])`);
    }
    if (where.lessonIds) {
      params.push(where.lessonIds);
      conds.push(`l.id = ANY($${params.length}::uuid[])`);
    }
    return db.many<CatalogLessonRow>(
      `SELECT l.id, l.slug, l.subject_id, s.slug AS subject_slug, l.unit_id, l.topic_id, l.sort_order, l.title_en, l.title_ar,
              l.description_en, l.description_ar, l.duration_sec, l.thumbnail_url, l.teacher_id,
              te.name_en AS teacher_name_en, te.name_ar AS teacher_name_ar, te.avatar_url AS teacher_avatar_url,
              l.prerequisite_lesson_id, l.is_free_preview, l.completion_threshold, l.video_asset_id, va.stream_status,
              u.sort_order AS unit_sort, u.title_en AS unit_title_en, u.title_ar AS unit_title_ar, tp.sort_order AS topic_sort
         FROM ${T.lessons} l
         JOIN ${T.subjects} s ON s.id = l.subject_id
         JOIN ${T.units} u ON u.id = l.unit_id
         LEFT JOIN ${T.topics} tp ON tp.id = l.topic_id
         LEFT JOIN ${T.teachers} te ON te.id = l.teacher_id
         LEFT JOIN ${T.video_assets} va ON va.id = l.video_asset_id
        WHERE ${conds.join(' AND ')}
        ORDER BY s.sort_order, u.sort_order, tp.sort_order NULLS LAST, l.sort_order, l.created_at`,
      params,
      ex,
    );
  },

  /** Lesson by uuid or slug (any status unless `liveOnly`). */
  lessonId(idOrSlug: string, ex?: Executor) {
    return db.maybeOne<{ id: string; subject_id: string; status: string; deleted_at: Date | null; is_free_preview: boolean }>(
      `SELECT id, subject_id, status, deleted_at, is_free_preview FROM ${T.lessons} WHERE ${isUuid(idOrSlug) ? 'id = $1::uuid' : 'slug = $1'}`,
      [idOrSlug],
      ex,
    );
  },

  /** Size of a lesson's quiz pool (published mcq/true_false questions of the subject — quizzes/engine lessonPool()),
   *  capped at `cap`, without loading the rows (lesson detail only needs the count). */
  async quizPoolSize(subjectId: string, cap: number, ex?: Executor): Promise<number> {
    return (
      (await db.scalar<number>(
        `SELECT count(*)::int FROM (SELECT 1 FROM ${T.questions} q
          WHERE q.subject_id = $1 AND q.status = 'published' AND q.deleted_at IS NULL AND q.type = ANY($2::text[]) LIMIT $3) pool`,
        [subjectId, ['mcq', 'true_false'], cap],
        ex,
      )) ?? 0
    );
  },

  units(subjectId: string, ex?: Executor) {
    return db.many<UnitRow>(`SELECT id, subject_id, title_en, title_ar, sort_order FROM ${T.units} WHERE subject_id = $1 AND deleted_at IS NULL ORDER BY sort_order, created_at`, [subjectId], ex);
  },
  topicsOfSubject(subjectId: string, ex?: Executor) {
    return db.many<TopicRow>(
      `SELECT tp.id, tp.unit_id, tp.title_en, tp.title_ar, tp.sort_order FROM ${T.topics} tp JOIN ${T.units} u ON u.id = tp.unit_id
        WHERE u.subject_id = $1 AND tp.deleted_at IS NULL AND u.deleted_at IS NULL ORDER BY u.sort_order, tp.sort_order, tp.created_at`,
      [subjectId],
      ex,
    );
  },

  resources(lessonIds: string[], ex?: Executor) {
    return db.many<ResourceRow>(
      `SELECT id, lesson_id, title_en, title_ar, kind, storage_bucket, storage_path, external_url, mime_type, size_bytes, pages, sort_order
         FROM ${T.lesson_resources} WHERE lesson_id = ANY($1::uuid[]) ORDER BY lesson_id, sort_order, created_at`,
      [lessonIds],
      ex,
    );
  },
  resource(lessonId: string, resourceId: string, ex?: Executor) {
    return db.maybeOne<ResourceRow>(
      `SELECT id, lesson_id, title_en, title_ar, kind, storage_bucket, storage_path, external_url, mime_type, size_bytes, pages, sort_order
         FROM ${T.lesson_resources} WHERE lesson_id = $1 AND id = $2`,
      [lessonId, resourceId],
      ex,
    );
  },
  captions(lessonIds: string[], ex?: Executor) {
    return db.many<CaptionRow>(
      `SELECT id, lesson_id, lang, label_en, label_ar, storage_bucket, storage_path, external_url FROM ${T.lesson_caption_tracks} WHERE lesson_id = ANY($1::uuid[]) ORDER BY lang`,
      [lessonIds],
      ex,
    );
  },
  video(id: string, ex?: Executor) {
    return db.maybeOne<VideoRow>(`SELECT * FROM ${T.video_assets} WHERE id = $1`, [id], ex);
  },

  teachers(f: { subjectId?: string; active?: boolean; ids?: string[] } = {}, ex?: Executor) {
    const conds = ['true'];
    const params: unknown[] = [];
    if (f.subjectId) {
      params.push(f.subjectId);
      conds.push(`t.subject_id = $${params.length}`);
    }
    if (f.active !== undefined) {
      params.push(f.active);
      conds.push(`t.active = $${params.length}`);
    }
    if (f.ids) {
      params.push(f.ids);
      conds.push(`t.id = ANY($${params.length}::uuid[])`);
    }
    return db.many<TeacherRow>(
      `SELECT t.id, t.slug, t.name_en, t.name_ar, t.bio_en, t.bio_ar, t.avatar_url, t.subject_id, s.slug AS subject_slug,
              t.years_experience, t.students_count, t.rating, t.active
         FROM ${T.teachers} t LEFT JOIN ${T.subjects} s ON s.id = t.subject_id
        WHERE ${conds.join(' AND ')} ORDER BY t.sort_order, t.name_en`,
      params,
      ex,
    );
  },

  note(userId: string, lessonId: string) {
    return db.maybeOne<{ body: string; updated_at: Date }>(`SELECT body, updated_at FROM ${T.lesson_notes} WHERE user_id = $1 AND lesson_id = $2`, [userId, lessonId]);
  },
  async saveNote(userId: string, lessonId: string, text: string) {
    if (!text.trim()) {
      await db.query(`DELETE FROM ${T.lesson_notes} WHERE user_id = $1 AND lesson_id = $2`, [userId, lessonId]);
      return null;
    }
    return db.one<{ body: string; updated_at: Date }>(
      `INSERT INTO ${T.lesson_notes} (user_id, lesson_id, body) VALUES ($1,$2,$3)
       ON CONFLICT (user_id, lesson_id) DO UPDATE SET body = EXCLUDED.body, updated_at = now() RETURNING body, updated_at`,
      [userId, lessonId, text],
    );
  },

  bestQuizScore(userId: string, lessonId: string) {
    return db.scalar<number | null>(`SELECT max(score) FROM ${T.quiz_attempts} WHERE user_id = $1 AND lesson_id = $2 AND status IN ('passed','failed')`, [userId, lessonId]);
  },
};
