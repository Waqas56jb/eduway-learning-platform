#!/usr/bin/env node
/**
 * load-test — gentle load/performance test of the EDUWAY API hot read paths (docs/PERFORMANCE.md).
 *
 * Runs against an ALREADY RUNNING server (never starts one). Default base: http://localhost:4100/api/v1.
 *
 *   cd scripts && npm install          # once (autocannon devDependency)
 *   node scripts/load-test.mjs [--base URL] [--phase all|probe|endpoints|mixed|refresh]
 *                              [--connections 10] [--requests 30]        # endpoints phase
 *                              [--ramp 5,15,25] [--stage 15]             # mixed phase
 *                              [--engine vu|autocannon] [--duration 8]   # mixed engine / refresh chain length
 *                              [--only <substring>] [--out results.json] [--no-spoof]
 *
 * Phases
 *   probe      serial baseline: 5 sequential requests per endpoint (no concurrency — the pure per-request cost)
 *   endpoints  each endpoint alone: --requests N at --connections virtual users; every request is awaited, so slow
 *              endpoints are measured instead of being cut off at a time limit
 *   mixed      realistic weighted mix (student traffic ×2, admin ×1) ramped through --ramp VU stages of --stage s.
 *              Engine `vu` (default): fetch-based virtual users with a per-endpoint breakdown; each stage waits for its
 *              in-flight requests. Engine `autocannon`: raw throughput, aggregate only (in-flight requests at the end
 *              of a stage are dropped by autocannon — see drain()).
 *   refresh    sequential POST /auth/refresh rotation chain for --duration s (tokens are single-use, so one chain)
 *
 * Robustness: the dev server runs in watch mode and restarts whenever someone saves a file. Each measured run checks
 * the server's uptime; a run during which the server restarted is discarded and repeated once (marked `rerun`).
 *
 * Auth: demo student via the OTP dev bypass code (non-production only) and the seeded super admin. Credentials are read
 * from server/.env (SEED_SUPER_ADMIN_PASSWORD, SEED_SUPER_ADMIN_EMAIL) or the environment and are never printed.
 * Both sessions are logged out at the end (no test data is left behind; the test only reads).
 *
 * Rate limiting: the API has a per-IP global limiter (600 req/min). All load comes from one machine, so by default
 * every request carries a synthetic X-Forwarded-For (10.250.x.y pool) — the server trusts one proxy hop — to model
 * many distinct clients. Pass --no-spoof to measure with the limiter in effect.
 *
 * Keep it gentle: the shared Supabase session pooler allows ~15 connections; the script refuses more than 30 VUs.
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
const REQUESTS = Number(flag('requests', 30));
const DURATION = Number(flag('duration', 8));
const RAMP = String(flag('ramp', '5,15,25')).split(',').map(Number);
const STAGE = Number(flag('stage', 15));
const PHASE = String(flag('phase', 'all'));
const ENGINE = String(flag('engine', 'vu'));
const ONLY = flag('only', null);
const OUT = flag('out', null);
const SPOOF = !argv.includes('--no-spoof');
const MAX_CONN = 30;
const REQUEST_TIMEOUT_MS = 60_000;
if (CONNECTIONS > MAX_CONN || RAMP.some((c) => c > MAX_CONN)) {
  console.error(`Refusing to run above ${MAX_CONN} virtual users (shared Supabase pooler).`);
  process.exit(2);
}

const DEMO_PHONE = envv('LOAD_STUDENT_PHONE', '+9647701234567');
const DEV_OTP = envv('LOAD_STUDENT_OTP', '123456');
const ADMIN_EMAIL = envv('SEED_SUPER_ADMIN_EMAIL', 'admin@eduway.iq');
const ADMIN_PASSWORD = envv('SEED_SUPER_ADMIN_PASSWORD', '');
const DEVICE_ID = 'load-test-device-0001';

// ---------- helpers ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ipCounter = 0;
const nextIp = () => {
  const n = ipCounter++ % 60000;
  return `10.250.${Math.floor(n / 250) + 1}.${(n % 250) + 1}`;
};
const headersFor = (token) => ({
  'Content-Type': 'application/json',
  'X-Client-Platform': 'web',
  'X-Device-Id': DEVICE_ID,
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
  ...(SPOOF ? { 'X-Forwarded-For': nextIp() } : {}),
});

/** Setup/teardown call: retries connection failures for ~60 s (watch-mode reloads). */
async function api(method, p, { token, body, ok = true } = {}) {
  let res;
  for (let attempt = 0; ; attempt++) {
    try {
      res = await fetch(`${BASE}${p}`, { method, headers: headersFor(token), body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30_000) });
      break;
    } catch (err) {
      if (attempt >= 30) throw err;
      await sleep(2000);
    }
  }
  const json = await res.json().catch(() => null);
  if (ok && !res.ok) throw new Error(`${method} ${p} -> ${res.status} ${json?.error?.code ?? ''}`);
  return { status: res.status, json };
}

