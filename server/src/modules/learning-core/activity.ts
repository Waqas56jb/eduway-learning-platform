/**
 * Learning activity bookkeeping shared by progress/quizzes/practice/exams/mistakes:
 *   - daily_activity upsert (minutes, questions, quizzes, exams …) in the platform timezone
 *   - streak update (eduway_platform_streaks)
 *   - achievements evaluation (metrics computed from activity tables; earned_at persisted once reached)
 */
import { T } from '../../config/constants.js';
import { db, type Executor } from '../../config/db.js';
import { logger } from '../../config/logger.js';
import { businessDate } from '../../common/utils/dates.js';
import { nextStreak, type StreakState } from './rules.js';

export interface ActivityDelta {
  minutes?: number;
  watchSeconds?: number;
  lessonsCompleted?: number;
  questionsAnswered?: number;
  questionsCorrect?: number;
  quizzesTaken?: number;
  examsTaken?: number;
}

export async function recordActivity(userId: string, d: ActivityDelta, platform: string | null, ex?: Executor, at: Date = new Date()): Promise<void> {
  const day = businessDate(at);
  const plat = platform === 'web' || platform === 'ios' || platform === 'android' ? platform : null;
  await db.query(
    `INSERT INTO ${T.daily_activity} (user_id, activity_date, minutes, watch_seconds, lessons_completed, questions_answered, questions_correct, quizzes_taken, exams_taken, platforms)
     VALUES ($1, $2::date, $3, $4, $5, $6, $7, $8, $9, CASE WHEN $10::text IS NULL THEN '{}'::text[] ELSE ARRAY[$10::text] END)
     ON CONFLICT (user_id, activity_date) DO UPDATE SET
       minutes = ${T.daily_activity}.minutes + EXCLUDED.minutes,
       watch_seconds = ${T.daily_activity}.watch_seconds + EXCLUDED.watch_seconds,
       lessons_completed = ${T.daily_activity}.lessons_completed + EXCLUDED.lessons_completed,
       questions_answered = ${T.daily_activity}.questions_answered + EXCLUDED.questions_answered,
       questions_correct = ${T.daily_activity}.questions_correct + EXCLUDED.questions_correct,
       quizzes_taken = ${T.daily_activity}.quizzes_taken + EXCLUDED.quizzes_taken,
       exams_taken = ${T.daily_activity}.exams_taken + EXCLUDED.exams_taken,
       platforms = (SELECT ARRAY(SELECT DISTINCT unnest(${T.daily_activity}.platforms || EXCLUDED.platforms)))`,
    [userId, day, Math.max(0, Math.round(d.minutes ?? 0)), Math.max(0, Math.round(d.watchSeconds ?? 0)), d.lessonsCompleted ?? 0, d.questionsAnswered ?? 0, d.questionsCorrect ?? 0, d.quizzesTaken ?? 0, d.examsTaken ?? 0, plat],
    ex,
  );
  await touchStreak(userId, day, ex);
}

export async function getStreak(userId: string, ex?: Executor): Promise<StreakState> {
  const r = await db.maybeOne<{ current_streak: number; longest_streak: number; last_active_date: string | null }>(
    `SELECT current_streak, longest_streak, last_active_date::text AS last_active_date FROM ${T.streaks} WHERE user_id = $1`,
    [userId],
    ex,
  );
  return { current: r?.current_streak ?? 0, longest: r?.longest_streak ?? 0, lastDate: r?.last_active_date ?? null };
}

export async function touchStreak(userId: string, day: string, ex?: Executor): Promise<StreakState> {
  const cur = await getStreak(userId, ex);
  const next = nextStreak(cur, day);
  if (next !== cur) {
    await db.query(
      `INSERT INTO ${T.streaks} (user_id, current_streak, longest_streak, last_active_date) VALUES ($1,$2,$3,$4::date)
       ON CONFLICT (user_id) DO UPDATE SET current_streak = EXCLUDED.current_streak, longest_streak = EXCLUDED.longest_streak, last_active_date = EXCLUDED.last_active_date`,
      [userId, next.current, next.longest, next.lastDate],
      ex,
    );
  }
  return next;
}

