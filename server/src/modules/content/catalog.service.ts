/**
 * Student catalog (CAT-01…09): subjects, subject detail, lesson detail, signed stream/resource URLs, notes.
 * Entitlement-gated surfaces use the foundation engine (402/403 + locked payload).
 */
import { T } from '../../config/constants.js';
import { db } from '../../config/db.js';
import { entitlements, evaluateSubjectAccess, type AccessDecision, type EntitlementRecord } from '../../common/entitlements.js';
import { NotFoundError } from '../../common/errors/index.js';
import type { Localized } from '../../common/i18n/index.js';
import { settingsStore } from '../../common/services/settings-store.js';
import { storage } from '../../common/services/storage.js';
import {
  bookmarkedQuestionIds,
  completedLessonIds,
  lessonLock,
  loadQuestions,
  ruleError,
  sizeLabel,
  toPublic,
  watchMap,
  type LessonLockReason,
  type QuestionPublic,
  type WatchRow,
} from '../learning-core/index.js';
import { effectiveQuizRuleDto, lessonPool } from '../quizzes/engine.js';
import { contentRepo, type CatalogLessonRow, type ResourceRow, type SubjectRow } from './repository.js';
import type { LessonDetail, LessonSummary, StreamUrlDto, StudentResource, SubjectDetail, SubjectSummary } from './types.js';

const round1 = (n: number) => Math.round(n * 10) / 10;

interface Viewer {
  userId: string;
  records: EntitlementRecord[];
  completed: Set<string>;
  watch: Map<string, WatchRow>;
}

async function viewer(userId: string | undefined): Promise<Viewer | null> {
  if (!userId) return null;
  const [records, completed, watch] = await Promise.all([entitlements.list(userId), completedLessonIds(userId), watchMap(userId)]);
  return { userId, records, completed, watch };
}

const accessOf = (v: Viewer | null, subjectId: string): AccessDecision | null => (v ? evaluateSubjectAccess(v.records, subjectId) : null);

/** Lesson summaries for one subject's ordered lesson rows (locks, progress, flattened order). */
async function summarize(rows: CatalogLessonRow[], v: Viewer | null, sequentialBySubject: Map<string, boolean>): Promise<LessonSummary[]> {
  const thumbs = await storage.resolveMany(rows.map((r) => r.thumbnail_url));
  const liveIds = new Set(rows.map((r) => r.id));
  const counter = new Map<string, number>();
  const prevBySubject = new Map<string, string>();
  return rows.map((r, i) => {
    const order = (counter.get(r.subject_id) ?? 0) + 1;
    counter.set(r.subject_id, order);
    const prev = prevBySubject.get(r.subject_id) ?? null;
    prevBySubject.set(r.subject_id, r.id);
    const done = v?.completed.has(r.id) ?? false;
    const w = v?.watch.get(r.id);
    const lock = lessonLock({
      access: accessOf(v, r.subject_id),
      freePreview: r.is_free_preview,
      prerequisiteDone: r.prerequisite_lesson_id && liveIds.has(r.prerequisite_lesson_id) ? (v?.completed.has(r.prerequisite_lesson_id) ?? false) : null,
      previousDone: sequentialBySubject.get(r.subject_id) && prev ? (v?.completed.has(prev) ?? false) : null,
    });
    return {
      id: r.id,
      subjectId: r.subject_id,
      subjectSlug: r.subject_slug,
      unitId: r.unit_id,
      chapterId: r.topic_id ?? '',
      topicId: r.topic_id ?? '',
      order,
      title: { en: r.title_en, ar: r.title_ar },
      description: { en: r.description_en, ar: r.description_ar },
      duration: r.duration_sec,
      thumbnail: thumbs[i] ?? '',
      teacher: { en: r.teacher_name_en ?? '', ar: r.teacher_name_ar ?? r.teacher_name_en ?? '' },
      teacherRef: r.teacher_id ? { id: r.teacher_id, name: { en: r.teacher_name_en ?? '', ar: r.teacher_name_ar ?? '' }, avatarUrl: r.teacher_avatar_url } : null,
      locked: lock.locked,
      lockReason: lock.lockReason as LessonLockReason | null,
      status: done ? 'completed' : w ? 'in-progress' : 'not-started',
      progress: done ? 100 : (w?.percent ?? 0),
      positionSec: w?.position_sec ?? 0,
    };
  });
}

