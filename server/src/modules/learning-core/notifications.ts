/**
 * Learning → notifications bridge (Agent D's `notify()`): new lesson published (entitled students), exam result.
 * `notify()` never throws; these helpers are fire-and-forget.
 */
import { T } from '../../config/constants.js';
import { db } from '../../config/db.js';
import { logger } from '../../config/logger.js';
import { notify } from '../notifications/notify.js';

/** `new_lesson` to every student with a live entitlement for the lesson's subject (fire-and-forget). */
export function notifyNewLessons(lessonIds: string[]): void {
  if (!lessonIds.length) return;
  void (async () => {
    const lessons = await db.many<{ id: string; title_en: string; title_ar: string; subject_id: string; name_en: string; name_ar: string }>(
      `SELECT l.id, l.title_en, l.title_ar, l.subject_id, s.name_en, s.name_ar FROM ${T.lessons} l JOIN ${T.subjects} s ON s.id = l.subject_id WHERE l.id = ANY($1::uuid[])`,
      [lessonIds],
    );
    for (const l of lessons) {
      const users = await db.many<{ user_id: string }>(
        `SELECT DISTINCT user_id FROM ${T.entitlements} WHERE subject_id = $1 AND revoked_at IS NULL AND starts_at <= now() AND ends_at > now() LIMIT 20000`,
        [l.subject_id],
      );
      for (const u of users) {
        await notify({
          userId: u.user_id,
          templateType: 'new_lesson',
          channels: ['in_app', 'push'],
          vars: { lesson_title: { en: l.title_en, ar: l.title_ar }, subject_name: { en: l.name_en, ar: l.name_ar } },
          fallback: { title: { en: 'New lesson available', ar: 'درس جديد متاح' }, body: { en: `${l.title_en} — ${l.name_en}`, ar: `${l.title_ar} — ${l.name_ar}` } },
          link: `/lesson/${l.id}`,
          target: { kind: 'lesson', id: l.id },
        });
      }
    }
  })().catch((err: Error) => logger.warn({ err: err.message }, 'new lesson notifications failed'));
}

/** In-app exam result notification (fire-and-forget). */
export function notifyExamResult(userId: string, attemptId: string): void {
  void (async () => {
    const a = await db.maybeOne<{ score: number | null; passed: boolean | null; title_en: string; title_ar: string; status: string }>(
      `SELECT a.score, a.passed, b.title_en, b.title_ar, a.status FROM ${T.exam_attempts} a JOIN ${T.exam_blueprints} b ON b.id = a.blueprint_id WHERE a.id = $1`,
      [attemptId],
    );
    if (!a) return;
    const pct = Math.round(Number(a.score ?? 0));
    await notify({
      userId,
      notificationType: 'exam',
      channels: ['in_app', 'push'],
      fallback: {
        title: { en: `Exam result: ${a.title_en}`, ar: `نتيجة الامتحان: ${a.title_ar}` },
        body: {
          en: `${a.status === 'auto_submitted' ? 'Time was up — submitted automatically. ' : ''}You scored ${pct}% (${a.passed ? 'passed' : 'not passed'}).`,
          ar: `${a.status === 'auto_submitted' ? 'انتهى الوقت — تم التسليم تلقائياً. ' : ''}حصلت على ${pct}٪ (${a.passed ? 'ناجح' : 'لم تنجح'}).`,
        },
      },
      link: `/exams/result/${attemptId}`,
      target: { kind: 'exam_result', id: attemptId },
    });
  })().catch((err: Error) => logger.warn({ err: err.message }, 'exam result notification failed'));
}
