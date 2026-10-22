/**
 * Agent B integration: catalog, entitlement gating, stream URL, watch progress, quizzes → mistakes → retry, practice,
 * bank/bookmarks, exams (start/autosave/flag/submit/result), admin content workflow, questions, quiz rules,
 * blueprints, attempts and search — against the real database under the TEST prefix (`eduway_platform_test_`).
 * Auto-skips when the database is unreachable. Only rows created here are removed.
 */
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { signAccessToken } from '../../src/common/auth/tokens.js';
import { T, TABLE_PREFIX, TEST_PREFIX } from '../../src/config/constants.js';
import { closeDb, pingDb, pool } from '../../src/config/db.js';
import { runMigrations } from '../../src/db/migrator.js';
import { autoSubmitExpiredAttempts } from '../../src/modules/exams/index.js';

const dbUp = (await pingDb(8000)).ok;
const app = createApp();
const tag = randomUUID().slice(0, 8);
const id = () => randomUUID();
const ids = {
  student: id(), poor: id(), admin: id(), subject: id(), other: id(), unit: id(), topic: id(), teacher: id(), lesson: id(), lesson2: id(), video: id(),
  pkg: id(), sub: id(), session: id(), poorSession: id(), adminSession: id(), blueprint: id(),
};
const questionIds: string[] = [];
let studentToken = '';
let poorToken = '';
let adminToken = '';