async function toSummaries(subjects: SubjectRow[], v: Viewer | null): Promise<SubjectSummary[]> {
  const images = await storage.resolveMany(subjects.map((s) => s.image_url));
  const avatars = await storage.resolveMany(subjects.map((s) => s.t_avatar_url));
  let lessonsBySubject = new Map<string, CatalogLessonRow[]>();
  if (v) {
    const rows = await contentRepo.catalogLessons({ subjectIds: subjects.map((s) => s.id) });
    lessonsBySubject = rows.reduce((m, r) => m.set(r.subject_id, [...(m.get(r.subject_id) ?? []), r]), new Map<string, CatalogLessonRow[]>());
  }
  return subjects.map((s, i) => {
    let progress: SubjectSummary['progress'] = null;
    if (v) {
      const ls = lessonsBySubject.get(s.id) ?? [];
      const completed = ls.filter((l) => v.completed.has(l.id)).length;
      const sum = ls.reduce((acc, l) => acc + (v.completed.has(l.id) ? 100 : (v.watch.get(l.id)?.percent ?? 0)), 0);
      progress = { completed, total: ls.length, pct: ls.length ? Math.round((completed / ls.length) * 100) : 0, avgPct: ls.length ? Math.round(sum / ls.length) : 0 };
    }
    return {
      id: s.id,
      slug: s.slug,
      name: { en: s.name_en, ar: s.name_ar },
      tagline: { en: s.tagline_en, ar: s.tagline_ar },
      description: { en: s.description_en, ar: s.description_ar },
      color: s.color,
      image: images[i] ?? '',
      icon: s.icon,
      lessonsCount: s.lessons_count,
      hours: round1(s.total_sec / 3600),
      questionsCount: s.questions_count,
      examsCount: s.exams_count,
      teacher: { en: s.t_name_en ?? s.teacher_name_en, ar: s.t_name_ar ?? s.teacher_name_ar },
      teacherRef: s.t_id ? { id: s.t_id, name: { en: s.t_name_en ?? '', ar: s.t_name_ar ?? '' }, avatarUrl: avatars[i] ?? null } : null,
      order: s.sort_order,
      sequentialUnlock: s.sequential_unlock,
      locked: v ? !evaluateSubjectAccess(v.records, s.id).allowed : null,
      progress,
    };
  });
}

function resourceDto(r: ResourceRow): StudentResource {
  return { id: r.id, title: { en: r.title_en, ar: r.title_ar }, size: sizeLabel(Number(r.size_bytes)), sizeBytes: Number(r.size_bytes), pages: r.pages, mimeType: r.mime_type ?? 'application/pdf' };
}

async function liveLesson(idOrSlug: string): Promise<CatalogLessonRow & { subject: SubjectRow }> {
  const ref = await contentRepo.lessonId(idOrSlug);
  if (!ref || ref.deleted_at || ref.status !== 'published') throw new NotFoundError('lesson');
  const subject = await contentRepo.subject(ref.subject_id);
  if (!subject) throw new NotFoundError('lesson');
  const [row] = await contentRepo.catalogLessons({ lessonIds: [ref.id] });
  if (!row) throw new NotFoundError('lesson');
  return { ...row, subject };
}