/** One measured request: latency incl. body download; network failures are reported as status 'conn'. */
async function timed(e) {
  const t0 = performance.now();
  try {
    const res = await fetch(`${BASE}${e.path}`, { method: e.method ?? 'GET', headers: headersFor(e.token), signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    const buf = await res.arrayBuffer();
    return { ms: performance.now() - t0, status: res.status, bytes: buf.byteLength };
  } catch (err) {
    return { ms: performance.now() - t0, status: err?.name === 'TimeoutError' ? 'timeout' : 'conn', bytes: 0 };
  }
}

const pct = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] : 0);
const r1 = (n) => Math.round(n * 10) / 10;
function summarize(name, lat, statuses, seconds, bytes = 0) {
  const sorted = [...lat].sort((a, b) => a - b);
  const total = Object.values(statuses).reduce((a, n) => a + n, 0);
  const errors = Object.entries(statuses).filter(([s]) => !(Number(s) >= 200 && Number(s) < 400)).reduce((a, [, n]) => a + n, 0);
  return {
    name,
    requests: total,
    rps: r1(lat.length / seconds),
    p50: r1(pct(sorted, 50)),
    p95: r1(pct(sorted, 95)),
    p99: r1(pct(sorted, 99)),
    max: r1(sorted[sorted.length - 1] ?? 0),
    mean: r1(lat.length ? lat.reduce((a, b) => a + b, 0) / lat.length : 0),
    errorRate: total ? r1((errors / total) * 100) : 0,
    statuses,
    kbPerReq: lat.length ? r1(bytes / lat.length / 1024) : 0,
    seconds: r1(seconds),
  };
}

class Recorder {
  constructor() {
    this.by = new Map();
  }
  add(name, r) {
    const b = this.by.get(name) ?? { lat: [], statuses: {}, bytes: 0 };
    if (typeof r.status === 'number') b.lat.push(r.ms);
    b.statuses[r.status] = (b.statuses[r.status] ?? 0) + 1;
    b.bytes += r.bytes;
    this.by.set(name, b);
  }
  summary(name, seconds) {
    const all = { lat: [], statuses: {}, bytes: 0 };
    const src = name ? [this.by.get(name)].filter(Boolean) : [...this.by.values()];
    for (const b of src) {
      all.lat.push(...b.lat);
      for (const [s, n] of Object.entries(b.statuses)) all.statuses[s] = (all.statuses[s] ?? 0) + n;
      all.bytes += b.bytes;
    }
    return summarize(name ?? 'all', all.lat, all.statuses, seconds, all.bytes);
  }
}

/**
 * Fetch-based virtual users. Stops after `amount` requests (all awaited) or after `duration` s (no new requests are
 * started after the deadline; in-flight ones are awaited and counted).
 */
