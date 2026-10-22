#!/usr/bin/env node
/**
 * load-test — gentle load/performance test of the EDUWAY API hot read paths (autocannon).
 *
 * Runs against an ALREADY RUNNING server (never starts one). Default base: http://localhost:4100/api/v1.
 *
 *   cd scripts && npm install          # once (autocannon devDependency)
 *   node scripts/load-test.mjs [--base URL] [--connections 10] [--requests 40] [--duration 8]
 *                              [--ramp 5,15,25] [--stage 15] [--phase all|probe|endpoints|mixed|refresh]
 *                              [--only <substring>] [--out results.json] [--no-spoof]
 *
 * Phases
 *   endpoints  each endpoint alone: --requests N (default 40) at --connections virtual users; every request is
 *              awaited, so slow endpoints are measured instead of being cut off at a time limit
 *   (mixed stages are time-boxed: requests still in flight when a stage ends are not counted)
 *   mixed      realistic mix of all endpoints, ramped through --ramp connection stages of --stage s each
 *   probe      serial baseline: 5 sequential requests per endpoint (no concurrency, pure per-request cost)
 *   refresh    sequential POST /auth/refresh rotation chain for --duration s (tokens are single-use, so one chain)
 *
 * Auth: demo student via OTP dev bypass code (non-production only) and the seeded super admin. Credentials are read
 * from server/.env (SEED_SUPER_ADMIN_PASSWORD, SEED_SUPER_ADMIN_EMAIL) or the environment and are never printed.
 * Both sessions are logged out at the end (no test data is left behind; the test only reads).
 *
 * Rate limiting: the API has a per-IP global limiter (600 req/min). All load comes from one machine, so by default
 * every request carries a synthetic X-Forwarded-For (10.250.x.y pool) — the server trusts one proxy hop — to model
 * many distinct clients. Pass --no-spoof to measure with the limiter in effect.
 *
 * Keep it gentle: the shared Supabase session pooler allows ~15 connections; keep connections <= 30.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import autocannon from 'autocannon';

const here = path.dirname(fileURLToPath(import.meta.url));

// ---------- args / env ----------
const argv = process.argv.slice(2);
const flag = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
};
function loadDotEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return out;
}
const dotenv = loadDotEnv(path.join(here, '..', 'server', '.env'));
const envv = (k, d) => process.env[k] ?? dotenv[k] ?? d;

const BASE = String(flag('base', envv('LOAD_BASE_URL', `http://localhost:${envv('PORT', '4100')}${envv('API_PREFIX', '/api/v1')}`))).replace(/\/$/, '');
const CONNECTIONS = Number(flag('connections', 10));
const DURATION = Number(flag('duration', 8));
const REQUESTS = Number(flag('requests', 40));
const RAMP = String(flag('ramp', '5,15,25')).split(',').map(Number);
const STAGE = Number(flag('stage', 15));
const PHASE = String(flag('phase', 'all'));
const ONLY = flag('only', null);
const OUT = flag('out', null);
const SPOOF = !argv.includes('--no-spoof');
const MAX_CONN = 30;
if (CONNECTIONS > MAX_CONN || RAMP.some((c) => c > MAX_CONN)) {
  console.error(`Refusing to run above ${MAX_CONN} connections (shared Supabase pooler).`);
  process.exit(2);
}

const DEMO_PHONE = envv('LOAD_STUDENT_PHONE', '+9647701234567');
const DEV_OTP = envv('LOAD_STUDENT_OTP', '123456');
const ADMIN_EMAIL = envv('SEED_SUPER_ADMIN_EMAIL', 'admin@eduway.iq');
const ADMIN_PASSWORD = envv('SEED_SUPER_ADMIN_PASSWORD', '');
const DEVICE_ID = 'load-test-device-0001';

// ---------- helpers ----------
let ipCounter = 0;
const nextIp = () => {
  const n = ipCounter++ % 60000;
  return `10.250.${Math.floor(n / 250) + 1}.${(n % 250) + 1}`;
};
async function api(method, p, { token, body, ok = true } = {}) {
  const headers = { 'Content-Type': 'application/json', 'X-Client-Platform': 'web', 'X-Device-Id': DEVICE_ID };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (SPOOF) headers['X-Forwarded-For'] = nextIp();
  let res;
  for (let attempt = 0; ; attempt++) {
    try {
      res = await fetch(`${BASE}${p}`, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30_000) });
      break;
    } catch (err) {
      // dev server in watch mode may be mid-reload: retry connection failures for up to ~60 s
      if (attempt >= 30) throw err;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  const json = await res.json().catch(() => null);
  if (ok && !res.ok) throw new Error(`${method} ${p} -> ${res.status} ${json?.error?.code ?? ''}`);
  return { status: res.status, json };
}
const pct = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] : 0);
const r1 = (n) => Math.round(n * 10) / 10;
function summarize(name, lat, statuses, seconds, bytes = 0) {
  const sorted = [...lat].sort((a, b) => a - b);
  const total = lat.length;
  const errors = Object.entries(statuses).filter(([s]) => Number(s) >= 400 || s === 'err').reduce((a, [, n]) => a + n, 0);
  return {
    name,
    requests: total,
    rps: r1(total / seconds),
    p50: r1(pct(sorted, 50)),
    p95: r1(pct(sorted, 95)),
    p99: r1(pct(sorted, 99)),
    max: r1(sorted[sorted.length - 1] ?? 0),
    mean: r1(total ? lat.reduce((a, b) => a + b, 0) / total : 0),
    errorRate: total ? r1((errors / total) * 100) : 0,
    statuses,
    kbPerReq: total ? r1(bytes / total / 1024) : 0,
  };
}

function runAutocannon({ requests, connections, duration, amount, title }) {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const lat = [];
    const statuses = {};
    let bytes = 0;
    const inst = autocannon(
      {
        url: BASE,
        connections,
        ...(amount ? { amount } : { duration }),
        timeout: 30,
        headers: { 'X-Client-Platform': 'web', 'X-Device-Id': DEVICE_ID, 'Accept-Encoding': 'gzip' },
        requests: requests.map((r) => ({
          method: r.method ?? 'GET',
          path: `${new URL(BASE).pathname}${r.path}`,
          headers: { ...(r.token ? { authorization: `Bearer ${r.token}` } : {}) },
          setupRequest: (req) => {
            if (SPOOF) req.headers = { ...req.headers, 'x-forwarded-for': nextIp() };
            return req;
          },
        })),
      },
      (err, res) => {
        if (err) return reject(err);
        statuses.err = (statuses.err ?? 0) + (res.errors ?? 0) + (res.timeouts ?? 0);
        if (!statuses.err) delete statuses.err;
        resolve({ ...summarize(title, lat, statuses, (performance.now() - started) / 1000, bytes), autocannon: { p90: res.latency.p90, p97_5: res.latency.p97_5 } });
      },
    );
    inst.on('response', (_client, statusCode, resBytes, responseTime) => {
      lat.push(responseTime);
      statuses[statusCode] = (statuses[statusCode] ?? 0) + 1;
      bytes += resBytes;
    });
  });
}

/**
 * Requests autocannon abandons at the end of a time-boxed stage keep running on the server; wait until a cheap
 * DB-backed request is fast again so the next stage does not inherit the previous stage's backlog.
 */