/** Lock state of one lesson for a student (computed against the full subject sequence). */
async function lessonContext(idOrSlug: string, userId: string) {
  const lesson = await liveLesson(idOrSlug);
  const v = await viewer(userId);
  const rows = await contentRepo.catalogLessons({ subjectIds: [lesson.subject_id] });
  const summaries = await summarize(rows, v, new Map([[lesson.subject_id, lesson.subject.sequential_unlock]]));
  const idx = summaries.findIndex((s) => s.id === lesson.id);
  return { lesson, v: v as Viewer, rows, summaries, idx, summary: summaries[idx] as LessonSummary };
}

/** Throws 402/403 (entitlement) or 422 (prerequisite / sequential) when the student may not consume the lesson. */
export async function assertLessonUnlocked(idOrSlug: string, userId: string) {
  const ctx = await lessonContext(idOrSlug, userId);
  const { lesson, summary } = ctx;
  if (!lesson.is_free_preview) await entitlements.assertAccess(userId, lesson.subject_id, { feature: 'lesson' });
  if (summary.lockReason === 'PREREQUISITE') throw ruleError('PREREQUISITE_NOT_MET', { prerequisiteLessonId: lesson.prerequisite_lesson_id });
  if (summary.lockReason === 'SEQUENTIAL') throw ruleError('SEQUENTIAL_LOCK', { previousLessonId: ctx.summaries[ctx.idx - 1]?.id ?? null });
  return ctx;
}

/** Lesson summaries for the given subjects as seen by a student (used by progress/dashboard/search). */
export async function lessonSummariesFor(userId: string | undefined, subjectIds?: string[]): Promise<LessonSummary[]> {
  const v = await viewer(userId);
  const rows = await contentRepo.catalogLessons(subjectIds ? { subjectIds } : {});
  const subjects = await contentRepo.subjects({ includeHidden: true, ids: [...new Set(rows.map((r) => r.subject_id))] });
  return summarize(rows, v, new Map(subjects.map((s) => [s.id, s.sequential_unlock])));
}

