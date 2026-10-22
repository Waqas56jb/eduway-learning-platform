/**
 * Progress & dashboard (PRG-01…13): watch heartbeat upsert, completion, dashboard composite, subject progress,
 * summary, score trend, weak topics, streak calendar, activity feed, today plan, achievements.
 * Day boundaries use the platform timezone (Asia/Baghdad) unless `tzOffsetMinutes` is given. Weeks start Saturday.
 */
import { randomUUID } from 'node:crypto';
import { T } from '../../config/constants.js';
import { db, tx, type Executor } from '../../config/db.js';
import { entitlements, evaluateSubjectAccess } from '../../common/entitlements.js';
import { NotFoundError } from '../../common/errors/index.js';
import type { Localized } from '../../common/i18n/index.js';
import { settingsStore } from '../../common/services/settings-store.js';
import { aiAllowance, mySubscription } from '../../common/services/student-summary.js';
import { decodeCursor, encodeCursor } from '../../common/utils/pagination.js';
import { BUSINESS_TZ, dayjs } from '../../common/utils/dates.js';
import {
  displayStreak,
  evaluateAchievements,
  findSubject,
  getStreak,
  heatLevel,
  isUuid,
  nextWatchProgress,
  recordActivity,
  reevaluateAchievementsLater,
  studentName,
  type WatchEvent,
} from '../learning-core/index.js';
import { lessonSummariesFor, type LessonSummary } from '../content/index.js';
import { examsService } from '../exams/index.js';

export interface LessonProgressDto {
  lessonId: string;
  status: 'completed' | 'in-progress' | 'not-started';
  progress: number;
  positionSec: number;
  completedAt: string | null;
  justCompleted: boolean;
}

const DAY_NAMES: Localized[] = [
  { en: 'Sat', ar: 'السبت' },
  { en: 'Sun', ar: 'الأحد' },
  { en: 'Mon', ar: 'الاثنين' },
  { en: 'Tue', ar: 'الثلاثاء' },
  { en: 'Wed', ar: 'الأربعاء' },
  { en: 'Thu', ar: 'الخميس' },
  { en: 'Fri', ar: 'الجمعة' },
];

/** "Today" (YYYY-MM-DD) in the platform tz or a client offset. */
export function todayStr(tzOffsetMinutes?: number, now = new Date()): string {
  if (tzOffsetMinutes !== undefined) return new Date(now.getTime() + tzOffsetMinutes * 60_000).toISOString().slice(0, 10);
  return dayjs(now).tz(BUSINESS_TZ).format('YYYY-MM-DD');
}
const addDaysStr = (d: string, n: number) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
/** Saturday-based weekday index (0 = Sat … 6 = Fri). */
export const satIndex = (d: string) => (new Date(`${d}T00:00:00Z`).getUTCDay() + 1) % 7;
export const weekStartOf = (d: string) => addDaysStr(d, -satIndex(d));
const round1 = (n: number) => Math.round(n * 10) / 10;

async function lessonForProgress(lessonIdOrSlug: string) {
  const l = await db.maybeOne<{ id: string; subject_id: string; duration_sec: number; completion_threshold: number; is_free_preview: boolean; status: string; deleted_at: Date | null }>(
    `SELECT id, subject_id, duration_sec, completion_threshold, is_free_preview, status, deleted_at FROM ${T.lessons} WHERE ${isUuid(lessonIdOrSlug) ? 'id = $1::uuid' : 'slug = $1'}`,
    [lessonIdOrSlug],
  );
  if (!l || l.deleted_at || l.status !== 'published') throw new NotFoundError('lesson');
  return l;
}

async function markCompleted(userId: string, lessonId: string, source: 'watch' | 'manual', platform: string | null, ex: Executor): Promise<boolean> {
  const ins = await db.query(`INSERT INTO ${T.lesson_completions} (user_id, lesson_id, source) VALUES ($1,$2,$3) ON CONFLICT (user_id, lesson_id) DO NOTHING`, [userId, lessonId, source], ex);
  await db.query(
    `INSERT INTO ${T.watch_progress} (user_id, lesson_id, percent, completed, platform) VALUES ($1,$2,100,true,$3)
     ON CONFLICT (user_id, lesson_id) DO UPDATE SET percent = 100, completed = true`,
    [userId, lessonId, platform === 'web' || platform === 'ios' || platform === 'android' ? platform : null],
    ex,
  );
  if (ins.rowCount) await recordActivity(userId, { lessonsCompleted: 1 }, platform, ex);
  return !!ins.rowCount;
}

