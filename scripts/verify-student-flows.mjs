#!/usr/bin/env node
/**
 * verify-student-flows — live walk of the student journey against a running API, using the same request shapes as
 * website/user/src/api and app/user/src/api. Every response's `data` is spot-checked against the frontends' TypeScript
 * interfaces (all required top-level fields present; known nested interfaces checked one level deeper).
 *
 * Usage:  node scripts/verify-student-flows.mjs [--base http://localhost:4100/api/v1] [--json out.json] [--quiet]
 *
 * Accounts:
 *   - a fresh random +96477xxxxxxxx registered through AUTH-01/AUTH-02 (registration object) on a web device, then
 *     signed in on a second (iOS) device. Its OTP is recovered from the database (dev only): the latest
 *     otp_codes.code_hash for the phone is matched against HMAC(code) with the server's JWT_REFRESH_SECRET (reads
 *     server/.env → SUPABASE_DB_URL). The whole journey (purchase → learning → AI → sessions) runs on this account.
 *   - demo student +9647701234567 with the dev bypass code 123456: ONE web session, read-only checks over the rich
 *     seeded data, then logout. Device-limit eviction only ever targets our own `verify-student-flows` sessions, so a
 *     real device (e.g. the client's iPhone on Expo Go) is never signed out.
 *
 * Demo data is not mutated (the fresh account is left in the DB as a normal registered student).
 * Exit code 0 when every step passes.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const argOf = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const BASE = argOf('--base', process.env.API_URL ?? 'http://localhost:4100/api/v1').replace(/\/+$/, '');
const JSON_OUT = argOf('--json', null);
const QUIET = args.includes('--quiet');
const DEMO_PHONE = '+9647701234567';
const DEV_CODE = '123456';

// ── frontend type index (for DTO spot checks) ──────────────────────────────────────────────────────────
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
      // `type X = A & B & { ... }` → parents A, B + body
      const end = src.indexOf('\n\n', i);
      const decl = src.slice(i, end < 0 ? undefined : end);
      if (!/^[\w\s&{]/.test(decl)) continue;
      const refs = decl.replace(/\{[\s\S]*\}/, '').split('&').map((s) => s.trim()).filter((s) => /^\w+$/.test(s));
      parents.push(...refs);
      const bi = decl.indexOf('{');
      if (bi < 0) { if (refs.length) types.set(name, { fields: [], parents }); continue; }
      if (/^\s*['"|\w\s]*\|/.test(decl.slice(0, bi))) continue; // union alias
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
      if (ch === '{' || ch === '(' || ch === '<' || ch === '[') d++;
      if (ch === '}' || ch === ')' || ch === '>' || ch === ']') d--;
      if ((ch === ';' || ch === '\n') && d === 0) {
        const fm = line.trim().replace(/^\/\/.*$/, '').match(/^(?:readonly\s+)?(\w+)(\?)?\s*:\s*([\s\S]+)$/);
        if (fm) fields.push({ name: fm[1], optional: !!fm[2], type: fm[3].trim() });
        line = '';
        continue;
      }
      line += ch;
      if (ch === '\n') line = '';
    }
    // strip comments inside fields
    types.set(name, { fields, parents });
  }
  return types;
}
const TYPES = {
  web: parseTypes(path.join(ROOT, 'website/user/src/api/types.ts')),
  app: parseTypes(path.join(ROOT, 'app/user/src/api/types.ts')),
};
function allFields(set, name, seen = new Set()) {
  const t = TYPES[set].get(name);
  if (!t || seen.has(name)) return [];
  seen.add(name);
  return [...t.parents.flatMap((p) => allFields(set, p, seen)), ...t.fields];
}
/** Returns a list of problems: required fields missing (one nested level for known interfaces). */
function shapeProblems(set, name, value, pathStr = name, depth = 0) {
  if (!TYPES[set].has(name)) return [`(${set}) unknown type ${name}`];
  if (value === null || value === undefined) return [`${pathStr} is ${value}`];
  if (typeof value !== 'object') return [`${pathStr} not an object`];
  const out = [];
  for (const f of allFields(set, name)) {
    const v = value[f.name];
    if (!f.optional && v === undefined && !/\bundefined\b/.test(f.type)) out.push(`${pathStr}.${f.name} missing`);
    if (v == null || depth >= 1) continue;
    const tm = f.type.replace(/\s*\|\s*null/g, '').match(/^(\w+)(\[\])?$/);
    if (tm && TYPES[set].has(tm[1]) && allFields(set, tm[1]).length) {
      const inner = tm[2] ? (Array.isArray(v) ? v[0] : undefined) : v;
      if (inner !== undefined && typeof inner === 'object') out.push(...shapeProblems(set, tm[1], inner, `${pathStr}.${f.name}${tm[2] ? '[0]' : ''}`, depth + 1));
    }
  }
  return out;
}

// ── HTTP ───────────────────────────────────────────────────────────────────────────────────────────────
const results = [];
let current = null;
const uuid = () => crypto.randomUUID();
const headersFor = (s) => ({
  Accept: 'application/json',
  'Accept-Language': 'en',
  'X-Request-Id': uuid(),
  'X-Client-Platform': s?.platform ?? 'web',
  'X-Device-Id': s?.deviceId ?? 'verify-anon-device',
  ...(s?.platform && s.platform !== 'web' ? { 'X-App-Version': '1.0.0' } : {}),
  ...(s?.access ? { Authorization: `Bearer ${s.access}` } : {}),
});

class HttpError extends Error {
  constructor(status, body, method, url) {
    super(`${method} ${url} → ${status} ${body?.error?.code ?? ''} ${body?.error?.details?.reason ?? ''} ${body?.error?.message ?? (typeof body === 'string' ? body.slice(0, 200) : '')}${body?.error?.details?.fields ? ` fields=${JSON.stringify(body.error.details.fields)}` : ''}${status >= 500 ? ` requestId=${body?.error?.details?.requestId}` : ''}`);
    this.status = status;
    this.body = body;
  }
}

