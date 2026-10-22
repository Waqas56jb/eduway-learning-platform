/**
 * Demo student "Ahmed Al-Baghdadi" (+9647701234567, dev OTP 123456): Full Access active (~23 days left),
 * streak 7, AI 27/100, realistic watch progress, quiz attempts, mistakes, exam attempts, notifications,
 * achievements and today's plan — so both student apps look alive.
 */
import { T } from '../../config/constants.js';
import type { TxClient } from '../../config/db.js';
import { businessDate } from '../../common/utils/dates.js';
import { blueprintId, lessonId, optionId, packageId, questionId, subjectId, type CatalogMaps } from './catalog.js';
import { daysAgo, daysAhead, insertMany, loadJson, rebase, rng, sid } from './helpers.js';
import { govId, marketerId, schoolId } from './partners.js';
import type { L, UserExam, UserQuestion } from './types.js';

export const DEMO_PHONE = '+9647701234567';
export const DEMO_ID = sid('student', 'demo-ahmed');

export async function seedDemoStudent(c: TxClient, cat: CatalogMaps): Promise<void> {
  const r = rng(1024);
  const user = loadJson<{ name: L; firstName: L; avatar: string }>('user.json');
  const existing = await c.query<{ id: string }>(`SELECT id FROM ${T.users} WHERE phone = $1 AND kind = 'student'`, [DEMO_PHONE]);
  const uid = existing.rows[0]?.id ?? DEMO_ID;
  await c.query(
    `INSERT INTO ${T.users} (id, kind, phone, name_en, name_ar, avatar_url, locale, status, last_active_at, created_at, notification_prefs)
     VALUES ($1,'student',$2,$3,$4,$5,'ar','active', now(), $6, '{}'::jsonb) ON CONFLICT (id) DO NOTHING`,
    [uid, DEMO_PHONE, user.name.en, user.name.ar, user.avatar, daysAgo(190)],
  );
  await c.query(
    `INSERT INTO ${T.student_profiles} (user_id, first_name_en, first_name_ar, gender, governorate_id, school_id, source, referral_code, marketer_id, registered_platform, profile_completed, daily_goal_minutes, last_lesson_id)
     VALUES ($1,$2,$3,'male',$4,$5,'school',(SELECT code FROM ${T.schools} WHERE id = $5),$6,'ios',true,120,$7) ON CONFLICT (user_id) DO NOTHING`,
    [uid, user.firstName.en, user.firstName.ar, govId('baghdad'), schoolId('sch_02'), marketerId('mkt_1'), lessonId('math-l9')],
  );
  await c.query(`INSERT INTO ${T.school_students} (id, school_id, user_id, marketer_id, source, referral_code_used, attributed_at, verified_paid_at) VALUES ($1,$2,$3,$4,'code',(SELECT code FROM ${T.schools} WHERE id = $2),$5,$6) ON CONFLICT (user_id) DO NOTHING`, [sid('school-student', 'demo'), schoolId('sch_02'), uid, marketerId('mkt_1'), daysAgo(190), daysAgo(7)]);

  // ── payment + subscription (Full Access, monthly, ~23 days left) + entitlements ──
  const payId = sid('payment', 'demo-full');
  const subId = sid('subscription', 'demo-full');
  const start = daysAgo(7);
  const end = daysAhead(23);
  await c.query(
    `INSERT INTO ${T.payments} (id, ref, user_id, package_id, billing_cycle, amount, discount, total, currency, provider, provider_ref, status, school_id, marketer_id, platform, paid_at, created_at)
     VALUES ($1,'EDW-DEMO-0001',$2,$3,'monthly',50000,0,50000,'IQD','zaincash','gw_EDW-DEMO-0001','paid',$4,$5,'ios',$6,$6) ON CONFLICT (id) DO NOTHING`,
    [payId, uid, packageId('full'), schoolId('sch_02'), marketerId('mkt_1'), start],
  );
  await insertMany(
    c,
    T.payment_events,
    ['id', 'payment_id', 'kind', 'status', 'note', 'created_at'],
    [
      [sid('payment-event', 'demo:1'), payId, 'status', 'initiated', 'Checkout started from mobile app', start],
      [sid('payment-event', 'demo:2'), payId, 'status', 'pending', 'Redirected to zaincash payment page', start],
      [sid('payment-event', 'demo:3'), payId, 'status', 'paid', 'Subscription activated and entitlements granted', start],
    ],
    'DO NOTHING',
  );
  await c.query(`INSERT INTO ${T.receipts} (id, payment_id, number, issued_at, data) VALUES ($1,$2,'R-DEMO-0001',$3,'{}'::jsonb) ON CONFLICT DO NOTHING`, [sid('receipt', 'demo'), payId, start]);
  await c.query(
    `INSERT INTO ${T.subscriptions} (id, user_id, package_id, billing_cycle, status, source, starts_at, ends_at, ai_quota, payment_id)
     VALUES ($1,$2,$3,'monthly','active','payment',$4,$5,100,$6) ON CONFLICT (id) DO UPDATE SET starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at, status = 'active'`,
    [subId, uid, packageId('full'), start, end, payId],
  );
  const slugs = ['math', 'physics', 'chemistry', 'biology', 'english'];
  await insertMany(
    c,
    T.entitlements,
    ['id', 'user_id', 'subject_id', 'source', 'subscription_id', 'starts_at', 'ends_at'],
    slugs.map((s) => [sid('entitlement', `demo:${s}`), uid, subjectId(s), 'package', subId, start, end]),
    '(id) DO UPDATE SET starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at, revoked_at = NULL',
  );
  await insertMany(
    c,
    T.entitlement_logs,
    ['id', 'user_id', 'subject_id', 'action', 'source', 'days', 'starts_at', 'ends_at', 'reason'],
    slugs.map((s) => [sid('entitlement-log', `demo:${s}`), uid, subjectId(s), 'grant', 'package', 30, start, end, 'subscription:payment']),
    'DO NOTHING',
  );

  // ── legal acceptance, streak, session, AI usage ──
  await c.query(
    `INSERT INTO ${T.legal_acceptances} (user_id, document_id, ip, platform) SELECT $1, id, '37.236.18.4', 'ios' FROM ${T.legal_documents} WHERE status = 'published' ON CONFLICT DO NOTHING`,
    [uid],
  );
  await c.query(
    `INSERT INTO ${T.streaks} (user_id, current_streak, longest_streak, last_active_date) VALUES ($1, 7, 21, $2)
     ON CONFLICT (user_id) DO UPDATE SET current_streak = 7, last_active_date = EXCLUDED.last_active_date`,
    [uid, businessDate()],
  );
  // No active session is seeded for the demo student: the device limit (app settings, default 2) stays free for web + app logins.
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1) - 3 * 3_600_000);
  await c.query(
    `INSERT INTO ${T.ai_usage} (id, user_id, period_start, period_end, allowance, questions_used, tokens_in, tokens_out, cost_usd)
     VALUES ($1,$2,$3,$4,100,27,18400,42100,0.71) ON CONFLICT (user_id, period_start) DO UPDATE SET questions_used = 27`,
    [sid('ai-usage', `demo:${monthStart.toISOString()}`), uid, monthStart, new Date(monthStart.getTime() + 31 * 86_400_000)],
  );

  // ── daily activity: 16-week heatmap + last week's study minutes ──
  const extras = loadJson<{ weeklyStudy: { minutes: number; questions: number }[]; activityHeatmap: { date: string; level: number }[]; tutorAnswers: { keywords: string[]; subjectId: string; answer: L }[] }>('student-extras.json');
  const levelMinutes = [0, 20, 45, 75, 130];
  const actRows: unknown[][] = extras.activityHeatmap.map((h, i) => {
    const d = rebase(`${h.date}T12:00:00Z`) as Date;
    const daysBack = extras.activityHeatmap.length - 1 - i;
    const week = daysBack < 7 ? extras.weeklyStudy[(extras.weeklyStudy.length - 1 - daysBack + 7) % 7] : null;
    const minutes = week ? week.minutes : (levelMinutes[h.level] ?? 0) + (h.level ? r.int(0, 10) : 0);
    const questions = week ? week.questions : h.level * r.int(4, 9);
    return [sid('activity', `demo:${h.date}`), uid, businessDate(d), minutes, minutes * 45, h.level ? r.int(0, 2) : 0, questions, Math.round(questions * 0.74), h.level ? r.int(0, 1) : 0, 0, h.level ? r.int(0, 3) : 0, ['ios', 'web']];
  });
  await insertMany(c, T.daily_activity, ['id', 'user_id', 'activity_date', 'minutes', 'watch_seconds', 'lessons_completed', 'questions_answered', 'questions_correct', 'quizzes_taken', 'exams_taken', 'ai_questions', 'platforms'], actRows, 'DO NOTHING'); // any unique (pkey or user+date): ids are rebased per day

  // ── watch progress + completions (from the apps' lesson states) ──
  const started = [...cat.lessonsBySlug.values()].filter((l) => l.status !== 'not-started');
  await insertMany(
    c,
    T.watch_progress,
    ['id', 'user_id', 'lesson_id', 'position_sec', 'duration_sec', 'watched_sec', 'percent', 'completed', 'platform', 'updated_at'],
    started.map((l, i) => [sid('watch', `demo:${l.id}`), uid, lessonId(l.id), Math.round((l.duration * l.progress) / 100), l.duration, Math.round((l.duration * l.progress) / 100), l.progress, l.status === 'completed', i % 2 ? 'web' : 'ios', l.id === 'math-l9' ? daysAgo(0, 2) : daysAgo(2 + (i % 40), i % 12)]),
    '(user_id, lesson_id) DO NOTHING',
  );
  const completed = started.filter((l) => l.status === 'completed');
  await insertMany(c, T.lesson_completions, ['id', 'user_id', 'lesson_id', 'source', 'completed_at'], completed.map((l, i) => [sid('completion', `demo:${l.id}`), uid, lessonId(l.id), 'watch', daysAgo(3 + (i % 45))]), '(user_id, lesson_id) DO NOTHING');

  // ── quiz attempts for completed lessons that have questions ──
  const qByLesson = new Map<string, UserQuestion[]>();
  for (const q of cat.questions) if (q.lessonId) qByLesson.set(q.lessonId, [...(qByLesson.get(q.lessonId) ?? []), q]);
  for (const [i, l] of completed.entries()) {
    const qs = qByLesson.get(l.id);
    if (!qs?.length) continue;
    const attemptId = sid('quiz-attempt', `demo:${l.id}`);
    const correct = Math.max(1, qs.length - (i % 3 === 0 ? 1 : 0));
    const score = Math.round((correct / qs.length) * 100);
    const at = daysAgo(3 + (i % 45), 1);
    await c.query(
      `INSERT INTO ${T.quiz_attempts} (id, user_id, lesson_id, attempt_number, question_ids, status, score, correct_count, total_count, pass_threshold, platform, started_at, submitted_at, time_sec)
       VALUES ($1,$2,$3,1,$4,$5,$6,$7,$8,60,'ios',$9,$10,$11) ON CONFLICT (id) DO NOTHING`,
      [attemptId, uid, lessonId(l.id), qs.map((q) => questionId(q.id)), score >= 60 ? 'passed' : 'failed', score, correct, qs.length, at, new Date(at.getTime() + 240_000), 240],
    );
    await insertMany(
      c,
      T.quiz_attempt_answers,
      ['id', 'attempt_id', 'question_id', 'selected_option_id', 'is_correct', 'time_sec', 'answered_at'],
      qs.map((q, k) => {
        const ok = k < correct;
        const chosen = ok ? q.correctIndex : (q.correctIndex + 1) % q.options.length;
        return [sid('quiz-answer', `demo:${l.id}:${q.id}`), attemptId, questionId(q.id), optionId(q.id, chosen), ok, 30 + k * 7, at];
      }),
      '(attempt_id, question_id) DO NOTHING',
    );
  }

  // ── mistakes (+ history) ──
  const mistakes = loadJson<{ id: string; questionId: string; chosenIndex: number; status: 'unresolved' | 'reviewed' | 'mastered'; repeatCount: number; date: string; source: 'quiz' | 'bank' | 'exam' }[]>('mistakes.json');
  const qMap = new Map(cat.questions.map((q) => [q.id, q]));
  for (const m of mistakes) {
    const q = qMap.get(m.questionId);
    if (!q) continue;
    const lesson = q.lessonId ? cat.lessonsBySlug.get(q.lessonId) : undefined;
    const mid = sid('mistake', `demo:${m.id}`);
    const at = rebase(m.date) as Date;
    await c.query(
      `INSERT INTO ${T.mistake_records} (id, user_id, question_id, subject_id, unit_id, topic_id, lesson_id, source, chosen_option_id, status, repeat_count, mastery_level, first_wrong_at, last_wrong_at, last_reviewed_at, mastered_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) ON CONFLICT (user_id, question_id) DO NOTHING`,
      [mid, uid, questionId(q.id), subjectId(q.subjectId), sid('unit', q.unitId), lesson ? sid('topic', lesson.chapterId) : null, lesson ? lessonId(lesson.id) : null, m.source, optionId(q.id, m.chosenIndex), m.status, m.repeatCount, m.status === 'mastered' ? 3 : m.status === 'reviewed' ? 1 : 0, new Date(at.getTime() - (m.repeatCount - 1) * 86_400_000), at, m.status === 'unresolved' ? null : at, m.status === 'mastered' ? at : null],
    );
    const hist: unknown[][] = Array.from({ length: m.repeatCount }, (_, k) => [sid('mistake-history', `demo:${m.id}:${k}`), mid, 'wrong', m.source, optionId(q.id, m.chosenIndex), new Date(at.getTime() - (m.repeatCount - 1 - k) * 86_400_000)]);
    if (m.status !== 'unresolved') hist.push([sid('mistake-history', `demo:${m.id}:r`), mid, m.status === 'mastered' ? 'mastered' : 'reviewed', m.source, null, at]);
    await insertMany(c, T.mistake_history, ['id', 'mistake_id', 'event', 'source', 'chosen_option_id', 'created_at'], hist, '(id) DO NOTHING');
  }

  // ── exam attempts (best scores from the apps: math 78 → 1 used; chemistry 64 → 2 used) ──
  const exams = loadJson<UserExam[]>('exams.json');
  for (const e of exams) {
    const used = e.attemptsTotal - e.attemptsLeft;
    for (let k = 0; k < used; k++) {
      const qs = e.questionIds.map((id) => qMap.get(id)).filter((q): q is UserQuestion => !!q);
      const target = k === used - 1 ? (e.bestScore ?? 60) : Math.max(30, (e.bestScore ?? 60) - 14);
      const correct = Math.round((target / 100) * qs.length);
      const score = Math.round((correct / qs.length) * 1000) / 10;
      const aid = sid('exam-attempt', `demo:${e.id}:${k}`);
      const startedAt = daysAgo(2 + (used - k) * 6, 3);
      await c.query(
        `INSERT INTO ${T.exam_attempts} (id, user_id, blueprint_id, attempt_number, status, question_ids, started_at, deadline_at, submitted_at, time_spent_sec, score, correct_count, total_count, passed, platform)
         VALUES ($1,$2,$3,$4,'submitted',$5,$6,$7,$8,$9,$10,$11,$12,$13,'web') ON CONFLICT (id) DO NOTHING`,
        [aid, uid, blueprintId(e.id), k + 1, qs.map((q) => questionId(q.id)), startedAt, new Date(startedAt.getTime() + e.durationMin * 60_000), new Date(startedAt.getTime() + (e.durationMin - 4) * 60_000), (e.durationMin - 4) * 60, score, correct, qs.length, score >= e.passMark],
      );
      await insertMany(
        c,
        T.exam_attempt_answers,
        ['id', 'attempt_id', 'question_id', 'selected_option_id', 'is_correct', 'time_sec'],
        qs.map((q, n) => {
          const ok = n < correct;
          return [sid('exam-answer', `demo:${e.id}:${k}:${q.id}`), aid, questionId(q.id), optionId(q.id, ok ? q.correctIndex : (q.correctIndex + 1) % q.options.length), ok, 60 + n * 5];
        }),
        '(attempt_id, question_id) DO NOTHING',
      );
    }
  }

  // ── AI tutor conversations ──
  for (const [i, a] of extras.tutorAnswers.slice(0, 3).entries()) {
    const conv = sid('ai-conv', `demo:${i}`);
    const asked = daysAgo(1 + i * 2, 4);
    const question = { en: `Can you explain ${a.keywords[0]}?`, ar: `ممكن تشرح ${a.keywords.find((k) => /[؀-ۿ]/.test(k)) ?? a.keywords[0]}؟` };
    await c.query(
      `INSERT INTO ${T.ai_conversations} (id, user_id, subject_id, title, message_count, last_message_at, platform, created_at) VALUES ($1,$2,$3,$4,2,$5,'ios',$5) ON CONFLICT (id) DO NOTHING`,
      [conv, uid, subjectId(a.subjectId), question.ar, asked],
    );
    await insertMany(
      c,
      T.ai_messages,
      ['id', 'conversation_id', 'role', 'content', 'tokens_in', 'tokens_out', 'model', 'counted', 'created_at'],
      [
        [sid('ai-msg', `demo:${i}:q`), conv, 'user', question.ar, 0, 0, null, true, asked],
        [sid('ai-msg', `demo:${i}:a`), conv, 'assistant', a.answer.ar, 620, 1480, 'claude-sonnet-5-5', false, new Date(asked.getTime() + 4000)],
      ],
      '(id) DO NOTHING',
    );
  }

  // ── notifications (links → canonical app routes + structured target) ──
  const notifs = loadJson<{ id: string; type: string; title: L; body: L; date: string; read: boolean; link?: string }[]>('notifications.json');
  await insertMany(
    c,
    T.notifications,
    ['id', 'user_id', 'type', 'title_en', 'title_ar', 'body_en', 'body_ar', 'link', 'data', 'read_at', 'created_at'],
    notifs.map((n) => {
      const lessonSlug = /\/lesson\/([\w-]+)/.exec(n.link ?? '')?.[1];
      const target = lessonSlug ? { kind: 'lesson', id: lessonId(lessonSlug) } : n.link?.includes('/exams') ? { kind: 'exams', id: null } : n.link?.includes('/subscription') ? { kind: 'subscription', id: null } : { kind: 'none', id: null };
      const link = lessonSlug ? `/lesson/${lessonId(lessonSlug)}` : target.kind === 'exams' ? '/exams' : target.kind === 'subscription' ? '/subscription' : null;
      const at = rebase(n.date) as Date;
      return [sid('notification', `demo:${n.id}`), uid, n.type, n.title.en, n.title.ar, n.body.en, n.body.ar, link, { target }, n.read ? at : null, at];
    }),
    '(id) DO NOTHING',
  );

  // ── achievements + today's plan + bookmarks ──
  const app = loadJson<{ achievements: { id: string; earned: boolean; current: number; earnedAt?: string }[]; todayPlan: { id: string; kind: string; subjectId: string; title: L; meta: L; minutes: number; target: unknown; done: boolean }[] }>('app-extras.json');
  await insertMany(
    c,
    T.user_achievements,
    ['id', 'user_id', 'achievement_id', 'current', 'earned_at'],
    app.achievements.map((a) => [sid('user-achievement', `demo:${a.id}`), uid, sid('achievement', a.id), a.current, a.earned ? rebase(a.earnedAt ?? null) : null]),
    '(user_id, achievement_id) DO NOTHING',
  );
  const today = businessDate();
  await insertMany(
    c,
    T.today_plan_items,
    ['id', 'user_id', 'plan_date', 'kind', 'subject_id', 'lesson_id', 'title_en', 'title_ar', 'meta_en', 'meta_ar', 'minutes', 'target', 'done', 'sort_order'],
    app.todayPlan.map((p, i) => {
      const t = p.target as { params?: { id?: string; lessonId?: string } } | string;
      const slug = typeof t === 'object' ? (t.params?.id ?? t.params?.lessonId) : undefined;
      const target = slug ? { kind: p.kind === 'quiz' ? 'quiz' : 'lesson', id: lessonId(slug) } : { kind: p.kind, id: null };
      return [sid('plan', `demo:${today}:${p.id}`), uid, today, p.kind, subjectId(p.subjectId), slug ? lessonId(slug) : null, p.title.en, p.title.ar, p.meta.en, p.meta.ar, p.minutes, target, p.done, i + 1];
    }),
    '(id) DO NOTHING',
  );
  await insertMany(
    c,
    T.bookmarks,
    ['id', 'user_id', 'entity_type', 'entity_id', 'note', 'created_at'],
    ['q3', 'q9', 'q17', 'q27'].filter((q) => qMap.has(q)).map((q, i) => [sid('bookmark', `demo:${q}`), uid, 'question', questionId(q), null, daysAgo(4 + i)]),
    'DO NOTHING',
  );
}