async function progressDto(userId: string, lessonId: string, justCompleted: boolean): Promise<LessonProgressDto> {
  const r = await db.maybeOne<{ position_sec: number; percent: number; completed: boolean; completed_at: Date | null }>(
    `SELECT w.position_sec, w.percent, w.completed, c.completed_at FROM ${T.watch_progress} w
       LEFT JOIN ${T.lesson_completions} c ON c.user_id = w.user_id AND c.lesson_id = w.lesson_id
      WHERE w.user_id = $1 AND w.lesson_id = $2`,
    [userId, lessonId],
  );
  const done = !!r?.completed_at || !!r?.completed;
  return { lessonId, status: done ? 'completed' : r ? 'in-progress' : 'not-started', progress: done ? 100 : (r?.percent ?? 0), positionSec: r?.position_sec ?? 0, completedAt: r?.completed_at?.toISOString() ?? null, justCompleted };
}

async function quizAverage(userId: string, sinceDays?: number): Promise<number | null> {
  const v = await db.scalar<number | null>(
    `SELECT avg(score) FROM ${T.quiz_attempts} WHERE user_id = $1 AND status IN ('passed','failed') ${sinceDays ? `AND submitted_at >= now() - make_interval(days => ${Math.round(sinceDays)})` : ''}`,
    [userId],
  );
  return v === null || v === undefined ? null : Math.round(Number(v));
}

async function dailyRows(userId: string, from: string, to: string) {
  return db.many<{ d: string; minutes: number; questions: number }>(
    `SELECT activity_date::text AS d, minutes, questions_answered AS questions FROM ${T.daily_activity} WHERE user_id = $1 AND activity_date BETWEEN $2::date AND $3::date`,
    [userId, from, to],
  );
}

export interface SubjectProgressDto {
  subjectId: string;
  slug: string;
  name: Localized;
  color: string;
  completed: number;
  total: number;
  pct: number;
  avgPct: number;
  quizAverage: number | null;
  mastery: number | null;
  studyMinutes: number;
  locked: boolean;
}