async function drain(token) {
  const until = Date.now() + 90_000;
  while (Date.now() < until) {
    const t0 = performance.now();
    await api('GET', '/notifications/unread-count', { token, ok: false });
    if (performance.now() - t0 < 600) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
}

// ---------- sessions ----------
async function studentLogin() {
  await api('POST', '/auth/send-otp', { body: { phone: DEMO_PHONE, purpose: 'login' }, ok: false });
  const body = { phone: DEMO_PHONE, code: DEV_OTP, purpose: 'login', deviceId: DEVICE_ID, platform: 'web' };
  let r = await api('POST', '/auth/verify-otp', { body, ok: false });
  const d = r.json?.error?.details;
  if (r.status === 422 && d?.reason === 'DEVICE_LIMIT_REACHED' && d.sessions?.length) {
    const oldest = [...d.sessions].sort((a, b) => a.lastActive.localeCompare(b.lastActive))[0];
    r = await api('POST', '/auth/verify-otp', { body: { ...body, revokeSessionId: oldest.id }, ok: false });
  }
  if (r.status !== 200) throw new Error(`student login failed: ${r.status} ${r.json?.error?.code ?? ''}`);
  return { access: r.json.data.accessToken, refresh: r.json.data.refreshToken };
}
async function adminLogin() {
  if (!ADMIN_PASSWORD) return null;
  const r = await api('POST', '/auth/admin/login', { body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD }, ok: false });
  if (r.status !== 200 || r.json?.data?.mfaRequired) {
    console.warn(`admin login unavailable (${r.status} ${r.json?.error?.code ?? (r.json?.data?.mfaRequired ? 'MFA' : '')}) — skipping admin endpoints`);
    return null;
  }
  return { access: r.json.data.tokens.accessToken, refresh: r.json.data.tokens.refreshToken };
}