describe.skipIf(!dbUp)('learning (content, quizzes, mistakes, practice, exams, progress, search) — integration', () => {
  beforeAll(async () => {
    expect(TABLE_PREFIX).toBe(TEST_PREFIX);
    await runMigrations(pool);
    const q = (sql: string, p: unknown[] = []) => pool.query(sql, p);
    await q(`INSERT INTO ${T.subjects} (id, slug, name_en, name_ar, status) VALUES ($1,$2,'Mathematics','الرياضيات','active'), ($3,$4,'Physics','الفيزياء','active')`, [ids.subject, `math-${tag}`, ids.other, `phys-${tag}`]);
    await q(`INSERT INTO ${T.units} (id, subject_id, slug, title_en, title_ar, sort_order) VALUES ($1,$2,$3,'Complex Numbers','الأعداد المركبة',1)`, [ids.unit, ids.subject, `u-${tag}`]);
    await q(`INSERT INTO ${T.topics} (id, unit_id, slug, title_en, title_ar, sort_order) VALUES ($1,$2,$3,'Basics','أساسيات',1)`, [ids.topic, ids.unit, `t-${tag}`]);
    await q(`INSERT INTO ${T.teachers} (id, slug, name_en, name_ar, subject_id) VALUES ($1,$2,'Teacher','المدرس',$3)`, [ids.teacher, `teacher-${tag}`, ids.subject]);
    await q(`INSERT INTO ${T.video_assets} (id, asset_ref, provider, source_url, duration_sec, stream_status, cdn_status) VALUES ($1,$2,'external','https://example.com/v.mp4',600,'ready','synced')`, [ids.video, `ext-${tag}`]);
    await q(
      `INSERT INTO ${T.lessons} (id, subject_id, unit_id, topic_id, slug, title_en, title_ar, teacher_id, sort_order, duration_sec, video_asset_id, completion_threshold, status, published_at)
       VALUES ($1,$2,$3,$4,$5,'Intro to i','مقدمة',$6,1,600,$7,80,'published',now()), ($8,$2,$3,$4,$9,'Second lesson','الدرس الثاني',$6,2,600,NULL,80,'draft',NULL)`,
      [ids.lesson, ids.subject, ids.unit, ids.topic, `l1-${tag}`, ids.teacher, ids.video, ids.lesson2, `l2-${tag}`],
    );
    for (let i = 0; i < 12; i++) {
      const qid = id();
      questionIds.push(qid);
      const diff = ['easy', 'medium', 'hard'][i % 3];
      await q(
        `INSERT INTO ${T.questions} (id, code, subject_id, unit_id, topic_id, lesson_id, type, difficulty, body_en, body_ar, explanation_en, explanation_ar, status)
         VALUES ($1,$2,$3,$4,$5,$6,'mcq',$7,$8,$9,'Because.','لأن.','published')`,
        [qid, `T${tag}-${i}`, ids.subject, ids.unit, ids.topic, ids.lesson, diff, `Question number ${i} about complex numbers ${tag}`, `سؤال رقم ${i}`],
      );
      for (let k = 0; k < 4; k++) await q(`INSERT INTO ${T.question_options} (question_id, sort_order, text_en, text_ar, is_correct) VALUES ($1,$2,$3,$3,$4)`, [qid, k + 1, `opt ${k}`, k === 0]);
    }
    await q(
      `INSERT INTO ${T.exam_blueprints} (id, slug, subject_id, title_en, title_ar, duration_min, question_count, pass_mark, attempt_limit, available_from, available_to, status)
       VALUES ($1,$2,$3,'Mock exam','امتحان تجريبي',30,6,50,3, now() - interval '1 day', now() + interval '10 days','published')`,
      [ids.blueprint, `bp-${tag}`, ids.subject],
    );
    await q(`INSERT INTO ${T.exam_blueprint_sections} (blueprint_id, subject_id, question_count, easy_count, medium_count, hard_count) VALUES ($1,$2,6,2,2,2)`, [ids.blueprint, ids.subject]);
    await q(`INSERT INTO ${T.packages} (id, slug, name_en, name_ar, status) VALUES ($1,$2,'Pkg','باقة','active')`, [ids.pkg, `pkg-${tag}`]);
    await q(`INSERT INTO ${T.package_subjects} (package_id, subject_id) VALUES ($1,$2)`, [ids.pkg, ids.subject]);
    for (const [uid, sid, phone] of [[ids.student, ids.session, 1], [ids.poor, ids.poorSession, 2]] as const) {
      await q(`INSERT INTO ${T.users} (id, kind, phone, name_en, name_ar, locale) VALUES ($1,'student',$2,'Test Student','طالب','en')`, [uid, `+9647${phone}${Math.floor(10_000_000 + Math.random() * 89_999_999)}`]);
      await q(`INSERT INTO ${T.student_profiles} (user_id, profile_completed) VALUES ($1, true)`, [uid]);
      await q(`INSERT INTO ${T.sessions} (id, user_id, audience, refresh_token_hash, platform, expires_at) VALUES ($1,$2,'student',$3,'web', now() + interval '1 day')`, [sid, uid, `h-${tag}-${phone}`]);
    }
    await q(`INSERT INTO ${T.subscriptions} (id, user_id, package_id, status, starts_at, ends_at) VALUES ($1,$2,$3,'active', now() - interval '1 day', now() + interval '30 days')`, [ids.sub, ids.student, ids.pkg]);
    await q(`INSERT INTO ${T.entitlements} (user_id, subject_id, source, subscription_id, starts_at, ends_at) VALUES ($1,$2,'package',$3, now() - interval '1 day', now() + interval '30 days')`, [ids.student, ids.subject, ids.sub]);
    studentToken = signAccessToken('student', ids.student, ids.session, 'web').token;
    poorToken = signAccessToken('student', ids.poor, ids.poorSession, 'web').token;

    await q(`INSERT INTO ${T.users} (id, kind, email, name_en, name_ar) VALUES ($1,'admin',$2,'Test Admin','مسؤول')`, [ids.admin, `admin-${tag}@test.local`]);
    await q(`INSERT INTO ${T.admin_users} (user_id, password_hash) VALUES ($1,'x') ON CONFLICT DO NOTHING`, [ids.admin]).catch(() => undefined);
    await q(`INSERT INTO ${T.roles} (key, name_en, name_ar, is_system) VALUES ('super_admin','Super Admin','مدير عام',true) ON CONFLICT DO NOTHING`).catch(() => undefined);
    const role = await q(`SELECT id FROM ${T.roles} WHERE key = 'super_admin'`);
    await q(`INSERT INTO ${T.admin_roles} (user_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [ids.admin, role.rows[0]?.id]).catch(() => undefined);
    await q(`INSERT INTO ${T.sessions} (id, user_id, audience, refresh_token_hash, platform, expires_at) VALUES ($1,$2,'admin',$3,'admin', now() + interval '1 day')`, [ids.adminSession, ids.admin, `h-${tag}-a`]);
    adminToken = signAccessToken('admin', ids.admin, ids.adminSession, 'admin').token;
  }, 180_000);

  afterAll(async () => {
    if (dbUp) {
      await pool.query(`DELETE FROM ${T.users} WHERE id = ANY($1::uuid[])`, [[ids.student, ids.poor, ids.admin]]).catch(() => undefined);
      await pool.query(`DELETE FROM ${T.exam_blueprints} WHERE slug LIKE $1 OR id = $2`, [`%${tag}%`, ids.blueprint]).catch(() => undefined);
      await pool.query(`DELETE FROM ${T.packages} WHERE id = $1`, [ids.pkg]).catch(() => undefined);
      await pool.query(`DELETE FROM ${T.subjects} WHERE id = ANY($1::uuid[]) OR slug LIKE $2`, [[ids.subject, ids.other], `%${tag}%`]).catch(() => undefined);
      await pool.query(`DELETE FROM ${T.video_assets} WHERE id = $1`, [ids.video]).catch(() => undefined);
    }
    await closeDb();
  }, 60_000);

  const stu = (r: request.Test, token = studentToken) => r.set('Authorization', `Bearer ${token}`).set('X-Client-Platform', 'web').set('Accept-Language', 'en');
  const adm = (r: request.Test) => r.set('Authorization', `Bearer ${adminToken}`).set('Accept-Language', 'en');

  it('CAT-01/02: subjects (anonymous + student) and subject detail by slug', async () => {
    const anon = await request(app).get('/api/v1/subjects');
    expect(anon.status).toBe(200);
    const mine = anon.body.data.find((s: { id: string }) => s.id === ids.subject);
    expect(mine).toMatchObject({ locked: null, progress: null, lessonsCount: 1 });
    const r = await stu(request(app).get(`/api/v1/subjects/math-${tag}`));
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ locked: false, nextLessonId: ids.lesson });
    expect(r.body.data.lessons).toHaveLength(1);
    expect(r.body.data.units[0].chapters[0].id).toBe(ids.topic);
  });

  it('entitlement gating: 402 locked payload for a student without subscription', async () => {
    const r = await stu(request(app).get(`/api/v1/lessons/${ids.lesson}/stream-url`), poorToken);
    expect(r.status).toBe(402);
    expect(r.body.error.code).toBe('SUBSCRIPTION_REQUIRED');
    expect(r.body.error.details.locked).toMatchObject({ reason: 'NO_SUBSCRIPTION', subjectId: ids.subject, packageIds: [ids.pkg] });
    const d = await stu(request(app).get(`/api/v1/lessons/${ids.lesson}`), poorToken);
    expect(d.status).toBe(200);
    expect(d.body.data).toMatchObject({ locked: true, resources: [] });
  });

  it('CAT-05/06 + PRG-01: lesson detail, signed stream URL, watch heartbeat → resume → completion', async () => {
    const d = await stu(request(app).get(`/api/v1/lessons/${ids.lesson}`));
    expect(d.body.data).toMatchObject({ hasVideo: true, unitIndex: 1, quiz: { available: true } });
    const s = await stu(request(app).get(`/api/v1/lessons/${ids.lesson}/stream-url`));
    expect(s.status).toBe(200);
    expect(s.body.data).toMatchObject({ url: 'https://example.com/v.mp4', type: 'mp4', heartbeatSeconds: expect.any(Number) });
    const w = await stu(request(app).put('/api/v1/progress/watch')).send({ lessonId: ids.lesson, positionSec: 120, durationSec: 600, event: 'heartbeat', watchedSecDelta: 10 });
    expect(w.body.data).toMatchObject({ status: 'in-progress', progress: 20, positionSec: 120, justCompleted: false });
    const done = await stu(request(app).put('/api/v1/progress/watch')).send({ lessonId: ids.lesson, positionSec: 500, durationSec: 600, event: 'heartbeat' });
    expect(done.body.data).toMatchObject({ status: 'completed', progress: 100, justCompleted: true });
  });

  it('CAT-08/09: notes', async () => {
    await stu(request(app).put(`/api/v1/lessons/${ids.lesson}/note`)).send({ text: 'remember i^2 = -1' }).expect(200);
    const n = await stu(request(app).get(`/api/v1/lessons/${ids.lesson}/note`));
    expect(n.body.data.text).toBe('remember i^2 = -1');
  });

  let mistakeId = '';
  it('QUZ-01…03: randomized quiz, instant feedback, wrong answer → mistake, result', async () => {
    const st = await stu(request(app).post(`/api/v1/quizzes/${ids.lesson}/start`)).send({});
    expect(st.status).toBe(201);
    expect(st.body.data.questions.length).toBeGreaterThan(0);
    expect(st.body.data.questions[0].correctOptionId).toBeUndefined();
    const attemptId = st.body.data.attemptId;
    const q0 = st.body.data.questions[0];
    const wrong = await stu(request(app).post(`/api/v1/quizzes/attempts/${attemptId}/answer`)).send({ questionId: q0.id, optionId: q0.options.find((o: { text: { en: string } }) => o.text.en !== 'opt 0').id });
    expect(wrong.body.data).toMatchObject({ correct: false, mistake: { questionId: q0.id, status: 'unresolved', repeatCount: 1 } });
    mistakeId = wrong.body.data.mistake.id;
    const again = await stu(request(app).post(`/api/v1/quizzes/attempts/${attemptId}/answer`)).send({ questionId: q0.id, optionId: q0.options[0].id });
    expect(again.status).toBe(409);
    const res = await stu(request(app).post(`/api/v1/quizzes/attempts/${attemptId}/submit`)).send({ timeSpentSec: 30 });
    expect(res.body.data).toMatchObject({ attemptId, mistakesAdded: 1, passed: false });
  });

  it('MST-01…05: list with counts, detail conceals answer, retry reveals and masters', async () => {
    const l = await stu(request(app).get('/api/v1/mistakes?status=unresolved&groupBy=subject'));
    expect(l.body.meta.counts.unresolved).toBeGreaterThanOrEqual(1);
    expect(l.body.meta.groups[0].ids).toContain(mistakeId);
    const d = await stu(request(app).get(`/api/v1/mistakes/${mistakeId}`));
    expect(d.body.data.question).toMatchObject({ correctOptionId: null, correctIndex: -1 });
    const q = await pool.query(`SELECT o.id FROM ${T.question_options} o JOIN ${T.mistake_records} m ON m.question_id = o.question_id WHERE m.id = $1 AND o.is_correct`, [mistakeId]);
    const r = await stu(request(app).post(`/api/v1/mistakes/${mistakeId}/retry`)).send({ optionId: q.rows[0]?.id });
    expect(r.body.data).toMatchObject({ correct: true, mistake: { status: 'mastered' } });
    expect(r.body.data.correctOptionId).toBe(q.rows[0]?.id);
    expect(r.body.data.mistake.history.at(-1)).toMatchObject({ source: 'retry', correct: true });
  });

  it('PRA/BNK/BMK: practice from bookmarks + filters, bank facets, bookmarks', async () => {
    await stu(request(app).put(`/api/v1/bookmarks/${questionIds[1]}`)).expect(200);
    const ids2 = await stu(request(app).get('/api/v1/bookmarks/ids'));
    expect(ids2.body.data).toContain(questionIds[1]);
    const f = await stu(request(app).get(`/api/v1/bank/facets?subjectId=math-${tag}`));
    expect(f.body.data.matchCount).toBe(12);
    const bank = await stu(request(app).get(`/api/v1/bank/questions?subjectId=${ids.subject}&reveal=true&pageSize=3`));
    expect(bank.body.data[0].correctOptionId).toBeTruthy();
    const none = await stu(request(app).post('/api/v1/practice/start')).send({ mode: 'filters', filters: { subjectId: ids.subject, q: 'zzzz-no-match' }, count: 10 });
    expect(none.status).toBe(422);
    expect(none.body.error.details.reason).toBe('NO_QUESTIONS');
    const p = await stu(request(app).post('/api/v1/practice/start')).send({ mode: 'bookmarks', filters: { subjectId: ids.subject }, count: 10 });
    expect(p.body.data.questions.map((q: { id: string }) => q.id)).toEqual([questionIds[1]]);
    const a = await stu(request(app).post(`/api/v1/practice/${p.body.data.sessionId}/answer`)).send({ questionId: questionIds[1], optionId: p.body.data.questions[0].options.find((o: { text: { en: string } }) => o.text.en === 'opt 0').id });
    expect(a.body.data).toMatchObject({ correct: true, streak: 1 });
    const fin = await stu(request(app).post(`/api/v1/practice/${p.body.data.sessionId}/finish`)).send({ timeSpentSec: 20 });
    expect(fin.body.data).toMatchObject({ score: 100, band: 'excellent', total: 1 });
  });

  it('EXM-03…08: start consumes an attempt, autosave seq, flag, idempotent submit, result', async () => {
    const st = await stu(request(app).post(`/api/v1/exams/${ids.blueprint}/start`)).send({});
    expect(st.status).toBe(201);
    const s = st.body.data;
    expect(s.questions).toHaveLength(6);
    expect(new Date(s.endsAt).getTime()).toBeGreaterThan(new Date(s.serverNow).getTime());
    const resume = await stu(request(app).post(`/api/v1/exams/${ids.blueprint}/start`)).send({});
    expect(resume.body.data.attemptId).toBe(s.attemptId);
    const q0 = s.questions[0];
    const save = await stu(request(app).put(`/api/v1/exams/attempts/${s.attemptId}/autosave`)).send({ answers: { [q0.id]: q0.options[0].id }, flagged: [], currentIndex: 1, clientSavedAt: new Date().toISOString(), seq: 2 });
    expect(save.body.data).toMatchObject({ seq: 2, lastSavedAt: expect.any(String) });
    const stale = await stu(request(app).put(`/api/v1/exams/attempts/${s.attemptId}/autosave`)).send({ answers: { [q0.id]: null }, flagged: [], currentIndex: 0, clientSavedAt: new Date().toISOString(), seq: 1 });
    expect(stale.body.data.seq).toBe(2);
    const flag = await stu(request(app).post(`/api/v1/exams/attempts/${s.attemptId}/flag`)).send({ questionId: q0.id, flagged: true });
    expect(flag.body.data.flagged).toEqual([q0.id]);
    const early = await stu(request(app).get(`/api/v1/exams/attempts/${s.attemptId}/result`));
    expect(early.status).toBe(409);
    const sub = await stu(request(app).post(`/api/v1/exams/attempts/${s.attemptId}/submit`)).set('Idempotency-Key', `k-${tag}`).send({ reason: 'manual' });
    expect(sub.body.data).toMatchObject({ attemptId: s.attemptId, status: 'submitted' });
    const sub2 = await stu(request(app).post(`/api/v1/exams/attempts/${s.attemptId}/submit`)).set('Idempotency-Key', `k2-${tag}`).send({ reason: 'manual' });
    expect(sub2.body.data.status).toBe('submitted');
    const r = await stu(request(app).get(`/api/v1/exams/attempts/${s.attemptId}/result`));
    expect(r.body.data.score).toMatchObject({ total: 6, unanswered: expect.any(Number) });
    expect(r.body.data.topicBreakdown.length).toBeGreaterThan(0);
    const saveAfter = await stu(request(app).put(`/api/v1/exams/attempts/${s.attemptId}/autosave`)).send({ answers: {}, flagged: [], currentIndex: 0, clientSavedAt: new Date().toISOString(), seq: 99 });
    expect(saveAfter.status).toBe(409);
  });

  it('auto-submit job finalizes expired attempts', async () => {
    const st = await stu(request(app).post(`/api/v1/exams/${ids.blueprint}/start`)).send({});
    await pool.query(`UPDATE ${T.exam_attempts} SET deadline_at = now() - interval '1 hour' WHERE id = $1`, [st.body.data.attemptId]);
    expect(await autoSubmitExpiredAttempts()).toBeGreaterThanOrEqual(1);
    const r = await stu(request(app).get(`/api/v1/exams/attempts/${st.body.data.attemptId}/result`));
    expect(r.status).toBe(200);
    expect(r.body.data.autoSubmitted).toBe(true);
  });

  it('PRG-04/09/13: dashboard, streak calendar, achievements', async () => {
    const d = await stu(request(app).get('/api/v1/progress/dashboard'));
    expect(d.status).toBe(200);
    expect(d.body.data.subscription).toHaveProperty('endsAt');
    expect(d.body.data.weeklyStudy.days).toHaveLength(7);
    const c = await stu(request(app).get('/api/v1/progress/streak-calendar?weeks=4'));
    expect(c.body.data.days).toHaveLength(28);
    expect((await stu(request(app).get('/api/v1/progress/achievements'))).status).toBe(200);
    expect((await stu(request(app).get('/api/v1/progress/today-plan'))).status).toBe(200);
  });

  it('admin: lesson workflow (publish needs ready video) + versions', async () => {
    const tr = await adm(request(app).post(`/api/v1/admin/lessons/${ids.lesson2}/transition`)).send({ to: 'in_review' });
    expect(tr.status, JSON.stringify(tr.body)).toBe(200);
    expect(tr.body.data.status).toBe('in_review');
    await adm(request(app).post(`/api/v1/admin/lessons/${ids.lesson2}/approve`)).send({}).expect(200);
    const pub = await adm(request(app).post(`/api/v1/admin/lessons/${ids.lesson2}/transition`)).send({ to: 'published' });
    expect(pub.status).toBe(422);
    expect(pub.body.error.details.reason).toBe('VIDEO_NOT_READY');
    const bad = await adm(request(app).post(`/api/v1/admin/lessons/${ids.lesson2}/transition`)).send({ to: 'archived' });
    expect(bad.status).toBe(200);
    const v = await adm(request(app).get(`/api/v1/admin/lessons/${ids.lesson2}/versions`));
    expect(v.body.data.length).toBeGreaterThanOrEqual(2);
    const list = await adm(request(app).get(`/api/v1/admin/lessons?subjectId=${ids.subject}&view=board&sort=nonsense`));
    expect(list.status).toBe(200);
    expect(list.body.meta.counts).toBeDefined();
  });

  it('admin: question create/validate/review workflow + similarity + quiz rules + blueprint availability + attempts + search', async () => {
    const bad = await adm(request(app).post('/api/v1/admin/questions')).send({ type: 'mcq', difficulty: 'easy', subjectId: ids.subject, unitId: ids.unit, topicId: ids.topic, body: { en: 'Too few options here', ar: 'خيارات قليلة' }, explanation: { en: 'Because', ar: 'لأن ذلك' }, options: [{ text: { en: 'a', ar: 'a' }, correct: true }] });
    expect(bad.status).toBe(422);
    const c = await adm(request(app).post('/api/v1/admin/questions')).send({
      type: 'mcq', difficulty: 'medium', subjectId: ids.subject, unitId: ids.unit, topicId: ids.topic,
      body: { en: `Brand new question body ${tag}`, ar: 'سؤال جديد تماماً' }, explanation: { en: 'Because math.', ar: 'لأن الرياضيات.' },
      options: [{ text: { en: 'A', ar: 'أ' }, correct: false }, { text: { en: 'B', ar: 'ب' }, correct: true }], tags: ['concept'], status: 'in_review',
    });
    expect(c.status).toBe(201);
    expect(c.body.data.code).toMatch(/^MATH-CN-\d{4}$/);
    const rej = await adm(request(app).post(`/api/v1/admin/questions/${c.body.data.id}/transition`)).send({ action: 'reject', comment: 'no' });
    expect(rej.status).toBe(422);
    const app1 = await adm(request(app).post(`/api/v1/admin/questions/${c.body.data.id}/transition`)).send({ action: 'approve' });
    expect(app1.body.data).toMatchObject({ status: 'approved', reviewer: { id: ids.admin } });
    const sim = await adm(request(app).post('/api/v1/admin/questions/similar')).send({ topicId: ids.topic, body: { en: `Question number 3 about complex numbers ${tag}` } });
    expect(sim.body.data[0].score).toBeGreaterThan(0.72);
    const rules = await adm(request(app).get(`/api/v1/admin/quiz-rules?scope=subject&subjectId=${ids.subject}`));
    expect(rules.body.data).toHaveLength(1);
    const ov = await adm(request(app).post('/api/v1/admin/quiz-rules')).send({ lessonId: ids.lesson, questionCount: 3, poolSize: 10, randomize: true, alternativeSets: 2, passThreshold: 70, retryPolicy: 'limited', maxRetries: 1, cooldownMinutes: 60, showExplanation: false, requireCompletionToUnlock: false });
    expect(ov.status).toBe(201);
    const eff = await adm(request(app).get(`/api/v1/admin/quiz-rules/effective?lessonId=${ids.lesson}`));
    expect(eff.body.data).toMatchObject({ source: 'lesson', questionCount: 3 });
    const av = await adm(request(app).post('/api/v1/admin/exam-blueprints/availability')).send({ rows: [{ subjectId: ids.subject, topicId: null, count: 6, easy: 34, medium: 33, hard: 33 }] });
    expect(av.body.data.shortRows).toBe(0);
    const att = await adm(request(app).get(`/api/v1/admin/attempts?studentId=${ids.student}`));
    expect(att.body.data.length).toBeGreaterThanOrEqual(3);
    const detail = await adm(request(app).get(`/api/v1/admin/attempts/${att.body.data[0].id}`));
    expect(Array.isArray(detail.body.data.answers)).toBe(true);
    const srch = await adm(request(app).get(`/api/v1/search?q=intro&scopes=lessons,students`));
    expect(srch.body.data.lessons.some((l: { id: string; status?: string }) => l.id === ids.lesson && l.status === 'published')).toBe(true);
  });
});