export const progressService = {
  async watch(userId: string, b: { lessonId: string; positionSec: number; durationSec: number; event: WatchEvent; watchedSecDelta?: number; platform?: string }, platformHeader: string | null): Promise<LessonProgressDto> {
    const lesson = await lessonForProgress(b.lessonId);
    if (!lesson.is_free_preview) await entitlements.assertAccess(userId, lesson.subject_id, { feature: 'lesson' });
    const learning = await settingsStore.get('learning');
    const platform = b.platform ?? platformHeader;
    const delta = Math.max(0, Math.min(b.watchedSecDelta ?? 0, learning.watchHeartbeatSeconds * 2));
    const duration = b.durationSec > 0 ? b.durationSec : lesson.duration_sec;
    const just = await tx(async (c) => {
      const prev = await db.maybeOne<{ percent: number; completed: boolean }>(`SELECT percent, completed FROM ${T.watch_progress} WHERE user_id = $1 AND lesson_id = $2 FOR UPDATE`, [userId, lesson.id], c);
      const done = !!prev?.completed || !!(await db.scalar<number>(`SELECT count(*)::int FROM ${T.lesson_completions} WHERE user_id = $1 AND lesson_id = $2`, [userId, lesson.id], c));
      const next = nextWatchProgress(prev ? { progress: prev.percent, completed: done } : null, b.positionSec, duration, b.event, lesson.completion_threshold);
      await db.query(
        `INSERT INTO ${T.watch_progress} (user_id, lesson_id, position_sec, duration_sec, watched_sec, percent, completed, platform, device_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULL)
         ON CONFLICT (user_id, lesson_id) DO UPDATE SET position_sec = EXCLUDED.position_sec, duration_sec = EXCLUDED.duration_sec,
           watched_sec = ${T.watch_progress}.watched_sec + EXCLUDED.watched_sec, percent = GREATEST(${T.watch_progress}.percent, EXCLUDED.percent),
           completed = ${T.watch_progress}.completed OR EXCLUDED.completed, platform = COALESCE(EXCLUDED.platform, ${T.watch_progress}.platform)`,
        [userId, lesson.id, Math.max(0, Math.round(b.positionSec)), Math.round(duration), Math.round(delta), next.progress, next.completed, platform === 'web' || platform === 'ios' || platform === 'android' ? platform : null],
        c,
      );
      await db.query(`UPDATE ${T.student_profiles} SET last_lesson_id = $2 WHERE user_id = $1`, [userId, lesson.id], c);
      if (delta > 0) {
        const today = todayStr();
        const before = (await db.scalar<number>(`SELECT watch_seconds FROM ${T.daily_activity} WHERE user_id = $1 AND activity_date = $2::date`, [userId, today], c)) ?? 0;
        const minutes = Math.floor((before + delta) / 60) - Math.floor(before / 60);
        await recordActivity(userId, { watchSeconds: delta, minutes }, platform, c);
      }
      return next.justCompleted && !done ? await markCompleted(userId, lesson.id, 'watch', platform, c) : false;
    });
    if (just) reevaluateAchievementsLater(userId);
    return progressDto(userId, lesson.id, just);
  },

  async complete(userId: string, lessonId: string, platform: string | null): Promise<LessonProgressDto> {
    const lesson = await lessonForProgress(lessonId);
    if (!lesson.is_free_preview) await entitlements.assertAccess(userId, lesson.subject_id, { feature: 'lesson' });
    const just = await tx((c) => markCompleted(userId, lesson.id, 'manual', platform, c));
    if (just) reevaluateAchievementsLater(userId);
    return progressDto(userId, lesson.id, just);
  },

  async lessons(userId: string, subjectIdOrSlug?: string): Promise<LessonProgressDto[]> {
    let subjectId: string | undefined;
    if (subjectIdOrSlug) {
      const s = await findSubject(subjectIdOrSlug);
      if (!s) throw new NotFoundError('subject');
      subjectId = s.id;
    }
    const rows = await db.many<{ lesson_id: string; position_sec: number | null; percent: number | null; completed: boolean | null; completed_at: Date | null }>(
      `SELECT l.id AS lesson_id, w.position_sec, w.percent, w.completed, c.completed_at
         FROM ${T.lessons} l
         LEFT JOIN ${T.watch_progress} w ON w.lesson_id = l.id AND w.user_id = $1
         LEFT JOIN ${T.lesson_completions} c ON c.lesson_id = l.id AND c.user_id = $1
        WHERE (w.id IS NOT NULL OR c.id IS NOT NULL) AND l.deleted_at IS NULL ${subjectId ? 'AND l.subject_id = $2' : ''}`,
      subjectId ? [userId, subjectId] : [userId],
    );
    return rows.map((r) => {
      const done = !!r.completed_at || !!r.completed;
      return { lessonId: r.lesson_id, status: done ? 'completed' : 'in-progress', progress: done ? 100 : (r.percent ?? 0), positionSec: r.position_sec ?? 0, completedAt: r.completed_at?.toISOString() ?? null, justCompleted: false };
    });
  },

  async subjects(userId: string, lessons?: LessonSummary[]): Promise<SubjectProgressDto[]> {
    const all = lessons ?? (await lessonSummariesFor(userId));
    const subjects = await db.many<{ id: string; slug: string; name_en: string; name_ar: string; color: string }>(`SELECT id, slug, name_en, name_ar, color FROM ${T.subjects} WHERE deleted_at IS NULL AND status = 'active' ORDER BY sort_order`);
    const quiz = await db.many<{ subject_id: string; avg: number }>(
      `SELECT l.subject_id, avg(a.score) AS avg FROM ${T.quiz_attempts} a JOIN ${T.lessons} l ON l.id = a.lesson_id WHERE a.user_id = $1 AND a.status IN ('passed','failed') GROUP BY l.subject_id`,
      [userId],
    );
    const mastery = await db.many<{ subject_id: string; answered: number; correct: number }>(
      `SELECT q.subject_id, count(*)::int AS answered, count(*) FILTER (WHERE pa.is_correct)::int AS correct
         FROM ${T.practice_answers} pa JOIN ${T.practice_sessions} ps ON ps.id = pa.session_id JOIN ${T.questions} q ON q.id = pa.question_id
        WHERE ps.user_id = $1 GROUP BY q.subject_id`,
      [userId],
    );
    const minutes = await db.many<{ subject_id: string; sec: number }>(
      `SELECT l.subject_id, sum(w.watched_sec)::int AS sec FROM ${T.watch_progress} w JOIN ${T.lessons} l ON l.id = w.lesson_id WHERE w.user_id = $1 GROUP BY l.subject_id`,
      [userId],
    );
    const records = await entitlements.list(userId);
    return subjects.map((s) => {
      const ls = all.filter((l) => l.subjectId === s.id);
      const completed = ls.filter((l) => l.status === 'completed').length;
      const m = mastery.find((x) => x.subject_id === s.id);
      const q = quiz.find((x) => x.subject_id === s.id);
      return {
        subjectId: s.id,
        slug: s.slug,
        name: { en: s.name_en, ar: s.name_ar },
        color: s.color,
        completed,
        total: ls.length,
        pct: ls.length ? Math.round((completed / ls.length) * 100) : 0,
        avgPct: ls.length ? Math.round(ls.reduce((a, l) => a + l.progress, 0) / ls.length) : 0,
        quizAverage: q ? Math.round(Number(q.avg)) : null,
        mastery: m && m.answered ? Math.round((m.correct / m.answered) * 100) : null,
        studyMinutes: Math.round((minutes.find((x) => x.subject_id === s.id)?.sec ?? 0) / 60),
        locked: !evaluateSubjectAccess(records, s.id).allowed,
      };
    });
  },

  async weeklyStudy(userId: string, tzOffsetMinutes?: number) {
    const today = todayStr(tzOffsetMinutes);
    const weekStart = weekStartOf(today);
    const lastStart = addDaysStr(weekStart, -7);
    const rows = await dailyRows(userId, lastStart, addDaysStr(weekStart, 6));
    const by = new Map(rows.map((r) => [r.d, r]));
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = addDaysStr(weekStart, i);
      return { date: d, day: DAY_NAMES[i] as Localized, minutes: by.get(d)?.minutes ?? 0, questions: by.get(d)?.questions ?? 0 };
    });
    const totalMinutes = days.reduce((a, d) => a + d.minutes, 0);
    const lastWeekTotalMinutes = Array.from({ length: 7 }, (_, i) => by.get(addDaysStr(lastStart, i))?.minutes ?? 0).reduce((a, b) => a + b, 0);
    const elapsed = satIndex(today) + 1;
    return {
      weekStart,
      days,
      totalMinutes,
      dailyAverageMinutes: Math.round(totalMinutes / elapsed),
      lastWeekTotalMinutes,
      changePct: lastWeekTotalMinutes ? round1(((totalMinutes - lastWeekTotalMinutes) / lastWeekTotalMinutes) * 100) : null,
    };
  },

  async dashboard(userId: string, tzOffsetMinutes?: number) {
    const today = todayStr(tzOffsetMinutes);
    const [who, sub, streak, lessons, ai, unresolved, profile] = await Promise.all([
      studentName(userId),
      mySubscription(userId),
      getStreak(userId),
      lessonSummariesFor(userId),
      aiAllowance(userId),
      db.scalar<number>(`SELECT count(*)::int FROM ${T.mistake_records} WHERE user_id = $1 AND status = 'unresolved'`, [userId]),
      db.maybeOne<{ daily_goal_minutes: number; last_lesson_id: string | null }>(`SELECT daily_goal_minutes, last_lesson_id FROM ${T.student_profiles} WHERE user_id = $1`, [userId]),
    ]);
    const learning = await settingsStore.get('learning');
    const last7From = addDaysStr(today, -6);
    const recent = await dailyRows(userId, last7From, today);
    const activeSet = new Set(recent.filter((r) => r.minutes > 0 || r.questions > 0).map((r) => r.d));
    const lastWatched = profile?.last_lesson_id ?? (await db.scalar<string>(`SELECT lesson_id FROM ${T.watch_progress} WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1`, [userId]));
    const cont = lessons.find((l) => l.id === lastWatched && l.status !== 'completed') ?? lessons.find((l) => l.status === 'in-progress') ?? lessons.find((l) => l.status === 'not-started' && !l.locked) ?? null;
    let continueLesson = null;
    if (cont) {
      const s = await db.one<{ id: string; slug: string; name_en: string; name_ar: string; color: string }>(`SELECT id, slug, name_en, name_ar, color FROM ${T.subjects} WHERE id = $1`, [cont.subjectId]);
      continueLesson = { ...cont, subject: { id: s.id, slug: s.slug, name: { en: s.name_en, ar: s.name_ar }, color: s.color } };
    }
    const completed = lessons.filter((l) => l.status === 'completed').length;
    return {
      greetingName: who.firstName,
      subscription: {
        packageName: sub ? sub.package.name : null,
        daysRemaining: sub?.daysRemaining ?? 0,
        totalDays: sub?.totalDays ?? 0,
        status: sub?.status ?? 'none',
        endsAt: sub?.endsAt ?? null,
      },
      streak: { current: displayStreak(streak, today), longest: streak.longest, last7: Array.from({ length: 7 }, (_, i) => addDaysStr(last7From, i)).map((d) => ({ date: d, active: activeSet.has(d) })) },
      continueLesson,
      lessons: { completed, total: lessons.length, pct: lessons.length ? Math.round((completed / lessons.length) * 100) : 0 },
      quizAverage: await quizAverage(userId),
      latestWeekQuizAverage: await quizAverage(userId, 7),
      unresolvedMistakes: unresolved ?? 0,
      aiAllowance: ai,
      subjects: await this.subjects(userId, lessons),
      weeklyStudy: await this.weeklyStudy(userId, tzOffsetMinutes),
      todayMinutes: recent.find((r) => r.d === today)?.minutes ?? 0,
      dailyGoalMinutes: profile?.daily_goal_minutes ?? learning.dailyGoalMinutes,
      upcomingExams: await examsService.upcoming(userId, 3),
      recentActivity: (await this.activity(userId, 5)).items,
    };
  },

  async summary(userId: string) {
    const today = todayStr();
    const [lessons, streak] = await Promise.all([lessonSummariesFor(userId), getStreak(userId)]);
    const cal = await this.calendarStats(userId, 16);
    const totalMin = (await db.scalar<number>(`SELECT COALESCE(sum(minutes), 0)::int FROM ${T.daily_activity} WHERE user_id = $1`, [userId])) ?? 0;
    const weekStart = weekStartOf(today);
    const doneThisWeek = (await db.scalar<number>(`SELECT count(*)::int FROM ${T.lesson_completions} WHERE user_id = $1 AND (completed_at AT TIME ZONE 'Asia/Baghdad')::date >= $2::date`, [userId, weekStart])) ?? 0;
    const completed = lessons.filter((l) => l.status === 'completed').length;
    return {
      overallPct: lessons.length ? Math.round((completed / lessons.length) * 100) : 0,
      overallAvgPct: lessons.length ? Math.round(lessons.reduce((a, l) => a + l.progress, 0) / lessons.length) : 0,
      completedLessons: completed,
      totalLessons: lessons.length,
      studyHours: round1(totalMin / 60),
      streak: displayStreak(streak, today),
      longestStreak: streak.longest,
      activeDays: cal.activeDays,
      activeDaysLast30: cal.activeDaysLast30,
      busiestWeekday: cal.busiestWeekday,
      quizAverage: await quizAverage(userId),
      lessonsDoneThisWeek: doneThisWeek,
    };
  },

  async calendarStats(userId: string, weeks: number) {
    const today = todayStr();
    const from = addDaysStr(today, -(weeks * 7 - 1));
    const rows = await dailyRows(userId, from, today);
    const learning = await settingsStore.get('learning');
    const by = new Map(rows.map((r) => [r.d, r.minutes]));
    const days = Array.from({ length: weeks * 7 }, (_, i) => {
      const d = addDaysStr(from, i);
      const minutes = by.get(d) ?? 0;
      return { date: d, minutes, level: heatLevel(minutes, learning.heatmapLevels) };
    });
    const since30 = addDaysStr(today, -29);
    const perWeekday = Array.from({ length: 7 }, () => 0);
    for (const d of days) perWeekday[satIndex(d.date)]! += d.minutes;
    const max = Math.max(...perWeekday);
    return {
      days,
      activeDays: days.filter((d) => d.minutes > 0).length,
      activeDaysLast30: days.filter((d) => d.minutes > 0 && d.date >= since30).length,
      busiestWeekday: max > 0 ? perWeekday.indexOf(max) : null,
    };
  },

  async streakCalendar(userId: string, weeks: number) {
    const streak = await getStreak(userId);
    const c = await this.calendarStats(userId, weeks);
    return { days: c.days, current: displayStreak(streak, todayStr()), longest: streak.longest, activeDays: c.activeDays, activeDaysLast30: c.activeDaysLast30, busiestWeekday: c.busiestWeekday };
  },

  async scoreTrend(userId: string, weeks: number) {
    const today = todayStr();
    const firstStart = addDaysStr(weekStartOf(today), -7 * (weeks - 1));
    const rows = await db.many<{ ws: string; slug: string; avg: number }>(
      `SELECT ((a.submitted_at AT TIME ZONE 'Asia/Baghdad')::date - ((extract(dow FROM (a.submitted_at AT TIME ZONE 'Asia/Baghdad'))::int + 1) % 7))::text AS ws,
              s.slug, avg(a.score) AS avg
         FROM ${T.quiz_attempts} a JOIN ${T.lessons} l ON l.id = a.lesson_id JOIN ${T.subjects} s ON s.id = l.subject_id
        WHERE a.user_id = $1 AND a.status IN ('passed','failed') AND (a.submitted_at AT TIME ZONE 'Asia/Baghdad')::date >= $2::date
        GROUP BY ws, s.slug`,
      [userId, firstStart],
    );
    const subjects = await db.many<{ id: string; slug: string; name_en: string; name_ar: string; color: string }>(`SELECT id, slug, name_en, name_ar, color FROM ${T.subjects} WHERE deleted_at IS NULL AND status = 'active' ORDER BY sort_order`);
    return {
      weeks: Array.from({ length: weeks }, (_, i) => {
        const ws = addDaysStr(firstStart, i * 7);
        return {
          week: i + 1,
          weekStart: ws,
          label: { en: `W${i + 1}`, ar: `أ${i + 1}` },
          scores: Object.fromEntries(subjects.map((s) => {
            const r = rows.find((x) => x.ws === ws && x.slug === s.slug);
            return [s.slug, r ? Math.round(Number(r.avg)) : null];
          })),
        };
      }),
      subjects: subjects.map((s) => ({ id: s.id, slug: s.slug, name: { en: s.name_en, ar: s.name_ar }, color: s.color })),
    };
  },

  async weakTopics(userId: string, limit: number, subjectIdOrSlug?: string) {
    let subjectId: string | null = null;
    if (subjectIdOrSlug) {
      const s = await findSubject(subjectIdOrSlug);
      if (!s) throw new NotFoundError('subject');
      subjectId = s.id;
    }
    const rows = await db.many<{ topic_id: string; subject_id: string; slug: string; title_en: string; title_ar: string; attempts: number; correct: number; lesson_id: string | null; l_title_en: string | null; l_title_ar: string | null }>(
      `WITH ans AS (
         SELECT qaa.question_id, qaa.is_correct FROM ${T.quiz_attempt_answers} qaa JOIN ${T.quiz_attempts} qa ON qa.id = qaa.attempt_id WHERE qa.user_id = $1
         UNION ALL
         SELECT pa.question_id, pa.is_correct FROM ${T.practice_answers} pa JOIN ${T.practice_sessions} ps ON ps.id = pa.session_id WHERE ps.user_id = $1
         UNION ALL
         SELECT ea.question_id, COALESCE(ea.is_correct, false) FROM ${T.exam_attempt_answers} ea JOIN ${T.exam_attempts} ex ON ex.id = ea.attempt_id
          WHERE ex.user_id = $1 AND ex.status IN ('submitted','auto_submitted') AND ea.selected_option_id IS NOT NULL
       )
       SELECT q.topic_id, q.subject_id, s.slug, tp.title_en, tp.title_ar, count(*)::int AS attempts, count(*) FILTER (WHERE ans.is_correct)::int AS correct,
              fl.id AS lesson_id, fl.title_en AS l_title_en, fl.title_ar AS l_title_ar
         FROM ans JOIN ${T.questions} q ON q.id = ans.question_id JOIN ${T.subjects} s ON s.id = q.subject_id JOIN ${T.topics} tp ON tp.id = q.topic_id
         LEFT JOIN LATERAL (SELECT l.id, l.title_en, l.title_ar FROM ${T.lessons} l WHERE l.topic_id = q.topic_id AND l.status = 'published' AND l.deleted_at IS NULL ORDER BY l.sort_order LIMIT 1) fl ON true
        WHERE ($2::uuid IS NULL OR q.subject_id = $2)
        GROUP BY q.topic_id, q.subject_id, s.slug, tp.title_en, tp.title_ar, fl.id, fl.title_en, fl.title_ar
       HAVING count(*) >= 3
        ORDER BY count(*) FILTER (WHERE ans.is_correct)::float / count(*) ASC, count(*) DESC
        LIMIT $3`,
      [userId, subjectId, limit],
    );
    return rows.map((r) => ({
      subjectId: r.subject_id,
      subjectSlug: r.slug,
      topicId: r.topic_id,
      topic: { en: r.title_en, ar: r.title_ar },
      accuracy: Math.round((r.correct / r.attempts) * 1000) / 10,
      attempts: r.attempts,
      lessonId: r.lesson_id,
      lessonTitle: r.lesson_id ? { en: r.l_title_en ?? '', ar: r.l_title_ar ?? '' } : null,
    }));
  },

  async activity(userId: string, limit: number, cursor?: string) {
    const c = decodeCursor(cursor);
    const params: unknown[] = [userId, limit + 1];
    let cond = '';
    if (c) {
      params.push(String(c.v), c.id);
      cond = 'WHERE (feed.at, feed.id::text) < ($3::timestamptz, $4)';
    }
    const rows = await db.many<{ id: string; kind: 'lesson' | 'quiz' | 'exam' | 'ai'; title_en: string; title_ar: string; ref_id: string; score: number | null; passed: boolean | null; at: Date }>(
      `WITH feed AS (
         SELECT c.id, 'lesson'::text AS kind, l.title_en, l.title_ar, l.id AS ref_id, NULL::numeric AS score, NULL::boolean AS passed, c.completed_at AS at
           FROM ${T.lesson_completions} c JOIN ${T.lessons} l ON l.id = c.lesson_id WHERE c.user_id = $1
         UNION ALL
         SELECT a.id, 'quiz', l.title_en, l.title_ar, l.id, a.score, a.status = 'passed', a.submitted_at
           FROM ${T.quiz_attempts} a JOIN ${T.lessons} l ON l.id = a.lesson_id WHERE a.user_id = $1 AND a.status IN ('passed','failed')
         UNION ALL
         SELECT e.id, 'exam', b.title_en, b.title_ar, e.id, e.score, e.passed, e.submitted_at
           FROM ${T.exam_attempts} e JOIN ${T.exam_blueprints} b ON b.id = e.blueprint_id WHERE e.user_id = $1 AND e.status IN ('submitted','auto_submitted')
         UNION ALL
         SELECT ac.id, 'ai', COALESCE(NULLIF(ac.title, ''), 'AI tutor'), COALESCE(NULLIF(ac.title, ''), 'المعلم الذكي'), ac.id, NULL, NULL, COALESCE(ac.last_message_at, ac.created_at)
           FROM ${T.ai_conversations} ac WHERE ac.user_id = $1
       )
       SELECT * FROM feed ${cond} ORDER BY feed.at DESC, feed.id::text DESC LIMIT $2`,
      params,
    );
    const page = rows.slice(0, limit);
    const items = page.map((r) => {
      const score = r.score === null ? null : Math.round(Number(r.score));
      const meta: Localized =
        r.kind === 'lesson'
          ? { en: 'Lesson completed', ar: 'تم إكمال الدرس' }
          : r.kind === 'quiz'
            ? { en: `Quiz score ${score}%`, ar: `نتيجة الاختبار ${score}٪` }
            : r.kind === 'exam'
              ? { en: `Exam score ${score}% · ${r.passed ? 'Passed' : 'Not passed'}`, ar: `نتيجة الامتحان ${score}٪ · ${r.passed ? 'ناجح' : 'لم ينجح'}` }
              : { en: 'Asked the AI tutor', ar: 'سأل المعلم الذكي' };
      const link = r.kind === 'exam' ? `/exams/result/${r.ref_id}` : r.kind === 'ai' ? '/tutor' : `/lesson/${r.ref_id}`;
      return { id: r.id, kind: r.kind, title: { en: r.title_en, ar: r.title_ar }, meta, date: r.at.toISOString(), link };
    });
    const last = page[page.length - 1];
    return { items, meta: { pageSize: limit, nextCursor: rows.length > limit && last ? encodeCursor(last.at.toISOString(), last.id) : null } };
  },

  async todayPlan(userId: string) {
    const today = todayStr();
    let items = await this.planRows(userId, today);
    if (!items.length) {
      await this.generatePlan(userId, today);
      items = await this.planRows(userId, today);
    }
    return items;
  },

  async planRows(userId: string, day: string) {
    const rows = await db.many<{ id: string; kind: string; subject_id: string | null; slug: string | null; title_en: string; title_ar: string; meta_en: string; meta_ar: string; minutes: number; target: { pathname: string; params: Record<string, string> }; done: boolean }>(
      `SELECT p.id, p.kind, p.subject_id, s.slug, p.title_en, p.title_ar, p.meta_en, p.meta_ar, p.minutes, p.target, p.done
         FROM ${T.today_plan_items} p LEFT JOIN ${T.subjects} s ON s.id = p.subject_id WHERE p.user_id = $1 AND p.plan_date = $2::date ORDER BY p.sort_order`,
      [userId, day],
    );
    return rows.map((r) => ({ id: r.id, kind: r.kind as 'lesson' | 'quiz' | 'mistakes' | 'exam', subjectId: r.subject_id, subjectSlug: r.slug, title: { en: r.title_en, ar: r.title_ar }, meta: { en: r.meta_en, ar: r.meta_ar }, minutes: r.minutes, target: r.target, done: r.done }));
  },

  async generatePlan(userId: string, day: string) {
    const lessons = await lessonSummariesFor(userId);
    const items: { kind: string; subjectId: string | null; lessonId: string | null; title: Localized; meta: Localized; minutes: number; target: { pathname: string; params: Record<string, string> } }[] = [];
    const cont = lessons.find((l) => l.status === 'in-progress' && !l.locked) ?? lessons.find((l) => l.status === 'not-started' && !l.locked);
    if (cont) items.push({ kind: 'lesson', subjectId: cont.subjectId, lessonId: cont.id, title: cont.title, meta: { en: `${Math.max(1, Math.round(cont.duration / 60))} min lesson`, ar: `درس ${Math.max(1, Math.round(cont.duration / 60))} دقيقة` }, minutes: Math.max(1, Math.round((cont.duration * (100 - cont.progress)) / 6000)), target: { pathname: '/lesson/[id]', params: { id: cont.id } } });
    const lastDone = await db.maybeOne<{ lesson_id: string }>(
      `SELECT c.lesson_id FROM ${T.lesson_completions} c WHERE c.user_id = $1
         AND NOT EXISTS (SELECT 1 FROM ${T.quiz_attempts} a WHERE a.user_id = c.user_id AND a.lesson_id = c.lesson_id AND a.status = 'passed')
       ORDER BY c.completed_at DESC LIMIT 1`,
      [userId],
    );
    const quizLesson = lastDone ? lessons.find((l) => l.id === lastDone.lesson_id && !l.locked) : undefined;
    if (quizLesson) items.push({ kind: 'quiz', subjectId: quizLesson.subjectId, lessonId: quizLesson.id, title: quizLesson.title, meta: { en: 'Lesson quiz', ar: 'اختبار الدرس' }, minutes: 4, target: { pathname: '/quiz/[lessonId]', params: { lessonId: quizLesson.id } } });
    const unresolved = (await db.scalar<number>(`SELECT count(*)::int FROM ${T.mistake_records} WHERE user_id = $1 AND status = 'unresolved'`, [userId])) ?? 0;
    if (unresolved > 0) items.push({ kind: 'mistakes', subjectId: null, lessonId: null, title: { en: 'Review your mistakes', ar: 'راجع أخطاءك' }, meta: { en: `${unresolved} unresolved`, ar: `${unresolved} غير محلولة` }, minutes: Math.min(30, unresolved * 2), target: { pathname: '/mistakes', params: {} } });
    const exams = await examsService.available(userId);
    const exam = exams.find((e) => e.available && !e.locked && e.attemptsLeft > 0 && new Date(e.availableTo).getTime() - Date.now() <= 14 * 86_400_000) ?? null;
    if (exam) items.push({ kind: 'exam', subjectId: exam.subjectId || null, lessonId: null, title: exam.title, meta: { en: `${exam.questionCount} questions · ${exam.durationMin} min`, ar: `${exam.questionCount} سؤال · ${exam.durationMin} دقيقة` }, minutes: exam.durationMin, target: { pathname: '/exams', params: {} } });
    await tx(async (c) => {
      const exists = await db.scalar<number>(`SELECT count(*)::int FROM ${T.today_plan_items} WHERE user_id = $1 AND plan_date = $2::date`, [userId, day], c);
      if (exists) return;
      for (const [i, it] of items.entries()) {
        await db.query(
          `INSERT INTO ${T.today_plan_items} (id, user_id, plan_date, kind, subject_id, lesson_id, title_en, title_ar, meta_en, meta_ar, minutes, target, sort_order)
           VALUES ($1,$2,$3::date,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13)`,
          [randomUUID(), userId, day, it.kind, it.subjectId, it.lessonId, it.title.en, it.title.ar, it.meta.en, it.meta.ar, it.minutes, JSON.stringify(it.target), i + 1],
          c,
        );
      }
    });
  },

  async setPlanItem(userId: string, itemId: string, done: boolean) {
    const r = await db.maybeOne<{ plan_date: string }>(`UPDATE ${T.today_plan_items} SET done = $3, done_at = CASE WHEN $3 THEN now() ELSE NULL END WHERE id = $1 AND user_id = $2 RETURNING plan_date::text`, [itemId, userId, done]);
    if (!r) throw new NotFoundError('planItem');
    return (await this.planRows(userId, r.plan_date)).find((x) => x.id === itemId);
  },

  achievements: (userId: string) => evaluateAchievements(userId),
};
