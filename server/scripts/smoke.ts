/**
 * npm run smoke — CLI acceptance walk against a running API (default http://localhost:$PORT/api/v1, i.e. 4100 in dev; override with
 * SMOKE_BASE_URL). Prints a PASS/FAIL table. Foundation steps live here; B/C/D append their steps to STEPS
 * (payment → entitlement → stream URL → quiz → mistakes → exam → AI allowance → webhook idempotency …).
 * Release steps (BACKEND_SPEC PART 3): AI allowance decrement, admin AI/OTP settings without deploy, fresh OTP
 * registration → profile (temp student locked afterwards), audit-log coverage of the admin mutations performed.
 * The registration step needs DB access (same .env as the server) to plant a known OTP hash for a random phone —
 * the MockSmsProvider only logs the code inside the server process.
 */
import axios, { type AxiosInstance } from 'axios';
import { T } from '../src/config/constants.js';
import { closeDb, db } from '../src/config/db.js';
import { env } from '../src/config/env.js';

const BASE = process.env.SMOKE_BASE_URL ?? `http://localhost:${env.PORT}${env.API_PREFIX}`;
const DEMO_PHONE = '+9647701234567';
const DEV_OTP = '123456';

interface Ctx {
  http: AxiosInstance;
  student?: string;
  admin?: string;
}
type Step = { name: string; run: (ctx: Ctx) => Promise<void> };

const ok = (cond: unknown, msg: string) => {
  if (!cond) throw new Error(msg);
};

export const STEPS: Step[] = [
  { name: 'health', run: async ({ http }) => ok((await http.get('/health')).data.data.status === 'ok', 'health not ok') },
  { name: 'public app-config', run: async ({ http }) => ok((await http.get('/public/app-config')).data.data.otp.codeLength, 'no otp config') },
  {
    name: 'student OTP login (dev code)',
    run: async (ctx) => {
      await ctx.http.post('/auth/send-otp', { phone: DEMO_PHONE, purpose: 'login' }).catch(() => undefined); // cooldown is fine
      const body = { phone: DEMO_PHONE, code: DEV_OTP, purpose: 'login', deviceId: 'smoke-device-0001', platform: 'web' };
      let r = await ctx.http.post('/auth/verify-otp', body, { validateStatus: () => true });
      // Device limit reached (other clients logged in as the demo student): free the least recently active slot,
      // exactly like the "log out another device" prompt in the apps (AUTH-02 revokeSessionId).
      const details = r.data?.error?.details as { reason?: string; sessions?: { id: string; lastActive: string }[] } | undefined;
      if (r.status === 422 && details?.reason === 'DEVICE_LIMIT_REACHED' && details.sessions?.length) {
        const oldest = [...details.sessions].sort((a, b) => a.lastActive.localeCompare(b.lastActive))[0];
        r = await ctx.http.post('/auth/verify-otp', { ...body, revokeSessionId: oldest?.id });
      }
      ok(r.status === 200, `verify-otp ${r.status} ${r.data?.error?.code ?? ''}`);
      ctx.student = r.data.data.accessToken;
      ok(ctx.student, 'no access token');
    },
  },
  {
    name: 'GET /auth/me (student)',
    run: async (ctx) => {
      const r = await ctx.http.get('/auth/me', { headers: { Authorization: `Bearer ${ctx.student}` } });
      ok(r.data.data.user.mobile === DEMO_PHONE, 'wrong user');
      ok(r.data.data.entitlements.length >= 1, 'no entitlements');
    },
  },
  {
    name: 'Arabic error messages (Accept-Language: ar)',
    run: async ({ http }) => {
      const r = await http.get('/me', { headers: { 'Accept-Language': 'ar' }, validateStatus: () => true });
      ok(r.status === 401 && /[؀-ۿ]/.test(r.data.error.message), 'message not Arabic');
    },
  },
  {
    name: 'admin login',
    run: async (ctx) => {
      const password = process.env.SEED_SUPER_ADMIN_PASSWORD;
      ok(password, 'set SEED_SUPER_ADMIN_PASSWORD to run admin steps');
      const r = await ctx.http.post('/auth/admin/login', { email: env.SEED_SUPER_ADMIN_EMAIL, password });
      ok(r.data.data.mfaRequired === false, 'MFA required (disable for smoke)');
      ctx.admin = r.data.data.tokens.accessToken;
    },
  },
  {
    name: 'RBAC: student token rejected on admin route',
    run: async ({ http, student }) => {
      const r = await http.get('/admin/students', { headers: { Authorization: `Bearer ${student}` }, validateStatus: () => true });
      ok(r.status === 401, `expected 401, got ${r.status}`);
    },
  },
  {
    name: 'admin: settings change audited',
    run: async ({ http, admin }) => {
      const h = { headers: { Authorization: `Bearer ${admin}` } };
      const cur = (await http.get('/admin/settings/learning', h)).data.data;
      await http.put('/admin/settings/learning', { dailyGoalMinutes: cur.dailyGoalMinutes === 120 ? 121 : 120 }, h);
      await http.put('/admin/settings/learning', { dailyGoalMinutes: cur.dailyGoalMinutes }, h);
      const logs = (await http.get('/admin/audit-logs?action=settings.update&pageSize=1', h)).data.data;
      ok(logs.length === 1, 'no audit entry');
    },
  },
  // ── Agent C: commerce, attribution ──
  ...commerceSteps(),
  ...learningSteps(),
  // ── Release acceptance ──
  ...releaseSteps(),
];

