#!/usr/bin/env node
/**
 * verify-app-flows — live walk of the EDUWAY student **mobile app** journey against a running API, sending exactly the
 * headers app/user/src/api/client.ts sends (Accept, Accept-Language ar|en, X-Request-Id, X-Client-Platform ios,
 * X-Device-Id, X-App-Version, Authorization) and the same request bodies as the app's api modules, in the app's real
 * flow order: boot → OTP login → profile → home → subjects → lesson/video → quiz → practice/bank → mistakes → exam →
 * AI tutor (SSE + polling fallback) → notifications/push → progress → subscription/checkout (mock gateway) → support
 * ticket → settings/sessions → logout. Every `data` payload is spot-checked against app/user/src/api/types.ts.
 *
 * Usage:  node scripts/verify-app-flows.mjs [--base http://localhost:4100/api/v1] [--json out.json] [--quiet]
 *                                            [--wait-slot 10] [--no-admin-cleanup]
 *
 * Account: the seeded demo student +9647701234567 with the dev bypass code 123456 (non-production only).
 * Safety & cleanup (the demo account is shared with real devices and other tools):
 *   - never revokes a session it did not create; if the device limit is full of foreign sessions it waits up to
 *     --wait-slot minutes for a free slot, then fails with a clear message;
 *   - "sign out other devices" (ME-05) only runs when every other active session is one of ours;
 *   - every setting it changes is restored (profile daily goal, notification prefs, lesson note, today-plan item,
 *     mistake status, bookmark, video position); the AI conversation is deleted; the push token is unregistered;
 *     the checkout uses the mock gateway with outcome `cancel` (no entitlement is granted to the demo student);
 *     the support ticket is deleted through the admin API (ADM-SUP-05; super-admin credentials from env
 *     ADMIN_EMAIL/ADMIN_PASSWORD or server/.env SEED_SUPER_ADMIN_*, never printed);
 *   - unavoidable history (quiz/practice/exam attempts, AI allowance usage, the cancelled mock payment record,
 *     mistake retry history) is listed in the summary. Exams are only submitted when ≥ 2 attempts are left.
 * Exit code 0 when every step passes.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const argOf = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const BASE = argOf('--base', process.env.API_URL ?? 'http://localhost:4100/api/v1').replace(/\/+$/, '');
const JSON_OUT = argOf('--json', null);
const QUIET = args.includes('--quiet');
const WAIT_SLOT_MIN = Number(argOf('--wait-slot', '10'));
const ADMIN_CLEANUP = !args.includes('--no-admin-cleanup');
const DEMO_PHONE = '+9647701234567';
const DEV_CODE = '123456';
const APP_VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'app/user/app.json'), 'utf8')).expo?.version ?? '1.0.0';
const TAG = 'verify-app-flows';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const uuid = () => crypto.randomUUID();

// ── app DTO index (spot checks against app/user/src/api/types.ts) ───────────────────────────────────────
function parseTypes(file) {
  const src = fs.readFileSync(file, 'utf8');
  const types = new Map();
  const re = /export (interface|type) (\w+)(?:<[^>]*>)?\s*(extends ([^{]+))?(=)?\s*/g;
  let m;
  while ((m = re.exec(src))) {
    const name = m[2];
    let i = m.index + m[0].length;
    const parents = (m[4] ?? '').split(',').map((s) => s.trim().replace(/<.*$/, '')).filter(Boolean);
    if (m[1] === 'type') {
      const end = src.indexOf('\n\n', i);
      const decl = src.slice(i, end < 0 ? undefined : end);
      if (!/^[\w\s&{]/.test(decl)) continue;
      const refs = decl.replace(/\{[\s\S]*\}/, '').split('&').map((s) => s.trim()).filter((s) => /^\w+$/.test(s));
      parents.push(...refs);
      const bi = decl.indexOf('{');
      if (bi < 0) { if (refs.length) types.set(name, { fields: [], parents }); continue; }
      if (/^\s*['"|\w\s]*\|/.test(decl.slice(0, bi))) continue;
      i += bi;
    }
    if (src[i] !== '{') continue;
    let depth = 0;
    let k = i;
    for (; k < src.length; k++) {
      if (src[k] === '{') depth++;
      else if (src[k] === '}') { depth--; if (depth === 0) break; }
    }
    const body = src.slice(i + 1, k);
    const fields = [];
    let d = 0;
    let line = '';
    for (const ch of body) {
      if ('{(<['.includes(ch)) d++;
      if ('})>]'.includes(ch)) d--;
      if ((ch === ';' || ch === '\n') && d === 0) {
        const fm = line.trim().replace(/^\/\/.*$/, '').match(/^(?:readonly\s+)?(\w+)(\?)?\s*:\s*([\s\S]+)$/);
        if (fm) fields.push({ name: fm[1], optional: !!fm[2], type: fm[3].trim() });
        line = '';
        continue;
      }
      line += ch;
      if (ch === '\n') line = '';
    }
    types.set(name, { fields, parents });
  }
  return types;
}
const TYPES = parseTypes(path.join(ROOT, 'app/user/src/api/types.ts'));
function allFields(name, seen = new Set()) {
  const t = TYPES.get(name);
  if (!t || seen.has(name)) return [];
  seen.add(name);
  return [...t.parents.flatMap((p) => allFields(p, seen)), ...t.fields];
}
function shapeProblems(name, value, pathStr = name, depth = 0) {
  if (!TYPES.has(name)) return [`unknown type ${name}`];
  if (value === null || value === undefined) return [`${pathStr} is ${value}`];
  if (typeof value !== 'object') return [`${pathStr} not an object`];
  const out = [];
  for (const f of allFields(name)) {
    const v = value[f.name];
    if (!f.optional && v === undefined && !/\bundefined\b/.test(f.type)) out.push(`${pathStr}.${f.name} missing`);
    if (v == null || depth >= 1) continue;
    const tm = f.type.replace(/\s*\|\s*null/g, '').match(/^(\w+)(\[\])?$/);
    if (tm && TYPES.has(tm[1]) && allFields(tm[1]).length) {
      const inner = tm[2] ? (Array.isArray(v) ? v[0] : undefined) : v;
      if (inner !== undefined && typeof inner === 'object') out.push(...shapeProblems(tm[1], inner, `${pathStr}.${f.name}${tm[2] ? '[0]' : ''}`, depth + 1));
    }
  }
  return out;
}
function expectShape(value, type) {
  if (Array.isArray(value) && value.length === 0) return;
  const probs = shapeProblems(type, Array.isArray(value) ? value[0] : value);
  if (probs.length) throw new Error(`DTO mismatch: ${probs.slice(0, 8).join('; ')}${probs.length > 8 ? ` (+${probs.length - 8})` : ''}`);
}
const assert = (c, msg) => { if (!c) throw new Error(msg); };

// ── HTTP with the app's headers ─────────────────────────────────────────────────────────────────────────
/** A simulated app install: device id + language + tokens (like session.ts + langStore). */
const app = { deviceId: `${TAG}-ios-${crypto.randomBytes(4).toString('hex')}`, lang: 'ar', access: null, refresh: null };
const appHeaders = (s, lang) => ({
  Accept: 'application/json',
  'Accept-Language': lang ?? s.lang,
  'X-Request-Id': uuid(),
  'X-Client-Platform': 'ios',
  'X-Device-Id': s.deviceId,
  'X-App-Version': APP_VERSION,
  ...(s.access && !s.skipAuth ? { Authorization: `Bearer ${s.access}` } : {}),
});

class HttpError extends Error {
  constructor(status, body, method, url) {
    const e = body?.error;
    super(`${method} ${url} → ${status} ${e?.code ?? ''} ${e?.details?.reason ?? ''} ${e?.message ?? (typeof body === 'string' ? body.slice(0, 160) : '')}${e?.details?.fields ? ` fields=${JSON.stringify(e.details.fields)}` : ''}`);
    this.status = status;
    this.body = body;
    this.code = e?.code;
    this.reason = e?.details?.reason ?? null;
  }
}

const results = [];
const transient = [];
const leftovers = [];
let current = null;
let refreshes = 0;

/** Same semantics as client.ts: 401 TOKEN_EXPIRED/UNAUTHORIZED → single refresh (rotate) → replay once. */
async function call(s, method, url, body, { headers = {}, lang, raw = false, skipAuth = false } = {}) {
  let retried = false;
  for (let attempt = 0; ; attempt++) {
    const h = { ...appHeaders({ ...s, skipAuth }, lang), ...headers };
    if (body !== undefined) h['Content-Type'] = 'application/json';
    let res;
    try {
      res = await fetch(`${BASE}${url}`, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
    } catch (err) {
      // dev server restarting (tsx watch) → like the app's offline probe, retry a few times before failing
      if (attempt >= 5) throw err;
      transient.push(`${method} ${url.split('?')[0]} network`);
      await sleep(3000);
      continue;
    }
    if (current) current.calls.push(`${method} ${url.split('?')[0]} ${res.status}`);
    if (res.status === 401 && !retried && !skipAuth && s.refresh && !/\/auth\/(refresh|send-otp|verify-otp)/.test(url)) {
      retried = true;
      await refreshTokens(s);
      continue;
    }
    // Shared dev DB pooler can transiently refuse a connection → retry 5xx like react-query does.
    if (res.status >= 500 && attempt < 3 && !raw) {
      transient.push(`${method} ${url.split('?')[0]} ${res.status}`);
      await sleep(2000 * (attempt + 1));
      continue;
    }
    if (raw) return res;
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = text; }
    if (!res.ok) throw new HttpError(res.status, json, method, url);
    if (!json || json.success !== true) throw new Error(`${method} ${url}: not a success envelope`);
    return { data: json.data, meta: json.meta, status: res.status, headers: res.headers };
  }
}
async function refreshTokens(s) {
  refreshes++;
  let r;
  try {
    r = await call(s, 'POST', '/auth/refresh', { refreshToken: s.refresh }, { skipAuth: true });
  } catch (e) {
    // like client.ts: a definitive 4xx ends the session (tokens cleared → "session expired" → welcome screen)
    if (e instanceof HttpError && e.status >= 400 && e.status < 500) { s.refresh = null; s.access = null; }
    throw e;
  }
  s.access = r.data.accessToken;
  s.refresh = r.data.refreshToken;
  return r.data;
}
const GET = (u, o) => call(app, 'GET', u, undefined, o);
const POST = (u, b = {}, o) => call(app, 'POST', u, b, o);
const PUT = (u, b = {}, o) => call(app, 'PUT', u, b, o);
const PATCH = (u, b = {}, o) => call(app, 'PATCH', u, b, o);
const DEL = (u, b, o) => call(app, 'DELETE', u, b, o);
async function expectError(promise, statuses) {
  try { await promise; } catch (e) { if (e instanceof HttpError && statuses.includes(e.status)) return e; throw e; }
  throw new Error(`expected HTTP ${statuses.join('/')}`);
}

async function step(id, name, fn) {
  current = { id, name, calls: [], ok: false, note: '' };
  const t0 = Date.now();
  try {
    const note = await fn();
    current.ok = true;
    if (typeof note === 'string') current.note = note;
  } catch (e) {
    current.note = e instanceof Error ? e.message : String(e);
  }
  current.ms = Date.now() - t0;
  results.push(current);
  if (!QUIET) console.log(`${current.ok ? 'PASS' : 'FAIL'}  ${id.padEnd(14)} ${name}${current.note ? `  — ${current.note}` : ''}`);
  const ok = current.ok;
  current = null;
  return ok;
}

// ── SSE (same parser rules as app/user/src/api/tutor.ts) ────────────────────────────────────────────────
function parseSse(text) {
  return text.replace(/\r\n/g, '\n').split('\n\n').map((blk) => {
    let event = 'message';
    const data = [];
    for (const l of blk.split('\n')) {
      if (l.startsWith(':')) continue;
      if (l.startsWith('event:')) event = l.slice(6).trim();
      else if (l.startsWith('data:')) data.push(l.slice(5).replace(/^ /, ''));
    }
    return data.length ? { event, data: JSON.parse(data.join('\n')) } : null;
  }).filter(Boolean);
}

// ── admin (cleanup only) ────────────────────────────────────────────────────────────────────────────────
function serverEnv() {
  const env = {};
  try {
    for (const line of fs.readFileSync(path.join(ROOT, 'server/.env'), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  } catch { /* no server/.env */ }
  return env;
}
async function adminToken() {
  const env = serverEnv();
  const email = process.env.ADMIN_EMAIL || env.SEED_SUPER_ADMIN_EMAIL || 'admin@eduway.iq';
  const password = process.env.ADMIN_PASSWORD || env.SEED_SUPER_ADMIN_PASSWORD;
  if (!password) throw new Error('no admin password (set ADMIN_PASSWORD or server/.env SEED_SUPER_ADMIN_PASSWORD)');
  const adm = { deviceId: `${TAG}-admin`, lang: 'en' };
  const r = await fetch(`${BASE}/auth/admin/login`, {
    method: 'POST',
    headers: { ...appHeaders(adm), 'X-Client-Platform': 'admin', 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const j = await r.json().catch(() => null);
  if (j?.data?.mfaRequired) throw new Error('super admin has MFA enabled — re-run with --no-admin-cleanup and delete the ticket in the admin portal');
  const tokens = j?.data?.tokens ?? j?.data;
  if (!r.ok || !tokens?.accessToken) throw new Error(`admin login ${r.status} ${j?.error?.details?.reason ?? j?.error?.code ?? ''}`);
  return { token: tokens.accessToken, refresh: tokens.refreshToken };
}

// ══ Flow ════════════════════════════════════════════════════════════════════════════════════════════════
const ctx = {};

async function login({ revokeOwn } = {}) {
  const body = (extra = {}) => ({ phone: DEMO_PHONE, code: DEV_CODE, purpose: 'login', deviceId: app.deviceId, platform: 'ios', deviceName: `${TAG} iPhone`, ...extra });
  const deadline = Date.now() + WAIT_SLOT_MIN * 60_000;
  for (;;) {
    try {
      const r = await POST('/auth/verify-otp', body(), { skipAuth: true });
      return r.data;
    } catch (e) {
      if (e.reason !== 'DEVICE_LIMIT_REACHED') throw e;
      const sessions = e.body.error.details.sessions ?? [];
      // The app's device-limit sheet: the student picks one of THEIR sessions → retry with revokeSessionId.
      const own = sessions.find((x) => (revokeOwn && x.id === revokeOwn) || new RegExp(TAG).test(x.device ?? ''));
      if (own) {
        ctx.deviceLimitSwap = { limit: e.body.error.details.limit, revoked: own.id };
        return (await POST('/auth/verify-otp', body({ revokeSessionId: own.id }), { skipAuth: true })).data;
      }
      if (Date.now() > deadline) {
        throw new Error(`DEVICE_LIMIT_REACHED (${sessions.length}/${e.body.error.details.limit}) held by foreign sessions (${sessions.map((x) => `${x.platform}:${x.browser ?? x.device ?? '?'}`).join(', ')}); waited ${WAIT_SLOT_MIN} min. Sign one out and re-run (this script never revokes sessions it did not create).`);
      }
      if (!QUIET) console.log(`      … device limit full of foreign sessions — waiting for a free slot`);
      await sleep(30_000);
    }
  }
}

async function main() {
  console.log(`verify-app-flows → ${BASE}  (X-Client-Platform ios, X-App-Version ${APP_VERSION}, device ${app.deviceId})\n`);

  // ── 1. Boot (app/_layout → useApiBoot, connectivity probe) ──
  await step('HLT-01', 'GET /health (connectivity probe)', async () => {
    const r = await fetch(`${BASE}/health`);
    assert(r.ok, `health ${r.status}`);
  });
  await step('PUB-01', 'GET /public/app-config (skipAuth, ios) → maintenance / force-update flags', async () => {
    const r = await GET('/public/app-config', { skipAuth: true });
    expectShape(r.data, 'AppConfigDto');
    assert(r.data.maintenance.enabled === false, 'maintenance mode is ON');
    assert(r.data.update.required === false, `app ${APP_VERSION} is below the minimum version`);
    ctx.config = r.data;
    return `deviceLimit ${r.data.deviceLimit ?? r.data.app?.deviceLimit ?? '?'}; support ${r.data.support?.phone ? 'contacts present' : 'no contacts'}`;
  });
  await step('I18N', 'Accept-Language ar vs en → localized error messages', async () => {
    const ar = await expectError(GET(`/lessons/${uuid()}`, { lang: 'ar', skipAuth: true }), [401, 404]);
    const en = await expectError(GET(`/lessons/${uuid()}`, { lang: 'en', skipAuth: true }), [401, 404]);
    const arMsg = ar.body.error.message;
    const enMsg = en.body.error.message;
    assert(/[؀-ۿ]/.test(arMsg), `ar message not Arabic: ${arMsg}`);
    assert(!/[؀-ۿ]/.test(enMsg) && enMsg !== arMsg, `en message not English: ${enMsg}`);
  });

  // ── 2. Onboarding / welcome / register screens (public reads) ──
  await step('PUB-02/03', 'GET /public/governorates + /public/schools (register pickers)', async () => {
    const g = (await GET('/public/governorates', { skipAuth: true })).data;
    assert(g.length > 0, 'no governorates');
    expectShape(g, 'Governorate');
    const s = (await GET(`/public/schools?governorateId=${g[0].id}&limit=200`, { skipAuth: true })).data;
    expectShape(s, 'PublicSchool');
  });
  await step('PUB-04', 'GET /public/referral-codes/:code (register referral check)', async () => {
    try { expectShape((await GET('/public/referral-codes/ZZZZ-NOPE', { skipAuth: true })).data, 'ReferralCheckDto'); } catch (e) { if (![404, 422].includes(e.status)) throw e; }
  });
  await step('PUB-11', 'GET /legal/terms + /legal/privacy (ar)', async () => {
    ctx.legal = [];
    for (const d of ['terms', 'privacy']) {
      const r = (await GET(`/legal/${d}`, { skipAuth: true })).data;
      expectShape(r, 'LegalDocumentDto');
      ctx.legal.push({ doc: d, version: r.version });
    }
  });
  await step('PUB-05/08', 'GET /public/stats + /public/teachers (welcome, teacher card)', async () => {
    expectShape((await GET('/public/stats', { skipAuth: true })).data, 'PublicStatsDto');
    expectShape((await GET('/public/teachers', { skipAuth: true })).data, 'TeacherDto');
  });

  // ── 3. OTP login (login → verify-otp screens) ──
  await step('AUTH-01', 'POST /auth/send-otp {phone, purpose:login, channel:sms}', async () => {
    try {
      const r = (await POST('/auth/send-otp', { phone: DEMO_PHONE, purpose: 'login', channel: 'sms' }, { skipAuth: true })).data;
      expectShape(r, 'SendOtpDto');
      assert(r.isRegistered === true, 'demo student reported unregistered');
      return `code length ${r.codeLength}, resend in ${r.resendInSeconds}s`;
    } catch (e) {
      // The app shows its resend countdown on OTP_RESEND_LIMIT/cooldown and still lets the student type the code.
      if (e.status === 429 && typeof e.body?.error?.details?.retryAfterSeconds === 'number') return `rate limited (${e.reason}, retry in ${e.body.error.details.retryAfterSeconds}s) — app shows countdown; bypass code still valid`;
      throw e;
    }
  });
  await step('AUTH-02', 'POST /auth/verify-otp wrong code → OTP_INVALID (input shake)', async () => {
    const e = await expectError(POST('/auth/verify-otp', { phone: DEMO_PHONE, code: '000000', purpose: 'login', deviceId: app.deviceId, platform: 'ios', deviceName: `${TAG} iPhone` }, { skipAuth: true }), [401, 422, 400, 429]);
    assert(['OTP_INVALID', 'OTP_EXPIRED', 'OTP_NOT_FOUND', 'OTP_LOCKED', 'OTP_ATTEMPTS_EXCEEDED'].includes(e.reason) || e.status === 429, `unexpected ${e.reason}`);
    return e.reason ?? e.code;
  });
  const signedIn = await step('AUTH-02', 'POST /auth/verify-otp dev bypass 123456 (deviceId, platform ios, deviceName)', async () => {
    const d = await login();
    expectShape(d, 'VerifyOtpDto');
    app.access = d.accessToken;
    app.refresh = d.refreshToken;
    assert(d.isNewUser === false, 'demo student isNewUser');
    return ctx.deviceLimitSwap ? `device limit ${ctx.deviceLimitSwap.limit}: swapped out an old ${TAG} session` : 'signed in';
  });
  if (!signedIn) return;

  // ── 4. Profile (authStore.bootstrap → /auth/me) ──
  await step('AUTH-07', 'GET /auth/me (MeStudentDto → auth store)', async () => {
    const r = (await GET('/auth/me')).data;
    expectShape(r, 'MeStudentDto');
    assert(r.user.mobile === DEMO_PHONE, 'wrong user');
    ctx.me = r;
    return `${r.user.name?.en ?? ''}; ${r.entitlements?.length ?? 0} entitlement(s); ${r.unreadNotifications ?? 0} unread`;
  });
  await step('AUTH-03', 'POST /auth/register on a complete profile → 409 (profile-completion guard)', async () => {
    await expectError(POST('/auth/register', { name: 'x', governorateId: ctx.me.user.governorateId ?? 'x', acceptTerms: true, acceptedLegal: ctx.legal }), [409, 400, 422]);
  });
  await step('AUTH-04', 'POST /auth/refresh (rotation, single-flight) → new access works', async () => {
    const before = app.refresh;
    const t = await refreshTokens(app);
    expectShape(t, 'AuthTokens');
    assert(app.refresh !== before, 'refresh token not rotated');
    ctx.rotatedOut = before;
    await GET('/auth/me');
    return 'rotated (old token replay is checked after logout: reuse detection revokes the whole session)';
  });
  await step('AUTH-04', 'expired/invalid access → 401 → interceptor refresh → replay', async () => {
    app.access = `${app.access.slice(0, -4)}AAAA`;
    const n = refreshes;
    const r = (await GET('/auth/me')).data;
    assert(r.user.mobile === DEMO_PHONE, 'replay returned wrong user');
    assert(refreshes === n + 1, 'no refresh happened');
  });

  // ── 5. Home tab ──
  await step('PRG-04', 'GET /progress/dashboard?tzOffsetMinutes=180 (home)', async () => {
    const d = (await GET('/progress/dashboard?tzOffsetMinutes=180')).data;
    expectShape(d, 'StudentDashboardDto');
    ctx.dashboard = d;
  });
  await step('PRG-11/12', 'GET /progress/today-plan + PATCH toggle (restored)', async () => {
    const plan = (await GET('/progress/today-plan')).data;
    expectShape(plan, 'PlanItemDto');
    if (!plan[0]) return 'no plan items today';
    const p = plan[0];
    expectShape((await PATCH(`/progress/today-plan/${encodeURIComponent(p.id)}`, { done: !p.done })).data, 'PlanItemDto');
    await PATCH(`/progress/today-plan/${encodeURIComponent(p.id)}`, { done: p.done });
    return `${plan.length} item(s); toggled + restored`;
  });
  await step('EXM-02', 'GET /exams/upcoming?limit=3 (home exam reminder)', async () => expectShape((await GET('/exams/upcoming?limit=3')).data, 'UpcomingExamDto'));
  await step('NTF-02', 'GET /notifications/unread-count (header bell)', async () => {
    const n = (await GET('/notifications/unread-count')).data.unreadCount;
    assert(typeof n === 'number', 'no unreadCount');
    ctx.unread = n;
    return `${n} unread`;
  });

  // ── 6. Subjects tab → subject detail ──
  await step('CAT-01', 'GET /subjects (locked flags + progress)', async () => {
    const r = (await GET('/subjects')).data;
    assert(r.length > 0, 'no subjects');
    expectShape(r, 'SubjectSummary');
    ctx.subjects = r;
    ctx.subject = r.find((s) => !s.locked);
    ctx.lockedSubject = r.find((s) => s.locked);
    assert(ctx.subject, 'demo student has no unlocked subject');
    return `${r.length} subjects, ${r.filter((s) => s.locked).length} locked`;
  });
  await step('PRG-06', 'GET /progress/summary (subjects summary card)', async () => expectShape((await GET('/progress/summary')).data, 'ProgressSummaryDto'));
  await step('CAT-02', 'GET /subjects/:slug (subject screen)', async () => {
    const r = (await GET(`/subjects/${encodeURIComponent(ctx.subject.slug)}`)).data;
    expectShape(r, 'SubjectDetail');
    ctx.lessons = r.lessons ?? (r.units ?? []).flatMap((u) => u.lessons ?? []);
    ctx.lesson = ctx.lessons.find((l) => !l.locked);
    ctx.lockedLesson = ctx.lessons.find((l) => l.locked);
    assert(ctx.lesson, `no unlocked lesson in ${ctx.subject.slug}`);
    return `${ctx.lessons.length} lesson(s)`;
  });
  await step('CAT-03/04', 'GET /subjects/:id/question-stats + /exams (subject tabs)', async () => {
    expectShape((await GET(`/subjects/${encodeURIComponent(ctx.subject.slug)}/question-stats`)).data, 'QuestionStatsDto');
    expectShape((await GET(`/subjects/${encodeURIComponent(ctx.subject.slug)}/exams`)).data, 'ExamCardDto');
  });
  await step('LOCK', 'locked lessons: entitlement → 402/403 details.locked (paywall); order → 422 SEQUENTIAL/PREREQUISITE', async () => {
    const isOrder = (l) => l.lockReason === 'SEQUENTIAL' || l.lockReason === 'PREREQUISITE';
    let paywalled = ctx.lessons.find((l) => l.locked && !isOrder(l));
    if (!paywalled && ctx.lockedSubject) {
      const d = (await GET(`/subjects/${encodeURIComponent(ctx.lockedSubject.slug)}`)).data;
      paywalled = (d.lessons ?? []).find((l) => l.locked && !isOrder(l));
    }
    const notes = [];
    if (paywalled) {
      const e = await expectError(GET(`/lessons/${paywalled.id}/stream-url`), [402, 403]);
      assert(['SUBSCRIPTION_REQUIRED', 'NOT_ENTITLED'].includes(e.code), `code ${e.code}`);
      assert(e.body.error.details?.locked?.reason, 'no details.locked.reason');
      notes.push(`paywall ${e.status} ${e.code} (${e.body.error.details.locked.reason})`);
    } else notes.push('demo student is entitled to every subject (paywall 402 covered by verify-student-flows on a fresh account)');
    const ordered = ctx.lessons.find((l) => l.locked && isOrder(l));
    if (ordered) {
      const d = (await GET(`/lessons/${ordered.id}`)).data;
      assert(d.locked === true && isOrder(d), `lesson detail lock ${d.locked}/${d.lockReason}`);
      const e = await expectError(GET(`/lessons/${ordered.id}/stream-url`), [422, 403]);
      assert(/SEQUENTIAL|PREREQUISITE/.test(e.reason ?? ''), `reason ${e.reason}`);
      notes.push(`order lock ${e.status} ${e.reason} (app: "finish the previous lesson", no paywall)`);
    }
    return notes.join('; ');
  });

  // ── 7. Lesson + video progress ──
  await step('CAT-05', 'GET /lessons/:id (lesson screen)', async () => {
    const d = (await GET(`/lessons/${encodeURIComponent(ctx.lesson.id)}`)).data;
    expectShape(d, 'LessonDetail');
    ctx.lessonDetail = d;
  });
  await step('CAT-06', 'GET /lessons/:id/stream-url (signed, expiresAt)', async () => {
    const s = (await GET(`/lessons/${encodeURIComponent(ctx.lesson.id)}/stream-url`)).data;
    expectShape(s, 'StreamUrlDto');
    assert(new Date(s.expiresAt).getTime() > Date.now(), 'stream url already expired');
    ctx.resume = s.resumePositionSec ?? ctx.lessonDetail.positionSec ?? 0;
  });
  await step('PRG-01', 'PUT /progress/watch heartbeat → pause → leave (position restored)', async () => {
    const dur = ctx.lessonDetail.duration ?? ctx.lessonDetail.durationSec ?? 600;
    const orig = Math.max(0, Math.floor(ctx.resume ?? 0));
    const pos = Math.min(Math.max(orig + 15, 15), Math.max(1, dur - 30));
    const hb = (await PUT('/progress/watch', { lessonId: ctx.lesson.id, positionSec: pos, durationSec: dur, event: 'heartbeat', watchedSecDelta: 15, platform: 'ios' })).data;
    expectShape(hb, 'LessonProgressDto');
    await PUT('/progress/watch', { lessonId: ctx.lesson.id, positionSec: pos, durationSec: dur, event: 'pause', platform: 'ios' });
    await PUT('/progress/watch', { lessonId: ctx.lesson.id, positionSec: orig, durationSec: dur, event: 'seek', platform: 'ios' });
    await PUT('/progress/watch', { lessonId: ctx.lesson.id, positionSec: orig, durationSec: dur, event: 'leave', platform: 'ios' });
    return `status ${hb.status}, progress ${hb.progress}%, position restored to ${orig}s`;
  });
  await step('PRG-02', 'POST /progress/complete (on an already-completed lesson → idempotent)', async () => {
    const done = ctx.lessons.find((l) => !l.locked && (l.status === 'completed' || l.completed));
    if (!done) return 'no completed lesson to re-complete idempotently (skipped to keep demo progress unchanged)';
    const r = (await POST('/progress/complete', { lessonId: done.id })).data;
    expectShape(r, 'LessonProgressDto');
    assert(r.justCompleted === false, 'lesson was not completed before');
  });
  await step('CAT-07', 'GET /lessons/:id/resources/:rid/url (resource list)', async () => {
    let lesson = ctx.lessonDetail;
    if (!lesson.resources?.length) {
      for (const l of ctx.lessons.filter((x) => !x.locked).slice(0, 8)) {
        const d = (await GET(`/lessons/${l.id}`)).data;
        if (d.resources?.length) { lesson = d; break; }
      }
    }
    if (!lesson.resources?.length) return 'no lesson with resources';
    expectShape((await GET(`/lessons/${lesson.id}/resources/${lesson.resources[0].id}/url`)).data, 'ResourceUrlDto');
  });
  await step('CAT-08/09', 'GET + PUT /lessons/:id/note (restored)', async () => {
    const before = (await GET(`/lessons/${ctx.lesson.id}/note`)).data;
    expectShape(before, 'LessonNoteDto');
    const saved = (await PUT(`/lessons/${ctx.lesson.id}/note`, { text: `${TAG} note` })).data;
    assert(saved.text === `${TAG} note`, 'note not saved');
    await PUT(`/lessons/${ctx.lesson.id}/note`, { text: before.text ?? '' });
  });
  await step('CAT-10', 'GET /lessons/:id/quiz-rule (quiz prompt sheet)', async () => expectShape((await GET(`/lessons/${ctx.lesson.id}/quiz-rule`)).data, 'EffectiveQuizRule'));

  // ── 8. Lesson quiz ──
  await step('QUZ-01..03', 'POST /quizzes/:lessonId/start → answer each → submit', async () => {
    let start;
    let lastErr;
    for (const l of [ctx.lesson, ...ctx.lessons.filter((x) => !x.locked && x.id !== ctx.lesson.id)].slice(0, 8)) {
      try { start = (await POST(`/quizzes/${encodeURIComponent(l.id)}/start`, {})).data; break; } catch (e) { lastErr = e; if (e.status >= 500) throw e; }
    }
    if (!start) throw lastErr;
    expectShape(start, 'QuizStartDto');
    for (const q of start.questions) {
      expectShape((await POST(`/quizzes/attempts/${start.attemptId}/answer`, { questionId: q.id, optionId: q.options?.[0]?.id, timeSec: 6 })).data, 'AnswerFeedback');
    }
    const res = (await POST(`/quizzes/attempts/${start.attemptId}/submit`, { timeSpentSec: 60 })).data;
    expectShape(res, 'QuizResultDto');
    leftovers.push(`quiz attempt ${start.attemptId}`);
    return `${start.questions.length} question(s), score ${res.score ?? res.scorePct ?? '?'}`;
  });

  // ── 9. Practice tab / question bank / bookmarks ──
  await step('BNK-02', 'GET /bank/facets?subjectId&difficulty (practice tab)', async () => expectShape((await GET(`/bank/facets?subjectId=${ctx.subject.slug}`)).data, 'BankFacetsDto'));
  await step('PRA-05', 'GET /practice/sessions?limit=5 (recent sessions)', async () => expectShape((await GET('/practice/sessions?limit=5')).data, 'PracticeSessionSummary'));
  await step('BNK-01/03', 'GET /bank/questions (page 1) + /bank/questions/:id', async () => {
    const r = await GET(`/bank/questions?subjectId=${ctx.subject.slug}&page=1&pageSize=20`);
    expectShape(r.data, 'QuestionPublic');
    assert(r.meta && typeof r.meta.total === 'number', 'no meta.total');
    ctx.question = r.data[0];
    // A question inside the student's running exam/quiz is concealed (409 QUESTION_IN_ACTIVE_ATTEMPT) → app toasts it.
    let shown = 0;
    let concealed = 0;
    for (const q of r.data.slice(0, 6)) {
      try {
        expectShape((await GET(`/bank/questions/${q.id}`)).data, 'QuestionReview');
        shown++;
        break;
      } catch (e) {
        if (e.reason !== 'QUESTION_IN_ACTIVE_ATTEMPT') throw e;
        concealed++;
      }
    }
    assert(shown === 1, 'no viewable question');
    return `${r.meta.total} question(s)${concealed ? `; ${concealed} concealed by an active attempt (409)` : ''}`;
  });
  await step('BMK-01..04', 'bookmarks ids → PUT → list → DELETE (restored)', async () => {
    const ids = (await GET('/bookmarks/ids')).data;
    expectShape((await GET('/bookmarks?page=1&pageSize=20')).data, 'QuestionPublic');
    const q = ctx.question;
    if (!q) return 'no question';
    const was = ids.includes(q.id);
    if (was) {
      await DEL(`/bookmarks/${q.id}`);
      await PUT(`/bookmarks/${q.id}`);
    } else {
      await PUT(`/bookmarks/${q.id}`);
      assert((await GET('/bookmarks/ids')).data.includes(q.id), 'not bookmarked');
      await DEL(`/bookmarks/${q.id}`);
    }
    assert((await GET('/bookmarks/ids')).data.includes(q.id) === was, 'bookmark state not restored');
  });
  await step('PRA-01..04', 'practice start (filters) → answer → finish → result', async () => {
    const st = (await POST('/practice/start', { mode: 'filters', filters: { subjectId: ctx.subject.slug, difficulty: 'all' }, count: 5 })).data;
    expectShape(st, 'PracticeStartDto');
    for (const q of st.questions.slice(0, 3)) {
      expectShape((await POST(`/practice/${st.sessionId}/answer`, { questionId: q.id, optionId: q.options?.[0]?.id, timeSec: 5 })).data, 'PracticeFeedback');
    }
    expectShape((await POST(`/practice/${st.sessionId}/finish`, { timeSpentSec: 30 })).data, 'PracticeResultDto');
    expectShape((await GET(`/practice/${st.sessionId}/result`)).data, 'PracticeResultDto');
    leftovers.push(`practice session ${st.sessionId}`);
  });

  // ── 10. Mistakes ──
  await step('MST-01/02', 'GET /mistakes + /mistakes/summary', async () => {
    const r = await GET('/mistakes?pageSize=100');
    expectShape(r.data, 'MistakeEntryDto');
    expectShape(r.meta, 'MistakesMeta');
    ctx.mistakes = r.data;
    expectShape((await GET('/mistakes/summary')).data, 'MistakeSummaryDto');
    return `${r.data.length} mistake(s)`;
  });
  await step('MST-03..05', 'GET /mistakes/:id → PATCH status → POST retry → status restored', async () => {
    const m = ctx.mistakes?.find((x) => x.status !== 'resolved') ?? ctx.mistakes?.[0];
    if (!m) return 'no mistakes';
    const d = (await GET(`/mistakes/${m.id}`)).data;
    expectShape(d, 'MistakeEntryDto');
    expectShape((await PATCH(`/mistakes/${m.id}`, { status: m.status === 'reviewed' ? 'unresolved' : 'reviewed' })).data, 'MistakeEntryDto');
    const wrong = d.question?.options?.find((o) => o.id !== d.question?.correctOptionId)?.id ?? d.question?.options?.[0]?.id;
    expectShape((await POST(`/mistakes/${m.id}/retry`, { optionId: wrong })).data, 'MistakeRetryDto');
    await PATCH(`/mistakes/${m.id}`, { status: m.status });
    leftovers.push(`mistake ${m.id} retry history +1`);
  });

  // ── 11. Exams (list → room → result) ──
  await step('EXM-01/09', 'GET /exams/available + /exams/attempts', async () => {
    const r = (await GET('/exams/available')).data;
    expectShape(r, 'ExamCardDto');
    ctx.exams = r;
    expectShape((await GET('/exams/attempts?pageSize=50')).data, 'ExamAttemptSummary');
    return `${r.length} exam(s)`;
  });
  await step('EXM-03..08', 'exam start/resume → autosave(seq) → flag → submit (Idempotency-Key, replay) → result', async () => {
    const resumable = ctx.exams.find((e) => !e.locked && e.activeAttempt);
    const fresh = ctx.exams.filter((e) => !e.locked && e.available && e.attemptsLeft >= 2).sort((a, b) => b.attemptsLeft - a.attemptsLeft)[0];
    const card = resumable ?? fresh;
    if (!card) return `no exam with an active attempt or ≥ 2 attempts left (${ctx.exams.length} cards) — not consuming the demo student's last attempt`;
    const st = (await POST(`/exams/${encodeURIComponent(card.id)}/start`, {})).data;
    expectShape(st, 'ExamAttemptState');
    const qs = st.questions ?? [];
    const answers = Object.fromEntries(qs.slice(0, 3).map((q) => [q.id, q.options?.[0]?.id ?? null]));
    const seq = Date.now();
    expectShape((await PUT(`/exams/attempts/${st.attemptId}/autosave`, { answers, flagged: [], currentIndex: Math.min(2, qs.length - 1), clientSavedAt: new Date().toISOString(), seq })).data, 'ExamAutosaveDto');
    // replaying an older seq must be ignored, not rejected (offline queue replays)
    await PUT(`/exams/attempts/${st.attemptId}/autosave`, { answers: {}, flagged: [], currentIndex: 0, clientSavedAt: new Date().toISOString(), seq: seq - 1 });
    if (qs[0]) await POST(`/exams/attempts/${st.attemptId}/flag`, { questionId: qs[0].id, flagged: true });
    const body = { reason: 'manual', answers, flagged: qs[0] ? [qs[0].id] : [], seq: seq + 1 };
    const key = `exam-submit-${st.attemptId}`;
    const sub = (await POST(`/exams/attempts/${st.attemptId}/submit`, body, { headers: { 'Idempotency-Key': key } })).data;
    expectShape(sub, 'ExamSubmitDto');
    const again = (await POST(`/exams/attempts/${st.attemptId}/submit`, body, { headers: { 'Idempotency-Key': key } })).data;
    assert(again.attemptId === sub.attemptId, 'idempotent replay differs');
    let res;
    for (let i = 0; i < 10 && !res; i++) {
      try { res = (await GET(`/exams/attempts/${st.attemptId}/result`)).data; } catch (e) { if (e.status !== 409) throw e; await sleep(700); }
    }
    expectShape(res, 'ExamResultDto');
    leftovers.push(`exam attempt ${st.attemptId} (${resumable ? 'resumed' : 'new'})`);
    return `${resumable ? 'resumed' : 'started'} "${card.title?.en}", score ${res.score ?? '?'}`;
  });

  // ── 12. AI tutor tab ──
  await step('AIT-01/02/03', 'GET allowance + suggestions + conversations', async () => {
    const a = (await GET('/ai-tutor/allowance')).data;
    expectShape(a, 'AiAllowance');
    ctx.allowance = a;
    await GET(`/ai-tutor/suggestions?subjectId=${ctx.subject.slug}`);
    expectShape((await GET('/ai-tutor/conversations?pageSize=50')).data, 'ConversationSummary');
    return `remaining ${a.remaining}/${a.limit ?? a.total ?? '?'}`;
  });
  await step('STO-01', 'POST /storage/signed-upload-url purpose=ai_attachment (tutor image attach)', async () => {
    expectShape((await POST('/storage/signed-upload-url', { purpose: 'ai_attachment', fileName: 'question.jpg', contentType: 'image/jpeg', sizeBytes: 20480 })).data, 'SignedUploadDto');
  });
  await step('AIT-04/05/06', 'create conversation → get (limit 50) → rename', async () => {
    const c = (await POST('/ai-tutor/conversations', { subjectId: ctx.subject.slug, title: TAG })).data;
    expectShape(c, 'ConversationDto');
    ctx.conv = c.id;
    expectShape((await GET(`/ai-tutor/conversations/${c.id}?limit=50`)).data, 'ConversationDto');
    expectShape((await PATCH(`/ai-tutor/conversations/${c.id}`, { title: `${TAG} (renamed)` })).data, 'ConversationSummary');
  });
  await step('AIT-08', 'POST message Accept: text/event-stream (meta → delta → done)', async () => {
    if (!ctx.conv) throw new Error('no conversation');
    if ((ctx.allowance?.remaining ?? 0) < 2) return `allowance remaining ${ctx.allowance?.remaining} — not spending the demo student's last questions`;
    const res = await call(app, 'POST', `/ai-tutor/conversations/${ctx.conv}/messages`, { text: 'ما هو المشتق؟ أجب باختصار.', lang: 'ar', clientMessageId: uuid() }, { headers: { Accept: 'text/event-stream' }, raw: true });
    if (!res.ok) throw new HttpError(res.status, await res.json().catch(() => null), 'POST', 'messages');
    assert((res.headers.get('content-type') ?? '').includes('text/event-stream'), `content-type ${res.headers.get('content-type')}`);
    const events = parseSse(await res.text());
    const names = events.map((e) => e.event);
    const err = events.find((e) => e.event === 'error');
    assert(!err, `error event: ${JSON.stringify(err?.data)}`);
    assert(names.includes('meta'), `no meta (${names.join(',')})`);
    const done = events.find((e) => e.event === 'done');
    assert(done?.data?.message?.text?.length > 0, `no done/full text (${names.join(',')})`);
    expectShape(done.data.message, 'TutorMessageDto');
    expectShape(done.data.allowance, 'AiAllowance');
    ctx.tutorMsg = done.data.message.id;
    return `events ${[...new Set(names)].join(',')}; ${names.filter((n) => n === 'delta').length} delta(s)`;
  });
  await step('AIT-08/09', 'POST message Accept: application/json (polling fallback) → GET /ai-tutor/messages/:id', async () => {
    if (!ctx.conv) throw new Error('no conversation');
    if ((ctx.allowance?.remaining ?? 0) < 2) return 'skipped (allowance)';
    const r = (await POST(`/ai-tutor/conversations/${ctx.conv}/messages`, { text: 'And an integral? One sentence.', lang: 'en', clientMessageId: uuid() })).data;
    expectShape(r, 'TutorSendPollingDto');
    let m;
    let delay = Math.max(400, r.pollAfterMs ?? 500);
    for (let i = 0; i < 60; i++) {
      await sleep(delay);
      m = (await GET(`/ai-tutor/messages/${r.tutorMessage.id}`)).data;
      if (['complete', 'failed', 'blocked'].includes(m.status)) break;
      delay = Math.min(2000, delay + 200);
    }
    expectShape(m, 'TutorMessageDto');
    assert(m.status === 'complete', `final status ${m.status}`);
  });
  await step('AIT-10/07', 'POST feedback (up → cleared) → DELETE conversation', async () => {
    if (ctx.tutorMsg) {
      expectShape((await POST(`/ai-tutor/messages/${ctx.tutorMsg}/feedback`, { rating: 'up' })).data, 'TutorMessageDto');
      await POST(`/ai-tutor/messages/${ctx.tutorMsg}/feedback`, { rating: null });
    }
    if (ctx.conv) await DEL(`/ai-tutor/conversations/${ctx.conv}`);
    ctx.conv = null;
    const after = (await GET('/ai-tutor/allowance')).data;
    if (after.remaining !== ctx.allowance?.remaining) leftovers.push(`AI allowance used ${ctx.allowance.remaining - after.remaining}`);
  });

  // ── 13. Notifications + push token ──
  await step('NTF-01', 'GET /notifications?filter=all|unread&limit=30 (cursor pages)', async () => {
    const r = await GET('/notifications?filter=all&limit=30');
    expectShape(r.data, 'AppNotificationDto');
    expectShape(r.meta, 'NotificationsMeta');
    ctx.notifs = r.data;
    if (r.meta.nextCursor) await GET(`/notifications?filter=all&limit=30&cursor=${encodeURIComponent(r.meta.nextCursor)}`);
    await GET('/notifications?filter=unread&limit=30');
    return `${r.data.length} on page 1`;
  });
  await step('NTF-03/04/05', 'read one (already read → idempotent) → read-all (only when 0 unread) → delete unknown → 404', async () => {
    const readOne = ctx.notifs?.find((n) => n.read);
    if (readOne) assert(typeof (await POST(`/notifications/${readOne.id}/read`)).data.unreadCount === 'number', 'no unreadCount');
    if ((ctx.unread ?? 1) === 0) await POST('/notifications/read-all');
    await expectError(DEL(`/notifications/${uuid()}`), [404]);
    return `${readOne ? 'read ✓' : 'no read notification'}; read-all ${(ctx.unread ?? 1) === 0 ? '✓' : 'not run (would mark the demo student\'s unread items)'}; delete wiring ✓`;
  });
  await step('ME-07/08', 'POST /me/push-token (expo, ios, deviceId) → DELETE', async () => {
    const token = `ExponentPushToken[${TAG}-${crypto.randomBytes(6).toString('hex')}]`;
    await POST('/me/push-token', { token, provider: 'expo', platform: 'ios', deviceId: app.deviceId });
    await DEL('/me/push-token', { token });
  });

  // ── 14. Progress screen ──
  await step('PRG-05..13', 'progress subjects / score-trend / weak-topics / streak / activity / achievements', async () => {
    expectShape((await GET('/progress/subjects')).data, 'SubjectProgressDto');
    expectShape((await GET('/progress/score-trend?weeks=8')).data, 'ScoreTrendDto');
    expectShape((await GET('/progress/weak-topics?limit=5')).data, 'WeakTopicDto');
    expectShape((await GET('/progress/streak-calendar?weeks=16')).data, 'StreakCalendarDto');
    expectShape((await GET('/progress/activity?limit=10')).data, 'ActivityItem');
    expectShape((await GET('/progress/achievements')).data, 'AchievementDto');
  });

  // ── 15. Subscription + checkout (mock gateway) ──
  await step('PAY-01/02/03', 'GET /packages + /packages/:id + /subscriptions/my + /public/faq', async () => {
    const p = (await GET('/packages')).data;
    expectShape(p, 'PackagePublic');
    assert(p.length > 0, 'no packages');
    ctx.packages = p;
    expectShape((await GET(`/packages/${p[0].id}`)).data, 'PackagePublic');
    const s = (await GET('/subscriptions/my')).data;
    if (s) expectShape(s, 'MySubscription');
    expectShape((await GET('/public/faq?placement=subscription_app', { skipAuth: true })).data, 'FaqItem');
    return s ? `subscribed (${s.status})` : 'no subscription';
  });
  await step('PAY-11/04/05', 'GET /payments/methods → POST /payments/quote → POST /promotions/validate', async () => {
    const m = (await GET('/payments/methods')).data;
    expectShape(m, 'PaymentMethodDto');
    ctx.mock = m.find((x) => x.id === 'mock');
    ctx.pkg = ctx.packages[0];
    const cycle = ctx.pkg.prices?.monthly != null || !ctx.pkg.prices ? 'monthly' : Object.keys(ctx.pkg.prices)[0];
    ctx.cycle = cycle;
    expectShape((await POST('/payments/quote', { packageId: ctx.pkg.id, cycle })).data, 'PriceQuote');
    try {
      const v = (await POST('/promotions/validate', { code: 'NOPE-APP', packageId: ctx.pkg.id, cycle })).data;
      expectShape(v, 'PromoValidateDto');
      assert(v.valid === false, 'unknown promo valid');
    } catch (e) { if (![404, 422].includes(e.status)) throw e; }
    return `${m.length} method(s)${ctx.mock ? ' incl. mock' : ' (no mock gateway!)'}`;
  });
  await step('PAY-06..08', 'initiate (Idempotency-Key + replay) → mock confirm cancel → poll status (no entitlement granted)', async () => {
    assert(ctx.mock, 'mock gateway not offered (non-production servers must expose it)');
    const key = uuid();
    const body = { packageId: ctx.pkg.id, cycle: ctx.cycle, gateway: 'mock', returnScheme: 'eduway://subscription/success' };
    const ini = (await POST('/payments/initiate', body, { headers: { 'Idempotency-Key': key } })).data;
    expectShape(ini, 'InitiatePaymentDto');
    assert(ini.mock?.confirmUrl, 'no mock.confirmUrl');
    const replay = (await POST('/payments/initiate', body, { headers: { 'Idempotency-Key': key } })).data;
    assert(replay.paymentId === ini.paymentId, 'idempotent replay created another payment');
    expectShape((await POST(`/payments/mock/${ini.paymentId}/confirm`, { outcome: 'cancel' })).data, 'StudentPaymentDto');
    let st;
    for (let i = 0; i < 10; i++) {
      st = (await GET(`/payments/${ini.paymentId}`)).data;
      if (!['initiated', 'pending'].includes(st.status)) break;
      await sleep(1000);
    }
    expectShape(st, 'PaymentDetailDto');
    assert(st.status === 'cancelled' || st.status === 'failed', `status ${st.status}`);
    leftovers.push(`payment ${ini.ref ?? ini.paymentId} (${st.status}, mock)`);
    return `${ini.ref} → ${st.status}`;
  });
  await step('PAY-09/10', 'GET /payments/my + receipt json of a paid payment (success screen)', async () => {
    const my = (await GET('/payments/my?pageSize=20')).data;
    expectShape(my, 'StudentPaymentDto');
    const paid = my.find((p) => p.status === 'paid');
    if (!paid) return `${my.length} payment(s), none paid`;
    expectShape((await GET(`/payments/${paid.id}/receipt?format=json`)).data, 'ReceiptDto');
    return `receipt ${paid.receiptNumber ?? paid.id}`;
  });

  // ── 16. Support ticket (Profile/Settings → Contact support → Send us a message) ──
  await step('PUB-10', 'POST /public/contact (in-app support message → EW-T ticket)', async () => {
    const r = (await POST('/public/contact', {
      name: ctx.me.user.name?.ar || ctx.me.user.name?.en || 'Demo Student',
      contact: DEMO_PHONE,
      subject: 'support',
      message: `${TAG}: automated check of the in-app support message — please ignore.`,
      locale: 'ar',
    })).data;
    assert(/^EW-T-\d+/.test(r.ticketId), `ticketId ${r.ticketId}`);
    ctx.ticket = r.ticketId;
    return r.ticketId;
  });

  // ── 17. Settings: profile, notification prefs, sessions, legal ──
  await step('ME-02', 'PATCH /me (dailyGoalMinutes, language) → restored', async () => {
    const u = ctx.me.user;
    const goal = u.dailyGoalMinutes ?? 30;
    const r = (await PATCH('/me', { dailyGoalMinutes: goal === 45 ? 30 : 45, language: u.language === 'ar' ? 'en' : 'ar' })).data;
    expectShape(r, 'StudentUser');
    const back = (await PATCH('/me', { dailyGoalMinutes: goal, language: u.language ?? 'ar' })).data;
    assert(back.dailyGoalMinutes === goal, 'daily goal not restored');
  });
  await step('ME-09/10', 'GET + PATCH /me/notification-preferences → restored', async () => {
    const p = (await GET('/me/notification-preferences')).data;
    expectShape(p, 'NotificationPrefs');
    const k = Object.keys(p).find((x) => typeof p[x] === 'boolean');
    const r = (await PATCH('/me/notification-preferences', { [k]: !p[k] })).data;
    assert(r[k] === !p[k], 'pref not updated');
    await PATCH('/me/notification-preferences', { [k]: p[k] });
  });
  await step('ME-03/04', 'GET /me/sessions (current flagged) + DELETE /me/sessions/:id wiring', async () => {
    const list = (await GET('/me/sessions')).data;
    expectShape(list, 'SessionDto');
    assert(list.filter((x) => x.current).length === 1, 'exactly one current session expected');
    // Revoking a real other device would sign out someone else on this shared demo account; the success path is
    // covered by verify-student-flows on a fresh account. Here: unknown id → 404 (not 5xx), list unchanged.
    await expectError(DEL(`/me/sessions/${uuid()}`), [404]);
    assert((await GET('/me/sessions')).data.length === list.length, 'session list changed');
    return `${list.length} active session(s)`;
  });
  await step('ME-05', 'DELETE /me/sessions?scope=others (only when every other session is ours)', async () => {
    const list = (await GET('/me/sessions')).data;
    const foreign = list.filter((s) => !s.current && !new RegExp(TAG).test(s.device ?? ''));
    if (foreign.length) return `not run: ${foreign.length} foreign device(s) signed in (${foreign.map((s) => s.platform).join(', ')}) — would sign them out`;
    const r = (await DEL('/me/sessions?scope=others')).data;
    assert(typeof r.revoked === 'number', 'no revoked count');
    return `revoked ${r.revoked}`;
  });
  await step('LANG', 'switch app language → /auth/me in en and ar', async () => {
    const en = await GET('/auth/me', { lang: 'en' });
    const ar = await GET('/auth/me', { lang: 'ar' });
    expectShape(en.data, 'MeStudentDto');
    expectShape(ar.data, 'MeStudentDto');
  });

  // ── 18. Logout ──
  await step('AUTH-05', 'POST /auth/logout {refreshToken} → refresh rejected → /auth/me 401', async () => {
    const rt = app.refresh;
    await POST('/auth/logout', { refreshToken: rt });
    await expectError(call({ ...app, refresh: null }, 'POST', '/auth/refresh', { refreshToken: rt }, { skipAuth: true }), [401]);
    if (ctx.rotatedOut) await expectError(call({ ...app, refresh: null }, 'POST', '/auth/refresh', { refreshToken: ctx.rotatedOut }, { skipAuth: true }), [401]);
    const r = await call({ ...app, refresh: null }, 'GET', '/auth/me', undefined, { raw: true });
    assert(r.status === 401, `/auth/me after logout ${r.status}`);
    app.access = null;
    app.refresh = null;
  });
}

async function cleanup() {
  // A failed run may leave the AI conversation behind; the session is signed out by AUTH-05 or here.
  if (ctx.conv && app.access) await DEL(`/ai-tutor/conversations/${ctx.conv}`).catch(() => undefined);
  if (app.refresh) await call(app, 'POST', '/auth/logout', { refreshToken: app.refresh }).catch(() => undefined);
  if (ctx.ticket) {
    await step('CLEANUP', `delete support ticket ${ctx.ticket} (ADM-SUP-05)`, async () => {
      if (!ADMIN_CLEANUP) { leftovers.push(`support ticket ${ctx.ticket}`); return 'skipped (--no-admin-cleanup)'; }
      const { token, refresh } = await adminToken();
      const h = { ...appHeaders({ deviceId: `${TAG}-admin`, lang: 'en' }), 'X-Client-Platform': 'admin', Authorization: `Bearer ${token}` };
      const r = await fetch(`${BASE}/admin/support-tickets/${encodeURIComponent(ctx.ticket)}`, { method: 'DELETE', headers: h });
      assert(r.ok, `delete ticket ${r.status}`);
      const g = await fetch(`${BASE}/admin/support-tickets/${encodeURIComponent(ctx.ticket)}`, { headers: h });
      assert(g.status === 404, `ticket still readable (${g.status})`);
      await fetch(`${BASE}/auth/admin/logout`, { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: refresh }) }).catch(() => undefined);
    });
  }
}

try {
  await main();
} catch (e) {
  console.error('fatal:', e);
  results.push({ id: 'FATAL', name: 'script', ok: false, note: String(e), calls: [] });
} finally {
  await cleanup().catch((e) => results.push({ id: 'CLEANUP', name: 'cleanup', ok: false, note: String(e), calls: [] }));
}
const failed = results.filter((r) => !r.ok);
if (transient.length) console.log(`\ntransient 5xx retried (${transient.length}): ${[...new Set(transient)].join(', ')}`);
console.log(`\n${results.length - failed.length}/${results.length} steps passed · ${results.reduce((n, r) => n + r.calls.length, 0)} requests · ${refreshes} token refresh(es)`);
if (leftovers.length) console.log(`history kept (no delete API, demo account): ${leftovers.join('; ')}`);
for (const f of failed) console.log(`  FAIL ${f.id}: ${f.note}`);
if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify({ base: BASE, at: new Date().toISOString(), results, leftovers }, null, 2));
process.exit(failed.length ? 1 : 0);