const transient = [];
async function call(s, method, url, body, extraHeaders = {}, { raw = false } = {}) {
  const h = { ...headersFor(s), ...extraHeaders };
  if (body !== undefined) h['Content-Type'] = 'application/json';
  let res;
  // A shared dev database pooler (session mode, 15 clients) can transiently refuse connections → 500. Retry those.
  for (let attempt = 0; ; attempt++) {
    res = await fetch(`${BASE}${url}`, { method, headers: { ...h, 'X-Request-Id': uuid() }, body: body !== undefined ? JSON.stringify(body) : undefined });
    // Another tool (e.g. smoke) may free the demo student's oldest session at the device limit → sign in again once.
    if (res.status === 401 && s?.relogin && !s.relogged) {
      s.relogged = true;
      await s.relogin();
      h.Authorization = `Bearer ${s.access}`;
      continue;
    }
    if (res.status < 500 || attempt >= 3) break;
    transient.push(`${method} ${url.split('?')[0]} ${res.status}`);
    await new Promise((r) => setTimeout(r, 2500 * (attempt + 1)));
  }
  if (raw) return res;
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  if (current) current.calls.push(`${method} ${url.split('?')[0]} ${res.status}`);
  if (!res.ok) throw new HttpError(res.status, json, method, url);
  if (!json || json.success !== true) throw new Error(`${method} ${url}: not a success envelope`);
  return { data: json.data, meta: json.meta, status: res.status, headers: res.headers };
}
const GET = (s, u, h) => call(s, 'GET', u, undefined, h);
const POST = (s, u, b = {}, h) => call(s, 'POST', u, b, h);
const PUT = (s, u, b = {}, h) => call(s, 'PUT', u, b, h);
const PATCH = (s, u, b = {}, h) => call(s, 'PATCH', u, b, h);
const DEL = (s, u, b, h) => call(s, 'DELETE', u, b, h);

function expectShape(value, webType, appType = webType) {
  const probs = [];
  const one = Array.isArray(value) ? value[0] : value;
  if (Array.isArray(value) && value.length === 0) return; // nothing to check
  if (webType) probs.push(...shapeProblems('web', webType, one).map((p) => `web:${p}`));
  if (appType) probs.push(...shapeProblems('app', appType, one).map((p) => `app:${p}`));
  if (probs.length) throw new Error(`DTO mismatch: ${probs.slice(0, 8).join('; ')}${probs.length > 8 ? ` (+${probs.length - 8})` : ''}`);
}
const assert = (c, msg) => { if (!c) throw new Error(msg); };

async function step(id, name, fn, { optional = false } = {}) {
  current = { id, name, calls: [], ok: false, note: '' };
  const t0 = Date.now();
  try {
    const note = await fn();
    current.ok = true;
    if (typeof note === 'string') current.note = note;
  } catch (e) {
    current.ok = false;
    current.note = e instanceof Error ? e.message : String(e);
    if (optional) current.skipped = true;
  }
  current.ms = Date.now() - t0;
  results.push(current);
  if (!QUIET) console.log(`${current.ok ? 'PASS' : current.skipped ? 'SKIP' : 'FAIL'}  ${id.padEnd(16)} ${name}${current.note ? `  — ${current.note}` : ''}`);
  const r = current;
  current = null;
  return r.ok;
}