/** Payment via MockGateway → webhook → entitlement; duplicate webhook; price change; attribution; refund. */
function commerceSteps(): Step[] {
  const st: { paymentId?: string; amount?: number; packageId?: string; subjectIds?: string[] } = {};
  const S = (ctx: Ctx) => ({ headers: { Authorization: `Bearer ${ctx.student}` } });
  const A = (ctx: Ctx) => ({ headers: { Authorization: `Bearer ${ctx.admin}` } });
  const idem = () => ({ 'Idempotency-Key': `smoke-${Date.now()}-${Math.random().toString(36).slice(2, 10)}` });
  return [
    {
      name: 'pay via mock gateway → webhook → paid + entitlements',
      run: async (ctx) => {
        const pkgs = (await ctx.http.get('/packages', S(ctx))).data.data as { id: string; subjectIds: string[]; priceMonthly: number }[];
        const pkg = [...pkgs].sort((a, b) => b.priceMonthly - a.priceMonthly)[0];
        ok(pkg, 'no packages');
        st.packageId = pkg?.id;
        st.subjectIds = pkg?.subjectIds;
        const init = (await ctx.http.post('/payments/initiate', { packageId: pkg?.id, cycle: 'monthly', gateway: 'mock', returnUrl: 'http://localhost:5173/student/subscription?payment=__ID__' }, { headers: { ...S(ctx).headers, ...idem() } })).data.data;
        ok(init.mock?.confirmUrl, 'no mock confirm url');
        st.paymentId = init.paymentId;
        st.amount = init.amount;
        const paid = (await ctx.http.post(`/payments/mock/${init.paymentId}/confirm`, { outcome: 'success' }, S(ctx))).data.data;
        ok(paid.status === 'paid' && paid.receiptNumber, `payment status ${paid.status}`);
        const ents = (await ctx.http.get('/me/entitlements', S(ctx))).data.data as { subjectId: string }[];
        ok(st.subjectIds?.every((s) => ents.some((e) => e.subjectId === s)), 'entitlements missing for package subjects');
      },
    },
    {
      name: 'duplicate webhook does not duplicate access',
      run: async (ctx) => {
        const { signMock } = await import('../src/modules/payments/providers.js');
        const body = JSON.stringify({ id: `evt_mock_${st.paymentId}_success`, type: 'payment.succeeded', data: { paymentId: st.paymentId, amount: st.amount } });
        for (let i = 0; i < 2; i++) {
          const r = await ctx.http.post('/payments/webhook/mock', body, { headers: { 'Content-Type': 'application/json', 'X-Signature': signMock(body) } });
          ok(r.data.data.duplicate === true, 'replayed webhook not flagged duplicate');
        }
        const subs = (await ctx.http.get(`/admin/subscriptions?pageSize=100&sort=-createdAt`, A(ctx))).data.data as { lastPaymentId: string | null }[];
        ok(subs.filter((s) => s.lastPaymentId === st.paymentId).length === 1, 'subscription duplicated');
        const bad = await ctx.http.post('/payments/webhook/mock', body, { headers: { 'Content-Type': 'application/json', 'X-Signature': 'sha256=00' }, validateStatus: () => true });
        ok(bad.status === 401, `bad signature accepted (${bad.status})`);
      },
    },
    {
      name: 'admin price change takes effect without deploy',
      run: async (ctx) => {
        const before = (await ctx.http.get(`/admin/packages/${st.packageId}`, A(ctx))).data.data.price as number;
        await ctx.http.patch(`/admin/packages/${st.packageId}`, { price: before + 1000 }, A(ctx));
        try {
          const pub = (await ctx.http.get(`/packages/${st.packageId}`, S(ctx))).data.data;
          ok(pub.priceMonthly === before + 1000, 'public price not updated');
          const q = (await ctx.http.post('/payments/quote', { packageId: st.packageId, cycle: 'monthly' }, S(ctx))).data.data;
          ok(q.subtotal === before + 1000, 'quote not using new price');
        } finally {
          await ctx.http.patch(`/admin/packages/${st.packageId}`, { price: before }, A(ctx));
        }
      },
    },
    {
      name: 'attribution reports reconcile (schools / marketers / progress)',
      run: async (ctx) => {
        const schools = (await ctx.http.get('/admin/schools?pageSize=100', A(ctx))).data.data as { id: string; periodPaidStudents: number; verifiedPaidStudents: number }[];
        const s = schools.find((x) => x.verifiedPaidStudents > 0) ?? schools[0];
        ok(s, 'no schools');
        const prog = (await ctx.http.get(`/admin/schools/${s?.id}/incentive-progress`, A(ctx))).data.data;
        ok(prog.paid === s?.periodPaidStudents, `school progress ${prog.paid} ≠ list ${s?.periodPaidStudents}`);
        const mk = (await ctx.http.get('/admin/marketers?pageSize=100', A(ctx))).data.data as { paidStudents: number }[];
        const stats = (await ctx.http.get('/admin/marketers/stats', A(ctx))).data.data;
        ok(stats.paidStudents === mk.reduce((a, m) => a + m.paidStudents, 0), 'marketer stats do not reconcile');
      },
    },
    {
      name: 'full refund revokes access (entitlement logs)',
      run: async (ctx) => {
        const r = await ctx.http.post(`/admin/payments/${st.paymentId}/refunds`, { kind: 'full', reason: 'smoke test refund', processNow: true }, { headers: { ...A(ctx).headers, ...idem() } });
        ok(r.data.data.transaction.status === 'refunded', 'not refunded');
        const subs = (await ctx.http.get(`/admin/subscriptions?pageSize=100&sort=-createdAt`, A(ctx))).data.data as { lastPaymentId: string | null; status: string }[];
        ok(subs.find((x) => x.lastPaymentId === st.paymentId)?.status === 'cancelled', 'subscription still active after refund');
      },
    },
  ];
}