async function runVus({ requests, vus, amount, duration }) {
  const rec = new Recorder();
  const started = performance.now();
  const deadline = duration ? started + duration * 1000 : Infinity;
  let issued = 0;
  const worker = async (w) => {
    let i = w;
    while (performance.now() < deadline && (!amount || issued < amount)) {
      issued++;
      const e = requests[i++ % requests.length];
      rec.add(e.name, await timed(e));
    }
  };
  await Promise.all(Array.from({ length: vus }, (_, w) => worker(w)));
  return { rec, seconds: (performance.now() - started) / 1000 };
}

/** autocannon engine for the mixed ramp (aggregate numbers only). */
function runAutocannon({ requests, connections, duration }) {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const rec = new Recorder();
    const inst = autocannon(
      {
        url: BASE,
        connections,
        duration,
        timeout: REQUEST_TIMEOUT_MS / 1000,
        headers: { 'X-Client-Platform': 'web', 'X-Device-Id': DEVICE_ID },
        requests: requests.map((r) => ({
          method: r.method ?? 'GET',
          path: `${new URL(BASE).pathname}${r.path}`,
          headers: { ...(r.token ? { authorization: `Bearer ${r.token}` } : {}) },
          setupRequest: (req) => (SPOOF ? { ...req, headers: { ...req.headers, 'x-forwarded-for': nextIp() } } : req),
        })),
      },
      (err, res) => {
        if (err) return reject(err);
        for (let k = 0; k < (res.errors ?? 0); k++) rec.add('all', { status: 'conn', ms: 0, bytes: 0 });
        resolve({ rec, seconds: (performance.now() - started) / 1000 });
      },
    );
    inst.on('response', (_client, statusCode, resBytes, responseTime) => rec.add('all', { status: statusCode, ms: responseTime, bytes: resBytes }));
  });
}

async function serverUptime() {
  const h = await api('GET', '/health', { ok: false }).catch(() => null);
  return h?.json?.data?.uptimeSec ?? 0;
}

/** Runs `fn`; if the dev server restarted meanwhile (watch mode), waits and repeats once. */
async function measured(label, fn) {
  for (let attempt = 0; attempt < 2; attempt++) {
    await drain();
    const t0 = Date.now();
    const out = await fn();
    const up = await serverUptime();
    if (up * 1000 >= Date.now() - t0) return { ...out, rerun: attempt > 0 };
    console.log(`  (${label}: server restarted during the run — repeating)`);
  }
  const out = await fn();
  return { ...out, rerun: true, restarted: true };
}