/** Current values of every achievement metric for a student. */
export async function achievementMetrics(userId: string): Promise<Record<string, number>> {
  const r = await db.one<Record<string, number>>(
    `SELECT
       COALESCE((SELECT GREATEST(longest_streak, current_streak) FROM ${T.streaks} WHERE user_id = $1), 0)::int AS streak_days,
       (SELECT count(*) FROM ${T.quiz_attempts} WHERE user_id = $1 AND status IN ('passed','failed') AND score >= 100)::int AS perfect_quizzes,
       COALESCE((SELECT sum(questions_answered) FROM ${T.daily_activity} WHERE user_id = $1), 0)::int AS questions_answered,
       (SELECT count(DISTINCT (started_at AT TIME ZONE 'Asia/Baghdad')::date) FROM ${T.quiz_attempts}
         WHERE user_id = $1 AND (date_part('hour', started_at AT TIME ZONE 'Asia/Baghdad') >= 22 OR date_part('hour', started_at AT TIME ZONE 'Asia/Baghdad') < 4))::int
       + (SELECT count(*) FROM ${T.lesson_completions}
         WHERE user_id = $1 AND (date_part('hour', completed_at AT TIME ZONE 'Asia/Baghdad') >= 22 OR date_part('hour', completed_at AT TIME ZONE 'Asia/Baghdad') < 4))::int AS night_sessions,
       (SELECT count(DISTINCT (started_at AT TIME ZONE 'Asia/Baghdad')::date) FROM ${T.quiz_attempts}
         WHERE user_id = $1 AND date_part('hour', started_at AT TIME ZONE 'Asia/Baghdad') BETWEEN 5 AND 7)::int
       + (SELECT count(*) FROM ${T.lesson_completions}
         WHERE user_id = $1 AND date_part('hour', completed_at AT TIME ZONE 'Asia/Baghdad') BETWEEN 5 AND 7)::int AS morning_sessions,
       (SELECT count(*) FROM ${T.exam_attempts} WHERE user_id = $1 AND passed)::int AS exams_passed,
       (SELECT count(*) FROM ${T.mistake_records} WHERE user_id = $1 AND status = 'mastered')::int AS mistakes_mastered,
       (SELECT count(DISTINCT l.subject_id) FROM ${T.watch_progress} w JOIN ${T.lessons} l ON l.id = w.lesson_id WHERE w.user_id = $1)::int AS subjects_started,
       (SELECT count(*) FROM ${T.lesson_completions} WHERE user_id = $1)::int AS lessons_completed`,
    [userId],
  );
  return r;
}

export interface AchievementDto {
  id: string;
  icon: string;
  title: { en: string; ar: string };
  description: { en: string; ar: string };
  hint: { en: string; ar: string };
  earned: boolean;
  current: number;
  target: number;
  earnedAt: string | null;
}

/** Recompute progress for every active achievement and persist newly earned ones. Returns the DTO list. */
export async function evaluateAchievements(userId: string): Promise<AchievementDto[]> {
  const defs = await db.many<{ id: string; key: string; icon: string; title_en: string; title_ar: string; description_en: string; description_ar: string; hint_en: string; hint_ar: string; metric: string; target: number; earned_at: Date | null }>(
    `SELECT a.id, a.key, a.icon, a.title_en, a.title_ar, a.description_en, a.description_ar, a.hint_en, a.hint_ar, a.metric, a.target, ua.earned_at
       FROM ${T.achievements} a LEFT JOIN ${T.user_achievements} ua ON ua.achievement_id = a.id AND ua.user_id = $1
      WHERE a.active ORDER BY a.sort_order, a.key`,
    [userId],
  );
  if (!defs.length) return [];
  const m = await achievementMetrics(userId);
  const out: AchievementDto[] = [];
  for (const d of defs) {
    const current = Math.max(0, Number(m[d.metric] ?? 0));
    let earnedAt = d.earned_at;
    const reached = current >= d.target;
    if (reached && !earnedAt) earnedAt = new Date();
    await db.query(
      `INSERT INTO ${T.user_achievements} (user_id, achievement_id, current, earned_at) VALUES ($1,$2,$3,$4)
       ON CONFLICT (user_id, achievement_id) DO UPDATE SET current = EXCLUDED.current, earned_at = COALESCE(${T.user_achievements}.earned_at, EXCLUDED.earned_at)`,
      [userId, d.id, current, earnedAt],
    );
    out.push({
      id: d.key,
      icon: d.icon,
      title: { en: d.title_en, ar: d.title_ar },
      description: { en: d.description_en, ar: d.description_ar },
      hint: { en: d.hint_en, ar: d.hint_ar },
      earned: !!earnedAt,
      current: Math.min(current, d.target),
      target: d.target,
      earnedAt: earnedAt ? earnedAt.toISOString() : null,
    });
  }
  return out;
}

/** Fire-and-forget re-evaluation after learning events (never fails the request). */
export function reevaluateAchievementsLater(userId: string): void {
  void evaluateAchievements(userId).catch((err: Error) => logger.warn({ err: err.message, userId }, 'achievement evaluation failed'));
}
