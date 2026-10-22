/**
 * Agent D integration: AI tutor (SSE + polling, allowance decrement, kill switch, blocked keywords) and
 * notifications (inbox, templates, campaign audience + send, deliveries) against the real database under the TEST
 * prefix (`eduway_platform_test_`). Auto-skips when the database is unreachable. Only rows created here are removed.
 */
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { signAccessToken } from '../../src/common/auth/tokens.js';
import { T, TABLE_PREFIX, TEST_PREFIX } from '../../src/config/constants.js';
import { closeDb, pingDb, pool } from '../../src/config/db.js';
import { runMigrations } from '../../src/db/migrator.js';
import { aiTutorService } from '../../src/modules/ai-tutor/service.js';
import { invalidateAiSettings } from '../../src/modules/ai-tutor/settings.js';
import { parseSse } from '../../src/modules/ai-tutor/sse.js';

const dbUp = (await pingDb(8000)).ok;
const app = createApp();
const tag = randomUUID().slice(0, 8);
const ids = { student: randomUUID(), admin: randomUUID(), subject: randomUUID(), pkg: randomUUID(), sub: randomUUID(), session: randomUUID(), adminSession: randomUUID(), role: randomUUID() };
let studentToken = '';
let adminToken = '';

describe.skipIf(!dbUp)('engagement (AI tutor + notifications) — integration', () => {
  beforeAll(async () => {
    expect(TABLE_PREFIX).toBe(TEST_PREFIX);
    await runMigrations(pool);
    const q = (sql: string, p: unknown[] = []) => pool.query(sql, p);
    await q(`INSERT INTO ${T.ai_settings} (id) VALUES (1) ON CONFLICT (id) DO NOTHING`);
    await q(`UPDATE ${T.ai_settings} SET enabled = true, rate_limit_per_minute = 100, rate_limit_per_hour = 1000, blocked_keywords = $1 WHERE id = 1`, [[`forbidden-${tag}`]]);
    invalidateAiSettings();
    await q(`INSERT INTO ${T.subjects} (id, slug, name_en, name_ar) VALUES ($1, $2, 'Physics', 'الفيزياء')`, [ids.subject, `phys-${tag}`]);
    await q(`INSERT INTO ${T.packages} (id, slug, name_en, name_ar, status) VALUES ($1, $2, 'Test pkg', 'باقة', 'active')`, [ids.pkg, `pkg-${tag}`]);
    await q(`INSERT INTO ${T.users} (id, kind, phone, name_en, name_ar, locale) VALUES ($1, 'student', $2, 'Test Student', 'طالب', 'en')`, [ids.student, `+96477${Math.floor(10_000_000 + Math.random() * 89_999_999)}`]);
    await q(`INSERT INTO ${T.student_profiles} (user_id, profile_completed) VALUES ($1, true)`, [ids.student]);
    await q(`INSERT INTO ${T.subscriptions} (id, user_id, package_id, status, starts_at, ends_at, ai_quota) VALUES ($1,$2,$3,'active', now() - interval '1 day', now() + interval '30 days', 3)`, [ids.sub, ids.student, ids.pkg]);
    await q(`INSERT INTO ${T.sessions} (id, user_id, audience, refresh_token_hash, platform, expires_at) VALUES ($1,$2,'student',$3,'web', now() + interval '1 day')`, [ids.session, ids.student, `h-${tag}-s`]);
    studentToken = signAccessToken('student', ids.student, ids.session, 'web').token;

    await q(`INSERT INTO ${T.users} (id, kind, email, name_en, name_ar) VALUES ($1, 'admin', $2, 'Test Admin', 'مسؤول')`, [ids.admin, `admin-${tag}@test.local`]);
    await q(`INSERT INTO ${T.admin_users} (user_id, password_hash) VALUES ($1, 'x') ON CONFLICT DO NOTHING`, [ids.admin]).catch(() => undefined);
    await q(`INSERT INTO ${T.roles} (id, key, name_en, name_ar, is_system) VALUES ($1, 'super_admin', 'Super Admin', 'مدير عام', true) ON CONFLICT DO NOTHING`, [ids.role]).catch(() => undefined);
    const role = await q(`SELECT id FROM ${T.roles} WHERE key = 'super_admin'`);
    await q(`INSERT INTO ${T.admin_roles} (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [ids.admin, role.rows[0]?.id]).catch(() => undefined);
    await q(`INSERT INTO ${T.sessions} (id, user_id, audience, refresh_token_hash, platform, expires_at) VALUES ($1,$2,'admin',$3,'admin', now() + interval '1 day')`, [ids.adminSession, ids.admin, `h-${tag}-a`]);
    adminToken = signAccessToken('admin', ids.admin, ids.adminSession, 'admin').token;
  }, 180_000);

  afterAll(async () => {
    if (dbUp) {
      await aiTutorService.drain();
      await pool.query(`DELETE FROM ${T.users} WHERE id = ANY($1::uuid[])`, [[ids.student, ids.admin]]).catch(() => undefined);
      await pool.query(`DELETE FROM ${T.packages} WHERE id = $1`, [ids.pkg]).catch(() => undefined);
      await pool.query(`DELETE FROM ${T.subjects} WHERE id = $1`, [ids.subject]).catch(() => undefined);
      await pool.query(`DELETE FROM ${T.notification_templates} WHERE name LIKE $1`, [`%${tag}%`]).catch(() => undefined);
    }
    await closeDb();
  }, 60_000);

  const stu = (r: request.Test) => r.set('Authorization', `Bearer ${studentToken}`).set('X-Client-Platform', 'web').set('Accept-Language', 'en');
  const adm = (r: request.Test) => r.set('Authorization', `Bearer ${adminToken}`).set('Accept-Language', 'en');

  let conversationId = '';

  it('allowance reflects the subscription quota', async () => {
    const r = await stu(request(app).get('/api/v1/ai-tutor/allowance'));
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ enabled: true, quota: 3, used: 0, remaining: 3 });
  });

  it('creates a conversation with a welcome message', async () => {
    const r = await stu(request(app).post('/api/v1/ai-tutor/conversations')).send({ subjectId: `phys-${tag}` });
    expect(r.status).toBe(201);
    conversationId = r.body.data.id;
    expect(r.body.data.messages[0]).toMatchObject({ kind: 'welcome', role: 'tutor' });
  });

  it('streams an answer over SSE (meta → delta… → done with full text) and decrements the allowance', async () => {
    const r = await stu(request(app).post(`/api/v1/ai-tutor/conversations/${conversationId}/messages`))
      .set('Accept', 'text/event-stream')
      .buffer(true)
      .parse((res, cb) => {
        let data = '';
        res.on('data', (c: Buffer) => (data += c.toString('utf8')));
        res.on('end', () => cb(null, data));
      })
      .send({ text: "Explain Faraday's law of induction", lang: 'en' });
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toContain('text/event-stream');
    const events = parseSse(r.body as string);
    expect(events[0]?.event).toBe('meta');
    const deltas = events.filter((e) => e.event === 'delta').map((e) => (JSON.parse(e.data) as { text: string }).text);
    const done = events.find((e) => e.event === 'done');
    expect(done).toBeTruthy();
    const payload = JSON.parse(done?.data ?? '{}') as { message: { text: string; status: string }; allowance: { used: number; remaining: number } };
    expect(payload.message.status).toBe('complete');
    expect(payload.message.text).toBe(deltas.join(''));
    expect(payload.message.text).toContain('Faraday');
    expect(payload.allowance).toMatchObject({ used: 1, remaining: 2 });
  }, 60_000);

  it('polling fallback returns a pending tutor message that completes via AIT-09', async () => {
    const r = await stu(request(app).post(`/api/v1/ai-tutor/conversations/${conversationId}/messages`)).send({ text: 'capacitor in series', lang: 'ar', clientMessageId: `c-${tag}` });
    expect(r.status).toBe(200);
    expect(r.body.data.pollAfterMs).toBe(800);
    await aiTutorService.drain();
    const m = await stu(request(app).get(`/api/v1/ai-tutor/messages/${r.body.data.tutorMessage.id}`));
    expect(m.body.data.status).toBe('complete');
    const replay = await stu(request(app).post(`/api/v1/ai-tutor/conversations/${conversationId}/messages`)).send({ text: 'capacitor in series', lang: 'ar', clientMessageId: `c-${tag}` });
    expect(replay.body.data.studentMessage.id).toBe(r.body.data.studentMessage.id); // idempotent retry
  }, 60_000);

  it('blocked keywords → 422 AI_BLOCKED_CONTENT and a keyword flag', async () => {
    const r = await stu(request(app).post(`/api/v1/ai-tutor/conversations/${conversationId}/messages`)).send({ text: `please forbidden-${tag}`, lang: 'en' });
    expect(r.status).toBe(422);
    expect(r.body.error.details.reason).toBe('AI_BLOCKED_CONTENT');
    const f = await pool.query(`SELECT source FROM ${T.ai_flags} WHERE user_id = $1`, [ids.student]);
    expect(f.rows.map((x) => x.source)).toContain('keyword');
  });

  it('exhausted allowance → 422 AI_ALLOWANCE_EXHAUSTED; kill switch → 403', async () => {
    await stu(request(app).post(`/api/v1/ai-tutor/conversations/${conversationId}/messages`)).send({ text: 'derivative chain rule', lang: 'en' });
    await aiTutorService.drain();
    const r = await stu(request(app).post(`/api/v1/ai-tutor/conversations/${conversationId}/messages`)).send({ text: 'integral', lang: 'en' });
    expect(r.status).toBe(422);
    expect(r.body.error.details.reason).toBe('AI_ALLOWANCE_EXHAUSTED');
    const off = await adm(request(app).post('/api/v1/admin/ai/settings/disable')).send({ reason: 'maintenance window' });
    expect(off.status).toBe(200);
    expect(off.body.data.enabled).toBe(false);
    const g = await stu(request(app).post(`/api/v1/ai-tutor/conversations/${conversationId}/messages`)).send({ text: 'x', lang: 'en' });
    expect(g.status).toBe(403);
    expect(g.body.error.details.reason).toBe('AI_GLOBALLY_DISABLED');
    await adm(request(app).post('/api/v1/admin/ai/settings/enable'));
  }, 60_000);

  it('admin usage dashboard counts the questions', async () => {
    const r = await adm(request(app).get('/api/v1/admin/ai/usage'));
    expect(r.status).toBe(200);
    expect(r.body.data.kpis.questions.value).toBeGreaterThanOrEqual(3);
    expect(r.body.data.kpis.questions.spark).toHaveLength(20);
  });

  it('notifications: template → audience preview → send now (in-app) → inbox → read-all', async () => {
    const t = await adm(request(app).post('/api/v1/admin/notification-templates')).send({ name: `Reminder ${tag}`, type: 'exam_reminder', channel: 'in_app', active: true, subject: { en: 'Exam soon', ar: 'امتحان قريب' }, body: { en: 'Hi {student_name}, revise!', ar: 'مرحبا {student_name}، راجع!' } });
    expect(t.status).toBe(201);
    expect(t.body.data.variables).toEqual(['student_name']);
    const filters = { packageId: ids.pkg };
    const pv = await adm(request(app).post('/api/v1/admin/campaigns/audience-preview')).send({ filters, channel: 'in_app' });
    expect(pv.status, JSON.stringify(pv.body)).toBe(200);
    expect(pv.body.data).toMatchObject({ matched: 1, reachable: 1 });
    const noKey = await adm(request(app).post('/api/v1/admin/campaigns')).send({ name: `Camp ${tag}`, channel: 'in_app', templateId: t.body.data.id, filters, sendAt: null });
    expect(noKey.status).toBe(400); // Idempotency-Key required
    const c = await adm(request(app).post('/api/v1/admin/campaigns')).set('Idempotency-Key', `camp-${tag}-0001`).send({ name: `Camp ${tag}`, channel: 'in_app', templateId: t.body.data.id, filters, sendAt: null });
    expect(c.status).toBe(201);
    expect(c.body.data.audienceCount).toBe(1);
    const inbox = await stu(request(app).get('/api/v1/notifications?filter=unread'));
    expect(inbox.status).toBe(200);
    expect(inbox.body.data[0]).toMatchObject({ type: 'exam', title: { en: 'Exam soon' }, body: { en: 'Hi Test Student, revise!' }, read: false });
    expect(inbox.body.meta.unreadCount).toBeGreaterThanOrEqual(1);
    const all = await stu(request(app).post('/api/v1/notifications/read-all'));
    expect(all.body.data.unreadCount).toBe(0);
    const d = await adm(request(app).get(`/api/v1/admin/deliveries?campaignId=${c.body.data.id}`));
    expect(d.body.data[0]).toMatchObject({ channel: 'in_app', status: 'delivered' });
    const none = await adm(request(app).post('/api/v1/admin/campaigns')).set('Idempotency-Key', `camp-${tag}-0002`).send({ name: `Empty ${tag}`, channel: 'email', templateId: t.body.data.id, filters, sendAt: null });
    expect(none.status).toBe(422); // channel mismatch (in_app template on email)
  }, 60_000);

  it('admin AI + notification read/write endpoints answer 200 against the real schema', async () => {
    const gets = [
      '/api/v1/admin/ai/settings',
      '/api/v1/admin/ai/models',
      '/api/v1/admin/ai/flags?status=open&sort=-severity',
      '/api/v1/admin/ai/flagged-users?sort=-flags',
      '/api/v1/admin/ai/usage?platform=web',
      '/api/v1/admin/notification-templates?type=exam_reminder&sort=name',
      '/api/v1/admin/notification-templates/variables',
      '/api/v1/admin/campaigns?sort=-audienceCount',
      '/api/v1/admin/deliveries?status=delivered&q=Test',
      '/api/v1/admin/deliveries/stats',
      '/api/v1/ai-tutor/conversations',
      `/api/v1/ai-tutor/suggestions?subjectId=phys-${tag}`,
      '/api/v1/notifications/unread-count',
    ];
    for (const g of gets) {
      const r = await (g.startsWith('/api/v1/admin') ? adm : stu)(request(app).get(g));
      expect(r.status, `${g} ${JSON.stringify(r.body).slice(0, 300)}`).toBe(200);
    }
    const flags = await adm(request(app).get('/api/v1/admin/ai/flags'));
    const flagId = flags.body.data[0]?.id as string;
    const detail = await adm(request(app).get(`/api/v1/admin/ai/flags/${flagId}`));
    expect(detail.body.data.transcript.length).toBeGreaterThan(0);
    const reviewed = await adm(request(app).patch(`/api/v1/admin/ai/flags/${flagId}`)).send({ status: 'reviewed', note: 'checked' });
    expect(reviewed.body.data).toMatchObject({ status: 'reviewed', note: 'checked' });
    const warn = await adm(request(app).post(`/api/v1/admin/ai/flagged-users/${ids.student}/warn`)).send({});
    expect(warn.body.data).toMatchObject({ warned: true });
    const patch = await adm(request(app).patch('/api/v1/admin/ai/settings')).send({ rateLimitPerMinute: 50, rateLimitPerHour: 500, provider: 'anthropic', model: 'claude-sonnet-5-5', suggestedPrompts: { [`phys-${tag}`]: [{ en: 'Q?', ar: 'س؟' }] } });
    expect(patch.status, JSON.stringify(patch.body)).toBe(200);
    expect(patch.body.data.rateLimitPerMinute).toBe(50);
    const bad = await adm(request(app).patch('/api/v1/admin/ai/settings')).send({ provider: 'openai', model: 'claude-sonnet-5-5' });
    expect(bad.body.error.details.reason).toBe('AI_MODEL_INVALID');
    const dis = await adm(request(app).put(`/api/v1/admin/ai/disabled-users/${ids.student}`)).send({ reason: 'abuse' });
    expect(dis.body.data.disabledUserIds).toContain(ids.student);
    const blocked = await stu(request(app).get('/api/v1/ai-tutor/allowance'));
    expect(blocked.body.data.disabledReason).toBe('USER');
    await adm(request(app).delete(`/api/v1/admin/ai/disabled-users/${ids.student}`));
    const exp = await adm(request(app).post('/api/v1/admin/ai/flags/export')).send({ format: 'csv' });
    expect(exp.status).toBe(200);
    expect(exp.headers['content-type']).toContain('text/csv');
    const sugg = await stu(request(app).get(`/api/v1/ai-tutor/suggestions?subjectId=phys-${tag}`));
    expect(sugg.body.data).toEqual([{ en: 'Q?', ar: 'س؟' }]);
  }, 90_000);

  it('push campaign → Expo (mock) deliveries dispatched; jobs run against the schema', async () => {
    await pool.query(`INSERT INTO ${T.push_tokens} (user_id, token, platform, device_id) VALUES ($1, $2, 'android', 'dev-1') ON CONFLICT (token) DO NOTHING`, [ids.student, `ExponentPushToken[${tag}]`]);
    const t = await adm(request(app).post('/api/v1/admin/notification-templates')).send({ name: `Push ${tag}`, type: 'new_lesson', channel: 'push', active: true, subject: { en: 'New lesson', ar: 'درس جديد' }, body: { en: 'Watch it now', ar: 'شاهده الآن' } });
    const filters = { packageId: ids.pkg, platforms: ['android'] };
    const pv = await adm(request(app).post('/api/v1/admin/campaigns/audience-preview')).send({ filters, channel: 'push', templateId: t.body.data.id });
    expect(pv.body.data).toMatchObject({ matched: 1, reachable: 1 });
    const web = await adm(request(app).post('/api/v1/admin/campaigns/audience-preview')).send({ filters: { packageId: ids.pkg, platforms: ['ios'] }, channel: 'push' });
    expect(web.body.data.excluded.noPushToken + web.body.data.matched - web.body.data.reachable).toBeGreaterThanOrEqual(0);
    const c = await adm(request(app).post('/api/v1/admin/campaigns')).set('Idempotency-Key', `camp-${tag}-push`).send({ name: `Push ${tag}`, channel: 'push', templateId: t.body.data.id, filters, sendAt: null });
    expect(c.status, JSON.stringify(c.body)).toBe(201);
    const { dispatchQueued } = await import('../../src/modules/notifications/dispatch.js');
    await dispatchQueued({ campaignId: c.body.data.id });
    const got = await adm(request(app).get(`/api/v1/admin/campaigns/${c.body.data.id}`));
    expect(got.body.data.status).toBe('sent');
    expect(got.body.data.stats.delivered).toBe(1);
    const sched = await adm(request(app).post('/api/v1/admin/campaigns')).set('Idempotency-Key', `camp-${tag}-sched`).send({ name: `Later ${tag}`, channel: 'push', templateId: t.body.data.id, filters, sendAt: new Date(Date.now() + 3600_000).toISOString() });
    expect(sched.body.data.status).toBe('scheduled');
    const cancel = await adm(request(app).post(`/api/v1/admin/campaigns/${sched.body.data.id}/cancel`));
    expect(cancel.body.data).toMatchObject({ status: 'draft', scheduledAt: null });
    const { resetAiAllowances, generateEmbeddings } = await import('../../src/jobs/ai.js');
    const r = await resetAiAllowances();
    expect(r.checked).toBeGreaterThanOrEqual(1);
    const e = await generateEmbeddings({ lessonId: randomUUID() });
    expect(e.embedded).toBe(0);
    const { runJobNow } = await import('../../src/jobs/index.js');
    await runJobNow('eduway.campaign-scheduled-send');
    await runJobNow('eduway.expo-push-receipts');
  }, 90_000);
});