// ---------- main ----------
async function main() {
  console.log(`EDUWAY load test → ${BASE}  phase=${PHASE} connections=${CONNECTIONS} duration=${DURATION}s ramp=${RAMP.join('→')} stage=${STAGE}s spoof=${SPOOF}`);
  // the dev server runs in watch mode and may be reloading — wait up to 60 s for it
  for (let i = 0; ; i++) {
    const h = await api('GET', '/health', { ok: false }).catch(() => null);
    if (h?.json?.data?.status === 'ok') break;
    if (i >= 30) throw new Error('server not healthy');
    await new Promise((r) => setTimeout(r, 2000));
  }

  const student = await studentLogin();
  const admin = await adminLogin();
  const S = student.access;
  const A = admin?.access;

  // discover ids
  const subjects = (await api('GET', '/subjects', { token: S })).json.data;
  const subject = subjects.find((s) => s.locked === false) ?? subjects[0];
  const detail = (await api('GET', `/subjects/${subject.id}`, { token: S })).json.data;
  const lesson = detail.lessons.find((l) => !l.locked) ?? detail.lessons[0];
  const tz = 180;

  const endpoints = [
    // student hot paths
    { name: 'GET /auth/me (student)', path: '/auth/me', token: S },
    { name: 'GET /public/app-config', path: '/public/app-config?platform=web' },
    { name: 'GET /progress/dashboard (home)', path: `/progress/dashboard?tzOffsetMinutes=${tz}`, token: S },
    { name: 'GET /progress/summary', path: '/progress/summary', token: S },
    { name: 'GET /progress/today-plan', path: '/progress/today-plan', token: S },
    { name: 'GET /subjects', path: '/subjects', token: S },
    { name: 'GET /subjects/:id', path: `/subjects/${subject.id}`, token: S },
    { name: 'GET /lessons/:id', path: `/lessons/${lesson.id}`, token: S },
    { name: 'GET /progress/subjects', path: '/progress/subjects', token: S },
    { name: 'GET /progress/lessons', path: '/progress/lessons', token: S },
    { name: 'GET /notifications', path: '/notifications?limit=20', token: S },
    { name: 'GET /notifications/unread-count', path: '/notifications/unread-count', token: S },
    { name: 'GET /me/entitlements', path: '/me/entitlements', token: S },
    // admin lists
    ...(A
      ? [
          { name: 'GET /admin/dashboard', path: '/admin/dashboard', token: A, admin: true },
          { name: 'GET /admin/students', path: '/admin/students?pageSize=20', token: A, admin: true },
          { name: 'GET /admin/lessons', path: '/admin/lessons?pageSize=20', token: A, admin: true },
          { name: 'GET /admin/payments', path: '/admin/payments?pageSize=20', token: A, admin: true },
          { name: 'GET /admin/subscriptions', path: '/admin/subscriptions?pageSize=20', token: A, admin: true },
          { name: 'GET /admin/audit-logs', path: '/admin/audit-logs?pageSize=20', token: A, admin: true },
        ]
      : []),
  ].filter((e) => !ONLY || e.name.includes(ONLY));

  // sanity: every endpoint must answer 200 before we load it
  for (const e of endpoints) {
    const r = await api('GET', e.path, { token: e.token, ok: false });
    if (r.status !== 200) {
      console.warn(`  ! ${e.name} -> ${r.status} ${r.json?.error?.code ?? ''} (excluded)`);
      e.skip = true;
    }
  }
  const live = endpoints.filter((e) => !e.skip);
  const results = { base: BASE, at: new Date().toISOString(), config: { CONNECTIONS, REQUESTS, DURATION, RAMP, STAGE, SPOOF }, endpoints: [], mixed: [], refresh: null };

  if (PHASE === 'all' || PHASE === 'probe') {
    // serial baseline: one request at a time (no queueing) — the pure per-request cost
    console.log('\n== serial probe (1 VU, 5 requests each) ==');
    results.probe = [];
    for (const e of live) {
      const lat = [];
      const statuses = {};
      const t = performance.now();
      for (let i = 0; i < 5; i++) {
        const t0 = performance.now();
        const r = await api('GET', e.path, { token: e.token, ok: false });
        lat.push(performance.now() - t0);
        statuses[r.status] = (statuses[r.status] ?? 0) + 1;
      }
      const r = summarize(e.name, lat, statuses, (performance.now() - t) / 1000);
      results.probe.push(r);
      console.log(`  ${e.name.padEnd(36)} p50 ${String(r.p50).padStart(7)}  max ${String(r.max).padStart(7)}  ${JSON.stringify(statuses)}`);
    }
  }

  if (PHASE === 'all' || PHASE === 'endpoints') {
    console.log(`\n== per-endpoint (${CONNECTIONS} VUs, ${REQUESTS} requests each; every request awaited) ==`);
    for (const e of live) {
      await drain(S);
      const r = await runAutocannon({ requests: [e], connections: CONNECTIONS, amount: REQUESTS, title: e.name });
      results.endpoints.push(r);
      console.log(`  ${e.name.padEnd(36)} rps ${String(r.rps).padStart(6)}  p50 ${String(r.p50).padStart(6)}  p95 ${String(r.p95).padStart(6)}  p99 ${String(r.p99).padStart(6)}  err ${r.errorRate}%`);
    }
  }

  if (PHASE === 'all' || PHASE === 'mixed') {
    // weight: student traffic dominates; admin endpoints appear once each
    const mix = [...live.filter((e) => !e.admin), ...live.filter((e) => !e.admin), ...live.filter((e) => e.admin)];
    console.log(`\n== mixed ramp (${RAMP.join(' → ')} VUs, ${STAGE}s per stage, ${mix.length} weighted requests) ==`);
    for (const c of RAMP) {
      await drain(S);
      const r = await runAutocannon({ requests: mix, connections: c, duration: STAGE, title: `mixed @${c} VUs` });
      results.mixed.push({ connections: c, ...r });
      console.log(`  @${String(c).padStart(2)} VUs  rps ${String(r.rps).padStart(6)}  p50 ${String(r.p50).padStart(6)}  p95 ${String(r.p95).padStart(6)}  p99 ${String(r.p99).padStart(6)}  err ${r.errorRate}%  ${JSON.stringify(r.statuses)}`);
    }
  }

  if (PHASE === 'all' || PHASE === 'refresh') {
    await drain(S);
    console.log(`\n== auth refresh rotation chain (${DURATION}s, sequential) ==`);
    const lat = [];
    const statuses = {};
    const end = Date.now() + DURATION * 1000;
    while (Date.now() < end) {
      const t0 = performance.now();
      const r = await api('POST', '/auth/refresh', { body: { refreshToken: student.refresh }, ok: false });
      lat.push(performance.now() - t0);
      statuses[r.status] = (statuses[r.status] ?? 0) + 1;
      if (r.status !== 200) break;
      student.refresh = r.json.data.refreshToken;
      student.access = r.json.data.accessToken;
    }
    results.refresh = summarize('POST /auth/refresh', lat, statuses, DURATION);
    const r = results.refresh;
    console.log(`  POST /auth/refresh                    rps ${r.rps}  p50 ${r.p50}  p95 ${r.p95}  p99 ${r.p99}  err ${r.errorRate}%`);
  }

  // cleanup: revoke the sessions this run created
  await api('POST', '/auth/logout', { token: student.access, body: { refreshToken: student.refresh }, ok: false });
  if (admin) await api('POST', '/auth/logout', { token: admin.access, body: { refreshToken: admin.refresh }, ok: false });

  if (results.endpoints.length) {
    console.log('\n== slowest endpoints by p95 ==');
    for (const r of [...results.endpoints].sort((a, b) => b.p95 - a.p95).slice(0, 6)) console.log(`  ${r.name.padEnd(36)} p95 ${r.p95} ms  p99 ${r.p99} ms`);
  }
  if (OUT) {
    fs.writeFileSync(path.resolve(String(OUT)), JSON.stringify(results, null, 2));
    console.log(`\nresults → ${OUT}`);
  }
}

main().catch((e) => {
  console.error('load test failed:', e.message);
  process.exit(1);
});
