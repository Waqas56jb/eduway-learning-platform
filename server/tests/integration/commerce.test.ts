/**
 * Agent C integration: packages, promotions, quote, MockGateway payment → webhook → entitlement, duplicate webhook,
 * refunds (access revoked), schools double-attribution guard, incentive preview, settlements, analytics, exports —
 * against the real database under the TEST prefix (`eduway_platform_test_`). Auto-skips when the DB is unreachable.
 * Only rows created here are removed.
 */
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { signAccessToken } from '../../src/common/auth/tokens.js';
import { T, TABLE_PREFIX, TEST_PREFIX } from '../../src/config/constants.js';
import { closeDb, pingDb, pool } from '../../src/config/db.js';
import { runMigrations } from '../../src/db/migrator.js';
import { signMock } from '../../src/modules/payments/providers.js';

const dbUp = (await pingDb(8000)).ok;
const app = createApp();
const tag = randomUUID().slice(0, 8);
const ids = { student: randomUUID(), admin: randomUUID(), subject: randomUUID(), pkg: randomUUID(), session: randomUUID(), adminSession: randomUUID(), gov: randomUUID(), m1: randomUUID(), m2: randomUUID() };
const govCode = `tg-${tag}`;
let studentToken = '';
let adminToken = '';
const created: { schools: string[]; promos: string[] } = { schools: [], promos: [] };