/** Agent B: catalog → stream URL → watch/resume → quiz → mistake → exam start/autosave/submit/result → admin content. */
function learningSteps(): Step[] {
  const st: { lessonId?: string; quizLessonId?: string } = {};
  const S = (ctx: Ctx) => ({ headers: { Authorization: `Bearer ${ctx.student}` } });
  const A = (ctx: Ctx) => ({ headers: { Authorization: `Bearer ${ctx.admin}` } });
  type Lesson = { id: string; locked: boolean; status: string };
  return [
    {
      name: 'catalog → entitled lesson → signed stream URL',
      run: async (ctx) => {
        const subjects = (await ctx.http.get('/subjects', S(ctx))).data.data as { id: string; locked: boolean | null }[];
        ok(subjects.length, 'no subjects');
        for (const sub of subjects.filter((x) => x.locked === false)) {
          const detail = (await ctx.http.get(`/subjects/${sub.id}`, S(ctx))).data.data as { lessons: Lesson[] };
          const lesson = detail.lessons.find((l) => !l.locked);
          if (!lesson) continue;
          const d = (await ctx.http.get(`/lessons/${lesson.id}`, S(ctx))).data.data as { hasVideo: boolean; quiz: { available: boolean } };
          if (!d.hasVideo) continue;
          st.lessonId = lesson.id;
          if (d.quiz.available) st.quizLessonId = lesson.id;
          break;
        }
        ok(st.lessonId, 'no unlocked lesson with a ready video for the demo student');
        const su = (await ctx.http.get(`/lessons/${st.lessonId}/stream-url`, S(ctx))).data.data;
        ok(su.url && su.expiresAt && su.heartbeatSeconds > 0, 'stream url incomplete');
      },
    },
    {
      name: 'watch heartbeat → resume position',
      run: async (ctx) => {
        const w = (await ctx.http.put('/progress/watch', { lessonId: st.lessonId, positionSec: 42, durationSec: 600, event: 'pause', watchedSecDelta: 10 }, S(ctx))).data.data;
        ok(w.lessonId === st.lessonId && w.positionSec >= 0, 'watch upsert failed');
        const d = (await ctx.http.get(`/lessons/${st.lessonId}`, S(ctx))).data.data;
        ok(d.status === 'completed' || d.positionSec === 42, `resume position ${d.positionSec}`);
        const dash = (await ctx.http.get('/progress/dashboard', S(ctx))).data.data;
        ok(dash.subscription && Array.isArray(dash.subjects) && dash.weeklyStudy?.days?.length === 7, 'dashboard incomplete');
      },
    },
    {
      name: 'quiz → wrong answer creates a mistake → submit',
      run: async (ctx) => {
        ok(st.quizLessonId ?? st.lessonId, 'no lesson');
        type QuizStart = { attemptId: string; questions: { id: string; options: { id: string }[] }[] };
        // Re-runs hit the retry cooldown on a lesson quizzed moments ago (422 BUSINESS_RULE) — that is the rule
        // working. Try the first lesson, then other unlocked lessons, so the smoke test stays repeatable.
        const candidates = [st.quizLessonId ?? st.lessonId!];
        const subjects = (await ctx.http.get('/subjects', S(ctx))).data.data as { id: string; locked: boolean | null }[];
        for (const sub of subjects.filter((x) => x.locked === false)) {
          const detail = (await ctx.http.get(`/subjects/${sub.id}`, S(ctx))).data.data as { lessons: Lesson[] };
          for (const l of detail.lessons) if (!l.locked && !candidates.includes(l.id)) candidates.push(l.id);
        }
        let start: QuizStart | null = null;
        for (const id of candidates) {
          try {
            start = (await ctx.http.post(`/quizzes/${id}/start`, {}, S(ctx))).data.data as QuizStart;
            break;
          } catch (e) {
            if (!/422|404/.test(String((e as Error).message))) throw e;
          }
        }
        ok(start, 'no lesson quiz can be started (all on cooldown or without questions)');
        if (!start) return;
        ok(start.questions.length, 'quiz has no questions');
        ok(!('correctOptionId' in (start.questions[0] as object)), 'answer leaked in quiz start payload');
        let mistakeQ: string | null = null;
        for (const q of start.questions) {
          const fb = (await ctx.http.post(`/quizzes/attempts/${start.attemptId}/answer`, { questionId: q.id, optionId: q.options[q.options.length - 1]?.id }, S(ctx))).data.data;
          if (!fb.correct) {
            ok(fb.mistake?.questionId === q.id, 'wrong answer did not create a mistake');
            mistakeQ = q.id;
            break;
          }
        }
        const res = (await ctx.http.post(`/quizzes/attempts/${start.attemptId}/submit`, { timeSpentSec: 60 }, S(ctx))).data.data;
        ok(typeof res.score === 'number' && res.answers.length === start.questions.length, 'quiz result incomplete');
        if (mistakeQ) {
          const m = (await ctx.http.get('/mistakes?status=unresolved&pageSize=100', S(ctx))).data.data as { questionId: string }[];
          ok(m.some((x) => x.questionId === mistakeQ), 'mistake not listed');
        }
      },
    },
    {
      name: 'exam start (server timer) → autosave → idempotent submit → result',
      run: async (ctx) => {
        const exams = (await ctx.http.get('/exams/available', S(ctx))).data.data as { id: string; available: boolean; locked: boolean; attemptsLeft: number; activeAttempt: unknown }[];
        const exam = exams.find((e) => e.available && !e.locked && (e.attemptsLeft > 0 || e.activeAttempt));
        ok(exam, 'no available exam for the demo student');
        const state = (await ctx.http.post(`/exams/${exam?.id}/start`, {}, S(ctx))).data.data as { attemptId: string; serverNow: string; endsAt: string; questions: { id: string; options: { id: string }[] }[] };
        ok(new Date(state.endsAt) > new Date(state.serverNow), 'timer not running');
        const q0 = state.questions[0];
        const save = (await ctx.http.put(`/exams/attempts/${state.attemptId}/autosave`, { answers: { [q0!.id]: q0!.options[0]!.id }, flagged: [q0!.id], currentIndex: 0, clientSavedAt: new Date().toISOString(), seq: Date.now() % 1_000_000_000 }, S(ctx))).data.data;
        ok(save.savedAt && save.lastSavedAt, 'autosave failed');
        const key = `smoke-exam-${state.attemptId}`;
        const sub1 = (await ctx.http.post(`/exams/attempts/${state.attemptId}/submit`, { reason: 'manual' }, { headers: { ...S(ctx).headers, 'Idempotency-Key': key } })).data.data;
        const sub2 = (await ctx.http.post(`/exams/attempts/${state.attemptId}/submit`, { reason: 'manual' }, { headers: { ...S(ctx).headers, 'Idempotency-Key': `${key}-2` } })).data.data;
        ok(sub1.status === sub2.status && sub1.status !== 'in_progress', 'submit not idempotent');
        const r = (await ctx.http.get(`/exams/attempts/${state.attemptId}/result`, S(ctx))).data.data;
        ok(Array.isArray(r.topicBreakdown) && r.answers.length === state.questions.length, 'exam result incomplete');
      },
    },
    {
      name: 'admin content & question bank reachable (RBAC)',
      run: async (ctx) => {
        const l = (await ctx.http.get('/admin/lessons?pageSize=5', A(ctx))).data;
        ok(Array.isArray(l.data) && l.meta.counts, 'admin lessons missing counts');
        const qs = (await ctx.http.get('/admin/questions/stats', A(ctx))).data.data;
        ok(qs.total > 0, 'no questions');
        const s = (await ctx.http.get('/search?q=ma&scopes=lessons,students', A(ctx))).data.data;
        ok(Array.isArray(s.lessons), 'admin search failed');
      },
    },
  ];
}

