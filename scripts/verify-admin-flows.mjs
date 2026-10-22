#!/usr/bin/env node
/**
 * Live verification of every admin-portal module against a running EDUWAY API.
 *
 *   node scripts/verify-admin-flows.mjs                       # API_URL defaults to http://localhost:4100/api/v1
 *   API_URL=http://localhost:4155/api/v1 SERVER_LOG=<path to that server's stdout> node scripts/verify-admin-flows.mjs
 *   flags: --json (machine-readable summary)  --only=<module,module>  --purge-only=<runId|ALL> (hard-delete verify artefacts)
 *          --legal-publish (also run the `legal-publish` module: publishes identical copies of the live terms, see below)
 *
 * Logs in as the seeded super admin (password read from server/.env → SEED_SUPER_ADMIN_PASSWORD, never printed),
 * walks every list/detail endpoint with the admin portal's real query params, exercises representative mutations
 * and cleans up everything it creates. SERVER_LOG lets the RBAC check read the dev-mailer invite link; without it
 * the temp admin is created with `npm run create-admin`. Exit code 1 when any step fails.
 */
import { execFileSync } from 'node:child_process';
import { createHmac, randomInt, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SERVER = resolve(ROOT, 'server');
const API = (process.env.API_URL || 'http://localhost:4100/api/v1').replace(/\/+$/, '');
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const AS_JSON = process.argv.includes('--json');
const RUN = Date.now().toString(36);
const today = new Date();
const isoDay = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 86400000);
const RANGE = { from: daysAgo(29).toISOString(), to: today.toISOString() };

function readEnv(file) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}
const ENV = readEnv(resolve(SERVER, '.env'));
const ADMIN_EMAIL = ENV.SEED_SUPER_ADMIN_EMAIL || 'admin@eduway.iq';
const ADMIN_PASSWORD = ENV.SEED_SUPER_ADMIN_PASSWORD;