export const catalogService = {
  async subjects(userId?: string): Promise<SubjectSummary[]> {
    const [subjects, v] = await Promise.all([contentRepo.subjects(), viewer(userId)]);
    return toSummaries(subjects, v);
  },

  async subjectDetail(idOrSlug: string, userId?: string): Promise<SubjectDetail> {
    const s = await contentRepo.subject(idOrSlug);
    if (!s || s.status !== 'active') throw new NotFoundError('subject');
    const v = await viewer(userId);
    const [summary] = await toSummaries([s], v);
    const [units, topics, rows] = await Promise.all([contentRepo.units(s.id), contentRepo.topicsOfSubject(s.id), contentRepo.catalogLessons({ subjectIds: [s.id] })]);
    const lessons = await summarize(rows, v, new Map([[s.id, s.sequential_unlock]]));
    const next = lessons.find((l) => l.status === 'in-progress') ?? lessons.find((l) => l.status === 'not-started') ?? lessons[0];
    return {
      ...(summary as SubjectSummary),
      units: units.map((u, i) => ({
        id: u.id,
        title: { en: u.title_en, ar: u.title_ar },
        order: i + 1,
        chapters: topics.filter((t) => t.unit_id === u.id).map((t) => ({ id: t.id, title: { en: t.title_en, ar: t.title_ar } })),
      })),
      lessons,
      nextLessonId: next?.id ?? null,
    };
  },

  async questionStats(idOrSlug: string, userId: string) {
    const s = await contentRepo.subject(idOrSlug);
    if (!s) throw new NotFoundError('subject');
    const rows = await db.many<{ unit_id: string | null; title_en: string | null; title_ar: string | null; sort_order: number | null; difficulty: 'easy' | 'medium' | 'hard'; n: number }>(
      `SELECT q.unit_id, u.title_en, u.title_ar, u.sort_order, q.difficulty, count(*)::int AS n
         FROM ${T.questions} q LEFT JOIN ${T.units} u ON u.id = q.unit_id
        WHERE q.subject_id = $1 AND q.status = 'published' AND q.deleted_at IS NULL
        GROUP BY q.unit_id, u.title_en, u.title_ar, u.sort_order, q.difficulty ORDER BY u.sort_order NULLS LAST`,
      [s.id],
    );
    const byDifficulty = { easy: 0, medium: 0, hard: 0 };
    const units = new Map<string, { unitId: string; title: Localized; order: number; total: number; easy: number; medium: number; hard: number }>();
    for (const r of rows) {
      byDifficulty[r.difficulty] += r.n;
      const key = r.unit_id ?? '';
      const u = units.get(key) ?? { unitId: key, title: { en: r.title_en ?? '', ar: r.title_ar ?? '' }, order: r.sort_order ?? 0, total: 0, easy: 0, medium: 0, hard: 0 };
      u.total += r.n;
      u[r.difficulty] += r.n;
      units.set(key, u);
    }
    const sampleIds = await db.many<{ id: string }>(
      `SELECT id FROM ${T.questions} WHERE subject_id = $1 AND status = 'published' AND deleted_at IS NULL AND type <> 'fill_blank' ORDER BY md5(id::text || current_date::text) LIMIT 3`,
      [s.id],
    );
    const loaded = await loadQuestions(sampleIds.map((x) => x.id));
    const bm = await bookmarkedQuestionIds(userId);
    const locked = !(await entitlements.check(userId, s.id)).allowed;
    const samples: QuestionPublic[] = sampleIds.map((x) => loaded.get(x.id)).filter((q) => !!q).map((q) => toPublic(q!, { bookmarked: bm.has(q!.row.id), locked }));
    return { total: byDifficulty.easy + byDifficulty.medium + byDifficulty.hard, byDifficulty, byUnit: [...units.values()].sort((a, b) => a.order - b.order), samples };
  },

  async lessonDetail(idOrSlug: string, userId: string): Promise<LessonDetail> {
    const { lesson, v, summaries, idx, summary } = await lessonContext(idOrSlug, userId);
    const unitLessons = summaries.filter((l) => l.unitId === lesson.unit_id);
    const units = await contentRepo.units(lesson.subject_id);
    const resources = summary.locked ? [] : (await contentRepo.resources([lesson.id])).map(resourceDto);
    const [rule, poolIds, note, best] = await Promise.all([
      effectiveQuizRuleDto({ id: lesson.id, subject_id: lesson.subject_id }, userId),
      lessonPool({ id: lesson.id, subject_id: lesson.subject_id, unit_id: lesson.unit_id, topic_id: lesson.topic_id }, 200),
      contentRepo.note(userId, lesson.id),
      contentRepo.bestQuizScore(userId, lesson.id),
    ]);
    const prereqLive = lesson.prerequisite_lesson_id && summaries.some((s) => s.id === lesson.prerequisite_lesson_id) ? lesson.prerequisite_lesson_id : null;
    return {
      ...summary,
      videoUrl: null,
      hasVideo: lesson.stream_status === 'ready',
      resources,
      completionThreshold: lesson.completion_threshold,
      prerequisiteId: prereqLive,
      unitTitle: { en: lesson.unit_title_en, ar: lesson.unit_title_ar },
      unitIndex: Math.max(1, units.findIndex((u) => u.id === lesson.unit_id) + 1),
      prevLessonId: summaries[idx - 1]?.id ?? null,
      nextLessonId: summaries[idx + 1]?.id ?? null,
      unitProgress: { done: unitLessons.filter((l) => v.completed.has(l.id)).length, total: unitLessons.length },
      bestQuizScore: best === null || best === undefined ? null : Number(best),
      quiz: { available: poolIds.length > 0, questionCount: Math.min(rule.questionCount, poolIds.length), estimatedMinutes: rule.estimatedMinutes, passThreshold: rule.passThreshold },
      note: note?.body ?? '',
    };
  },

  async streamUrl(idOrSlug: string, userId: string): Promise<StreamUrlDto> {
    const { lesson, v, summary } = await assertLessonUnlocked(idOrSlug, userId);
    if (!lesson.video_asset_id) throw new NotFoundError('video');
    const va = await contentRepo.video(lesson.video_asset_id);
    if (!va || va.stream_status !== 'ready') throw new NotFoundError('video');
    const learning = await settingsStore.get('learning');
    const ttl = 3600 * 3;
    let url: string;
    let type: 'hls' | 'mp4';
    if (va.provider === 'external') {
      url = va.source_url ?? '';
      type = /\.m3u8(\?|$)/i.test(url) ? 'hls' : 'mp4';
    } else if (va.hls_path && va.storage_bucket) {
      url = (await storage.signedUrl(va.storage_bucket, va.hls_path, ttl)).url;
      type = 'hls';
    } else if (va.storage_bucket && va.storage_path) {
      url = (await storage.signedUrl(va.storage_bucket, va.storage_path, ttl)).url;
      type = 'mp4';
    } else throw new NotFoundError('video');
    const caps = await contentRepo.captions([lesson.id]);
    const captions = [];
    for (const c of caps) {
      const capUrl = c.external_url ?? (c.storage_bucket && c.storage_path ? (await storage.signedUrl(c.storage_bucket, c.storage_path, ttl)).url : null);
      if (capUrl) captions.push({ lang: c.lang, label: { en: c.label_en || (c.lang === 'ar' ? 'Arabic' : 'English'), ar: c.label_ar || (c.lang === 'ar' ? 'العربية' : 'الإنجليزية') }, url: capUrl });
    }
    const replay = v.completed.has(lesson.id);
    await db.query(`UPDATE ${T.video_assets} SET views = views + 1, replays = replays + $2 WHERE id = $1`, [va.id, replay ? 1 : 0]);
    await db.query(`UPDATE ${T.lessons} SET views_count = views_count + 1 WHERE id = $1`, [lesson.id]);
    return {
      url,
      type,
      expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
      renditions: [],
      captions,
      poster: summary.thumbnail,
      durationSec: va.duration_sec || lesson.duration_sec,
      resumePositionSec: summary.status === 'completed' ? 0 : summary.positionSec,
      heartbeatSeconds: learning.watchHeartbeatSeconds,
    };
  },

  async resourceUrl(idOrSlug: string, resourceId: string, userId: string) {
    const { lesson } = await assertLessonUnlocked(idOrSlug, userId);
    const r = await contentRepo.resource(lesson.id, resourceId);
    if (!r) throw new NotFoundError('file');
    const fileName = `${(r.title_en || 'resource').replace(/[^A-Za-z0-9._-]+/g, '-')}.pdf`;
    let url: string;
    let expiresAt: string;
    if (r.storage_bucket && r.storage_path) ({ url, expiresAt } = await storage.signedUrl(r.storage_bucket, r.storage_path, undefined, fileName));
    else if (r.external_url) {
      url = r.external_url;
      expiresAt = new Date(Date.now() + 3600_000).toISOString();
    } else throw new NotFoundError('file');
    await db.query(`UPDATE ${T.lesson_resources} SET downloads = downloads + 1 WHERE id = $1`, [r.id]);
    return { url, expiresAt, fileName, mimeType: r.mime_type ?? 'application/pdf', sizeBytes: Number(r.size_bytes) };
  },

  async note(idOrSlug: string, userId: string) {
    const lesson = await liveLesson(idOrSlug);
    const n = await contentRepo.note(userId, lesson.id);
    return { lessonId: lesson.id, text: n?.body ?? '', updatedAt: n?.updated_at.toISOString() ?? null };
  },

  async saveNote(idOrSlug: string, userId: string, text: string) {
    const lesson = await liveLesson(idOrSlug);
    const n = await contentRepo.saveNote(userId, lesson.id, text);
    return { lessonId: lesson.id, text: n?.body ?? '', updatedAt: n ? n.updated_at.toISOString() : new Date().toISOString() };
  },
};