/** Wait until a cheap DB-backed request is fast again (no backlog from the previous run). */
let drainToken = null;
async function drain() {
  const until = Date.now() + 90_000;
  while (Date.now() < until) {
    const t0 = performance.now();
    await api('GET', '/notifications/unread-count', { token: drainToken, ok: false });
    if (performance.now() - t0 < 800) return;
    await sleep(1000);
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

const line = (r) =>
  `rps ${String(r.rps).padStart(6)}  p50 ${String(r.p50).padStart(7)}  p95 ${String(r.p95).padStart(7)}  p99 ${String(r.p99).padStart(7)}  err ${String(r.errorRate).padStart(5)}%`;

// ---------- main ----------
async function main() {
  console.log(`EDUWAY load test → ${BASE}  phase=${PHASE} vus=${CONNECTIONS} requests=${REQUESTS} ramp=${RAMP.join('→')} stage=${STAGE}s engine=${ENGINE} spoof=${SPOOF}`);
  if (!(await serverUptime())) throw new Error('server not healthy');

  const student = await studentLogin();
  const admin = await adminLogin();
  const S = student.access;
  const A = admin?.access;
  drainToken = S;

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
  const results = { base: BASE, at: new Date().toISOString(), config: { CONNECTIONS, REQUESTS, DURATION, RAMP, STAGE, ENGINE, SPOOF }, probe: [], endpoints: [], mixed: [], refresh: null };

  if (PHASE === 'all' || PHASE === 'probe') {
    console.log('\n== serial probe (1 VU, 5 requests each) ==');
    for (const e of live) {
      const { rec, seconds } = await measured(e.name, () => runVus({ requests: [e], vus: 1, amount: 5 }));
      const r = rec.summary(e.name, seconds);
      results.probe.push(r);
      console.log(`  ${e.name.padEnd(36)} p50 ${String(r.p50).padStart(7)}  max ${String(r.max).padStart(7)}  ${JSON.stringify(r.statuses)}`);
    }
  }

  if (PHASE === 'all' || PHASE === 'endpoints') {
    console.log(`\n== per-endpoint (${CONNECTIONS} VUs, ${REQUESTS} requests each; every request awaited) ==`);
    for (const e of live) {
      const { rec, seconds, rerun } = await measured(e.name, () => runVus({ requests: [e], vus: CONNECTIONS, amount: REQUESTS }));
      const r = { ...rec.summary(e.name, seconds), rerun };
      results.endpoints.push(r);
      console.log(`  ${e.name.padEnd(36)} ${line(r)}${Object.keys(r.statuses).some((s) => s !== '200') ? `  ${JSON.stringify(r.statuses)}` : ''}`);
    }
  }

  if (PHASE === 'all' || PHASE === 'mixed') {
    // weight: student traffic dominates; admin endpoints appear once each
    const mix = [...live.filter((e) => !e.admin), ...live.filter((e) => !e.admin), ...live.filter((e) => e.admin)];
    console.log(`\n== mixed ramp (${RAMP.join(' → ')} VUs, ${STAGE}s per stage, engine ${ENGINE}) ==`);
    for (const c of RAMP) {
      const run = ENGINE === 'autocannon' ? () => runAutocannon({ requests: mix, connections: c, duration: STAGE }) : () => runVus({ requests: mix, vus: c, duration: STAGE });
      const { rec, seconds, rerun } = await measured(`mixed @${c}`, run);
      const r = { connections: c, ...rec.summary(null, seconds), rerun, perEndpoint: ENGINE === 'autocannon' ? [] : [...rec.by.keys()].map((n) => rec.summary(n, seconds)) };
      results.mixed.push(r);
      console.log(`  @${String(c).padStart(2)} VUs  ${line(r)}  ${JSON.stringify(r.statuses)}`);
    }
    const top = results.mixed.at(-1)?.perEndpoint ?? [];
    if (top.length) {
      console.log(`  slowest in the @${results.mixed.at(-1).connections} stage (p95):`);
      for (const r of [...top].sort((a, b) => b.p95 - a.p95).slice(0, 5)) console.log(`    ${r.name.padEnd(36)} p50 ${r.p50}  p95 ${r.p95}  (${r.requests} req)`);
    }
  }

  if (PHASE === 'all' || PHASE === 'refresh') {
    await drain();
    console.log(`\n== auth refresh rotation chain (${DURATION}s, sequential) ==`);
    const lat = [];
    const statuses = {};
    const end = Date.now() + DURATION * 1000;
    const t = performance.now();
    while (Date.now() < end) {
      const t0 = performance.now();
      const r = await api('POST', '/auth/refresh', { body: { refreshToken: student.refresh }, ok: false });
      lat.push(performance.now() - t0);
      statuses[r.status] = (statuses[r.status] ?? 0) + 1;
      if (r.status !== 200) break;
      student.refresh = r.json.data.refreshToken;
      student.access = r.json.data.accessToken;
    }
    results.refresh = summarize('POST /auth/refresh', lat, statuses, (performance.now() - t) / 1000);
    console.log(`  ${'POST /auth/refresh'.padEnd(36)} ${line(results.refresh)}`);
  }

  // cleanup: revoke the sessions this run created
  await api('POST', '/auth/logout', { token: student.access, body: { refreshToken: student.refresh }, ok: false });
  if (admin) await api('POST', '/auth/logout', { token: admin.access, body: { refreshToken: admin.refresh }, ok: false });

  if (results.endpoints.length) {
    console.log('\n== slowest endpoints by p95 (per-endpoint phase) ==');
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
