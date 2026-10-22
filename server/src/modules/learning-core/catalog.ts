/**
 * Shared catalog lookups for the learning modules (subjects by uuid|slug, lesson basics, student progress sets).
 */
import { T } from '../../config/constants.js';
import { db, type Executor } from '../../config/db.js';
import { NotFoundError } from '../../common/errors/index.js';
import type { Localized } from '../../common/i18n/index.js';

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: string | null | undefined): v is string => !!v && UUID_RE.test(v);

export interface SubjectBasic {
  id: string;
  slug: string;
  name_en: string;
  name_ar: string;
  color: string;
  status: 'active' | 'hidden';
  sequential_unlock: boolean;
  sort_order: number;
}

export const subjectRefOf = (s: Pick<SubjectBasic, 'id' | 'slug' | 'name_en' | 'name_ar' | 'color'>) => ({ id: s.id, slug: s.slug, name: { en: s.name_en, ar: s.name_ar } as Localized, color: s.color });

/** Subject by uuid or slug (non-deleted). */
export async function findSubject(idOrSlug: string, ex?: Executor): Promise<SubjectBasic | null> {
  return db.maybeOne<SubjectBasic>(
    `SELECT id, slug, name_en, name_ar, color, status, sequential_unlock, sort_order FROM ${T.subjects}
      WHERE deleted_at IS NULL AND ${isUuid(idOrSlug) ? 'id = $1::uuid' : 'slug = $1'}`,
    [idOrSlug],
    ex,
  );
}

export async function requireSubject(idOrSlug: string, ex?: Executor): Promise<SubjectBasic> {
  const s = await findSubject(idOrSlug, ex);
  if (!s) throw new NotFoundError('subject');
  return s;
}

/** Optional subject filter → uuid (404 when the given id/slug does not exist). */
export async function subjectIdFilter(idOrSlug: string | undefined | null): Promise<string | undefined> {
  if (!idOrSlug) return undefined;
  return (await requireSubject(idOrSlug)).id;
}

export async function allSubjects(ex?: Executor): Promise<SubjectBasic[]> {
  return db.many<SubjectBasic>(`SELECT id, slug, name_en, name_ar, color, status, sequential_unlock, sort_order FROM ${T.subjects} WHERE deleted_at IS NULL ORDER BY sort_order, name_en`, [], ex);
}

/** Published, non-deleted lesson predicate for alias `l`. */
export const LESSON_LIVE = `l.deleted_at IS NULL AND l.status = 'published'`;

export async function completedLessonIds(userId: string, ex?: Executor): Promise<Set<string>> {
  const rows = await db.many<{ lesson_id: string }>(`SELECT lesson_id FROM ${T.lesson_completions} WHERE user_id = $1`, [userId], ex);
  return new Set(rows.map((r) => r.lesson_id));
}

export interface WatchRow {
  lesson_id: string;
  position_sec: number;
  duration_sec: number;
  percent: number;
  completed: boolean;
  updated_at: Date;
}

export async function watchMap(userId: string, lessonIds?: string[], ex?: Executor): Promise<Map<string, WatchRow>> {
  const rows = await db.many<WatchRow>(
    `SELECT lesson_id, position_sec, duration_sec, percent, completed, updated_at FROM ${T.watch_progress}
      WHERE user_id = $1 ${lessonIds ? 'AND lesson_id = ANY($2::uuid[])' : ''}`,
    lessonIds ? [userId, lessonIds] : [userId],
    ex,
  );
  return new Map(rows.map((r) => [r.lesson_id, r]));
}

export async function bookmarkedQuestionIds(userId: string, ex?: Executor): Promise<Set<string>> {
  const rows = await db.many<{ entity_id: string }>(`SELECT entity_id FROM ${T.bookmarks} WHERE user_id = $1 AND entity_type = 'question'`, [userId], ex);
  return new Set(rows.map((r) => r.entity_id));
}

/** Student display name (share cards, greetings). */
export async function studentName(userId: string): Promise<{ name: Localized; firstName: Localized }> {
  const r = await db.maybeOne<{ name_en: string; name_ar: string; first_name_en: string | null; first_name_ar: string | null }>(
    `SELECT u.name_en, u.name_ar, sp.first_name_en, sp.first_name_ar FROM ${T.users} u LEFT JOIN ${T.student_profiles} sp ON sp.user_id = u.id WHERE u.id = $1`,
    [userId],
  );
  const en = r?.name_en ?? '';
  const ar = r?.name_ar || en;
  const first = (s: string) => s.trim().split(/\s+/)[0] ?? '';
  return { name: { en, ar }, firstName: { en: r?.first_name_en || first(en), ar: r?.first_name_ar || first(ar) } };
}

/** Student's current client platform as stored on attempts (web|ios|android). */
export const platformOf = (p: string | null | undefined): 'web' | 'ios' | 'android' | null => (p === 'web' || p === 'ios' || p === 'android' ? p : null);