// ── dev OTP recovery (fresh number) ───────────────────────────────────────────────────────────────────
function loadServerEnv() {
  const env = {};
  const file = path.join(ROOT, 'server/.env');
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return env;
}
let pgClient = null;
async function pg() {
  const env = loadServerEnv();
  const req = createRequire(path.join(ROOT, 'server/package.json'));
  const { Client } = req('pg');
  pgClient = new Client({ connectionString: env.SUPABASE_DB_URL, ssl: /localhost|127\.0\.0\.1/.test(env.SUPABASE_DB_URL) ? false : { rejectUnauthorized: false } });
  await pgClient.connect();
  pgClient.secret = env.JWT_REFRESH_SECRET;
  return pgClient;
}
async function pgQuery(sql, params) {
  // one short-lived connection per query: the dev pooler is shared and small
  for (let attempt = 0; ; attempt++) {
    try {
      const c = await pg();
      try { return { rows: (await c.query(sql, params)).rows, secret: c.secret }; } finally { await c.end().catch(() => undefined); pgClient = null; }
    } catch (e) {
      if (attempt >= 4 || !/EMAXCONN|too many|timeout/i.test(String(e.message))) throw e;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}
async function recoverOtp(phone, codeLength) {
  const { rows, secret } = await pgQuery(
    `SELECT code_hash FROM eduway_platform_otp_codes WHERE phone = $1 AND consumed_at IS NULL AND invalidated_at IS NULL ORDER BY created_at DESC LIMIT 1`,
    [phone],
  );
  assert(rows[0], 'no active OTP row');
  const target = rows[0].code_hash;
  const max = 10 ** codeLength;
  for (let n = 0; n < max; n++) {
    const code = String(n).padStart(codeLength, '0');
    const h = crypto.createHmac('sha256', secret).update(`otp:${phone}:${code}`).digest('hex');
    if (h === target) return code;
  }
  throw new Error('OTP not recoverable');
}

// ── SSE ────────────────────────────────────────────────────────────────────────────────────────────────
async function sse(s, url, body) {
  const res = await call(s, 'POST', url, body, { Accept: 'text/event-stream' }, { raw: true });
  if (current) current.calls.push(`POST ${url} ${res.status} (${res.headers.get('content-type')})`);
  if (!res.ok) throw new HttpError(res.status, await res.json().catch(() => null), 'POST', url);
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('text/event-stream')) return { json: (await res.json()).data, events: [] };
  const text = await res.text();
  const events = text.split(/\r?\n\r?\n/).map((blk) => {
    let event = 'message';
    const data = [];
    for (const l of blk.split(/\r?\n/)) {
      if (l.startsWith('event:')) event = l.slice(6).trim();
      else if (l.startsWith('data:')) data.push(l.slice(5).trimStart());
    }
    return data.length ? { event, data: JSON.parse(data.join('\n')) } : null;
  }).filter(Boolean);
  return { events };
}

// ══ Flow ══════════════════════════════════════════════════════════════════════════════════════════════
const ctx = {};
const anon = { platform: 'web', deviceId: 'verify-anon-device' };
const tag = crypto.randomBytes(3).toString('hex');
// fresh student devices (web registration + iOS app) and the demo student's single web session
const web = { platform: 'web', deviceId: `verify-flows-web-${tag}` };
const ios = { platform: 'ios', deviceId: `verify-flows-ios-${tag}` };
const demo = { platform: 'web', deviceId: 'verify-flows-demo-web' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitCooldown() {
  const ms = (ctx.resendIn ?? 60) * 1000 - (Date.now() - (ctx.sentAt ?? 0)) + 1500;
  if (ms > 0) { if (!QUIET) console.log(`      … waiting ${Math.ceil(ms / 1000)}s for the OTP resend cooldown`); await sleep(ms); }
}

async function login(s, phone, code, purpose = 'login', registration, { evictForeign = false } = {}) {
  const body = { phone, code, purpose, deviceId: s.deviceId, platform: s.platform, deviceName: `verify-student-flows ${s.platform}`, ...(registration ? { registration } : {}) };
  let r;
  try {
    r = await POST(s, '/auth/verify-otp', body);
  } catch (e) {
    if (e.body?.error?.details?.reason !== 'DEVICE_LIMIT_REACHED') throw e;
    // Only ever evict our own verify sessions — never a real device (e.g. the client's iPhone on Expo Go).
    const sessions = e.body.error.details.sessions ?? [];
    const victim = sessions.find((x) => /verify-student-flows/.test(x.device ?? x.deviceName ?? '')) ?? (evictForeign ? sessions[sessions.length - 1] : null);
    if (!victim) throw new Error(`DEVICE_LIMIT_REACHED for ${phone} and no verify-* session to evict (devices: ${sessions.map((x) => x.device ?? x.deviceName).join(', ')})`);
    r = await POST(s, '/auth/verify-otp', { ...body, revokeSessionId: victim.id });
  }
  s.access = r.data.accessToken;
  s.refresh = r.data.refreshToken;
  return r.data;
}

async function main() {
  console.log(`verify-student-flows → ${BASE}\n`);

  // ── Public ──
  await step('HLT-01', 'GET /health', async () => { await GET(anon, '/health'); });
  await step('PUB-01', 'GET /public/app-config', async () => {
    const r = await GET({ ...anon, platform: 'ios' }, '/public/app-config');
    expectShape(r.data, 'AppConfigDto', 'AppConfigDto');
    ctx.config = r.data;
  });
  await step('PUB-02', 'GET /public/governorates', async () => {
    const r = await GET(anon, '/public/governorates');
    assert(r.data.length > 0, 'empty');
    expectShape(r.data, 'Governorate');
    ctx.gov = r.data[0].id;
  });
  await step('PUB-03', 'GET /public/schools?governorateId&q&limit', async () => {
    const r = await GET(anon, `/public/schools?governorateId=${ctx.gov}&limit=50`);
    expectShape(r.data, 'PublicSchool');
    ctx.school = r.data[0]?.id;
  });
  await step('PUB-04', 'GET /public/referral-codes/:code (invalid code → valid:false or 404)', async () => {
    try {
      const r = await GET(anon, '/public/referral-codes/ZZZZ-NOPE');
      expectShape(r.data, 'ReferralCheckDto');
    } catch (e) {
      if (e.status !== 404 && e.status !== 422) throw e;
    }
  });
  await step('PUB-05', 'GET /public/stats', async () => expectShape((await GET(anon, '/public/stats')).data, 'PublicStatsDto'));
  await step('PUB-06', 'GET /public/testimonials?placement=landing|auth|app', async () => {
    for (const p of ['landing', 'auth', 'app']) expectShape((await GET(anon, `/public/testimonials?placement=${p}`)).data, 'Testimonial', null);
  });
  await step('PUB-07', 'GET /public/faq?placement=landing|pricing|subscription_app', async () => {
    for (const p of ['landing', 'pricing', 'subscription_app']) expectShape((await GET(anon, `/public/faq?placement=${p}`)).data, 'FaqItem');
  });
  await step('PUB-08', 'GET /public/teachers', async () => expectShape((await GET(anon, '/public/teachers')).data, 'TeacherDto'));
  await step('PUB-09', 'GET /public/payment-methods', async () => {
    const r = await GET(anon, '/public/payment-methods');
    expectShape(r.data, 'PaymentMethodDto');
    ctx.methods = r.data;
  });
  await step('PUB-11', 'GET /legal/terms + /legal/privacy', async () => {
    ctx.legal = [];
    for (const d of ['terms', 'privacy']) {
      const r = await GET(anon, `/legal/${d}`);
      expectShape(r.data, 'LegalDocumentDto');
      ctx.legal.push({ doc: d, version: r.data.version });
    }
  });
  await step('PAY-01', 'GET /packages (+ comparison) / PAY-02 /packages/:id', async () => {
    const r = await GET(anon, '/packages');
    expectShape(r.data, 'PackagePublic');
    ctx.packages = r.data;
    const one = await GET(anon, `/packages/${r.data[0].id}`);
    expectShape(one.data, 'PackagePublic');
  });
  await step('CAT-01', 'GET /subjects (anonymous)', async () => {
    const r = await GET(anon, '/subjects');
    assert(r.data.length > 0, 'no subjects');
    expectShape(r.data, 'SubjectSummary');
  });

  // ══ Fresh student: register on the web, then a second device (iOS) ═══════════════════════════════════
  const phone = `+96477${String(crypto.randomInt(10_000_000, 99_999_999))}`;
  ctx.freshPhone = phone;
  await step('AUTH-01', `POST /auth/send-otp purpose=register (fresh ${phone})`, async () => {
    const r = (await POST(anon, '/auth/send-otp', { phone, purpose: 'register', channel: 'sms' })).data;
    expectShape(r, 'SendOtpDto');
    assert(r.isRegistered === false, 'fresh number reported registered');
    ctx.codeLength = r.codeLength;
    ctx.resendIn = r.resendInSeconds;
    ctx.sentAt = Date.now();
  });
  const registered = await step('AUTH-02', 'POST /auth/verify-otp purpose=register + registration (web)', async () => {
    const code = await recoverOtp(phone, ctx.codeLength ?? 6);
    const d = await login(web, phone, code, 'register', {
      name: 'Verify Student',
      governorateId: ctx.gov,
      schoolId: ctx.school ?? null,
      acceptTerms: true,
      acceptedLegal: ctx.legal,
      language: 'en',
    });
    expectShape(d, 'VerifyOtpDto', 'VerifyOtpDto');
    assert(d.isNewUser === true, 'isNewUser false');
    assert(d.me.user.profileComplete === true, 'profile incomplete after register');
    assert(!d.me.user.pendingLegal?.length, `pendingLegal not empty: ${JSON.stringify(d.me.user.pendingLegal)}`);
  });
  if (!registered) return;
  await step('AUTH-03', 'POST /auth/register on a complete profile → 409', async () => {
    try {
      await POST(web, '/auth/register', { name: 'Verify Student', governorateId: ctx.gov, acceptTerms: true, acceptedLegal: ctx.legal });
      throw new Error('expected 409');
    } catch (e) { if (e.status !== 409) throw e; }
  });
  await step('AUTH-02', 'second device: send-otp purpose=login → verify-otp (ios)', async () => {
    await waitCooldown();
    const s = (await POST(anon, '/auth/send-otp', { phone, purpose: 'login', channel: 'sms' })).data;
    assert(s.isRegistered === true, 'registered number reported unregistered');
    ctx.sentAt = Date.now();
    ctx.resendIn = s.resendInSeconds;
    const d = await login(ios, phone, await recoverOtp(phone, ctx.codeLength ?? 6));
    expectShape(d, 'VerifyOtpDto', 'VerifyOtpDto');
    assert(d.isNewUser === false, 'isNewUser true on login');
  });
  await step('AUTH-07', 'GET /auth/me (web + ios)', async () => {
    const r = await GET(web, '/auth/me');
    expectShape(r.data, 'MeStudentDto');
    assert(r.data.user.mobile === phone, 'wrong user');
    ctx.me = r.data;
    expectShape((await GET(ios, '/me')).data, 'MeStudentDto');
  });
  await step('CAT-01', 'GET /subjects before purchase → locked', async () => {
    const r = await GET(web, '/subjects');
    expectShape(r.data, 'SubjectSummary');
    assert(r.data.every((s) => s.locked), 'unsubscribed student has unlocked subjects');
  });

  // ── Purchase (fresh student) ──
  await step('PAY-03', 'GET /subscriptions/my (none yet)', async () => {
    const s = (await GET(web, '/subscriptions/my')).data;
    assert(s === null || s.status !== 'active', 'already subscribed');
  });
  await step('PAY-11', 'GET /payments/methods', async () => expectShape((await GET(ios, '/payments/methods')).data, 'PaymentMethodDto'));
  await step('PAY-05', 'POST /promotions/validate (unknown code → invalid)', async () => {
    const pkg = ctx.packages.reduce((a, p) => ((p.subjectIds?.length ?? 0) > (a.subjectIds?.length ?? 0) ? p : a), ctx.packages[0]);
    ctx.pkg = pkg;
    ctx.cycle = 'monthly';
    try {
      const r = (await POST(web, '/promotions/validate', { code: 'NOPE-VERIFY', packageId: pkg.id, cycle: ctx.cycle })).data;
      expectShape(r, 'PromoValidationDto', 'PromoValidateDto');
      assert(r.valid === false, 'unknown promo valid');
    } catch (e) { if (![404, 422].includes(e.status)) throw e; }
  });
  await step('PAY-04', 'POST /payments/quote', async () => {
    const q = (await POST(ios, '/payments/quote', { packageId: ctx.pkg.id, cycle: ctx.cycle })).data;
    expectShape(q, 'PriceQuote');
  });
  await step('PAY-06..10', 'initiate (Idempotency-Key + replay) → mock confirm → status → receipt json/pdf → entitlements', async () => {
    const gw = (ctx.methods ?? []).find((m) => m.id === 'mock' || m.flow === 'mock')?.id ?? 'mock';
    const key = uuid();
    const body = { packageId: ctx.pkg.id, cycle: ctx.cycle, gateway: gw, returnUrl: 'http://localhost:5173/student/subscription?payment=__ID__' };
    const ini = (await POST(web, '/payments/initiate', body, { 'Idempotency-Key': key })).data;
    expectShape(ini, 'InitiatePaymentDto');
    const replay = (await POST(web, '/payments/initiate', body, { 'Idempotency-Key': key })).data;
    assert(replay.paymentId === ini.paymentId, 'idempotent replay created another payment');
    const conf = (await POST(web, `/payments/mock/${ini.paymentId}/confirm`, { outcome: 'success' })).data;
    expectShape(conf, 'StudentPaymentDto');
    let st;
    for (let i = 0; i < 10; i++) {
      st = (await GET(web, `/payments/${ini.paymentId}`)).data;
      if (st.status !== 'pending' && st.status !== 'initiated') break;
      await sleep(500);
    }
    expectShape(st, 'PaymentDetailDto');
    assert(st.status === 'paid', `status ${st.status}`);
    expectShape((await GET(ios, `/payments/${ini.paymentId}/receipt?format=json`)).data, 'ReceiptDto');
    const pdf = await call(web, 'GET', `/payments/${ini.paymentId}/receipt?format=pdf`, undefined, {}, { raw: true });
    assert(pdf.ok && /pdf/.test(pdf.headers.get('content-type') ?? ''), `pdf receipt ${pdf.status} ${pdf.headers.get('content-type')}`);
    const sub = (await GET(web, '/subscriptions/my')).data;
    assert(sub, 'no subscription after payment');
    expectShape(sub, 'MySubscription');
    expectShape((await GET(web, '/payments/my?page=1&pageSize=20')).data, 'StudentPaymentDto');
    const ents = (await GET(ios, '/me/entitlements')).data;
    assert(ents.length > 0, 'no entitlements after payment');
    expectShape(ents, 'Entitlement');
    return `payment ${ini.paymentId} ${st.status}, ${ents.length} entitlement(s)`;
  });

  // ── Learning journey (fresh, subscribed) ──
  await step('PRG-04', 'GET /progress/dashboard?tzOffsetMinutes', async () => expectShape((await GET(web, '/progress/dashboard?tzOffsetMinutes=180')).data, 'StudentDashboardDto'));
  await step('CAT-01', 'GET /subjects (student: locked + progress)', async () => {
    const r = await GET(web, '/subjects');
    expectShape(r.data, 'SubjectSummary');
    ctx.subjects = r.data;
    ctx.subject = r.data.find((s) => !s.locked);
    assert(ctx.subject, 'all subjects still locked after purchase');
  });
  await step('CAT-02', 'GET /subjects/:slug + /subjects/:uuid', async () => {
    const r = await GET(web, `/subjects/${ctx.subject.slug}`);
    expectShape(r.data, 'SubjectDetail');
    await GET(ios, `/subjects/${ctx.subject.id}`);
    ctx.lessons = r.data.lessons ?? [];
    ctx.lesson = ctx.lessons.find((l) => !l.locked);
    assert(ctx.lesson, `no unlocked lesson in ${ctx.subject.slug}`);
  });
  await step('CAT-03', 'GET /subjects/:id/question-stats', async () => expectShape((await GET(web, `/subjects/${ctx.subject.slug}/question-stats`)).data, 'QuestionStatsDto'));
  await step('CAT-04', 'GET /subjects/:id/exams', async () => expectShape((await GET(ios, `/subjects/${ctx.subject.slug}/exams`)).data, 'ExamCard', 'ExamCardDto'));
  await step('CAT-05', 'GET /lessons/:id', async () => {
    const r = await GET(web, `/lessons/${ctx.lesson.id}`);
    expectShape(r.data, 'LessonDetail');
    ctx.lessonDetail = r.data;
  });
  await step('CAT-06', 'GET /lessons/:id/stream-url', async () => expectShape((await GET(ios, `/lessons/${ctx.lesson.id}/stream-url`)).data, 'StreamUrlDto'));
  await step('PRG-01', 'PUT /progress/watch (heartbeat web, pause ios)', async () => {
    const dur = ctx.lessonDetail?.duration ?? 600;
    expectShape((await PUT(web, '/progress/watch', { lessonId: ctx.lesson.id, positionSec: 30, durationSec: dur, event: 'heartbeat', watchedSecDelta: 15, platform: 'web' })).data, 'LessonProgressDto');
    await PUT(ios, '/progress/watch', { lessonId: ctx.lesson.id, positionSec: 45, durationSec: dur, event: 'pause', watchedSecDelta: 15, platform: 'ios' });
  });
  await step('PRG-02', 'POST /progress/complete', async () => expectShape((await POST(web, '/progress/complete', { lessonId: ctx.lesson.id })).data, 'LessonProgressDto'));
  await step('CAT-07', 'GET /lessons/:id/resources/:rid/url', async () => {
    let lesson = ctx.lessonDetail;
    if (!lesson?.resources?.length) {
      for (const l of ctx.lessons.filter((x) => !x.locked).slice(0, 10)) {
        const d = (await GET(web, `/lessons/${l.id}`)).data;
        if (d.resources?.length) { lesson = d; break; }
      }
    }
    if (!lesson?.resources?.length) return 'no unlocked lesson with resources (skipped)';
    const r = await GET(web, `/lessons/${lesson.id}/resources/${lesson.resources[0].id}/url`);
    expectShape(r.data, null, 'ResourceUrlDto');
  });
  await step('CAT-08/09', 'GET + PUT /lessons/:id/note', async () => {
    const before = (await GET(web, `/lessons/${ctx.lesson.id}/note`)).data;
    expectShape(before, null, 'LessonNoteDto');
    const saved = (await PUT(ios, `/lessons/${ctx.lesson.id}/note`, { text: 'verify note' })).data;
    assert(saved.text === 'verify note', 'note not saved');
    assert((await GET(web, `/lessons/${ctx.lesson.id}/note`)).data.text === 'verify note', 'note not persisted');
  });
  await step('CAT-10', 'GET /lessons/:id/quiz-rule', async () => expectShape((await GET(web, `/lessons/${ctx.lesson.id}/quiz-rule`)).data, 'EffectiveQuizRule'));
  await step('QUZ-01..03', 'quiz start → answer each → submit', async () => {
    let start;
    let lastErr;
    for (const l of [ctx.lesson, ...ctx.lessons.filter((x) => !x.locked && x.id !== ctx.lesson.id)].slice(0, 8)) {
      try { start = (await POST(web, `/quizzes/${l.id}/start`, {})).data; break; } catch (e) { lastErr = e; if (e.status >= 500) throw e; }
    }
    if (!start) throw lastErr;
    expectShape(start, 'QuizStartDto');
    for (const [i, q] of start.questions.entries()) {
      const fb = (await POST(web, `/quizzes/attempts/${start.attemptId}/answer`, { questionId: q.id, optionId: q.options?.[i % 2]?.id ?? q.options?.[0]?.id, timeSec: 5 })).data;
      expectShape(fb, 'AnswerFeedback');
    }
    expectShape((await POST(web, `/quizzes/attempts/${start.attemptId}/submit`, { timeSpentSec: 60 })).data, 'QuizResultDto');
    ctx.quizAttempt = start.attemptId;
  });
  await step('QUZ-04/05', 'GET /quizzes/attempts + /quizzes/attempts/:id (app)', async () => {
    expectShape((await GET(ios, '/quizzes/attempts?pageSize=10')).data, null, 'QuizAttemptSummary');
    if (ctx.quizAttempt) expectShape((await GET(ios, `/quizzes/attempts/${ctx.quizAttempt}`)).data, 'QuizResultDto');
  });
  await step('BNK-02', 'GET /bank/facets (repeated difficulty)', async () => expectShape((await GET(web, `/bank/facets?subjectId=${ctx.subject.slug}&difficulty=easy&difficulty=medium`)).data, 'BankFacetsDto'));
  await step('BNK-01', 'GET /bank/questions (page) + reveal=true', async () => {
    const r = await GET(web, `/bank/questions?subjectId=${ctx.subject.slug}&page=1&pageSize=20`);
    expectShape(r.data, 'QuestionPublic');
    assert(r.meta && typeof r.meta.total === 'number', 'no meta.total');
    ctx.question = r.data[0];
    expectShape((await GET(ios, `/bank/questions?subjectId=${ctx.subject.id}&page=1&pageSize=5&reveal=true`)).data, 'QuestionReview');
  });
  await step('BNK-03', 'GET /bank/questions/:id', async () => expectShape((await GET(ios, `/bank/questions/${ctx.question.id}`)).data, 'QuestionReview'));
  await step('BMK-01..04', 'bookmark add → ids → list → remove', async () => {
    await PUT(web, `/bookmarks/${ctx.question.id}`);
    assert((await GET(web, '/bookmarks/ids')).data.includes(ctx.question.id), 'not bookmarked');
    expectShape((await GET(ios, '/bookmarks?page=1&pageSize=50')).data, 'QuestionPublic');
    await DEL(web, `/bookmarks/${ctx.question.id}`);
    assert(!(await GET(web, '/bookmarks/ids')).data.includes(ctx.question.id), 'bookmark not removed');
  });
  await step('PRA-01..04', 'practice start → answer → finish → result', async () => {
    const st = (await POST(web, '/practice/start', { mode: 'filters', filters: { subjectId: ctx.subject.slug, difficulty: 'all' }, count: 5 })).data;
    expectShape(st, 'PracticeStartDto');
    for (const q of st.questions.slice(0, 4)) {
      expectShape((await POST(ios, `/practice/${st.sessionId}/answer`, { questionId: q.id, optionId: q.options?.[1]?.id ?? q.options?.[0]?.id, timeSec: 4 })).data, 'AnswerFeedback', 'PracticeFeedback');
    }
    expectShape((await POST(web, `/practice/${st.sessionId}/finish`, { timeSpentSec: 40 })).data, 'PracticeResultDto');
    expectShape((await GET(ios, `/practice/${st.sessionId}/result`)).data, 'PracticeResultDto');
  });
  await step('PRA-05', 'GET /practice/sessions (app)', async () => expectShape((await GET(ios, '/practice/sessions?limit=5')).data, null, 'PracticeSessionSummary'));
  await step('PRA-01', 'practice start mode=bookmarks|mistakes (empty → NO_QUESTIONS accepted)', async () => {
    for (const mode of ['bookmarks', 'mistakes']) {
      try { expectShape((await POST(ios, '/practice/start', { mode, count: 5 })).data, 'PracticeStartDto'); } catch (e) { if (e.body?.error?.details?.reason !== 'NO_QUESTIONS') throw e; }
    }
  });
  await step('MST-01/02', 'GET /mistakes + /mistakes/summary', async () => {
    const r = await GET(web, '/mistakes?pageSize=100');
    expectShape(r.data, 'MistakeEntry', 'MistakeEntryDto');
    expectShape(r.meta, 'MistakesMeta');
    ctx.mistakes = r.data;
    expectShape((await GET(ios, '/mistakes/summary')).data, 'MistakeSummaryDto');
    return `${r.data.length} mistake(s)`;
  });
  await step('MST-03..05', 'GET /mistakes/:id (answer concealed) → PATCH status → POST retry (reveals)', async () => {
    const m = ctx.mistakes?.[0];
    if (!m) return 'no mistakes recorded (skipped)';
    const d = (await GET(ios, `/mistakes/${m.id}`)).data;
    expectShape(d, 'MistakeEntry', 'MistakeEntryDto');
    expectShape((await PATCH(web, `/mistakes/${m.id}`, { status: 'reviewed' })).data, 'MistakeEntry', 'MistakeEntryDto');
    await PATCH(web, `/mistakes/${m.id}`, { status: 'unresolved' });
    const opt = d.question?.options?.[0]?.id;
    expectShape((await POST(ios, `/mistakes/${m.id}/retry`, { optionId: opt })).data, 'MistakeRetryDto');
  });
  await step('EXM-01/02', 'GET /exams/available + /exams/upcoming', async () => {
    const r = await GET(web, '/exams/available');
    expectShape(r.data, 'ExamCard', 'ExamCardDto');
    ctx.exams = r.data;
    expectShape((await GET(ios, '/exams/upcoming?limit=3')).data, 'UpcomingExamDto');
  });
  await step('EXM-03..08', 'exam start → attempt → autosave → flag → submit (Idempotency-Key + replay) → result', async () => {
    const card = ctx.exams.find((e) => !e.locked && e.available && e.attemptsLeft > 0);
    assert(card, `no startable exam (${ctx.exams.length} cards)`);
    const st = (await POST(web, `/exams/${card.id}/start`, {})).data;
    expectShape(st, 'ExamAttemptState');
    expectShape((await GET(ios, `/exams/attempts/${st.attemptId}`)).data, 'ExamAttemptState');
    const qs = st.questions ?? [];
    const answers = Object.fromEntries(qs.slice(0, 3).map((q) => [q.id, q.options?.[0]?.id ?? null]));
    const sv = (await PUT(web, `/exams/attempts/${st.attemptId}/autosave`, { answers, flagged: [], currentIndex: 2, clientSavedAt: new Date().toISOString(), seq: 1 })).data;
    expectShape(sv, 'ExamAutosaveDto');
    if (qs[0]) await POST(ios, `/exams/attempts/${st.attemptId}/flag`, { questionId: qs[0].id, flagged: true });
    const key = uuid();
    const body = { reason: 'manual', answers, flagged: qs[0] ? [qs[0].id] : [], seq: 2 };
    const sub = (await POST(web, `/exams/attempts/${st.attemptId}/submit`, body, { 'Idempotency-Key': key })).data;
    expectShape(sub, 'ExamSubmitDto');
    const again = (await POST(ios, `/exams/attempts/${st.attemptId}/submit`, body, { 'Idempotency-Key': key })).data;
    assert(again.attemptId === sub.attemptId, 'idempotent replay differs');
    let res;
    for (let i = 0; i < 8 && !res; i++) {
      try { res = (await GET(ios, `/exams/attempts/${st.attemptId}/result`)).data; } catch (e) { if (e.status !== 409) throw e; await sleep(700); }
    }
    expectShape(res, 'ExamResultDto');
  });
  await step('EXM-09', 'GET /exams/attempts', async () => expectShape((await GET(web, '/exams/attempts?page=1&pageSize=20')).data, 'ExamAttemptSummary'));
  await step('AIT-01/02/03', 'allowance + suggestions + conversations', async () => {
    expectShape((await GET(web, '/ai-tutor/allowance')).data, 'AiAllowance');
    await GET(ios, `/ai-tutor/suggestions?subjectId=${ctx.subject.slug}`);
    expectShape((await GET(web, '/ai-tutor/conversations?pageSize=20')).data, 'ConversationSummary');
  });
  await step('AIT-04/05/06', 'create conversation → get → rename', async () => {
    const c = (await POST(web, '/ai-tutor/conversations', { subjectId: ctx.subject.slug, title: 'verify-student-flows' })).data;
    expectShape(c, 'ConversationDto');
    ctx.conv = c.id;
    expectShape((await GET(ios, `/ai-tutor/conversations/${ctx.conv}?limit=50`)).data, 'ConversationDto');
    expectShape((await PATCH(ios, `/ai-tutor/conversations/${ctx.conv}`, { title: 'verify (renamed)' })).data, 'ConversationSummary');
  });
  await step('AIT-08', 'POST message SSE (meta → delta → done) + allowance decrement', async () => {
    const before = (await GET(web, '/ai-tutor/allowance')).data;
    const { events, json } = await sse(web, `/ai-tutor/conversations/${ctx.conv}/messages`, { text: 'What is a derivative? Answer briefly.', lang: 'en', clientMessageId: uuid() });
    assert(!json, 'server answered JSON to an SSE request');
    const names = events.map((e) => e.event);
    const err = events.find((e) => e.event === 'error');
    assert(!err, `error event: ${JSON.stringify(err?.data)}`);
    assert(names.includes('meta'), `no meta event (${names.join(',')})`);
    const done = events.find((e) => e.event === 'done');
    assert(done, `no done event (${names.join(',')})`);
    expectShape(done.data.message, 'TutorMessage', 'TutorMessageDto');
    assert(done.data.message.text?.length > 0, 'done without full text');
    const after = (await GET(web, '/ai-tutor/allowance')).data;
    assert(after.remaining === before.remaining - 1, `allowance ${before.remaining} → ${after.remaining}`);
    ctx.tutorMsg = done.data.message.id;
    return `events ${[...new Set(names)].join(',')}; remaining ${before.remaining}→${after.remaining}`;
  });
  await step('AIT-08/09', 'POST message JSON (polling mode) → poll GET /ai-tutor/messages/:id', async () => {
    const r = await call(ios, 'POST', `/ai-tutor/conversations/${ctx.conv}/messages`, { text: 'And an integral?', lang: 'en', clientMessageId: uuid() }, { Accept: 'application/json' });
    expectShape(r.data, 'TutorPollingStartDto', 'TutorSendPollingDto');
    let m;
    for (let i = 0; i < 40; i++) {
      m = (await GET(ios, `/ai-tutor/messages/${r.data.tutorMessage.id}`)).data;
      if (m.status !== 'pending' && m.status !== 'streaming') break;
      await sleep(r.data.pollAfterMs ?? 500);
    }
    expectShape(m, 'TutorMessage', 'TutorMessageDto');
    assert(m.status === 'complete', `final status ${m.status}`);
  });
  await step('AIT-10/07', 'feedback → delete conversation', async () => {
    expectShape((await POST(web, `/ai-tutor/messages/${ctx.tutorMsg}/feedback`, { rating: 'up' })).data, 'TutorMessage', 'TutorMessageDto');
    await DEL(web, `/ai-tutor/conversations/${ctx.conv}`);
  });
  await step('NTF-01/02', 'GET /notifications (all, unread) + unread-count', async () => {
    const r = await GET(web, '/notifications?filter=all&limit=30');
    expectShape(r.data, 'AppNotification', 'AppNotificationDto');
    expectShape(r.meta, 'NotificationsMeta');
    ctx.notifs = r.data;
    await GET(ios, '/notifications?filter=unread&limit=100');
    assert(typeof (await GET(ios, '/notifications/unread-count')).data.unreadCount === 'number', 'no unreadCount');
    return `${r.data.length} notification(s)`;
  });
  await step('NTF-03/04/05', 'read one → read-all → delete one', async () => {
    const n = ctx.notifs[0];
    if (!n) return 'fresh student has no notifications (read/delete covered on demo below)';
    assert(typeof (await POST(web, `/notifications/${n.id}/read`)).data.unreadCount === 'number', 'no unreadCount');
    await POST(ios, '/notifications/read-all');
    assert(typeof (await DEL(ios, `/notifications/${n.id}`)).data.unreadCount === 'number', 'no unreadCount');
  });
  await step('ME-02', 'PATCH /me (name, language, dailyGoalMinutes)', async () => {
    const r = (await PATCH(web, '/me', { name: 'Verify Student Two', language: 'ar', dailyGoalMinutes: 45 })).data;
    expectShape(r, 'StudentUser');
    assert(r.name.en === 'Verify Student Two' || r.name.ar === 'Verify Student Two', 'name not updated');
    const presets = ctx.config?.avatarPresets ?? [];
    if (presets.length) await PATCH(ios, '/me', { avatarPreset: typeof presets[0] === 'string' ? presets[0] : presets[0].id ?? presets[0].url });
  });
  await step('ME-09/10', 'GET + PATCH /me/notification-preferences', async () => {
    const p = (await GET(ios, '/me/notification-preferences')).data;
    expectShape(p, 'NotificationPrefs');
    const k = Object.keys(p).find((x) => typeof p[x] === 'boolean');
    const r = (await PATCH(web, '/me/notification-preferences', { [k]: !p[k] })).data;
    assert(r[k] === !p[k], 'pref not updated');
  });
  await step('ME-03/06', 'GET /me/sessions (2 devices) + /me/devices', async () => {
    const s = (await GET(web, '/me/sessions')).data;
    expectShape(s, 'SessionDto');
    assert(s.filter((x) => x.current).length === 1, 'exactly one current session expected');
    assert(s.length === 2, `expected 2 sessions, got ${s.length}`);
    await GET(ios, '/me/devices');
  });
  await step('ME-07/08', 'POST + DELETE /me/push-token', async () => {
    const token = `ExponentPushToken[verify-${crypto.randomBytes(6).toString('hex')}]`;
    await POST(ios, '/me/push-token', { token, provider: 'expo', platform: 'ios', deviceId: ios.deviceId });
    await DEL(ios, '/me/push-token', { token });
  });
  await step('STO-01', 'POST /storage/signed-upload-url (student_avatar, ai_attachment)', async () => {
    expectShape((await POST(ios, '/storage/signed-upload-url', { purpose: 'student_avatar', fileName: 'avatar.jpg', contentType: 'image/jpeg', sizeBytes: 20480 })).data, 'SignedUploadDto');
    expectShape((await POST(web, '/storage/signed-upload-url', { purpose: 'ai_attachment', fileName: 'q.png', contentType: 'image/png', sizeBytes: 20480 })).data, 'SignedUploadDto');
  });
  await step('SRC-01', 'GET /search?q&scopes=lessons&limit=6', async () => {
    const term = (ctx.lessonDetail?.title?.en ?? 'a').split(' ')[0];
    expectShape((await GET(web, `/search?q=${encodeURIComponent(term)}&scopes=lessons&limit=6`)).data, 'SearchResultDto', null);
  });
  await step('PRG-05..13', 'progress subjects/summary/score-trend/weak-topics/streak/activity/today-plan/achievements/lessons', async () => {
    expectShape((await GET(web, '/progress/subjects')).data, 'SubjectProgressDto');
    expectShape((await GET(web, '/progress/summary')).data, 'ProgressSummaryDto');
    expectShape((await GET(web, '/progress/score-trend?weeks=8')).data, 'ScoreTrendDto');
    expectShape((await GET(web, '/progress/weak-topics?limit=5')).data, 'WeakTopicDto');
    expectShape((await GET(ios, '/progress/streak-calendar?weeks=16')).data, 'StreakCalendarDto');
    expectShape((await GET(web, '/progress/activity?limit=10')).data, 'ActivityItem');
    const plan = (await GET(ios, '/progress/today-plan')).data;
    expectShape(plan, 'PlanItem', 'PlanItemDto');
    if (plan[0]) expectShape((await PATCH(ios, `/progress/today-plan/${plan[0].id}`, { done: !plan[0].done })).data, 'PlanItem', 'PlanItemDto');
    expectShape((await GET(ios, '/progress/achievements')).data, null, 'AchievementDto');
    expectShape((await GET(ios, '/progress/lessons')).data, 'LessonProgressDto');
  });
  await step('AUTH-08', 'POST /auth/accept-legal (current versions)', async () => {
    const r = (await POST(web, '/auth/accept-legal', { documents: ctx.legal })).data;
    assert(Array.isArray(r.pendingLegal) && r.pendingLegal.length === 0, `pendingLegal ${JSON.stringify(r.pendingLegal)}`);
  });

  // ══ Demo student: read-only pass over rich seeded data (single session, never evicts foreign devices) ══
  const demoIn = await step('AUTH-02', 'demo: verify-otp with dev code 123456', async () => {
    const d = await login(demo, DEMO_PHONE, DEV_CODE, 'login', undefined, { evictForeign: false });
    demo.relogin = () => login(demo, DEMO_PHONE, DEV_CODE);
    expectShape(d, 'VerifyOtpDto');
  });
  if (demoIn) {
    await step('PRG-04', 'demo: dashboard + subjects + progress summary', async () => {
      expectShape((await GET(demo, '/progress/dashboard?tzOffsetMinutes=180')).data, 'StudentDashboardDto');
      expectShape((await GET(demo, '/subjects')).data, 'SubjectSummary');
      expectShape((await GET(demo, '/progress/summary')).data, 'ProgressSummaryDto');
    });
    await step('MST-01/03', 'demo: mistakes list + detail', async () => {
      const r = await GET(demo, '/mistakes?pageSize=100');
      expectShape(r.data, 'MistakeEntry', 'MistakeEntryDto');
      if (r.data[0]) expectShape((await GET(demo, `/mistakes/${r.data[0].id}`)).data, 'MistakeEntry', 'MistakeEntryDto');
      return `${r.data.length} mistake(s)`;
    });
    await step('NTF-01', 'demo: notifications list', async () => {
      const r = await GET(demo, '/notifications?filter=all&limit=30');
      expectShape(r.data, 'AppNotification', 'AppNotificationDto');
      return `${r.data.length} notification(s)`;
    });
    await step('PAY-03/09', 'demo: subscription + billing history', async () => {
      const s = (await GET(demo, '/subscriptions/my')).data;
      if (s) expectShape(s, 'MySubscription');
      expectShape((await GET(demo, '/payments/my?page=1&pageSize=20')).data, 'StudentPaymentDto');
    });
    await step('AUTH-05', 'demo: logout', async () => { await POST(demo, '/auth/logout', { refreshToken: demo.refresh }); });
  }

  // ══ Sessions: device limit, revoke one / others, logout-all (fresh) ══
  await step('ME-04/05', 'third device → DEVICE_LIMIT_REACHED → same code + revokeSessionId → DELETE /me/sessions/:id → ?scope=others', async () => {
    const third = { platform: 'web', deviceId: `${web.deviceId}-3` };
    await waitCooldown();
    await POST(anon, '/auth/send-otp', { phone, purpose: 'login', channel: 'sms' });
    ctx.sentAt = Date.now();
    const code = await recoverOtp(phone, ctx.codeLength ?? 6);
    const body = { phone, code, purpose: 'login', deviceId: third.deviceId, platform: 'web', deviceName: 'verify-student-flows web-3' };
    let limited;
    try { await POST(anon, '/auth/verify-otp', body); } catch (e) { limited = e; }
    assert(limited?.body?.error?.details?.reason === 'DEVICE_LIMIT_REACHED', `expected DEVICE_LIMIT_REACHED, got ${limited?.message ?? 'success'}`);
    const sessions = limited.body.error.details.sessions;
    expectShape(sessions, 'SessionDto');
    const iosSession = sessions.find((s) => s.platform === 'ios' || /ios/.test(s.device ?? ''));
    assert(iosSession, 'ios session not listed in details.sessions');
    const r = (await POST(anon, '/auth/verify-otp', { ...body, revokeSessionId: iosSession.id })).data;
    third.access = r.accessToken;
    third.refresh = r.refreshToken;
    try { await GET(ios, '/auth/me'); throw new Error('revoked ios session still valid'); } catch (e) { if (e.status !== 401) throw e; }
    let list = (await GET(web, '/me/sessions')).data;
    const t = list.find((s) => !s.current);
    assert(t, 'third session not listed');
    await DEL(web, `/me/sessions/${t.id}`);
    list = (await GET(web, '/me/sessions')).data;
    assert(!list.some((s) => s.id === t.id), 'session not revoked');
    const o = (await DEL(web, '/me/sessions?scope=others')).data;
    assert(typeof o.revoked === 'number', 'no revoked count');
  });
  await step('AUTH-06', 'POST /auth/logout-all {keepCurrent:true}', async () => {
    const r = (await POST(web, '/auth/logout-all', { keepCurrent: true })).data;
    assert(typeof r.revoked === 'number', 'no revoked count');
    await GET(web, '/auth/me');
  });
  await step('AUTH-04', 'POST /auth/refresh (rotate) → new access works', async () => {
    const r = (await POST(anon, '/auth/refresh', { refreshToken: web.refresh })).data;
    expectShape(r, 'AuthTokens');
    web.access = r.accessToken;
    web.refresh = r.refreshToken;
    await GET(web, '/auth/me');
  });
  await step('AUTH-05', 'POST /auth/logout → refresh rejected', async () => {
    await POST(web, '/auth/logout', { refreshToken: web.refresh });
    try { await POST(anon, '/auth/refresh', { refreshToken: web.refresh }); throw new Error('refresh after logout succeeded'); } catch (e) { if (e.status !== 401) throw e; }
  });
}

try {
  await main();
} catch (e) {
  console.error('fatal:', e);
  results.push({ id: 'FATAL', name: 'script', ok: false, note: String(e), calls: [] });
} finally {
  if (pgClient) await pgClient.end().catch(() => undefined);
}
const failed = results.filter((r) => !r.ok && !r.skipped);
if (transient.length) console.log(`
transient 5xx retried (${transient.length}): ${[...new Set(transient)].join(', ')}`);
console.log(`\n${results.length - failed.length}/${results.length} steps passed${ctx.freshPhone ? ` · fresh student ${ctx.freshPhone}` : ''}`);
if (failed.length) for (const f of failed) console.log(`  FAIL ${f.id}: ${f.note}`);
if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify({ base: BASE, at: new Date().toISOString(), freshPhone: ctx.freshPhone, results }, null, 2));
process.exit(failed.length ? 1 : 0);