/** Release acceptance: AI allowance, settings without deploy, fresh registration, audit trail. */
function releaseSteps(): Step[] {
  const S = (ctx: Ctx) => ({ headers: { Authorization: `Bearer ${ctx.student}` } });
  const A = (ctx: Ctx) => ({ headers: { Authorization: `Bearer ${ctx.admin}` } });
  const startedAt = new Date(Date.now() - 1000).toISOString();
  const st: { tempStudentId?: string } = {};
  type Allowance = { enabled: boolean; used: number; quota: number; remaining: number; cycle: 'calendar' | 'billing' };
  return [
    {
      name: 'AI tutor message (JSON/polling) decrements allowance',
      run: async (ctx) => {
        const before = (await ctx.http.get('/ai-tutor/allowance', S(ctx))).data.data as Allowance;
        ok(before.enabled && before.remaining > 0, `AI not usable for demo student (enabled=${before.enabled}, remaining=${before.remaining})`);
        const ents = (await ctx.http.get('/me/entitlements', S(ctx))).data.data as { subjectId: string }[];
        ok(ents[0], 'no entitled subject');
        const conv = (await ctx.http.post('/ai-tutor/conversations', { subjectId: ents[0]?.subjectId, title: 'smoke' }, S(ctx))).data.data as { id: string };
        try {
          const sent = (
            await ctx.http.post(
              `/ai-tutor/conversations/${conv.id}/messages`,
              { text: 'Explain the derivative of x^2 briefly.', lang: 'en', clientMessageId: `smoke-${Date.now()}` },
              { headers: { ...S(ctx).headers, Accept: 'application/json' } },
            )
          ).data.data as { tutorMessage: { id: string; status: string }; pollAfterMs: number };
          ok(sent.tutorMessage?.id, 'no pending tutor message');
          let status = sent.tutorMessage.status;
          const deadline = Date.now() + 60_000;
          while (status !== 'complete' && status !== 'failed' && status !== 'blocked' && Date.now() < deadline) {
            await new Promise((r) => setTimeout(r, Math.max(200, sent.pollAfterMs || 500)));
            status = ((await ctx.http.get(`/ai-tutor/messages/${sent.tutorMessage.id}`, S(ctx))).data.data as { status: string }).status;
          }
          ok(status === 'complete', `tutor message ended as ${status}`);
          const after = (await ctx.http.get('/ai-tutor/allowance', S(ctx))).data.data as Allowance;
          ok(after.used === before.used + 1, `allowance used ${before.used} → ${after.used} (expected +1)`);
          ok(after.remaining === before.remaining - 1, `remaining ${before.remaining} → ${after.remaining}`);
        } finally {
          await ctx.http.delete(`/ai-tutor/conversations/${conv.id}`, S(ctx)).catch(() => undefined);
        }
      },
    },
    {
      name: 'admin changes AI allowance settings without deploy',
      run: async (ctx) => {
        const cur = (await ctx.http.get('/admin/ai/settings', A(ctx))).data.data as { monthlyAllowance: number; resetCycle: 'calendar' | 'billing' };
        const nextCycle = cur.resetCycle === 'calendar' ? 'billing' : 'calendar';
        const nextAllowance = cur.monthlyAllowance === 1000 ? 999 : cur.monthlyAllowance + 1;
        await ctx.http.patch('/admin/ai/settings', { monthlyAllowance: nextAllowance, resetCycle: nextCycle }, A(ctx));
        try {
          const s = (await ctx.http.get('/admin/ai/settings', A(ctx))).data.data;
          ok(s.monthlyAllowance === nextAllowance && s.resetCycle === nextCycle, 'admin AI settings not persisted');
          const a = (await ctx.http.get('/ai-tutor/allowance', S(ctx))).data.data as Allowance;
          ok(a.cycle === nextCycle, `student allowance cycle ${a.cycle}, expected ${nextCycle}`);
        } finally {
          await ctx.http.patch('/admin/ai/settings', { monthlyAllowance: cur.monthlyAllowance, resetCycle: cur.resetCycle }, A(ctx));
        }
        const restored = (await ctx.http.get('/ai-tutor/allowance', S(ctx))).data.data as Allowance;
        ok(restored.cycle === cur.resetCycle, 'AI settings not restored');
      },
    },
    {
      name: 'admin changes OTP thresholds without deploy',
      run: async (ctx) => {
        const cur = (await ctx.http.get('/admin/settings/otp', A(ctx))).data.data as { resendCooldownSeconds: number; maxAttempts: number };
        const next = { resendCooldownSeconds: cur.resendCooldownSeconds === 120 ? 121 : 120, maxAttempts: cur.maxAttempts === 5 ? 6 : 5 };
        await ctx.http.put('/admin/settings/otp', next, A(ctx));
        try {
          const cfg = (await ctx.http.get('/public/app-config', { headers: { 'Cache-Control': 'no-cache' } })).data.data;
          ok(cfg.otp.resendCooldownSeconds === next.resendCooldownSeconds, `app-config cooldown ${cfg.otp.resendCooldownSeconds}, expected ${next.resendCooldownSeconds}`);
          const s = (await ctx.http.get('/admin/settings/otp', A(ctx))).data.data;
          ok(s.maxAttempts === next.maxAttempts, 'maxAttempts not persisted');
        } finally {
          await ctx.http.put('/admin/settings/otp', { resendCooldownSeconds: cur.resendCooldownSeconds, maxAttempts: cur.maxAttempts }, A(ctx));
        }
      },
    },
    {
      name: 'fresh student OTP register → profile (temp student locked)',
      run: async (ctx) => {
        const phone = `+96479${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
        const sent = (await ctx.http.post('/auth/send-otp', { phone, purpose: 'register' })).data.data as { codeLength: number; isRegistered: boolean };
        ok(sent.isRegistered === false, 'random phone already registered');
        // The MockSmsProvider only logs the code inside the server process: plant a known code for this phone's OTP row.
        const { otpHash } = await import('../src/modules/auth/student-auth.service.js');
        const code = '24681357'.slice(0, sent.codeLength);
        const plant = () =>
          db.query(
            `UPDATE ${T.otp_codes} SET code_hash = $2 WHERE id = (SELECT id FROM ${T.otp_codes} WHERE phone = $1 AND consumed_at IS NULL AND invalidated_at IS NULL ORDER BY created_at DESC LIMIT 1)`,
            [phone, otpHash(phone, code)],
          );
        // The Supabase session pooler caps clients; retry briefly when every slot is held by running servers.
        let upd: Awaited<ReturnType<typeof plant>> | undefined;
        for (let i = 0; i < 6 && !upd; i++) {
          try {
            upd = await plant();
          } catch (e) {
            if (i === 5 || !/EMAXCONNSESSION|max clients/i.test((e as Error).message)) throw e;
            await new Promise((res) => setTimeout(res, 3000));
          }
        }
        ok(upd, 'OTP row not updated');
        ok(upd?.rowCount === 1, 'OTP row not found');
        const govs = (await ctx.http.get('/public/governorates')).data.data as { id: string }[];
        const registration = { name: 'Smoke Tester', governorateId: govs[0]?.id, acceptTerms: true, language: 'en' };
        const r = (await ctx.http.post('/auth/verify-otp', { phone, code, purpose: 'register', deviceId: `smoke-reg-${Date.now()}`, platform: 'web', registration })).data.data;
        ok(r.isNewUser === true && r.accessToken, 'account not created');
        st.tempStudentId = r.user.id;
        const me = (await ctx.http.get('/me', { headers: { Authorization: `Bearer ${r.accessToken}` } })).data.data;
        ok(me.user.mobile === phone && [me.user.name?.en, me.user.name?.ar].includes('Smoke Tester'), `profile does not match registration (${JSON.stringify({ mobile: me.user.mobile, name: me.user.name })})`);
        await ctx.http.post(`/admin/students/${st.tempStudentId}/lock`, { reason: 'smoke test temp student' }, A(ctx));
      },
    },
    {
      name: 'audit logs exist for smoke admin mutations',
      run: async (ctx) => {
        const logs = (await ctx.http.get(`/admin/audit-logs?since=${encodeURIComponent(startedAt)}&pageSize=100`, A(ctx))).data.data as { action: string }[];
        const actions = new Set(logs.map((l) => l.action));
        const required = ['settings.update', 'package.update', 'ai_settings.update'];
        if (st.tempStudentId) required.push('student.lock');
        const missing = required.filter((a) => !actions.has(a));
        ok(!missing.length, `missing audit actions: ${missing.join(', ')} (seen: ${[...actions].join(', ')})`);
        ok([...actions].some((a) => a.startsWith('refund.')), `no refund audit entry (seen: ${[...actions].join(', ')})`);
      },
    },
  ];
}

async function main() {
  const ctx: Ctx = { http: axios.create({ baseURL: BASE, timeout: 20_000, headers: { 'X-Client-Platform': 'web', 'X-Device-Id': 'smoke-device-0001' } }) };
  const rows: { step: string; result: string; detail: string }[] = [];
  for (const s of STEPS) {
    try {
      await s.run(ctx);
      rows.push({ step: s.name, result: 'PASS', detail: '' });
    } catch (err) {
      const e = err as { response?: { status: number; data?: { error?: { code: string; message: string } } }; message: string };
      rows.push({ step: s.name, result: 'FAIL', detail: e.response ? `${e.response.status} ${e.response.data?.error?.code ?? ''} ${e.response.data?.error?.message ?? ''}` : e.message });
    }
  }
  console.table(rows);
  const failed = rows.filter((r) => r.result === 'FAIL').length;
  console.log(`${rows.length - failed}/${rows.length} passed against ${BASE}`);
  if (failed) process.exitCode = 1;
}

void main().finally(() => closeDb());