// ── tiny HTTP client ─────────────────────────────────────────────────────────
let TOKEN = null;
const DEVICE = `verify-admin-${RUN}`;
class HttpError extends Error {
  constructor(status, body, method, path) {
    super(`${method} ${path} → ${status} ${body?.error?.code ?? ''}${body?.error?.details?.reason ? `/${body.error.details.reason}` : ''} ${body?.error?.message ?? ''}`.trim());
    this.status = status;
    this.body = body;
  }
}
function qs(params) {
  if (!params) return '';
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    u.set(k, Array.isArray(v) ? v.join(',') : typeof v === 'object' ? JSON.stringify(v) : String(v));
  }
  const s = u.toString();
  return s ? `?${s}` : '';
}
async function http(method, path, { query, body, idem, token = TOKEN, raw = false, headers = {} } = {}) {
  const h = { 'Accept-Language': 'en', 'X-Client-Platform': 'admin', 'X-Device-Id': DEVICE, 'X-Request-Id': randomUUID(), ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  if (body !== undefined) h['Content-Type'] = 'application/json';
  if (idem) h['Idempotency-Key'] = idem === true ? randomUUID() : idem;
  let res;
  for (let attempt = 0; attempt < 4; attempt++) {
    res = await fetch(`${API}${path}${qs(query)}`, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
    if (res.status !== 429) break;
    const wait = Math.min(65, Number(res.headers.get('retry-after')) || 10);
    if (!AS_JSON) console.log(`     … 429 on ${method} ${path}, waiting ${wait}s`);
    await new Promise((r) => setTimeout(r, wait * 1000));
  }
  if (raw) {
    const buf = Buffer.from(await res.arrayBuffer());
    if (!res.ok) {
      let j = null;
      try {
        j = JSON.parse(buf.toString('utf8'));
      } catch {
        /* binary */
      }
      throw new HttpError(res.status, j, method, path);
    }
    return { status: res.status, type: res.headers.get('content-type') || '', disposition: res.headers.get('content-disposition') || '', size: buf.length, buf };
  }
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok || json?.success === false) throw new HttpError(res.status, json, method, path);
  return { data: json?.data, meta: json?.meta, status: res.status };
}
const get = (p, query, o) => http('GET', p, { query, ...o }).then((r) => r.data);
const list = (p, query, o) => http('GET', p, { query, ...o });
const post = (p, body = {}, o) => http('POST', p, { body, ...o }).then((r) => r.data);
const put = (p, body = {}, o) => http('PUT', p, { body, ...o }).then((r) => r.data);
const patch = (p, body = {}, o) => http('PATCH', p, { body, ...o }).then((r) => r.data);
const del = (p, o) => http('DELETE', p, o).then((r) => r.data);
const download = (method, p, o = {}) => http(method, p, { ...o, raw: true });

async function expectError(status, fn, reason) {
  try {
    await fn();
  } catch (e) {
    if (e.status === status && (!reason || e.body?.error?.details?.reason === reason || e.body?.error?.code === reason)) return e;
    throw new Error(`expected ${status}${reason ? ` ${reason}` : ''}, got: ${e.message}`);
  }
  throw new Error(`expected ${status}${reason ? ` ${reason}` : ''}, got success`);
}

// ── shape assertions (frontend DTO fields from website/admin/src/api/*.ts) ────
function has(obj, fields, label = 'dto') {
  if (obj === null || obj === undefined) throw new Error(`${label}: missing object`);
  const miss = fields.filter((f) => {
    let cur = obj;
    for (const part of f.split('.')) {
      if (cur === null || cur === undefined || !(part in cur)) return true;
      cur = cur[part];
    }
    return false;
  });
  if (miss.length) throw new Error(`${label}: missing fields ${miss.join(', ')}`);
  return obj;
}
function paged(r, fields, label) {
  if (!Array.isArray(r.data)) throw new Error(`${label}: data is not an array`);
  if (!r.meta || typeof r.meta.total !== 'number') throw new Error(`${label}: missing meta.total`);
  if (r.data[0] && fields) has(r.data[0], fields, label);
  return r.data;
}
function arr(d, fields, label) {
  if (!Array.isArray(d)) throw new Error(`${label}: expected array`);
  if (d[0] && fields) has(d[0], fields, label);
  return d;
}

// ── step runner ──────────────────────────────────────────────────────────────
const results = []; // { module, step, ok, ms, error, endpoints }
const cleanups = []; // LIFO
let currentModule = 'setup';
async function step(name, endpoints, fn) {
  const t0 = Date.now();
  try {
    const v = await fn();
    results.push({ module: currentModule, step: name, endpoints, ok: true, ms: Date.now() - t0 });
    if (!AS_JSON) console.log(`  ✅ ${name}`);
    return v;
  } catch (e) {
    results.push({ module: currentModule, step: name, endpoints, ok: false, ms: Date.now() - t0, error: e.message });
    if (!AS_JSON) console.log(`  ❌ ${name} — ${e.message}`);
    return undefined;
  }
}
function onCleanup(label, fn) {
  cleanups.push({ label, fn });
}
async function runCleanups() {
  while (cleanups.length) {
    const c = cleanups.pop();
    try {
      await c.fn();
    } catch (e) {
      results.push({ module: 'cleanup', step: c.label, endpoints: '', ok: false, error: e.message });
      if (!AS_JSON) console.log(`  ⚠️  cleanup ${c.label} — ${e.message}`);
    }
  }
}
const modules = [];
const module = (name, fn) => modules.push({ name, fn });

/** Run parameterized SQL through the server's own db layer (prefix-safe cleanup of rows with no delete endpoint). */
const TSX = resolve(SERVER, 'node_modules', 'tsx', 'dist', 'cli.mjs');
function tsx(args, opts = {}) {
  return execFileSync(process.execPath, [TSX, ...args], { cwd: SERVER, env: { ...process.env, DB_POOL_MAX: '1', LOG_LEVEL: 'error' }, encoding: 'utf8', ...opts });
}
function sql(statement, params = []) {
  const file = join(tmpdir(), `eduway-verify-sql-${RUN}-${randomUUID().slice(0, 8)}.mts`);
  const dbUrl = pathToFileURL(resolve(SERVER, 'src', 'config', 'db.ts')).href;
  writeFileSync(file, `import { db, closeDb } from ${JSON.stringify(dbUrl)};
const r = await db.query(${JSON.stringify(statement)}, ${JSON.stringify(params)});
console.log(JSON.stringify({ rowCount: r.rowCount ?? 0, rows: r.rows ?? [] }));
await closeDb();
`);
  try {
    const out = tsx([file]);
    const line = out.trim().split(/\r?\n/).filter((l) => l.startsWith('{"rowCount"')).pop();
    return line ? JSON.parse(line) : { rowCount: 0, rows: [] };
  } finally {
    rmSync(file, { force: true });
  }
}

/**
 * Hard-delete rows a run created that the API only soft-deletes (or has no delete endpoint for).
 * `tag` is the run id (default) or, with --purge-only=<tag>, an earlier run id / 'ALL' for every verify-run artefact.
 * Every pattern contains the verify marker, so seeded and real data are never matched.
 */
function purgeRun(tag) {
  const any = tag === 'ALL';
  const t = any ? '%' : `%${tag}%`;
  const suffix = any ? '%' : `%${tag.slice(-6)}%`;
  const promo = any ? '%' : `%${tag.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10)}%`;
  const stmts = [
    [`DELETE FROM eduway_platform_questions WHERE body_en LIKE 'Verify ' || $1 || ': what is 2 + 2%' OR body_en LIKE 'Import verify ' || $1`, [any ? '%' : `${tag}%`]],
    [`DELETE FROM eduway_platform_lessons WHERE title_en LIKE 'Verify lesson ' || $1`, [suffix]],
    [`DELETE FROM eduway_platform_subjects WHERE slug LIKE 'verify-' || $1 AND deleted_at IS NOT NULL`, [suffix]],
    [`DELETE FROM eduway_platform_exam_blueprints WHERE title_en LIKE 'Verify exam ' || $1`, [t]],
    [`DELETE FROM eduway_platform_packages WHERE name_en LIKE 'Verify pkg ' || $1`, [t]],
    [`DELETE FROM eduway_platform_promotions WHERE code LIKE 'VF' || $1`, [promo]],
    [`DELETE FROM eduway_platform_schools WHERE name_en LIKE 'Verify school ' || $1`, [t]],
    [`DELETE FROM eduway_platform_marketers WHERE name_en LIKE 'Verify marketer ' || $1`, [t]],
    [`DELETE FROM eduway_platform_notification_templates WHERE name LIKE 'Verify ' || $1`, [t]],
    [`DELETE FROM eduway_platform_entity_notes WHERE body LIKE 'verify ' || $1 OR body LIKE 'verify note ' || $1`, [t]],
    [`DELETE FROM eduway_platform_entitlements WHERE reason LIKE 'verify ' || $1`, [t]],
    [`DELETE FROM eduway_platform_subscriptions WHERE grant_reason LIKE 'verify ' || $1`, [t]],
    [`DELETE FROM eduway_platform_refunds WHERE reason LIKE 'verify ' || $1 AND status = 'rejected'`, [t]],
    [`DELETE FROM eduway_platform_cms_faq WHERE question_en LIKE 'Verify ' || $1`, [t]],
    [`DELETE FROM eduway_platform_users WHERE email LIKE 'verify.rbac.' || $1 || '@eduway.test'`, [any ? '%' : tag]],
    [`DELETE FROM eduway_platform_roles WHERE key LIKE 'verify\_' || $1`, [any ? '%' : tag.replace(/[^a-z0-9_]/g, '_')]],
  ];
  // one tsx process for the whole batch (spawning per statement is slow)
  const out = {};
  const file = join(tmpdir(), `eduway-verify-purge-${RUN}.mts`);
  const dbUrl = pathToFileURL(resolve(SERVER, 'src', 'config', 'db.ts')).href;
  writeFileSync(file, `import { db, closeDb } from ${JSON.stringify(dbUrl)};
const stmts = ${JSON.stringify(stmts)};
const out = {};
for (const [q, p] of stmts) {
  const table = q.split(' ')[2].replace('eduway_platform_', '');
  try { out[table] = (await db.query(q, p)).rowCount ?? 0; } catch (e) { out[table] = 'ERR ' + e.message; }
}
console.log('PURGE' + JSON.stringify(out));
await closeDb();
`);
  try {
    const line = tsx([file]).split(/\r?\n/).find((l) => l.startsWith('PURGE'));
    Object.assign(out, line ? JSON.parse(line.slice(5)) : { purge: 'ERR no output' });
  } finally {
    rmSync(file, { force: true });
  }
  return out;
}

// ── shared context discovered from seeded data ───────────────────────────────
const ctx = {};
const L = (s) => ({ en: s, ar: `${s} (ar)` });

// ═════════════════════════════════════════════════════════════════════════════
module('auth', async () => {
  await step('Login super admin (AUTH-10, MFA aware)', 'POST /auth/admin/login', async () => {
    if (!ADMIN_PASSWORD) throw new Error('SEED_SUPER_ADMIN_PASSWORD missing in server/.env');
    const r = await post('/auth/admin/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD }, { token: null });
    if (r.mfaRequired) {
      if (!process.env.ADMIN_TOTP) throw new Error('MFA enabled for super admin — set ADMIN_TOTP to a current code');
      const v = await post('/auth/admin/mfa/verify', { mfaToken: r.mfaToken, code: process.env.ADMIN_TOTP }, { token: null });
      TOKEN = v.tokens.accessToken;
      ctx.refresh = v.tokens.refreshToken;
    } else {
      has(r, ['tokens.accessToken', 'tokens.refreshToken', 'me.admin.id', 'me.permissions'], 'AdminLoginResult');
      TOKEN = r.tokens.accessToken;
      ctx.refresh = r.tokens.refreshToken;
    }
  });
  await step('GET /auth/me permissions + roles', 'GET /auth/me', async () => {
    const me = await get('/auth/me');
    has(me, ['admin.id', 'admin.email', 'role.key', 'permissions'], 'MeAdminDto');
    if (!Array.isArray(me.permissions) || me.permissions.length < 80) throw new Error(`expected full permission set, got ${me.permissions?.length}`);
    ctx.adminId = me.admin.id;
  });
  await step('Profile: /admin/me, sessions, inbox', 'GET /admin/me · /admin/me/sessions · /admin/me/notifications', async () => {
    has(await get('/admin/me'), ['admin.id', 'permissions'], 'MeAdminDto');
    arr(await get('/admin/me/sessions'), ['id', 'current', 'browser', 'location', 'deviceType'], 'AdminSessionDto');
    paged(await list('/admin/me/notifications', { page: 1, pageSize: 20 }), ['id', 'title', 'read'], 'AdminInboxNotification');
  });
  await step('Token refresh (single-flight path)', 'POST /auth/refresh', async () => {
    const r = await post('/auth/refresh', { refreshToken: ctx.refresh }, { token: null });
    has(r, ['accessToken', 'refreshToken'], 'AuthTokens');
    TOKEN = r.accessToken;
    ctx.refresh = r.refreshToken;
  });
  await step('Lookups + global search', 'GET /admin/lookups · GET /search', async () => {
    const lk = await get('/admin/lookups');
    has(lk, ['governorates', 'subjects', 'units', 'topics', 'packages', 'schools', 'marketers', 'teachers', 'admins', 'roles', 'gateways', 'aiModels'], 'LookupsDto');
    ctx.lookups = lk;
    const s = await get('/search', { q: 'ma', scopes: ['students', 'lessons', 'questions'], limit: 5 });
    await expectError(400, () => get('/search', { q: 'a', scopes: 'students', limit: 8 })); // UI only searches from 2 chars
    if (typeof s !== 'object') throw new Error('search: bad payload');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
module('dashboard', async () => {
  await step('Dashboard composite (ADM-DSH-01)', 'GET /admin/dashboard?from&to', async () => {
    const d = await get('/admin/dashboard', RANGE);
    has(d, ['kpis.totalStudents.value', 'kpis.activeSubscriptions.pctOfTotal', 'kpis.revenueThisMonth.spark', 'kpis.publishedLessons.totalLessons', 'kpis.openIssues.pending', 'monthly', 'packageDistribution', 'dau', 'registrationsByGovernorate', 'weakestTopics', 'topSchools', 'topMarketers', 'pendingReview', 'pendingReviewCount', 'recentPayments'], 'AdminDashboardDto');
    if (d.monthly.length !== 12) throw new Error('monthly must have 12 rows');
    if (d.recentPayments[0]) has(d.recentPayments[0], ['id', 'ref', 'student.name', 'package.name', 'amount', 'status'], 'recentPayment');
  });
  await step('System health (ADM-DSH-02)', 'GET /admin/system/health', async () => {
    has(await get('/admin/system/health'), ['status', 'uptime30d', 'errorRate24h', 'apiP95Ms', 'services'], 'SystemHealthDto');
  });
  await step('Daily metrics (ADM-ANL-03)', 'GET /admin/analytics/daily', async () => {
    await get('/admin/analytics/daily', { from: RANGE.from, to: RANGE.to });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
module('students', async () => {
  const rowFields = ['id', 'name.en', 'mobile', 'governorate', 'subscriptionStatus', 'source', 'locked', 'platforms', 'createdAt'];
  await step('List + filters + sorts (ADM-STU-01)', 'GET /admin/students', async () => {
    const r = paged(await list('/admin/students', { page: 1, pageSize: 20, sort: '-createdAt' }), rowFields, 'AdminStudentRow');
    if (!r.length) throw new Error('no seeded students');
    for (const sort of ['name', '-lastActive', 'subscriptionStatus', 'mobile']) await list('/admin/students', { sort, page: 1, pageSize: 5 });
    for (const f of [{ status: 'active' }, { status: 'locked' }, { packageId: '__none' }, { schoolId: '__none' }, { marketerId: '__none' }, { governorateId: 'baghdad' }, { source: 'organic' }, { platform: 'web' }, { createdFrom: RANGE.from, createdTo: RANGE.to }, { q: '+964' }]) await list('/admin/students', { ...f, page: 1, pageSize: 5 });
    // pick a student who is not the seeded demo login, without active sessions
    ctx.student = r.find((s) => !s.locked && (s.platforms ?? []).length === 0) ?? r[r.length - 1];
  });
  await step('Stats (ADM-STU-02)', 'GET /admin/students/stats', async () => has(await get('/admin/students/stats'), ['total', 'active', 'trial', 'expired', 'locked', 'byPlatform'], 'StudentStats'));
  const id = () => ctx.student.id;
  await step('Detail + tabs (ADM-STU-06/09/12/16/19/20)', 'GET /admin/students/:id (+sessions, notes, entitlement-logs, activity, transactions)', async () => {
    const d = await get(`/admin/students/${id()}`);
    has(d, [...rowFields, 'progress', 'avgScore', 'aiQuestionsUsed', 'aiAllowance', 'lifetimeValue', 'entitlements', 'otp.failures', 'counts.transactions', 'memberSince'], 'AdminStudentDetail');
    arr(await get(`/admin/students/${id()}/sessions`), ['id'], 'SessionDto');
    arr(await get(`/admin/students/${id()}/notes`), ['id', 'body'], 'NoteDto');
    arr(await get(`/admin/students/${id()}/entitlement-logs`), ['id'], 'EntitlementLogDto');
    has(await get(`/admin/students/${id()}/activity`, { limit: 20, days: 14 }), ['watch', 'quizzes', 'exams', 'aiDaily', 'aiRecent'], 'StudentActivityDto');
    paged(await list(`/admin/students/${id()}/transactions`, { page: 1, pageSize: 10 }), null, 'StudentTransactionRow');
  });
  await step('Lock → unlock (ADM-STU-07/08)', 'POST /admin/students/:id/lock · /unlock', async () => {
    const l = await post(`/admin/students/${id()}/lock`, { reason: `verify ${RUN}` });
    if (!l.locked) throw new Error('not locked');
    const u = await post(`/admin/students/${id()}/unlock`, { reason: `verify ${RUN}` });
    if (u.locked) throw new Error('still locked');
  });
  await step('Bulk lock → bulk unlock (ADM-STU-04/05)', 'POST /admin/students/bulk/lock · bulk/unlock', async () => {
    has(await post('/admin/students/bulk/lock', { ids: [id()], reason: `verify ${RUN}` }), ['succeeded'], 'BulkResult');
    await post('/admin/students/bulk/unlock', { ids: [id()] });
  });
  await step('Support note (ADM-STU-13)', 'POST /admin/students/:id/notes', async () => {
    const n = await post(`/admin/students/${id()}/notes`, { body: `verify note ${RUN}` });
    has(n, ['id', 'body', 'author', 'createdAt'], 'NoteDto');
    onCleanup('student note', async () => sql(`DELETE FROM eduway_platform_entity_notes WHERE body = $1`, [`verify note ${RUN}`]));
  });
  await step('Manual grant → revoke (ADM-STU-14/15, Idempotency-Key)', 'POST /admin/students/:id/entitlements · DELETE …/entitlements/:eid?reason=', async () => {
    const subjectId = ctx.lookups.subjects[0].id;
    const key = randomUUID();
    const ents = await post(`/admin/students/${id()}/entitlements`, { subjectId, days: 3, reason: `verify ${RUN}` }, { idem: key });
    const again = await post(`/admin/students/${id()}/entitlements`, { subjectId, days: 3, reason: `verify ${RUN}` }, { idem: key });
    arr(ents, ['id'], 'EntitlementDto');
    if (JSON.stringify(ents.map((e) => e.id)) !== JSON.stringify(again.map((e) => e.id))) throw new Error('idempotent replay returned a different body');
    const mine = ents.find((e) => e.source === 'manual' && (e.subjectId === subjectId || e.subject?.id === subjectId)) ?? ents.find((e) => e.source === 'manual');
    if (!mine) throw new Error('manual entitlement not found in response');
    await del(`/admin/students/${id()}/entitlements/${mine.id}`, { query: { reason: `verify cleanup ${RUN}` } });
  });
  await step('Force logout all (ADM-STU-11 ?reason=)', 'DELETE /admin/students/:id/sessions', async () => {
    has(await del(`/admin/students/${id()}/sessions`, { query: { reason: 'verify' } }), ['revoked'], 'revoke-all');
  });
  await step('OTP lockout reset (ADM-STU-18)', 'POST /admin/students/:id/otp/reset', async () => has(await post(`/admin/students/${id()}/otp/reset`), ['failures', 'locked'], 'otp reset'));
  await step('Export CSV (ADM-STU-03)', 'POST /admin/students/export', async () => {
    const f = await download('POST', '/admin/students/export', { body: { format: 'csv', filters: { status: 'active' } } });
    if (!/csv/.test(f.type) || f.size < 10) throw new Error(`bad export ${f.type} ${f.size}`);
  });
  await step('Support tickets (ADM-SUP-01)', 'GET /admin/support-tickets', async () => paged(await list('/admin/support-tickets', { status: 'open', page: 1, pageSize: 10 }), ['id', 'subject', 'status', 'priority'], 'SupportTicketDto'));
});

// ═════════════════════════════════════════════════════════════════════════════
module('support', async () => {
  // PUB-10 contact form → ticket → ADM-SUP-01..06 → delete. PUB-10 is rate limited (5/hour/IP): one ticket per run.
  const marker = `verify-contact-${RUN}`;
  const sup = (id) => `/admin/support-tickets/${encodeURIComponent(id)}`;
  await step('Public contact form creates a ticket (PUB-10)', 'POST /public/contact', async () => {
    const r = await post('/public/contact', { name: 'Verify Contact', contact: `${marker}@eduway.test`, subject: 'billing', message: `Automated verification ticket ${marker}. Please ignore, it is deleted right away.`, locale: 'en' }, { token: null });
    has(r, ['ticketId', 'createdAt'], 'contact result');
    if (!/^EW-T-\d{5,}$/.test(r.ticketId)) throw new Error(`unexpected ticket id ${r.ticketId}`);
    ctx.ticket = r.ticketId;
    onCleanup('support ticket', async () => {
      await del(sup(r.ticketId)).catch(() => {});
      sql(`DELETE FROM eduway_platform_support_tickets WHERE contact_value = $1`, [`${marker}@eduway.test`]);
    });
  });
  await step('Ticket appears in the admin list (filters, sorts, counts) (ADM-SUP-01)', 'GET /admin/support-tickets', async () => {
    if (!ctx.ticket) throw new Error('needs ticket');
    const r = await list('/admin/support-tickets', { q: marker, page: 1, pageSize: 10 });
    const rows = paged(r, ['id', 'student', 'contact', 'subject', 'message', 'category', 'priority', 'status', 'assignee', 'source', 'locale', 'replies', 'resolvedAt', 'createdAt'], 'SupportTicketDto');
    const t = rows.find((x) => x.id === ctx.ticket);
    if (!t) throw new Error('new ticket not found by q');
    if (t.source !== 'contact_form' || t.category !== 'payment' || t.status !== 'open') throw new Error(`ticket mapped wrong: ${t.source}/${t.category}/${t.status}`);
    has(r.meta, ['counts.open', 'counts.pending', 'counts.resolved'], 'ticket counts');
    for (const f of [{ status: 'open' }, { category: 'payment' }, { priority: 'medium' }, { source: 'contact_form' }, { assigneeId: '__none' }, { sort: 'priority' }, { sort: '-updatedAt' }, { sort: 'status' }, { sort: 'number' }])
      await list('/admin/support-tickets', { ...f, page: 1, pageSize: 5 });
  });
  await step('Detail → assign to me → priority → reply → resolve → reopen (ADM-SUP-02..04)', 'GET /admin/support-tickets/:id · PATCH · POST /:id/replies', async () => {
    if (!ctx.ticket) throw new Error('needs ticket');
    has(await get(sup(ctx.ticket)), ['id', 'messages', 'contact.contact'], 'SupportTicketDetailDto');
    const a = await patch(sup(ctx.ticket), { assigneeId: ctx.adminId, priority: 'high' });
    if (a.assignee?.id !== ctx.adminId || a.priority !== 'high') throw new Error('assign/priority not applied');
    await expectError(400, () => patch(sup(ctx.ticket), { assigneeId: randomUUID() }));
    const r = await post(`${sup(ctx.ticket)}/replies`, { body: 'Thanks, verification reply.' });
    if (r.status !== 'pending' || r.replies !== 1 || r.messages.at(-1)?.authorKind !== 'admin') throw new Error(`reply not recorded (${r.status}, ${r.replies})`);
    const c = await post(`${sup(ctx.ticket)}/replies`, { body: 'Closing (verification).', status: 'resolved' });
    if (c.status !== 'resolved' || !c.resolvedAt) throw new Error('not resolved');
    const reopened = await patch(sup(ctx.ticket), { status: 'open' });
    if (reopened.status !== 'open' || reopened.resolvedAt) throw new Error('reopen did not clear resolvedAt');
    await patch(sup(ctx.ticket), { status: 'resolved' });
  });
  await step('Export tickets (ADM-SUP-06)', 'POST /admin/support-tickets/export', async () => {
    const f = await download('POST', '/admin/support-tickets/export', { body: { format: 'csv', filters: { q: marker } } });
    if (!f.buf.toString('utf8').includes(ctx.ticket ?? '§')) throw new Error('ticket missing from export');
  });
  await step('Delete ticket → 404 (ADM-SUP-05)', 'DELETE /admin/support-tickets/:id', async () => {
    if (!ctx.ticket) throw new Error('needs ticket');
    await del(sup(ctx.ticket));
    await expectError(404, () => get(sup(ctx.ticket)));
  });
});

module('content', async () => {
  await step('Subjects / units / teachers (ADM-SUB-01, ADM-UNT-01, ADM-TCH-01)', 'GET /admin/subjects · /admin/subjects/:id · /units · /admin/teachers', async () => {
    const subs = arr(await get('/admin/subjects', { includeHidden: true }), ['id', 'slug', 'name', 'color', 'status'], 'AdminSubject');
    ctx.subject = subs[0];
    has(await get(`/admin/subjects/${subs[0].id}`), ['id', 'slug'], 'AdminSubject');
    const units = arr(await get(`/admin/subjects/${subs[0].id}/units`), ['id', 'name', 'topics'], 'AdminUnit');
    ctx.unit = units[0];
    ctx.topic = units[0]?.topics?.[0];
    const teachers = arr(await get('/admin/teachers', { subjectId: subs[0].id }), ['id', 'name'], 'TeacherDto');
    ctx.teacher = teachers[0] ?? arr(await get('/admin/teachers'), ['id'], 'TeacherDto')[0];
  });
  await step('Teachers page: list + lessonsCount, create with avatar upload → edit → deactivate → delete; 409 on a teacher with lessons (ADM-TCH-01..04)', 'GET/POST/PATCH/DELETE /admin/teachers · STO-01 teacher_avatar', async () => {
    const all = arr(await get('/admin/teachers'), ['id', 'name', 'bio', 'avatarUrl', 'subjectId', 'yearsExperience', 'studentsCount', 'rating', 'active', 'lessonsCount'], 'AdminTeacherDto');
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'); // 1×1 PNG
    const s = await post('/storage/signed-upload-url', { purpose: 'teacher_avatar', fileName: `verify-${RUN}.png`, contentType: 'image/png', sizeBytes: png.length });
    const up = await fetch(s.uploadUrl, { method: s.method ?? 'PUT', headers: { 'Content-Type': 'image/png', ...(s.headers ?? {}) }, body: png });
    if (!up.ok) throw new Error(`storage PUT ${up.status}`);
    const t = await post('/admin/teachers', { name: L(`Verify teacher ${RUN}`), bio: L('Verification bio'), subjectId: ctx.subject.id, avatarFileKey: s.fileKey, yearsExperience: 5, studentsCount: 100, rating: 4.5, active: true });
    onCleanup('teacher', () => del(`/admin/teachers/${t.id}`).catch(() => {}));
    has(t, ['id', 'lessonsCount'], 'AdminTeacherDto');
    if (!t.avatarUrl) throw new Error('avatar not attached');
    const e = await patch(`/admin/teachers/${t.id}`, { rating: 4.8, yearsExperience: null, active: false });
    if (e.active !== false || e.rating !== 4.8 || e.yearsExperience !== null) throw new Error('edit not applied');
    const cleared = await patch(`/admin/teachers/${t.id}`, { avatarFileKey: null });
    if (cleared.avatarUrl) throw new Error('avatar not cleared');
    await del(`/admin/teachers/${t.id}`);
    const busy = all.find((x) => x.lessonsCount > 0);
    if (busy) await expectError(409, () => del(`/admin/teachers/${busy.id}`), 'HAS_DEPENDENTS');
  });
  await step('Lessons list views + filters (ADM-LSN-01)', 'GET /admin/lessons', async () => {
    const r = paged(await list('/admin/lessons', { page: 1, pageSize: 20, sort: '-updatedAt' }), ['id', 'title', 'subject', 'unit', 'topic', 'status', 'teacher'], 'AdminLessonDto');
    ctx.lesson = r.find((l) => l.status === 'published') ?? r[0];
    await list('/admin/lessons', { view: 'board', pageSize: 1000 });
    await list('/admin/lessons', { view: 'options', pageSize: 100 });
    for (const f of [{ status: 'published' }, { subjectId: ctx.subject.id }, { q: 'a' }, { sort: '-views' }]) await list('/admin/lessons', { ...f, page: 1, pageSize: 5 });
    has(await get(`/admin/lessons/${ctx.lesson.id}`), ['id', 'title', 'resources', 'status'], 'AdminLessonDto');
    arr(await get(`/admin/lessons/${ctx.lesson.id}/versions`), ['version'], 'LessonVersionDto');
  });
  await step('Videos + stats (ADM-VID-01..03)', 'GET /admin/videos · /admin/videos/stats · /admin/videos/:id', async () => {
    const r = paged(await list('/admin/videos', { page: 1, pageSize: 20, sort: '-createdAt' }), ['id', 'assetId', 'lesson', 'streamStatus', 'cdnStatus', 'sizeMb', 'durationSec', 'uploadedAt'], 'VideoAssetDto');
    await get('/admin/videos/stats');
    if (r[0]) await get(`/admin/videos/${r[0].id}`);
  });
  await step('Review queue + tags', 'GET /admin/questions/review-queue · /admin/tags', async () => {
    await list('/admin/questions/review-queue', { page: 1, pageSize: 20 });
    await get('/admin/tags', { q: '' });
  });

  // create subject → unit → topic → lesson → workflow → versions → delete
  const suffix = RUN.slice(-6);
  await step('Create subject → unit → topic (ADM-SUB-02, ADM-UNT-02, ADM-TOP-02)', 'POST /admin/subjects · /admin/subjects/:id/units · /admin/units/:id/topics', async () => {
    ctx.newSubject = await post('/admin/subjects', { name: L(`Verify ${suffix}`), slug: `verify-${suffix}`, color: '#123456', icon: 'math', status: 'hidden' });
    onCleanup('subject', () => del(`/admin/subjects/${ctx.newSubject.id}`));
    ctx.newUnit = await post(`/admin/subjects/${ctx.newSubject.id}/units`, { name: L('Verify unit') });
    onCleanup('unit', () => del(`/admin/units/${ctx.newUnit.id}`));
    ctx.newTopic = await post(`/admin/units/${ctx.newUnit.id}/topics`, { name: L('Verify topic') });
    onCleanup('topic', () => del(`/admin/topics/${ctx.newTopic.id}`));
    await patch(`/admin/subjects/${ctx.newSubject.id}`, { tagline: L('tag') });
    await patch(`/admin/units/${ctx.newUnit.id}`, { name: L('Verify unit 2') });
    await patch(`/admin/topics/${ctx.newTopic.id}`, { name: L('Verify topic 2') });
  });
  await step('Lesson create → edit → in_review → approve → publish/schedule guard (VIDEO_NOT_READY) → archive; versions (ADM-LSN-02..08)', 'POST /admin/lessons · /transition · /approve · GET /versions · PATCH', async () => {
    if (!ctx.newTopic) throw new Error('needs new topic');
    const l = await post('/admin/lessons', { title: L(`Verify lesson ${suffix}`), subjectId: ctx.newSubject.id, unitId: ctx.newUnit.id, topicId: ctx.newTopic.id, teacherId: ctx.teacher.id, durationSec: 60, status: 'draft' });
    ctx.newLesson = l;
    onCleanup('lesson', () => del(`/admin/lessons/${l.id}`));
    await patch(`/admin/lessons/${l.id}`, { description: L('changed'), versionNote: 'verify edit' });
    let s = await post(`/admin/lessons/${l.id}/transition`, { to: 'in_review', note: 'verify' });
    if (s.status !== 'in_review') throw new Error(`expected in_review, got ${s.status}`);
    s = await post(`/admin/lessons/${l.id}/approve`, { note: 'verify approve' });
    if (s.status !== 'approved') throw new Error(`expected approved, got ${s.status}`);
    // A lesson without a ready video must not publish (VIDEO_NOT_READY guard); seeded lessons cover the publish path.
    await expectError(422, () => post(`/admin/lessons/${l.id}/transition`, { to: 'published' }), 'VIDEO_NOT_READY');
    await expectError(422, () => post(`/admin/lessons/${l.id}/transition`, { to: 'scheduled', publishAt: new Date(Date.now() + 86400000).toISOString() }), 'VIDEO_NOT_READY');
    s = await post(`/admin/lessons/${l.id}/transition`, { to: 'archived', note: 'verify' });
    if (s.status !== 'archived') throw new Error(`expected archived, got ${s.status}`);
    const v = await get(`/admin/lessons/${l.id}/versions`);
    if (!Array.isArray(v) || v.length < 2) throw new Error(`expected ≥2 versions, got ${v?.length}`);
    await put(`/admin/topics/${ctx.newTopic.id}/lessons/order`, { ids: [l.id] });
  });
  await step('Signed upload → Storage PUT → register resource (STO-01, ADM-LSN-09/11)', 'POST /storage/signed-upload-url · PUT <signed> · POST /admin/lessons/:id/resources · DELETE', async () => {
    if (!ctx.newLesson) throw new Error('needs lesson');
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
    const s = await post('/storage/signed-upload-url', { purpose: 'lesson_resource', fileName: `verify-${suffix}.pdf`, contentType: 'application/pdf', sizeBytes: pdf.length });
    has(s, ['uploadUrl', 'fileKey'], 'SignedUploadDto');
    const up = await fetch(s.uploadUrl, { method: s.method ?? 'PUT', headers: { 'Content-Type': 'application/pdf', ...(s.headers ?? {}) }, body: pdf });
    if (!up.ok) throw new Error(`storage PUT ${up.status} ${await up.text()}`);
    const res = await post(`/admin/lessons/${ctx.newLesson.id}/resources`, { fileKey: s.fileKey, title: L('Verify PDF'), pages: 1 });
    has(res, ['id', 'title'], 'AdminLessonResource');
    await patch(`/admin/lessons/${ctx.newLesson.id}/resources/${res.id}`, { pages: 2 });
    const dl = await post('/storage/signed-download-url', { fileKey: s.fileKey });
    has(dl, ['url'], 'signed download');
    await del(`/admin/lessons/${ctx.newLesson.id}/resources/${res.id}`);
  });
  await step('Signed upload → register video (ADM-VID-04) → remove', 'POST /storage/signed-upload-url · POST /admin/videos · DELETE /admin/lessons/:id/video', async () => {
    if (!ctx.newLesson) throw new Error('needs lesson');
    const mp4 = Buffer.alloc(2048, 0);
    const s = await post('/storage/signed-upload-url', { purpose: 'lesson_video', fileName: `verify-${suffix}.mp4`, contentType: 'video/mp4', sizeBytes: mp4.length });
    const up = await fetch(s.uploadUrl, { method: s.method ?? 'PUT', headers: { 'Content-Type': 'video/mp4', ...(s.headers ?? {}) }, body: mp4 });
    if (!up.ok) throw new Error(`storage PUT ${up.status}`);
    const v = await post('/admin/videos', { lessonId: ctx.newLesson.id, fileKey: s.fileKey });
    has(v, ['id', 'assetId', 'streamStatus', 'cdnStatus'], 'VideoAssetDto');
    await get(`/admin/videos/${v.id}`);
    await del(`/admin/lessons/${ctx.newLesson.id}/video`);
  });
  await step('Lesson export (ADM-LSN-12)', 'POST /admin/lessons/export', async () => {
    const f = await download('POST', '/admin/lessons/export', { body: { format: 'xlsx' } });
    if (f.size < 100) throw new Error('empty xlsx');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
module('questions', async () => {
  await step('List + stats + detail (ADM-QST-01/02/03)', 'GET /admin/questions · /stats · /:id', async () => {
    const r = paged(await list('/admin/questions', { page: 1, pageSize: 20, sort: '-updatedAt' }), ['id', 'code', 'type', 'difficulty', 'status', 'body', 'options', 'subject', 'topic'], 'AdminQuestionDto');
    for (const f of [{ status: 'published' }, { difficulty: 'hard' }, { type: 'mcq' }, { subjectId: ctx.lookups.subjects[0].id }, { q: 'the' }]) await list('/admin/questions', { ...f, page: 1, pageSize: 5 });
    await get('/admin/questions/stats');
    ctx.question = r[0];
    has(await get(`/admin/questions/${r[0].id}`), ['id', 'options', 'explanation'], 'AdminQuestionDto');
  });
  const topic = () => ctx.newTopic ?? ctx.question.topic;
  const unitId = () => (ctx.newTopic ? ctx.newUnit.id : ctx.question.unitId ?? ctx.question.unit?.id);
  const subjectId = () => (ctx.newTopic ? ctx.newSubject.id : ctx.question.subjectId ?? ctx.question.subject?.id);
  const qBody = (t) => ({ type: 'mcq', difficulty: 'easy', subjectId: subjectId(), unitId: unitId(), topicId: topic().id, body: { en: t, ar: t }, explanation: L('Because.'), options: [{ text: L('4'), correct: true }, { text: L('5'), correct: false }, { text: L('6'), correct: false }, { text: L('7'), correct: false }], tags: ['verify'], status: 'draft' });
  await step('Create → duplicate check → review approve → delete (ADM-QST-04/12/08)', 'POST /admin/questions · /similar · /:id/transition · /:id/duplicate · DELETE', async () => {
    const text = `Verify ${RUN}: what is 2 + 2 in the verification run?`;
    const q = await post('/admin/questions', qBody(text));
    onCleanup('question', () => del(`/admin/questions/${q.id}`).catch(() => {}));
    const sim = await post('/admin/questions/similar', { topicId: topic().id, body: { en: text }, threshold: 0.5, limit: 5 });
    arr(sim, null, 'SimilarDto');
    await post(`/admin/questions/${q.id}/transition`, { action: 'submit' }).catch(async () => post(`/admin/questions/${q.id}/transition`, { to: 'in_review' }));
    const ap = await post(`/admin/questions/${q.id}/transition`, { action: 'approve' }).catch(async () => post(`/admin/questions/${q.id}/transition`, { to: 'published' }));
    has(ap, ['status'], 'approved question');
    const dup = await post(`/admin/questions/${q.id}/duplicate`);
    await del(`/admin/questions/${dup.id}`);
    await patch(`/admin/questions/${q.id}`, { difficulty: 'medium' });
  });
  await step('Bulk import: template → upload → preview → commit (ADM-IMP-01..05)', 'GET /admin/questions/import/template · STO-01 · POST /admin/questions/import · GET /:importId · /errors · POST /commit', async () => {
    const tpl = await download('GET', '/admin/questions/import/template', { query: { format: 'csv' } });
    const header = tpl.buf.toString('utf8').replace(/^﻿/, '').split(/\r?\n/)[0];
    const cols = header.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    const row = Object.fromEntries(cols.map((c) => [c, '']));
    const set = (re, v) => cols.filter((c) => re.test(c)).forEach((c) => (row[c] = v));
    set(/^type$/i, 'mcq');
    set(/difficulty/i, 'easy');
    set(/^subject/i, ctx.newSubject?.slug ?? ctx.lookups.subjects[0].slug);
    set(/^unit/i, '1'); // 1-based unit / topic numbers (see template sample rows)
    set(/^topic/i, '1');
    set(/(question|body|text)_?en/i, `Import verify ${RUN} — capital of Iraq?`);
    set(/(question|body|text)_?ar/i, `Import verify ${RUN} — عاصمة العراق؟`);
    set(/option_?a_?en|option1_?en|^a_en/i, 'Baghdad');
    set(/option_?b_?en|option2_?en|^b_en/i, 'Basra');
    set(/option_?c_?en|option3_?en|^c_en/i, 'Mosul');
    set(/option_?d_?en|option4_?en|^d_en/i, 'Erbil');
    set(/option_?a_?ar|option1_?ar|^a_ar/i, 'بغداد');
    set(/option_?b_?ar|option2_?ar|^b_ar/i, 'البصرة');
    set(/option_?c_?ar|option3_?ar|^c_ar/i, 'الموصل');
    set(/option_?d_?ar|option4_?ar|^d_ar/i, 'أربيل');
    set(/^correct/i, 'A');
    set(/explanation_?en/i, 'Baghdad is the capital.');
    set(/explanation_?ar/i, 'بغداد هي العاصمة.');
    const esc = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const csv = `${header}\n${cols.map((c) => esc(row[c])).join(',')}\n`;
    const buf = Buffer.from(csv, 'utf8');
    const s = await post('/storage/signed-upload-url', { purpose: 'question_import', fileName: `verify-${RUN}.csv`, contentType: 'text/csv', sizeBytes: buf.length });
    const up = await fetch(s.uploadUrl, { method: s.method ?? 'PUT', headers: { 'Content-Type': 'text/csv', ...(s.headers ?? {}) }, body: buf });
    if (!up.ok) throw new Error(`storage PUT ${up.status}`);
    let imp = await post('/admin/questions/import', { fileKey: s.fileKey });
    has(imp, ['importId', 'status'], 'ImportPreviewDto');
    for (let i = 0; i < 30 && ['queued', 'processing', 'parsing', 'pending'].includes(imp.status); i++) {
      await new Promise((r) => setTimeout(r, 1000));
      imp = await get(`/admin/questions/import/${imp.importId}`, { filter: 'all', page: 1, pageSize: 20 });
    }
    if (imp.status === 'failed') throw new Error(`import failed: ${imp.failureReason}`);
    const errs = await download('GET', `/admin/questions/import/${imp.importId}/errors`);
    if (!errs.size && errs.size !== 0) throw new Error('errors csv');
    const valid = imp.totals?.valid;
    has(imp, ['importId', 'status', 'totals.rows', 'totals.valid', 'totals.invalid', 'rows'], 'ImportPreviewDto');
    if (!valid) throw new Error(`preview found no valid rows: ${JSON.stringify(imp.rows?.[0]?.errors ?? imp).slice(0, 400)}`);
    const c = await post(`/admin/questions/import/${imp.importId}/commit`, {}, { idem: `import-${imp.importId}` });
    has(c, ['imported', 'createdIds'], 'commit');
    for (const qid of c.createdIds) await del(`/admin/questions/${qid}`);
  });
  await step('Question export (ADM-QST-14)', 'POST /admin/questions/export', async () => {
    const f = await download('POST', '/admin/questions/export', { body: { format: 'csv', filters: { status: 'published' } } });
    if (f.size < 10) throw new Error('empty export');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
module('assessments', async () => {
  await step('Quiz rules list + subject upsert round-trip (ADM-QZR-01/02)', 'GET /admin/quiz-rules · PUT /admin/quiz-rules/subjects/:id', async () => {
    const r = paged(await list('/admin/quiz-rules', { scope: 'subject', page: 1, pageSize: 50 }), ['id', 'scope', 'questionCount', 'passThreshold', 'retryPolicy'], 'QuizRuleDto');
    await list('/admin/quiz-rules', { scope: 'lesson', page: 1, pageSize: 20 });
    const d = r.find((x) => (x.subjectId ?? x.subject?.id) === ctx.lookups.subjects[0].id) ?? r[0];
    const sid = d.subjectId ?? d.subject.id;
    const body = { questionCount: d.questionCount, poolSize: d.poolSize, randomize: d.randomize, alternativeSets: d.alternativeSets, passThreshold: d.passThreshold, retryPolicy: d.retryPolicy, maxRetries: d.maxRetries, cooldownMinutes: d.cooldownMinutes ?? undefined, showExplanation: d.showExplanation, requireCompletionToUnlock: d.requireCompletionToUnlock };
    const changed = await put(`/admin/quiz-rules/subjects/${sid}`, { ...body, passThreshold: Math.min(100, d.passThreshold + 1) });
    if (changed.passThreshold !== Math.min(100, d.passThreshold + 1)) throw new Error('upsert not applied');
    await put(`/admin/quiz-rules/subjects/${sid}`, body);
  });
  await step('Lesson override create → patch → delete (ADM-QZR-03..05)', 'POST /admin/quiz-rules · PATCH · DELETE', async () => {
    const lessonId = ctx.newLesson?.id ?? ctx.lesson.id;
    const r = await post('/admin/quiz-rules', { lessonId, questionCount: 5, poolSize: 10, randomize: true, alternativeSets: 1, passThreshold: 60, retryPolicy: 'unlimited', maxRetries: 0, showExplanation: true, requireCompletionToUnlock: false });
    await patch(`/admin/quiz-rules/${r.id}`, { passThreshold: 70 });
    await del(`/admin/quiz-rules/${r.id}`);
  });
  await step('Effective quiz rule page: lesson options → effective rule vs subject default; unknown lesson 404 (ADM-QZR-06)', 'GET /admin/lessons?view=options · GET /admin/quiz-rules/effective?lessonId', async () => {
    const opts = paged(await list('/admin/lessons', { view: 'options', pageSize: 1000, excludeArchived: true }), ['id', 'order'], 'LessonOption');
    const lessonId = ctx.lesson?.id ?? opts[0]?.id;
    if (!lessonId) return;
    const e = has(await get('/admin/quiz-rules/effective', { lessonId }), ['subjectId', 'subject.name', 'questionCount', 'poolSize', 'passThreshold', 'alternativeSets', 'retryPolicy', 'maxRetries', 'cooldownMinutes', 'randomize', 'showExplanation', 'requireCompletionToUnlock', 'source'], 'EffectiveQuizRuleDto');
    if (!['subject', 'lesson'].includes(e.source)) throw new Error(`source=${e.source}`);
    const defaults = (await list('/admin/quiz-rules', { scope: 'subject', pageSize: 100 })).data;
    const def = defaults.find((r) => r.subjectId === e.subjectId);
    if (!def) throw new Error('subject default missing for the effective rule subject');
    if (e.source === 'subject' && def.questionCount !== e.questionCount) throw new Error('subject-sourced rule differs from the subject default');
    await expectError(404, () => get('/admin/quiz-rules/effective', { lessonId: '00000000-0000-4000-8000-000000000000' }));
  });
  await step('Blueprints list/stats/detail + availability (ADM-EXB-01/02/03/10)', 'GET /admin/exam-blueprints · /stats · /:id · POST /availability', async () => {
    const r = paged(await list('/admin/exam-blueprints', { page: 1, pageSize: 20, sort: '-updatedAt' }), ['id', 'name', 'rows', 'durationMin', 'status'], 'ExamBlueprintDto');
    await get('/admin/exam-blueprints/stats');
    if (r[0]) await get(`/admin/exam-blueprints/${r[0].id}`);
    await post('/admin/exam-blueprints/availability', { rows: [{ subjectId: ctx.lookups.subjects[0].id, topicId: null, count: 5, easy: 40, medium: 40, hard: 20 }] });
  });
  await step('Blueprint create → publish → duplicate → archive → delete (ADM-EXB-04..09)', 'POST /admin/exam-blueprints · /publish · /duplicate · /archive · DELETE', async () => {
    const b = await post('/admin/exam-blueprints', { name: L(`Verify exam ${RUN}`), rows: [{ subjectId: ctx.lookups.subjects[0].id, topicId: null, count: 2, easy: 50, medium: 50, hard: 0 }], durationMin: 10, randomize: true, scoring: 'standard', attemptLimit: 1, reviewBeforeSubmit: true, passMark: 50, availableFrom: new Date(Date.now() + 86400000 * 30).toISOString(), availableTo: new Date(Date.now() + 86400000 * 31).toISOString(), status: 'draft' });
    onCleanup('blueprint', () => del(`/admin/exam-blueprints/${b.id}`).catch(() => {}));
    const p = await post(`/admin/exam-blueprints/${b.id}/publish`, { force: true });
    if (p.status !== 'published') throw new Error(`publish → ${p.status}`);
    const d = await post(`/admin/exam-blueprints/${b.id}/duplicate`);
    await del(`/admin/exam-blueprints/${d.id}`);
    await post(`/admin/exam-blueprints/${b.id}/archive`);
    await del(`/admin/exam-blueprints/${b.id}`);
  });
  await step('Attempts list/stats/detail (ADM-ATT-01..03)', 'GET /admin/attempts · /stats · /:id', async () => {
    const r = paged(await list('/admin/attempts', { page: 1, pageSize: 20, sort: '-date' }), ['id', 'student', 'score'], 'AttemptRowDto');
    await get('/admin/attempts/stats', {});
    if (r[0]) await get(`/admin/attempts/${r[0].id}`);
  });
  await step('Assessment exports (attempts / blueprints / quiz overrides)', 'POST /admin/attempts/export · /admin/exam-blueprints/export · /admin/quiz-rules/export', async () => {
    for (const p of ['/admin/attempts/export', '/admin/exam-blueprints/export', '/admin/quiz-rules/export']) await download('POST', p, { body: { format: 'csv' } }).catch((e) => {
      if (e.body?.error?.details?.reason !== 'NO_ROWS') throw e;
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
module('packages', async () => {
  await step('Packages list (pageSize=100) + detail (ADM-PKG-01/02)', 'GET /admin/packages · /:id', async () => {
    const r = paged(await list('/admin/packages', { pageSize: 100 }), ['id', 'name', 'price', 'subjectIds', 'status', 'validityType'], 'AdminPackageDto');
    ctx.pkg = r.find((p) => p.status === 'active') ?? r[0];
    await get(`/admin/packages/${ctx.pkg.id}`);
  });
  await step('Package create → edit → duplicate → archive → restore → delete (ADM-PKG-03..08)', 'POST /admin/packages · PATCH · /duplicate · /archive · /restore · DELETE', async () => {
    const p = await post('/admin/packages', { name: L(`Verify pkg ${RUN}`), subjectIds: [ctx.lookups.subjects[0].id], price: 1000, validityType: 'days', validityValue: 7, status: 'draft' });
    onCleanup('package', () => del(`/admin/packages/${p.id}`).catch(() => {}));
    const e = await patch(`/admin/packages/${p.id}`, { price: 1500 });
    if (e.price !== 1500) throw new Error('edit not applied');
    const d = await post(`/admin/packages/${p.id}/duplicate`);
    await del(`/admin/packages/${d.id}`);
    await post(`/admin/packages/${p.id}/archive`, { reason: 'verify' });
    await post(`/admin/packages/${p.id}/restore`);
    await del(`/admin/packages/${p.id}`);
  });
  await step('Promotions list/stats/code tools/redemptions (ADM-PRM-01..08)', 'GET /admin/promotions · /stats · /check-code · /generate-code · /:id/redemptions', async () => {
    const r = paged(await list('/admin/promotions', { page: 1, pageSize: 20, sort: '-validFrom' }), ['id', 'code', 'type', 'discountType', 'discountValue', 'packages', 'used', 'phase', 'enabled', 'owner'], 'PromotionDto');
    await get('/admin/promotions/stats');
    has(await get('/admin/promotions/check-code', { code: `VERIFY${RUN}`.toUpperCase().slice(0, 16) }), ['available'], 'check-code');
    has(await get('/admin/promotions/generate-code', { prefix: 'VER' }), ['code'], 'generate-code');
    if (r[0]) await list(`/admin/promotions/${r[0].id}/redemptions`, { page: 1, pageSize: 10, sort: '-redeemedAt' });
    const used = r.find((x) => (x.used ?? 0) > 0);
    if (used) await download('POST', `/admin/promotions/${used.id}/redemptions/export`, { body: { format: 'csv' } }); // ADM-PRM-10 (RedemptionsModal export)
  });
  await step('Promotion create → edit → delete (ADM-PRM-03..05)', 'POST /admin/promotions · PATCH · DELETE', async () => {
    const code = `VF${RUN}`.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
    const p = await post('/admin/promotions', { code, type: 'promo', discountType: 'percent', discountValue: 10, packageIds: [ctx.pkg.id], usageLimit: 5, perUserLimit: 1, validFrom: isoDay(today), validTo: isoDay(daysAgo(-10)), enabled: false });
    onCleanup('promotion', () => del(`/admin/promotions/${p.id}`).catch(() => {}));
    await patch(`/admin/promotions/${p.id}`, { discountValue: 15 });
    has(await get('/admin/promotions/check-code', { code }), ['available'], 'check-code');
    await del(`/admin/promotions/${p.id}`);
  });
  await step('Subscriptions list + grant → extend → cancel (ADM-SBS-01..05)', 'GET /admin/subscriptions · POST /grant · /:id/extend · /:id/cancel', async () => {
    paged(await list('/admin/subscriptions', { page: 1, pageSize: 20, sort: 'endsAt' }), ['id', 'student', 'package', 'status', 'endsAt'], 'AdminSubscriptionDto');
    for (const f of [{ status: 'active' }, { packageId: ctx.pkg.id }, { sort: '-startedAt' }]) await list('/admin/subscriptions', { ...f, page: 1, pageSize: 5 });
    const sid = ctx.student?.id;
    if (!sid) throw new Error('needs student');
    const g = await post('/admin/subscriptions/grant', { studentId: sid, packageId: ctx.pkg.id, days: 3, reason: `verify ${RUN}` }, { idem: true });
    has(g, ['id', 'status', 'endsAt'], 'AdminSubscriptionDto');
    onCleanup('granted subscription rows', async () => sql(`DELETE FROM eduway_platform_subscriptions WHERE id = $1 AND grant_reason = $2`, [g.id, `verify ${RUN}`]));
    await post(`/admin/subscriptions/${g.id}/extend`, { days: 1, reason: 'verify' });
    const c = await post(`/admin/subscriptions/${g.id}/cancel`, { reason: 'verify', immediate: true });
    if (c.status !== 'cancelled') throw new Error(`cancel → ${c.status}`);
  });
  await step('Package / promotion / subscription exports', 'POST /admin/packages/export · /admin/promotions/export · /admin/subscriptions/export', async () => {
    for (const p of ['/admin/packages/export', '/admin/promotions/export', '/admin/subscriptions/export']) await download('POST', p, { body: { format: 'csv' } });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
module('payments', async () => {
  await step('Transactions list + summary + filters (ADM-PAY-01/02)', 'GET /admin/payments · /summary', async () => {
    const r = paged(await list('/admin/payments', { page: 1, pageSize: 20, sort: '-createdAt' }), ['id', 'ref', 'student', 'package', 'amount', 'gateway', 'status', 'createdAt'], 'TransactionRowDto');
    for (const f of [{ status: 'paid' }, { gateway: 'zaincash' }, { from: RANGE.from, to: RANGE.to }, { q: 'EDW' }]) await list('/admin/payments', { ...f, page: 1, pageSize: 5 });
    await get('/admin/payments/summary', { from: RANGE.from, to: RANGE.to });
    ctx.payment = r.find((p) => p.status === 'paid' && p.amount >= 5000);
  });
  await step('Payment detail + receipt json/pdf (ADM-PAY-03/04)', 'GET /admin/payments/:id · /receipt?format=json|pdf', async () => {
    if (!ctx.payment) throw new Error('no paid payment');
    has(await get(`/admin/payments/${ctx.payment.id}`), ['id', 'ref', 'student.governorate', 'package.listPrice', 'listPrice', 'timeline', 'webhooks', 'pendingRefund', 'canRefund', 'canViewReceipt', 'refundable'], 'TransactionDetailDto');
    has(await get(`/admin/payments/${ctx.payment.id}/receipt`, { format: 'json' }), ['receiptNumber'], 'ReceiptDto');
    const pdf = await download('GET', `/admin/payments/${ctx.payment.id}/receipt`, { query: { format: 'pdf' } });
    if (!/pdf/.test(pdf.type)) throw new Error(`receipt type ${pdf.type}`);
    // Language follows ?lang / Accept-Language: the Arabic PDF embeds Noto Sans Arabic (subset), the English one does not.
    const ar = await download('GET', `/admin/payments/${ctx.payment.id}/receipt`, { query: { format: 'pdf' }, headers: { 'Accept-Language': 'ar' } });
    if (!/NotoSansArabic/.test(ar.buf.toString('latin1'))) throw new Error('Arabic receipt does not embed Noto Sans Arabic');
    if (!/-ar\.pdf/.test(ar.disposition)) throw new Error(`Arabic receipt file name ${ar.disposition}`);
    const en = await download('GET', `/admin/payments/${ctx.payment.id}/receipt`, { query: { format: 'pdf', lang: 'en' }, headers: { 'Accept-Language': 'ar' } });
    if (/NotoSansArabic/.test(en.buf.toString('latin1'))) throw new Error('?lang=en ignored');
  });
  await step('Partial refund request with Idempotency-Key (replay) → reject (ADM-PAY-05, ADM-REF-04)', 'POST /admin/payments/:id/refunds · POST /admin/refunds/:id/reject', async () => {
    if (!ctx.payment) throw new Error('no paid payment');
    const key = randomUUID();
    const body = { kind: 'partial', amount: 1000, reason: `verify ${RUN}`, processNow: false };
    const a = await post(`/admin/payments/${ctx.payment.id}/refunds`, body, { idem: key });
    const b = await post(`/admin/payments/${ctx.payment.id}/refunds`, body, { idem: key });
    has(a, ['refund.id', 'refund.status', 'transaction.id'], 'refund result');
    if (a.refund.id !== b.refund.id) throw new Error('idempotent replay created a second refund');
    await expectError(400, () => post(`/admin/payments/${ctx.payment.id}/refunds`, body)); // Idempotency-Key required
    await post(`/admin/refunds/${a.refund.id}/reject`, { reason: 'verify cleanup' });
  });
  await step('Refunds list + summary (ADM-REF-01/02)', 'GET /admin/refunds · /summary', async () => {
    paged(await list('/admin/refunds', { page: 1, pageSize: 20, sort: '-requestedAt' }), ['id', 'amount', 'status', 'reason'], 'RefundDto');
    for (const sort of ['requestedAt', 'amount', '-status']) await list('/admin/refunds', { sort, page: 1, pageSize: 5 });
    await get('/admin/refunds/summary');
  });
  await step('Reconciliation overview + comparison + resolve (ADM-REC-01..04)', 'GET /admin/reconciliation · /comparison · POST /resolve', async () => {
    has(await get('/admin/reconciliation', { from: RANGE.from, to: RANGE.to }), ['summary.gross', 'summary.mismatches', 'chart', 'daily'], 'ReconciliationDto');
    const c = paged(await list('/admin/reconciliation/comparison', { from: RANGE.from, to: RANGE.to, page: 1, pageSize: 20, sort: '-day' }), ['day', 'gateway', 'systemAmount', 'state'], 'ReconciliationRow');
    for (const sort of ['gateway', 'difference', 'systemAmount']) await list('/admin/reconciliation/comparison', { sort, page: 1, pageSize: 5 });
    const mm = c.find((x) => x.state === 'mismatch');
    if (mm) {
      const prev = sql(`SELECT state, resolved_by, resolved_at, note FROM eduway_platform_reconciliation_records WHERE day = $1::date AND gateway = $2`, [mm.day, mm.gateway]).rows[0];
      onCleanup('reconciliation resolution', async () =>
        prev
          ? sql(`UPDATE eduway_platform_reconciliation_records SET state = $3, resolved_by = $4, resolved_at = $5, note = $6 WHERE day = $1::date AND gateway = $2`, [mm.day, mm.gateway, prev.state, prev.resolved_by, prev.resolved_at, prev.note])
          : sql(`DELETE FROM eduway_platform_reconciliation_records WHERE day = $1::date AND gateway = $2 AND note = $3`, [mm.day, mm.gateway, `verify ${RUN}`]),
      );
      const r = await post('/admin/reconciliation/resolve', { day: mm.day, gateway: mm.gateway, reason: `verify ${RUN}` });
      has(r, ['day', 'gateway', 'state', 'resolvedBy', 'note'], 'ReconciliationRow');
      if (r.day !== mm.day || r.state !== 'reconciled') throw new Error(`resolve → ${r.day} ${r.state}`);
    }
  });
  await step('Payment exports (transactions / refunds / reconciliation)', 'POST /admin/payments/export · /admin/refunds/export · /admin/reconciliation/export', async () => {
    await download('POST', '/admin/payments/export', { body: { format: 'csv', filters: { status: 'paid' } } });
    await download('POST', '/admin/refunds/export', { body: { format: 'csv' } });
    await download('POST', '/admin/reconciliation/export', { body: { format: 'csv', table: 'comparison', filters: { from: RANGE.from, to: RANGE.to } } });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
module('partners', async () => {
  await step('Schools list/stats/detail/students/progress/notes (ADM-SCH-01..09)', 'GET /admin/schools · /stats · /:id · /students · /incentive-progress · /notes', async () => {
    const r = paged(await list('/admin/schools', { page: 1, pageSize: 20, sort: '-verifiedPaidStudents' }), ['id', 'name', 'code', 'governorate', 'marketer', 'status', 'verifiedPaidStudents', 'tier', 'pendingSettlement'], 'SchoolDto');
    for (const f of [{ status: 'active' }, { sort: 'status' }, { governorateId: 'baghdad' }]) await list('/admin/schools', { ...f, page: 1, pageSize: 5 });
    await get('/admin/schools/stats');
    ctx.school = r[0];
    await get(`/admin/schools/${r[0].id}`);
    await list(`/admin/schools/${r[0].id}/students`, { page: 1, pageSize: 10, sort: '-createdAt' });
    await get(`/admin/schools/${r[0].id}/incentive-progress`, {});
    arr(await get(`/admin/schools/${r[0].id}/notes`), null, 'NoteDto');
  });
  await step('Marketers list/stats/detail/performance/progress (ADM-MKT-01..05, 13)', 'GET /admin/marketers · /stats · /:id · /performance · /incentive-progress', async () => {
    const r = paged(await list('/admin/marketers', { page: 1, pageSize: 20, sort: '-paidStudents' }), ['id', 'name', 'paidStudents', 'pendingReward', 'schoolsCount', 'status'], 'MarketerDto');
    await list('/admin/marketers', { status: 'active', sort: 'status', page: 1, pageSize: 5 });
    await get('/admin/marketers/stats');
    ctx.marketer = r[0];
    ctx.marketer2 = r[1];
    has(await get(`/admin/marketers/${r[0].id}`), ['id', 'schools'], 'MarketerDetailDto');
    await get(`/admin/marketers/${r[0].id}/performance`, { months: 6 });
    has(await get(`/admin/marketers/${r[0].id}/incentive-progress`, {}), ['period.key', 'paid', 'result', 'progressPct'], 'IncentiveProgressDto');
    // ADM-MKT-11: attributed students section (server paging, the UI's sort keys, search)
    for (const sort of ['-createdAt', 'name', '-lastActive']) paged(await list(`/admin/marketers/${r[0].id}/students`, { page: 1, pageSize: 10, sort }), ['id', 'name', 'mobile', 'school', 'package', 'subscriptionStatus', 'source', 'lastActive', 'createdAt'], 'AdminStudentRow');
    await list(`/admin/marketers/${r[0].id}/students`, { q: '77', page: 1, pageSize: 5 });
    arr(await get('/admin/milestone-sets'), ['id', 'items', 'status'], 'MilestoneSetDto');
  });
  await step('School create → note → assign marketer (double-attribution 409 → override) → delete', 'POST /admin/schools · /notes · PUT /:id/marketer · POST /admin/marketers/:id/schools · DELETE', async () => {
    const code = `VF${RUN}`.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
    const s = await post('/admin/schools', { name: L(`Verify school ${RUN}`), code, city: L('Baghdad'), governorateId: 'baghdad', contactName: 'Verify', contactMobile: '+9647700000000', contractStart: isoDay(today), contractEnd: isoDay(daysAgo(-365)), status: 'pending' });
    onCleanup('school', () => del(`/admin/schools/${s.id}`).catch(() => {}));
    await patch(`/admin/schools/${s.id}`, { contactName: 'Verify 2' });
    await post(`/admin/schools/${s.id}/notes`, { body: `verify ${RUN}` });
    onCleanup('school note', async () => sql(`DELETE FROM eduway_platform_entity_notes WHERE entity_id = $1`, [s.id]));
    const a = await put(`/admin/schools/${s.id}/marketer`, { marketerId: ctx.marketer.id });
    if ((a.school?.marketerId ?? a.marketerId) !== ctx.marketer.id) throw new Error('marketer not assigned');
    if (ctx.marketer2) {
      const e = await expectError(409, () => post(`/admin/marketers/${ctx.marketer2.id}/schools`, { schoolId: s.id }), 'DOUBLE_ATTRIBUTION');
      has(e.body.error.details, ['currentMarketer.id', 'currentMarketer.name'], 'DOUBLE_ATTRIBUTION details');
      await post(`/admin/marketers/${ctx.marketer2.id}/schools`, { schoolId: s.id, overrideReason: 'verify override' });
      await del(`/admin/marketers/${ctx.marketer2.id}/schools/${s.id}`);
    }
    await put(`/admin/schools/${s.id}/marketer`, { marketerId: null });
    await del(`/admin/schools/${s.id}`);
  });
  await step('Marketer create → edit → delete (ADM-MKT-06..08)', 'POST /admin/marketers · PATCH · DELETE', async () => {
    const m = await post('/admin/marketers', { name: L(`Verify marketer ${RUN}`), mobile: '+9647700000001', email: `verify.${RUN}@eduway.test`, governorateId: 'baghdad', status: 'inactive' });
    onCleanup('marketer', () => del(`/admin/marketers/${m.id}`).catch(() => {}));
    await patch(`/admin/marketers/${m.id}`, { status: 'inactive', mobile: '+9647700000002' });
    await del(`/admin/marketers/${m.id}`);
  });
  await step('Incentive rules list + preview (ADM-INC-01, -07)', 'GET /admin/incentive-rules · POST /preview', async () => {
    const rules = arr(await get('/admin/incentive-rules', { partnerType: 'school' }), ['id', 'tiers', 'status'], 'IncentiveRuleDto');
    await get(`/admin/incentive-rules/${rules[0].id}`);
    const p = await post('/admin/incentive-rules/preview', { qualificationThreshold: 10, tiers: [{ from: 10, to: 49, rewardType: 'per_student', amount: 1000 }, { from: 50, to: null, rewardType: 'per_student', amount: 2000 }], students: 60 });
    if (typeof p !== 'object') throw new Error('preview payload');
  });
  await step('Incentive rule draft clone → edit → delete', 'POST /admin/incentive-rules · PATCH · DELETE', async () => {
    const rules = await get('/admin/incentive-rules', { partnerType: 'school' });
    const active = rules.find((r) => r.status === 'active') ?? rules[0];
    const d = await post('/admin/incentive-rules', { partnerType: 'school', cloneFromId: active.id });
    onCleanup('incentive draft', () => del(`/admin/incentive-rules/${d.id}`).catch(() => {}));
    await patch(`/admin/incentive-rules/${d.id}`, { qualificationThreshold: (active.qualificationThreshold ?? 10) + 1 });
    await del(`/admin/incentive-rules/${d.id}`);
  });
  await step('Settlements list + generate → approve (ADM-SET-01..05)', 'GET /admin/settlements · POST /generate · /:id/approve', async () => {
    paged(await list('/admin/settlements', { partnerType: 'school', page: 1, pageSize: 20, sort: '-period' }), ['id', 'period', 'partner', 'amount', 'status'], 'SettlementDto');
    for (const sort of ['amount', 'qualifiedStudents', '-paidAt']) await list('/admin/settlements', { partnerType: 'marketer', sort, page: 1, pageSize: 5 });
    const before = new Set((await list('/admin/settlements', { partnerType: 'school', period: '2024', pageSize: 100 })).data.map((x) => x.id));
    const g = await post('/admin/settlements/generate', { partnerType: 'school', period: '2024', partnerIds: [ctx.school.id] }, { idem: true });
    has(g, ['created', 'updated', 'skipped'], 'GenerateResult');
    const after = (await list('/admin/settlements', { partnerType: 'school', period: '2024', pageSize: 100 })).data;
    const mine = after.filter((x) => !before.has(x.id));
    onCleanup('generated settlements', async () => {
      if (mine.length) sql(`DELETE FROM eduway_platform_settlements WHERE id = ANY($1::uuid[])`, [mine.map((x) => x.id)]);
    });
    const pending = mine.find((x) => x.status === 'pending');
    if (pending) {
      const a = await post(`/admin/settlements/${pending.id}/approve`);
      if (a.status !== 'approved') throw new Error(`approve → ${a.status}`);
    }
    await get(`/admin/settlements/${(mine[0] ?? after[0] ?? { id: null }).id ?? ''}`).catch((e) => {
      if (mine[0] || after[0]) throw e;
    });
  });
  await step('Incentive rule + settlement detail pages (ADM-INC-02, ADM-SET-02); unknown ids 404', 'GET /admin/incentive-rules/:id · GET /admin/settlements/:id', async () => {
    for (const partnerType of ['school', 'marketer']) {
      const rules = await get('/admin/incentive-rules', { partnerType });
      if (!rules[0]) continue;
      const r = has(await get(`/admin/incentive-rules/${rules[0].id}`), ['id', 'version', 'name.en', 'partnerType', 'qualificationThreshold', 'tiers', 'period', 'effectiveFrom', 'effectiveTo', 'status', 'createdBy', 'createdAt', 'activatedAt'], 'IncentiveRuleDto');
      if (r.partnerType !== partnerType) throw new Error(`rule partnerType ${r.partnerType} ≠ ${partnerType}`);
      if (r.tiers[0]) has(r.tiers[0], ['id', 'from', 'to', 'rewardType', 'amount', 'label'], 'IncentiveTier');
      const st = (await list('/admin/settlements', { partnerType, page: 1, pageSize: 1, sort: '-period' })).data[0];
      if (!st) continue;
      const d = has(await get(`/admin/settlements/${st.id}`), ['id', 'partnerType', 'partnerId', 'partner.name', 'period', 'ruleId', 'ruleVersion', 'qualifiedStudents', 'amount', 'currency', 'status', 'approvedAt', 'paidAt', 'paymentReference', 'note', 'createdAt', 'items'], 'SettlementDto+items');
      if (!Array.isArray(d.items)) throw new Error('settlement items not an array');
      if (d.items[0]) has(d.items[0], ['studentId', 'studentName.en', 'paymentId', 'ref', 'paidAt', 'amount'], 'SettlementItem');
    }
    await expectError(404, () => get('/admin/incentive-rules/00000000-0000-4000-8000-000000000000'));
    await expectError(404, () => get('/admin/settlements/00000000-0000-4000-8000-000000000000'));
  });
  await step('Partner exports (schools / marketers / settlements)', 'POST /admin/schools/export · /admin/marketers/export · /admin/settlements/export', async () => {
    await download('POST', '/admin/schools/export', { body: { format: 'csv' } });
    await download('POST', '/admin/marketers/export', { body: { format: 'xlsx' } });
    await download('POST', '/admin/settlements/export', { body: { format: 'csv', filters: { partnerType: 'school' } } });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
module('aitutor', async () => {
  await step('Usage dashboard + models (ADM-AI-01, -12)', 'GET /admin/ai/usage · /admin/ai/models', async () => {
    has(await get('/admin/ai/usage', { from: RANGE.from, to: RANGE.to }), ['kpis'], 'AiUsageDto');
    await get('/admin/ai/models');
  });
  await step('Settings save round-trip (ADM-AI-02/03)', 'GET /admin/ai/settings · PATCH', async () => {
    const s = await get('/admin/ai/settings');
    has(s, ['enabled', 'monthlyAllowance', 'provider', 'model', 'temperature', 'maxTokens', 'retrieval', 'blockedKeywords'], 'AiSettingsDto');
    const changed = await patch('/admin/ai/settings', { monthlyAllowance: s.monthlyAllowance + 1 });
    if (changed.monthlyAllowance !== s.monthlyAllowance + 1) throw new Error('patch not applied');
    await patch('/admin/ai/settings', { monthlyAllowance: s.monthlyAllowance });
    ctx.aiEnabled = s.enabled;
  });
  await step('Kill switch disable → enable (ADM-AI-04/05)', 'POST /admin/ai/settings/disable · /enable', async () => {
    const off = await post('/admin/ai/settings/disable', { reason: `verify ${RUN}` });
    if (off.enabled !== false) throw new Error('still enabled');
    const on = await post('/admin/ai/settings/enable');
    if (on.enabled !== true) throw new Error('not re-enabled');
    if (ctx.aiEnabled === false) await post('/admin/ai/settings/disable', { reason: 'restore original state' });
  });
  await step('Per-student AI disable → enable (ADM-AI-06/07)', 'PUT/DELETE /admin/ai/disabled-users/:id', async () => {
    await put(`/admin/ai/disabled-users/${ctx.student.id}`, { reason: 'verify' });
    await del(`/admin/ai/disabled-users/${ctx.student.id}`);
  });
  await step('Flags + flagged users (ADM-AI-08..11)', 'GET /admin/ai/flags · /:id · /admin/ai/flagged-users', async () => {
    const f = paged(await list('/admin/ai/flags', { page: 1, pageSize: 20, sort: '-createdAt' }), ['id', 'reason', 'severity', 'status'], 'AiFlagDto');
    for (const sort of ['severity', 'status']) await list('/admin/ai/flags', { sort, page: 1, pageSize: 5 });
    if (f[0]) has(await get(`/admin/ai/flags/${f[0].id}`), ['id', 'student', 'excerpt', 'transcript'], 'AiFlagDetailDto');
    paged(await list('/admin/ai/flagged-users', { page: 1, pageSize: 20, sort: '-flags' }), ['student', 'flags'], 'FlaggedUserDto');
  });
  await step('AI exports (flags / flagged users)', 'POST /admin/ai/flags/export · /admin/ai/flagged-users/export', async () => {
    for (const p of ['/admin/ai/flags/export', '/admin/ai/flagged-users/export']) await download('POST', p, { body: { format: 'csv' } }).catch((e) => {
      if (e.body?.error?.details?.reason !== 'NO_ROWS') throw e;
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
module('analytics', async () => {
  await step('Daily metrics page: all fields + aiBySubject, per platform (ADM-ANL-03)', 'GET /admin/analytics/daily?fields&platform', async () => {
    const fields = ['dau', 'wau', 'mau', 'watchMinutes', 'videoCompletionRate', 'quizAttempts', 'quizCompletionRate', 'examAttempts', 'aiQuestions', 'aiActiveUsers', 'aiTokens', 'aiCostUsd', 'errorRate', 'registrations', 'revenue'];
    for (const platform of [undefined, 'web', 'ios', 'android']) {
      const rows = arr(await get('/admin/analytics/daily', { from: RANGE.from, to: RANGE.to, platform, fields: [...fields, 'aiBySubject'] }), ['date', ...fields, 'aiBySubject'], 'DailyRow');
      if (rows.length < 28) throw new Error(`expected ~30 daily rows, got ${rows.length}`);
      if (rows.some((r) => fields.some((f) => typeof r[f] !== 'number'))) throw new Error('non-numeric daily metric');
    }
  });
  await step('Business analytics all grains + compare + platform (ADM-ANL-01)', 'GET /admin/analytics/business', async () => {
    for (const grain of ['day', 'week', 'month']) has(await get('/admin/analytics/business', { ...RANGE, grain, compare: true }), ['kpis', 'timeline'], 'BusinessAnalyticsDto');
    for (const platform of ['web', 'ios', 'android']) await get('/admin/analytics/business', { ...RANGE, platform });
  });
  await step('Learning analytics (+subject) (ADM-ANL-02)', 'GET /admin/analytics/learning', async () => {
    const d = await get('/admin/analytics/learning', { ...RANGE, compare: true });
    has(d, ['kpis.dau', 'kpis.dau.prevWau', 'kpis.dau.prevMau'], 'LearningAnalyticsDto');
    // The page passes subjectId to every chart endpoint (learning + topics); subject-scoped charts must narrow.
    const sid = ctx.lookups.subjects[0].id;
    const one = await get('/admin/analytics/learning', { ...RANGE, subjectId: sid });
    if (one.scoreBySubject.some((x) => x.subjectId !== sid)) throw new Error('scoreBySubject not filtered by subjectId');
    if (one.weakTopics.some((x) => x.subject.id !== sid)) throw new Error('weakTopics not filtered by subjectId');
    const allQ = d.questionAccuracy.reduce((a, b) => a + b.questions, 0);
    const subQ = one.questionAccuracy.reduce((a, b) => a + b.questions, 0);
    if (subQ > allQ) throw new Error(`questionAccuracy grew with a subject filter (${subQ} > ${allQ})`);
    arr(await get('/admin/analytics/topics', { ...RANGE, subjectId: sid, sort: 'accuracy' }), ['topicId', 'subject'], 'TopicSignalDto');
  });
  await step('Topics + platform split (ADM-ANL-04/05)', 'GET /admin/analytics/topics · /platform-split', async () => {
    arr(await get('/admin/analytics/topics', { ...RANGE, sort: 'accuracy', limit: 50 }), ['topicId', 'accuracy', 'subject'], 'TopicSignalDto');
    const ps = arr(await get('/admin/analytics/platform-split', RANGE), ['platform'], 'PlatformSplitRow');
    const p = new Set(ps.map((x) => x.platform));
    for (const k of ['web', 'ios', 'android']) if (!p.has(k)) throw new Error(`platform split missing ${k}`);
  });
  await step('Exports: preview → generate csv + xlsx → history → download (ADM-EXP-01..05)', 'GET /admin/exports/preview · POST /admin/exports · GET /admin/exports · /:id/download · POST /history/export', async () => {
    const from = isoDay(daysAgo(365));
    const to = isoDay(today);
    has(await get('/admin/exports/preview', { report: 'students', from, to }), ['rows'], 'export preview');
    const created = [];
    for (const format of ['csv', 'xlsx']) {
      let rec = await post('/admin/exports', { report: 'students', from, to, format }, { idem: true });
      has(rec, ['id', 'report', 'format', 'status'], 'ExportRecordDto');
      for (let i = 0; i < 20 && rec.status !== 'ready' && rec.status !== 'failed'; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        rec = (await list('/admin/exports', { page: 1, pageSize: 20 })).data.find((x) => x.id === rec.id) ?? rec;
      }
      if (rec.status === 'failed') throw new Error(`export ${format} failed`);
      const f = await download('GET', `/admin/exports/${rec.id}/download`);
      if (f.size < 20) throw new Error(`${format} download empty`);
      created.push(rec.id);
    }
    onCleanup('export records', async () => sql(`DELETE FROM eduway_platform_exports_log WHERE id = ANY($1::uuid[])`, [created]));
    paged(await list('/admin/exports', { page: 1, pageSize: 20, report: 'students' }), ['id', 'report', 'format', 'rows', 'by', 'status'], 'ExportRecordDto');
    await download('POST', '/admin/exports/history/export', { body: { format: 'csv' } });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
module('notifications', async () => {
  await step('Templates list/variables/detail (ADM-NTT-01..03)', 'GET /admin/notification-templates · /variables · /:id', async () => {
    const r = await list('/admin/notification-templates', { page: 1, pageSize: 100, sort: 'name' });
    paged(r, ['id', 'name', 'type', 'channel', 'active', 'subject', 'body', 'variables'], 'NotificationTemplateDto');
    if (!r.meta.matrix) throw new Error('meta.matrix missing');
    for (const sort of ['type', 'channel', '-updatedAt']) await list('/admin/notification-templates', { sort, page: 1, pageSize: 5 });
    await get('/admin/notification-templates/variables');
    ctx.inAppTemplate = r.data.find((t) => t.channel === 'in_app' && t.active);
    await get(`/admin/notification-templates/${r.data[0].id}`);
  });
  await step('Template create → edit → duplicate → bulk deactivate → delete (ADM-NTT-04..08)', 'POST /admin/notification-templates · PATCH · /duplicate · /bulk · DELETE', async () => {
    const t = await post('/admin/notification-templates', { name: `Verify ${RUN}`, type: 'support_message', channel: 'in_app', active: true, subject: L('Verify subject'), body: L('Hello {{name}}, verification message.') });
    onCleanup('template', () => del(`/admin/notification-templates/${t.id}`).catch(() => {}));
    await patch(`/admin/notification-templates/${t.id}`, { body: L('Hello {{name}}, verification message 2.') });
    const d = await post(`/admin/notification-templates/${t.id}/duplicate`);
    await post('/admin/notification-templates/bulk', { ids: [d.id], action: 'deactivate' });
    await del(`/admin/notification-templates/${d.id}`);
    ctx.verifyTemplate = t;
  });
  await step('Campaign audience preview → send in-app → cancel/cleanup (ADM-CMP-01..05)', 'GET /admin/campaigns · POST /audience-preview · POST /admin/campaigns · /:id/cancel · GET /:id', async () => {
    paged(await list('/admin/campaigns', { page: 1, pageSize: 20, sort: '-createdAt' }), ['id', 'name', 'status', 'channel', 'audienceCount'], 'CampaignDto');
    const filters = { schoolId: ctx.school?.id, subscriptionStatus: 'active' };
    const pv = await post('/admin/campaigns/audience-preview', { filters, channel: 'in_app' });
    has(pv, ['matched', 'reachable', 'total', 'excluded.optedOut'], 'AudiencePreviewDto');
    const tpl = ctx.verifyTemplate ?? ctx.inAppTemplate;
    if (!pv.reachable) {
      await expectError(422, () => post('/admin/campaigns', { name: `Verify ${RUN}`, channel: 'in_app', templateId: tpl.id, filters }, { idem: true }), 'NO_RECIPIENTS');
      return;
    }
    const c = await post('/admin/campaigns', { name: `Verify ${RUN}`, channel: 'in_app', templateId: tpl.id, filters }, { idem: true });
    has(c, ['id', 'status', 'audienceCount'], 'CampaignDto');
    onCleanup('campaign + deliveries + in-app notifications', async () => {
      sql(`DELETE FROM eduway_platform_notifications WHERE campaign_id = $1`, [c.id]);
      sql(`DELETE FROM eduway_platform_notification_deliveries WHERE campaign_id = $1`, [c.id]);
      sql(`DELETE FROM eduway_platform_campaigns WHERE id = $1`, [c.id]);
    });
    await get(`/admin/campaigns/${c.id}`);
    const scheduled = await post('/admin/campaigns', { name: `Verify sched ${RUN}`, channel: 'in_app', templateId: tpl.id, filters, sendAt: new Date(Date.now() + 86400000).toISOString() }, { idem: true });
    onCleanup('scheduled campaign', async () => sql(`DELETE FROM eduway_platform_campaigns WHERE id = $1`, [scheduled.id]));
    const x = await post(`/admin/campaigns/${scheduled.id}/cancel`);
    if (x.status !== 'draft' || x.scheduledAt) throw new Error(`cancel → ${x.status} (contract: back to draft, scheduledAt null)`);
  });
  await step('Campaign detail page: campaign + its deliveries (ADM-CMP-02, ADM-DLV-01 ?campaignId); unknown id 404', 'GET /admin/campaigns/:id · GET /admin/deliveries?campaignId', async () => {
    const c0 = (await list('/admin/campaigns', { page: 1, pageSize: 1, sort: '-createdAt' })).data[0];
    if (c0) {
      const c = has(await get(`/admin/campaigns/${c0.id}`), ['id', 'name', 'channel', 'templateId', 'template', 'filters', 'audienceCount', 'status', 'scheduledAt', 'sentAt', 'stats.queued', 'stats.sent', 'stats.delivered', 'stats.failed', 'createdBy', 'createdAt'], 'CampaignDto');
      const d = await list('/admin/deliveries', { campaignId: c.id, page: 1, pageSize: 10, sort: '-createdAt' });
      paged(d, ['id', 'recipient', 'channel', 'provider', 'status', 'attempts', 'createdAt'], 'DeliveryDto');
      if (d.data.some((x) => x.campaignId && x.campaignId !== c.id)) throw new Error('campaignId filter not applied');
      await list('/admin/deliveries', { campaignId: c.id, status: 'failed', page: 1, pageSize: 10, sort: '-createdAt' });
    }
    await expectError(404, () => get('/admin/campaigns/00000000-0000-4000-8000-000000000000'));
  });
  await step('Delivery log + stats (ADM-DLV-01/02)', 'GET /admin/deliveries · /stats', async () => {
    paged(await list('/admin/deliveries', { page: 1, pageSize: 20, sort: '-createdAt' }), ['id', 'channel', 'status'], 'DeliveryDto');
    for (const f of [{ channel: 'in_app' }, { status: 'failed' }]) await list('/admin/deliveries', { ...f, page: 1, pageSize: 5 });
    const all = has(await get('/admin/deliveries/stats', {}), ['total', 'delivered', 'failed', 'queued', 'rate', 'byProvider'], 'DeliveryStatsDto');
    // The page sends its filters (channel, provider, from, q; not status) to the KPIs.
    const from = new Date(Date.now() - 7 * 86400000).toISOString();
    const f = await get('/admin/deliveries/stats', { channel: 'in_app', from });
    if (f.total > all.total || f.byProvider.some((p) => p.channel !== 'in_app')) throw new Error('stats ignore channel/from filters');
    const prov = all.byProvider[0]?.provider;
    if (prov) {
      const p = await get('/admin/deliveries/stats', { provider: prov, q: 'zz-no-match-zz' });
      if (p.total !== 0) throw new Error('stats ignore q filter');
    }
  });
  await step('Notification exports (templates / campaigns / deliveries)', 'POST /admin/notification-templates/export · /admin/campaigns/export · /admin/deliveries/export', async () => {
    for (const p of ['/admin/notification-templates/export', '/admin/campaigns/export', '/admin/deliveries/export']) await download('POST', p, { body: { format: 'csv' } });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
module('settings', async () => {
  const masked = (v) => typeof v === 'string' && /^\*+|•{3,}|\*{3,}/.test(v);
  for (const section of ['general', 'otp', 'app', 'support', 'payments', 'learning', 'marketing', 'security']) {
    await step(`Settings "${section}" GET → PUT round-trip (ADM-STG-01/02)`, `GET/PUT /admin/settings/${section}`, async () => {
      const s = await get(`/admin/settings/${section}`);
      if (!s || typeof s !== 'object') throw new Error('empty section');
      const body = JSON.parse(JSON.stringify(s, (k, v) => (masked(v) ? undefined : v)));
      delete body.updatedAt;
      delete body.updatedBy;
      const back = await put(`/admin/settings/${section}`, body);
      if (!back || typeof back !== 'object') throw new Error('PUT returned nothing');
    });
  }
  await step('App maintenance ON → public app-config reflects → OFF (ADM-STG-02 app, PUB-01)', 'PUT /admin/settings/app · GET /public/app-config', async () => {
    const s = await get('/admin/settings/app');
    const was = !!s.maintenanceMode;
    try {
      await put('/admin/settings/app', { maintenanceMode: true, maintenanceMessage: L('Verify maintenance'), maintenanceAppliesTo: ['ios'] });
      const cfg = await get('/public/app-config', undefined, { token: null, headers: { 'X-Client-Platform': 'ios' } });
      const m = cfg.maintenance ?? cfg;
      if (!(m.enabled ?? m.maintenanceMode ?? m.active)) throw new Error(`public config does not show maintenance: ${JSON.stringify(m).slice(0, 200)}`);
    } finally {
      await put('/admin/settings/app', { maintenanceMode: was, maintenanceMessage: s.maintenanceMessage, maintenanceAppliesTo: s.maintenanceAppliesTo });
    }
    const after = await get('/admin/settings/app');
    if (!!after.maintenanceMode !== was) throw new Error('maintenance not restored');
  });
  await step('Feature flags list → create → toggle → delete (ADM-FLG-01..04)', 'GET /admin/feature-flags · POST · PATCH · DELETE', async () => {
    const r = await list('/admin/feature-flags', { page: 1, pageSize: 100 });
    if (r.data[0]) has(r.data[0], ['id', 'key', 'name', 'environment', 'enabled'], 'FeatureFlagDto');
    const f = await post('/admin/feature-flags', { key: `verify_${RUN}`.replace(/[^a-z0-9_]/g, '_'), name: L('Verify flag'), description: L('temp'), environment: 'staging', enabled: false });
    onCleanup('feature flag', () => del(`/admin/feature-flags/${f.id}`).catch(() => {}));
    const t = await patch(`/admin/feature-flags/${f.id}`, { enabled: true });
    if (!t.enabled) throw new Error('toggle failed');
    await del(`/admin/feature-flags/${f.id}`);
  });
  await step('Legal: versions/stats/acceptances → create draft → edit → delete (ADM-LGL-01..07)', 'GET /admin/legal/:doc/versions · /stats · /versions/:id/acceptances · POST draft · PATCH · DELETE', async () => {
    for (const doc of ['terms', 'privacy']) {
      const v = arr(await get(`/admin/legal/${doc}/versions`), ['id', 'version', 'status'], 'LegalVersionDto');
      await get(`/admin/legal/${doc}/stats`);
      const pub = v.find((x) => x.status === 'published');
      if (pub) await list(`/admin/legal/versions/${pub.id}/acceptances`, { page: 1, pageSize: 10 });
    }
    const terms = await get('/admin/legal/terms/versions');
    const existingDraft = terms.find((x) => x.status === 'draft');
    if (existingDraft) throw new Error(`a terms draft already exists (${existingDraft.version}) — not touching it`);
    const pub = terms.find((x) => x.status === 'published');
    const d = await post('/admin/legal/terms/versions', { cloneFromId: pub?.id });
    onCleanup('legal draft', () => del(`/admin/legal/versions/${d.id}`).catch(() => {}));
    await patch(`/admin/legal/versions/${d.id}`, { changeSummary: L('verify') }).catch(async () => patch(`/admin/legal/versions/${d.id}`, { summary: 'verify' }));
    // Publishing would retire the live version for every student; verify the guard path instead of the real publish.
    await del(`/admin/legal/versions/${d.id}`);
  });
  await step('CMS testimonials + FAQ CRUD + order (ADM-CMS-01..09)', 'GET/POST/PATCH/DELETE /admin/cms/testimonials · /admin/cms/faq · PUT /admin/cms/order', async () => {
    const ts = arr(await get('/admin/cms/testimonials'), ['id', 'name', 'quote', 'rating', 'placements', 'active'], 'TestimonialDto');
    const fq = arr(await get('/admin/cms/faq'), ['id', 'q', 'a', 'order', 'active', 'placements'], 'FaqDto');
    const f = await post('/admin/cms/faq', { q: L(`Verify ${RUN}?`), a: L('Yes.'), placements: ['contact'], order: 999, active: false });
    onCleanup('faq', () => del(`/admin/cms/faq/${f.id}`).catch(() => {}));
    await patch(`/admin/cms/faq/${f.id}`, { a: L('Yes!') });
    await put('/admin/cms/order', { kind: 'faq', ids: [...fq.map((x) => x.id), f.id] });
    await del(`/admin/cms/faq/${f.id}`);
    if (ts.length) await put('/admin/cms/order', { kind: 'testimonials', ids: ts.map((x) => x.id) });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
module('security', async () => {
  await step('Roles matrix + permission catalog (ADM-ROL-01/02/07)', 'GET /admin/roles?pageSize=100 · /:id · /admin/permissions/catalog', async () => {
    const r = await list('/admin/roles', { pageSize: 100 });
    paged(r, ['id', 'key', 'name', 'system', 'permissions.content.view', 'assignedAdmins', 'assignedCount', 'grantedCount'], 'RoleDto');
    await get(`/admin/roles/${r.data[0].id}`);
    has(await get('/admin/permissions/catalog'), ['modules', 'actions'], 'PermissionCatalogDto');
  });
  await step('Admin users list + export (ADM-ADM-01/08)', 'GET /admin/admins · POST /admin/admins/export', async () => {
    paged(await list('/admin/admins', { page: 1, pageSize: 20, sort: '-lastLogin' }), ['id', 'name', 'email', 'role', 'status', 'mfaEnabled'], 'AdminUserDto');
    for (const sort of ['name', 'status']) await list('/admin/admins', { sort, page: 1, pageSize: 5 });
    await download('POST', '/admin/admins/export', { body: { format: 'csv' } });
  });
  await step('Audit logs list + facets + detail with diff (ADM-AUD-01..03)', 'GET /admin/audit-logs · /facets · /:id', async () => {
    const r = paged(await list('/admin/audit-logs', { page: 1, pageSize: 50, sort: '-at' }), ['id', 'at', 'actor', 'action', 'entity'], 'AuditLogDto');
    for (const f of [{ entity: 'lesson' }, { sort: 'action' }, { from: RANGE.from, to: RANGE.to }]) await list('/admin/audit-logs', { ...f, page: 1, pageSize: 5 });
    has(await get('/admin/audit-logs/facets', {}), ['actors', 'entities', 'actions'], 'facets');
    const withDiff = r.find((x) => x.before || x.after || x.diff || x.hasDiff) ?? r[0];
    const d = await get(`/admin/audit-logs/${withDiff.id}`);
    if (!('before' in d || 'after' in d || 'diff' in d || 'changes' in d)) throw new Error('audit detail has no diff fields');
    await download('POST', '/admin/audit-logs/export', { body: { format: 'csv' } });
  });
  await step('Admin sessions list + export (ADM-SES-01/04)', 'GET /admin/admin-sessions · POST /export', async () => {
    paged(await list('/admin/admin-sessions', { page: 1, pageSize: 20, sort: '-lastActive' }), ['id', 'admin', 'browser', 'location', 'deviceType', 'abroad'], 'AdminSessionRowDto');
    await download('POST', '/admin/admin-sessions/export', { body: { format: 'csv' } });
  });
  await step('Security alerts list → resolve → reopen (ADM-SEC-01..04)', 'GET /admin/security-alerts · POST /:id/resolve · /:id/reopen', async () => {
    const r = paged(await list('/admin/security-alerts', { page: 1, pageSize: 20 }), ['id', 'kind', 'severity', 'subject', 'detail', 'status', 'resolvedBy'], 'SecurityAlertDto');
    const open = r.find((x) => x.status === 'open');
    if (open) {
      const x = await post(`/admin/security-alerts/${open.id}/resolve`, { reason: `verify ${RUN}` });
      if (x.status !== 'resolved') throw new Error(`resolve → ${x.status}`);
      await post(`/admin/security-alerts/${open.id}/reopen`);
    }
  });
  await step('RBAC: temp role + temp admin → 403 on forbidden module, 200 on allowed → cleanup', 'POST /admin/roles · POST /admin/admins/invite · POST /auth/admin/accept-invite · 403 check · deactivate · DELETE /admin/roles/:id', async () => {
    const key = `verify_${RUN}`.replace(/[^a-z0-9_]/g, '_');
    const role = await post('/admin/roles', { key, name: L(`Verify ${RUN}`), permissions: { dashboard: { view: true }, content: { view: true } } });
    onCleanup('temp role', async () => del(`/admin/roles/${role.id}`, { query: { confirmKey: role.key } }));
    await put(`/admin/roles/${role.id}`, { key, name: L(`Verify ${RUN}`), permissions: { dashboard: { view: true }, content: { view: true } } });
    const email = `verify.rbac.${RUN}@eduway.test`;
    const password = `Vf!${RUN}Aa9${RUN.slice(0, 3).toUpperCase()}`;
    const inv = await post('/admin/admins/invite', { name: { en: 'Verify RBAC' }, email, roleId: role.id });
    has(inv, ['id', 'status'], 'AdminUserDto');
    onCleanup('temp admin user', async () => {
      sql(`DELETE FROM eduway_platform_users WHERE id = $1 AND email = $2`, [inv.id, email]);
    });
    let token = null;
    const log = process.env.SERVER_LOG;
    if (log && existsSync(log)) {
      let m = null;
      for (let i = 0; i < 20 && !m; i++) {
        await new Promise((r) => setTimeout(r, 500));
        const txt = readFileSync(log, 'utf8');
        const at = txt.lastIndexOf(email);
        if (at >= 0) m = /accept-invite\?token=([A-Za-z0-9%_\-.~]+)/.exec(txt.slice(at, at + 2000));
      }
      if (m) {
        const info = await get(`/auth/admin/invite/${m[1]}`, undefined, { token: null });
        if (info.email !== email) throw new Error('invite token in log belongs to another admin');
        const acc = await post('/auth/admin/accept-invite', { token: decodeURIComponent(m[1]), password }, { token: null });
        token = acc.tokens.accessToken;
      }
    }
    if (!token) {
      tsx(['scripts/create-admin.ts', '--email', email, '--name', 'Verify RBAC', '--role', key, '--password', password], { stdio: 'ignore' });
      const lr = await post('/auth/admin/login', { email, password }, { token: null });
      token = lr.tokens.accessToken;
    }
    const me = await get('/auth/me', undefined, { token });
    if (me.permissions.includes('payments.view')) throw new Error('restricted admin has payments.view');
    await get('/admin/subjects', undefined, { token });
    await get('/admin/system/health', undefined, { token });
    for (const p of ['/admin/payments', '/admin/students', '/admin/roles', '/admin/settings/general']) await expectError(403, () => get(p, undefined, { token }));
    await expectError(403, () => post('/admin/subjects', { name: L('x'), slug: 'x-forbidden', color: '#000000' }, { token }));
    const dash = await get('/admin/dashboard', RANGE, { token });
    if (dash.recentPayments !== null || dash.topSchools !== null) throw new Error('dashboard leaks sections without permission');
    await post(`/admin/admins/${inv.id}/deactivate`, { reason: 'verify cleanup' });
    await expectError(401, () => get('/auth/me', undefined, { token }));
  });
});

/**
 * `legal-publish` (opt-in: --legal-publish or --only=legal-publish). Terms/privacy are the only legal document types, so
 * publishing always replaces the live version. To keep the student-facing text unchanged:
 *   1. a temporary student registers and accepts the current terms + privacy;
 *   2. an identical clone of the live terms is published WITH re-acceptance: the student gets pendingLegal, student
 *      routes answer 403 LEGAL_ACCEPTANCE_REQUIRED, AUTH-08 clears it and the acceptance shows up in ADM-LGL-07;
 *   3. a second identical clone is published WITHOUT re-acceptance (seconds later, in a finally block): nobody is
 *      prompted, PUB-11 serves the original text, and that identical version stays current;
 *   4. the temporary student is deleted.
 */
module('legal-publish', async () => {
  const phone = `+96477${String(randomInt(10_000_000, 99_999_999))}`;
  const dev = { 'X-Client-Platform': 'web', 'X-Device-Id': `verify-legal-${RUN}` };
  const st = (o = {}) => ({ token: ctx.legalStudent, headers: dev, ...o });
  let original;
  await step('Snapshot live terms + register a temporary student accepting them (PUB-11, AUTH-01/02)', 'GET /legal/:doc · POST /auth/send-otp · /auth/verify-otp', async () => {
    original = { terms: await get('/legal/terms', undefined, { token: null }), privacy: await get('/legal/privacy', undefined, { token: null }) };
    const drafts = (await get('/admin/legal/terms/versions')).filter((x) => x.status === 'draft');
    if (drafts.length) throw new Error(`a terms draft already exists (${drafts[0].version}); not touching it`);
    const gov = (await get('/public/governorates', undefined, { token: null }))[0].id;
    const s = await post('/auth/send-otp', { phone, purpose: 'register', channel: 'sms' }, { token: null, headers: dev });
    onCleanup('temporary legal student', async () => {
      sql(`DELETE FROM eduway_platform_users WHERE phone = $1 AND kind = 'student'`, [phone]);
      sql(`DELETE FROM eduway_platform_otp_codes WHERE phone = $1`, [phone]);
    });
    const { rows } = sql(`SELECT code_hash FROM eduway_platform_otp_codes WHERE phone = $1 AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1`, [phone]);
    const secret = ENV.JWT_REFRESH_SECRET;
    let code = null;
    for (let n = 0; n < 10 ** s.codeLength && !code; n++) {
      const c = String(n).padStart(s.codeLength, '0');
      if (createHmac('sha256', secret).update(`otp:${phone}:${c}`).digest('hex') === rows[0]?.code_hash) code = c;
    }
    if (!code) throw new Error('OTP not recoverable');
    const acceptedLegal = [{ doc: 'terms', version: original.terms.version }, { doc: 'privacy', version: original.privacy.version }];
    const v = await post('/auth/verify-otp', { phone, code, purpose: 'register', deviceId: dev['X-Device-Id'], platform: 'web', deviceName: 'verify-admin-flows legal', registration: { name: 'Verify Legal', governorateId: gov, acceptTerms: true, acceptedLegal, language: 'en' } }, { token: null, headers: dev });
    ctx.legalStudent = v.accessToken;
    if (v.me.user.pendingLegal?.length) throw new Error('fresh student already has pendingLegal');
  });
  await step('Publish an identical terms clone WITH re-acceptance → pendingLegal → 403 → accept → cleared (ADM-LGL-02/04/07, AUTH-08)', 'POST /admin/legal/terms/versions · /versions/:id/publish · GET /auth/me · POST /auth/accept-legal', async () => {
    if (!ctx.legalStudent) throw new Error('needs student');
    const pub = (await get('/admin/legal/terms/versions')).find((x) => x.status === 'published');
    const a = await post('/admin/legal/terms/versions', { cloneFromId: pub.id });
    await patch(`/admin/legal/versions/${a.id}`, { changeSummary: L('Re-published unchanged (verification)') });
    let published = false;
    try {
      const r = await post(`/admin/legal/versions/${a.id}/publish`, { requireReacceptance: true });
      published = true;
      if (r.published.id !== a.id || r.retired?.id !== pub.id) throw new Error('publish did not retire the previous version');
      const me = await get('/auth/me', undefined, st());
      const pending = me.user?.pendingLegal ?? me.pendingLegal;
      if (!pending?.some((x) => x.doc === 'terms' && x.version === a.version)) throw new Error(`pendingLegal missing terms ${a.version}: ${JSON.stringify(pending)}`);
      await expectError(403, () => get('/progress/dashboard', undefined, st()), 'LEGAL_ACCEPTANCE_REQUIRED');
      const acc = await post('/auth/accept-legal', { documents: [{ doc: 'terms', version: a.version }] }, st());
      if (acc.pendingLegal.length) throw new Error(`still pending: ${JSON.stringify(acc.pendingLegal)}`);
      await get('/progress/dashboard', undefined, st());
      const rows = paged(await list(`/admin/legal/versions/${a.id}/acceptances`, { page: 1, pageSize: 20 }), ['student', 'acceptedAt', 'platform'], 'acceptance');
      if (!rows.some((x) => x.student.mobile === phone)) throw new Error('acceptance not listed');
    } finally {
      if (!published) await del(`/admin/legal/versions/${a.id}`).catch(() => {});
      else {
        // Runs whatever happened above: never leave a re-acceptance requirement live for real students.
        const cur = (await get('/admin/legal/terms/versions')).find((x) => x.status === 'published');
        const b = await post('/admin/legal/terms/versions', { cloneFromId: cur.id });
        await patch(`/admin/legal/versions/${b.id}`, { changeSummary: L('Re-published unchanged (verification)') });
        await post(`/admin/legal/versions/${b.id}/publish`, { requireReacceptance: false });
        ctx.legalFinal = b;
      }
    }
  });
  await step('Identical version stays current without a prompt; text unchanged (PUB-11, ADM-LGL-06)', 'GET /legal/terms · /admin/legal/terms/stats · GET /auth/me', async () => {
    if (!ctx.legalFinal) throw new Error('final publish missing');
    const now = await get('/legal/terms', undefined, { token: null });
    if (now.version !== ctx.legalFinal.version) throw new Error(`current terms ${now.version}, expected ${ctx.legalFinal.version}`);
    const text = (d) => JSON.stringify([d.title, d.subtitle, d.intro, d.sections, d.contactEmail]);
    if (!now.sections?.length || text(now) !== text(original.terms)) throw new Error('terms text changed');
    const priv = await get('/legal/privacy', undefined, { token: null });
    if (priv.version !== original.privacy.version) throw new Error('privacy changed');
    const stats = await get('/admin/legal/terms/stats');
    if (stats.currentVersion !== ctx.legalFinal.version) throw new Error('stats current version');
    const me = await get('/auth/me', undefined, st());
    if ((me.user?.pendingLegal ?? me.pendingLegal ?? []).length) throw new Error('prompt after the no-reacceptance publish');
    const live = sql(`SELECT count(*)::int AS n FROM eduway_platform_legal_documents WHERE status = 'published' AND requires_acceptance AND doc_type = 'terms' AND id = $1`, [ctx.legalFinal.id]).rows[0];
    if (live?.n) throw new Error('live terms still require re-acceptance');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
(async () => {
  const purgeOnly = process.argv.find((a) => a.startsWith('--purge-only='));
  if (purgeOnly) {
    console.log(JSON.stringify(purgeRun(purgeOnly.slice('--purge-only='.length))));
    return;
  }
  console.log(AS_JSON ? '' : `EDUWAY admin live verification → ${API}  (run ${RUN})`);
  for (const m of modules) {
    if (ONLY.length && m.name !== 'auth' && !ONLY.includes(m.name)) continue;
    if (m.name === 'legal-publish' && !ONLY.includes(m.name) && !process.argv.includes('--legal-publish')) continue;
    currentModule = m.name;
    if (!AS_JSON) console.log(`\n▶ ${m.name}`);
    try {
      await m.fn();
    } catch (e) {
      results.push({ module: m.name, step: '(module crashed)', ok: false, error: e.message });
      console.log(`  ❌ module crashed — ${e.stack}`);
    }
  }
  currentModule = 'cleanup';
  if (!AS_JSON) console.log('\n▶ cleanup');
  await runCleanups();
  await step('Purge run artefacts the API only soft-deletes', 'SQL (prefix + run-id scoped)', async () => {
    const r = purgeRun(RUN);
    if (!AS_JSON) console.log(`     purged ${JSON.stringify(r)}`);
    const errs = Object.entries(r).filter(([, v]) => typeof v === 'string');
    if (errs.length) throw new Error(errs.map(([k, v]) => `${k}: ${v}`).join('; '));
  });
  const bad = results.filter((r) => !r.ok);
  if (AS_JSON) console.log(JSON.stringify({ api: API, run: RUN, passed: results.length - bad.length, failed: bad.length, results }, null, 2));
  else {
    console.log(`\n${results.length - bad.length}/${results.length} steps passed`);
    for (const b of bad) console.log(`  ❌ [${b.module}] ${b.step}: ${b.error}`);
  }
  process.exit(bad.length ? 1 : 0);
})();