describe.skipIf(!dbUp)('commerce & partners — integration', () => {
  beforeAll(async () => {
    expect(TABLE_PREFIX).toBe(TEST_PREFIX);
    await runMigrations(pool);
    const q = (sql: string, p: unknown[] = []) => pool.query(sql, p);
    await q(`INSERT INTO ${T.ai_settings} (id) VALUES (1) ON CONFLICT (id) DO NOTHING`);
    await q(`INSERT INTO ${T.governorates} (id, code, name_en, name_ar) VALUES ($1, $2, 'Test Gov', 'محافظة')`, [ids.gov, govCode]);
    await q(`INSERT INTO ${T.subjects} (id, slug, name_en, name_ar) VALUES ($1, $2, 'Math', 'الرياضيات')`, [ids.subject, `math-${tag}`]);
    await q(`INSERT INTO ${T.packages} (id, slug, name_en, name_ar, status, price, validity_type, validity_value) VALUES ($1, $2, 'C Pack', 'باقة', 'active', 30000, 'days', 30)`, [ids.pkg, `cpkg-${tag}`]);
    await q(`INSERT INTO ${T.package_subjects} (package_id, subject_id) VALUES ($1, $2)`, [ids.pkg, ids.subject]);
    await q(`INSERT INTO ${T.users} (id, kind, phone, name_en, name_ar, locale) VALUES ($1, 'student', $2, 'C Student', 'طالب', 'en')`, [ids.student, `+96478${Math.floor(10_000_000 + Math.random() * 89_999_999)}`]);
    await q(`INSERT INTO ${T.student_profiles} (user_id, profile_completed) VALUES ($1, true)`, [ids.student]);
    await q(`INSERT INTO ${T.sessions} (id, user_id, audience, refresh_token_hash, platform, expires_at) VALUES ($1,$2,'student',$3,'web', now() + interval '1 day')`, [ids.session, ids.student, `hc-${tag}-s`]);
    studentToken = signAccessToken('student', ids.student, ids.session, 'web').token;
    await q(`INSERT INTO ${T.users} (id, kind, email, name_en, name_ar) VALUES ($1, 'admin', $2, 'C Admin', 'مسؤول')`, [ids.admin, `c-admin-${tag}@test.local`]);
    await q(`INSERT INTO ${T.admin_users} (user_id, password_hash) VALUES ($1, 'x') ON CONFLICT DO NOTHING`, [ids.admin]).catch(() => undefined);
    await q(`INSERT INTO ${T.roles} (key, name_en, name_ar, is_system) VALUES ('super_admin', 'Super Admin', 'مدير عام', true) ON CONFLICT DO NOTHING`).catch(() => undefined);
    const role = await q(`SELECT id FROM ${T.roles} WHERE key = 'super_admin'`);
    await q(`INSERT INTO ${T.admin_roles} (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [ids.admin, role.rows[0]?.id]).catch(() => undefined);
    await q(`INSERT INTO ${T.sessions} (id, user_id, audience, refresh_token_hash, platform, expires_at) VALUES ($1,$2,'admin',$3,'admin', now() + interval '1 day')`, [ids.adminSession, ids.admin, `hc-${tag}-a`]);
    adminToken = signAccessToken('admin', ids.admin, ids.adminSession, 'admin').token;
    for (const [id, n] of [[ids.m1, 1], [ids.m2, 2]] as const) {
      await q(`INSERT INTO ${T.marketers} (id, code, referral_code, name_en, name_ar, status) VALUES ($1,$2,$3,$4,$4,'active')`, [id, `MKT-${tag}-${n}`, `REF-${tag}-${n}`, `Marketer ${n}`]);
    }
  }, 240_000);

  afterAll(async () => {
    if (dbUp) {
      const q = (sql: string, p: unknown[]) => pool.query(sql, p).catch(() => undefined);
      await q(`DELETE FROM ${T.refunds} WHERE user_id = $1`, [ids.student]);
      await q(`DELETE FROM ${T.promotion_redemptions} WHERE user_id = $1`, [ids.student]);
      await q(`DELETE FROM ${T.subscriptions} WHERE user_id = $1`, [ids.student]);
      await q(`DELETE FROM ${T.payments} WHERE user_id = $1`, [ids.student]);
      await q(`DELETE FROM ${T.users} WHERE id = ANY($1::uuid[])`, [[ids.student, ids.admin]]);
      await q(`DELETE FROM ${T.promotions} WHERE id = ANY($1::uuid[])`, [created.promos]);
      await q(`DELETE FROM ${T.marketer_schools} WHERE school_id = ANY($1::uuid[])`, [created.schools]);
      await q(`DELETE FROM ${T.entity_notes} WHERE entity_id = ANY($1::uuid[])`, [created.schools]);
      await q(`DELETE FROM ${T.schools} WHERE id = ANY($1::uuid[])`, [created.schools]);
      await q(`DELETE FROM ${T.marketers} WHERE id = ANY($1::uuid[])`, [[ids.m1, ids.m2]]);
      await q(`DELETE FROM ${T.packages} WHERE id = $1`, [ids.pkg]);
      await q(`DELETE FROM ${T.subjects} WHERE id = $1`, [ids.subject]);
      await q(`DELETE FROM ${T.governorates} WHERE id = $1`, [ids.gov]);
    }
    await closeDb();
  }, 60_000);

  const stu = (r: request.Test) => r.set('Authorization', `Bearer ${studentToken}`).set('X-Client-Platform', 'web').set('Accept-Language', 'en');
  const adm = (r: request.Test) => r.set('Authorization', `Bearer ${adminToken}`).set('Accept-Language', 'en');
  const idem = () => `it-${randomUUID()}`;
  let promoCode = '';
  let paymentId = '';
  let amount = 0;

  it('lists the package and quotes a new purchase', async () => {
    const list = await stu(request(app).get('/api/v1/packages'));
    expect(list.status).toBe(200);
    expect(list.body.data.some((p: { id: string }) => p.id === ids.pkg)).toBe(true);
    const q = await stu(request(app).post('/api/v1/payments/quote')).send({ packageId: ids.pkg, cycle: 'monthly' });
    expect(q.body.data).toMatchObject({ intent: 'new', subtotal: 30_000, total: 30_000, baseValidityDays: 30 });
    const y = await stu(request(app).post('/api/v1/payments/quote')).send({ packageId: ids.pkg, cycle: 'yearly' });
    expect(y.status).toBe(422);
    expect(y.body.error.details.reason).toBe('PACKAGE_UNAVAILABLE');
  });

  it('creates a promotion and validates it (percent | fixed)', async () => {
    promoCode = `IT-${tag}`.toUpperCase();
    const c = await adm(request(app).post('/api/v1/admin/promotions')).send({ code: promoCode, type: 'promo', discountType: 'fixed', discountValue: 5000, validFrom: new Date(Date.now() - 86_400_000).toISOString(), validTo: new Date(Date.now() + 86_400_000).toISOString() });
    expect(c.status).toBe(201);
    created.promos.push(c.body.data.id);
    const dup = await adm(request(app).post('/api/v1/admin/promotions')).send({ code: promoCode, type: 'promo', discountType: 'fixed', discountValue: 5000, validFrom: new Date().toISOString(), validTo: new Date(Date.now() + 1000).toISOString() });
    expect(dup.status).toBe(409);
    const v = await stu(request(app).post('/api/v1/promotions/validate')).send({ code: promoCode, packageId: ids.pkg, cycle: 'monthly' });
    expect(v.body.data).toMatchObject({ valid: true, type: 'fixed', discountAmount: 5000, total: 25_000 });
    const bad = await stu(request(app).post('/api/v1/promotions/validate')).send({ code: 'NOPE-0000', packageId: ids.pkg, cycle: 'monthly' });
    expect(bad.body.data).toMatchObject({ valid: false, reason: 'PROMO_INVALID' });
  });

  it('pays via the MockGateway → webhook → paid, receipt, entitlement', async () => {
    const noKey = await stu(request(app).post('/api/v1/payments/initiate')).send({ packageId: ids.pkg, cycle: 'monthly', gateway: 'mock' });
    expect(noKey.status).toBe(400);
    const init = await stu(request(app).post('/api/v1/payments/initiate')).set('Idempotency-Key', idem()).send({ packageId: ids.pkg, cycle: 'monthly', gateway: 'mock', promoCode, returnUrl: 'http://localhost:5173/pay?id=__ID__' });
    expect(init.status).toBe(201);
    paymentId = init.body.data.paymentId;
    amount = init.body.data.amount;
    expect(amount).toBe(25_000);
    expect(init.body.data.ref).toMatch(/^EDW-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(init.body.data.mock.confirmUrl).toContain(paymentId);
    const meta = await pool.query(`SELECT metadata->>'returnUrl' AS u FROM ${T.payments} WHERE id = $1`, [paymentId]);
    expect(meta.rows[0].u).toBe(`http://localhost:5173/pay?id=${paymentId}`);
    const conf = await stu(request(app).post(`/api/v1/payments/mock/${paymentId}/confirm`)).send({ outcome: 'success' });
    expect(conf.body.data).toMatchObject({ status: 'paid', amount: 25_000, promoCode });
    expect(conf.body.data.receiptNumber).toMatch(/^R-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    const ents = await stu(request(app).get('/api/v1/me/entitlements'));
    expect(ents.body.data.some((e: { subjectId: string }) => e.subjectId === ids.subject)).toBe(true);
    const used = await pool.query(`SELECT used_count FROM ${T.promotions} WHERE upper(code) = $1`, [promoCode]);
    expect(used.rows[0].used_count).toBe(1);
    const pdf = await stu(request(app).get(`/api/v1/payments/${paymentId}/receipt?format=pdf`));
    expect(pdf.headers['content-type']).toContain('application/pdf');
  });

  it('duplicate webhooks never duplicate access; bad signatures are rejected', async () => {
    const body = JSON.stringify({ id: `evt_mock_${paymentId}_success`, type: 'payment.succeeded', data: { paymentId, amount } });
    for (let i = 0; i < 2; i++) {
      const r = await request(app).post('/api/v1/payments/webhook/mock').set('Content-Type', 'application/json').set('X-Signature', signMock(body)).send(body);
      expect(r.body.data).toEqual({ received: true, duplicate: true });
    }
    const subs = await pool.query(`SELECT count(*)::int AS n FROM ${T.subscriptions} WHERE payment_id = $1`, [paymentId]);
    expect(subs.rows[0].n).toBe(1);
    const bad = await request(app).post('/api/v1/payments/webhook/mock').set('Content-Type', 'application/json').set('X-Signature', 'sha256=00').send(body);
    expect(bad.status).toBe(401);
  });

  it('refunds: partial validation, full refund revokes access', async () => {
    const over = await adm(request(app).post(`/api/v1/admin/payments/${paymentId}/refunds`)).set('Idempotency-Key', idem()).send({ kind: 'partial', amount: 99_000, reason: 'too much refund' });
    expect(over.body.error.details.reason).toBe('REFUND_EXCEEDS_REMAINING');
    const full = await adm(request(app).post(`/api/v1/admin/payments/${paymentId}/refunds`)).set('Idempotency-Key', idem()).send({ kind: 'full', reason: 'integration refund', processNow: true });
    expect(full.status).toBe(201);
    expect(full.body.data.transaction).toMatchObject({ status: 'refunded', refundedAmount: 25_000 });
    const ent = await pool.query(`SELECT count(*)::int AS n FROM ${T.entitlements} WHERE user_id = $1 AND revoked_at IS NULL AND ends_at > now()`, [ids.student]);
    expect(ent.rows[0].n).toBe(0);
    const logs = await pool.query(`SELECT count(*)::int AS n FROM ${T.entitlement_logs} WHERE user_id = $1 AND action = 'revoke'`, [ids.student]);
    expect(logs.rows[0].n).toBeGreaterThan(0);
    const again = await adm(request(app).post(`/api/v1/admin/payments/${paymentId}/refunds`)).set('Idempotency-Key', idem()).send({ kind: 'full', reason: 'second refund' });
    expect(again.body.error.details.reason).toBe('NOT_REFUNDABLE');
  });

  it('schools: double-attribution guard + override reason → audit', async () => {
    const c = await adm(request(app).post('/api/v1/admin/schools')).send({ name: { en: 'IT School', ar: 'مدرسة' }, code: `IT${tag}`.toUpperCase().slice(0, 12), governorateId: govCode, contactName: 'Head', contactMobile: '+9647700000000', contractStart: '2026-01-01', contractEnd: '2027-01-01', marketerId: ids.m1 });
    expect(c.status).toBe(201);
    created.schools.push(c.body.data.id);
    expect(c.body.data.referralLink).toContain(c.body.data.code);
    const conflict = await adm(request(app).put(`/api/v1/admin/schools/${c.body.data.id}/marketer`)).send({ marketerId: ids.m2 });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.details).toMatchObject({ reason: 'DOUBLE_ATTRIBUTION', currentMarketer: { id: ids.m1 } });
    const ok = await adm(request(app).put(`/api/v1/admin/schools/${c.body.data.id}/marketer`)).send({ marketerId: ids.m2, overrideReason: 'territory change' });
    expect(ok.body.data.marketerId).toBe(ids.m2);
    await new Promise((r) => setTimeout(r, 300));
    const audit = await pool.query(`SELECT count(*)::int AS n FROM ${T.audit_logs} WHERE action = 'school.attribution_override' AND entity_id = $1`, [c.body.data.id]);
    expect(audit.rows[0].n).toBe(1);
  });

  it('incentive preview, settlements list, analytics and exports', async () => {
    const p = await adm(request(app).post('/api/v1/admin/incentive-rules/preview')).send({ qualificationThreshold: 2, tiers: [{ from: 2, to: null, rewardType: 'per_student', amount: 1000, label: 'A' }], students: 5 });
    expect(p.body.data).toMatchObject({ qualified: true, amount: 5000 });
    const s = await adm(request(app).get('/api/v1/admin/settlements?partnerType=school&sort=bogus'));
    expect(s.status).toBe(200);
    expect(s.body.meta.totals).toBeDefined();
    const b = await adm(request(app).get('/api/v1/admin/analytics/business?compare=true'));
    expect(b.status).toBe(200);
    expect(b.body.data.platforms).toHaveLength(3);
    const none = await adm(request(app).post('/api/v1/admin/exports')).send({ report: 'refunds', from: '2001-01-01T00:00:00Z', to: '2001-01-02T00:00:00Z', format: 'csv' });
    expect(none.status).toBe(422);
    expect(none.body.error.details.reason).toBe('NO_ROWS');
    const csv = await adm(request(app).post('/api/v1/admin/packages/export')).send({ format: 'csv' });
    expect(csv.headers['content-disposition']).toMatch(/packages-\d{4}-\d{2}-\d{2}\.csv/);
  });
});
