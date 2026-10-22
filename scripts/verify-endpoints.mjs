#!/usr/bin/env node
/**
 * verify-endpoints — static cross-check of a frontend's HTTP calls against the server OpenAPI document.
 *
 * Usage:
 *   node scripts/verify-endpoints.mjs <frontendDir> [--src src/api] [--openapi server/docs/openapi.json]
 *                                     [--base /api/v1] [--all] [--json]
 *
 *   <frontendDir>   e.g. website/user | app/user | website/admin
 *   --src           directory (relative to frontendDir) to scan recursively; default `src/api`
 *   --openapi       OpenAPI JSON; default `server/docs/openapi.json` (relative to the repo root)
 *   --base          server base path stripped from OpenAPI paths; default: `servers[0].url` path or `/api/v1`
 *   --all           also print every matched call
 *   --json          machine-readable output
 *
 * What it extracts (method + path template) from .ts/.tsx/.js files:
 *   - helper calls:   get|getPaged|post|put|patch|del|remove|downloadFile|download|useExport (…)
 *   - client objects: <ident>.get|list|post|put|patch|delete (…)          e.g. api.get('/x'), http.post(`/y/${id}`)
 *   - sendKeepalive('PUT', '/path', …)
 *   - any string/template literal containing `${API_URL}` / `${BASE_URL}` / `${API_BASE}` followed by a path
 *     (fetch / EventSource / expo fetch); method read from a nearby `method: 'X'` (default GET).
 *   A `method: 'X'` inside the call's own arguments overrides the helper default (e.g. download(p, { method: 'POST' })).
 *
 * Normalisation: query strings are dropped, `${expr}` / `:param` / `{param}` path segments become `{}`, a
 * `${expr}` glued to the end of a segment (e.g. `/notifications${qs(p)}`) is treated as a query suffix.
 *
 * Exit code: 0 when every call matches, 1 otherwise.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ── CLI ────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const opts = { src: 'src/api', openapi: path.join(REPO_ROOT, 'server/docs/openapi.json'), base: null, all: false, json: false };
const positional = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--src') opts.src = argv[++i];
  else if (a === '--openapi') opts.openapi = path.resolve(REPO_ROOT, argv[++i]);
  else if (a === '--base') opts.base = argv[++i];
  else if (a === '--all') opts.all = true;
  else if (a === '--json') opts.json = true;
  else if (a === '-h' || a === '--help') {
    console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 30).join('\n'));
    process.exit(0);
  } else positional.push(a);
}
if (!positional[0]) {
  console.error('usage: node scripts/verify-endpoints.mjs <frontendDir> [--src src/api] [--openapi file] [--all] [--json]');
  process.exit(2);
}
const frontendDir = path.resolve(process.cwd(), positional[0]);
const scanDir = path.resolve(frontendDir, opts.src);
if (!fs.existsSync(scanDir)) {
  console.error(`scan dir not found: ${scanDir}`);
  process.exit(2);
}

// ── OpenAPI index ──────────────────────────────────────────────────────────
const spec = JSON.parse(fs.readFileSync(opts.openapi, 'utf8'));
let base = opts.base;
if (base == null) {
  const s = spec.servers?.[0]?.url;
  base = s ? s.replace(/^https?:\/\/[^/]+/, '').replace(/\/+$/, '') : '';
  if (!base && Object.keys(spec.paths).every((p) => p.startsWith('/api/v1'))) base = '/api/v1';
}
base = base.replace(/\/+$/, '');
const HTTP = ['get', 'post', 'put', 'patch', 'delete'];
/** normalized path → Set<METHOD> */
const specIndex = new Map();
for (const [p, item] of Object.entries(spec.paths)) {
  const rel = base && p.startsWith(base) ? p.slice(base.length) || '/' : p;
  const key = normalizePath(rel);
  const set = specIndex.get(key) ?? new Set();
  for (const m of HTTP) if (item[m]) set.add(m.toUpperCase());
  specIndex.set(key, set);
}

function normalizePath(p) {
  let s = p.split('?')[0].split('#')[0];
  s = s.replace(/\/+$/, '') || '/';
  return s
    .split('/')
    .map((seg) => (/^\{[^}]*\}$/.test(seg) || /^:[A-Za-z_]\w*$/.test(seg) || seg === '\u0000' ? '{}' : seg))
    .join('/');
}

// ── Source scanning ────────────────────────────────────────────────────────
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/\.(m?[jt]sx?)$/.test(e.name) && !/\.(test|spec)\./.test(e.name) && !e.name.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

const HELPERS = {
  get: 'GET', getPaged: 'GET', list: 'GET', downloadFile: 'GET', download: 'GET',
  post: 'POST', put: 'PUT', patch: 'PATCH', del: 'DELETE', remove: 'DELETE', delete: 'DELETE',
  useExport: 'POST',
};
const BASE_VARS = ['API_URL', 'BASE_URL', 'API_BASE', 'API_BASE_URL', 'apiUrl', 'baseUrl'];

/** Read a JS string/template literal starting at src[i] (a quote char). Returns { text, end } with `${…}` → \u0000. */
function readLiteral(src, i) {
  const q = src[i];
  let j = i + 1;
  let text = '';
  while (j < src.length) {
    const c = src[j];
    if (c === '\\') { text += src[j + 1]; j += 2; continue; }
    if (c === q) return { text, raw: src.slice(i, j + 1), end: j + 1 };
    if (q === '`' && c === '$' && src[j + 1] === '{') {
      // balanced skip of the expression
      let depth = 1;
      let k = j + 2;
      const exprStart = k;
      while (k < src.length && depth > 0) {
        if (src[k] === '{') depth++;
        else if (src[k] === '}') depth--;
        else if (src[k] === '`' || src[k] === "'" || src[k] === '"') {
          const inner = readLiteral(src, k);
          k = inner.end;
          continue;
        }
        k++;
      }
      const expr = src.slice(exprStart, k - 1).trim();
      text += `\u0001${expr}\u0002`;
      j = k;
      continue;
    }
    if (q !== '`' && c === '\n') break;
    text += c;
    j++;
  }
  return null;
}

/** Skip a balanced generic `<…>` starting at src[i] === '<'. */
function skipGeneric(src, i) {
  let depth = 0;
  for (let k = i; k < src.length; k++) {
    const c = src[k];
    if (c === '<') depth++;
    else if (c === '>' && src[k - 1] !== '=') {
      depth--;
      if (depth === 0) return k + 1;
    } else if (c === ';' || c === '\n' && depth > 3) return -1;
  }
  return -1;
}

/** Find the end of a call's argument list starting right after `(`. */
function argsSlice(src, i, max = 800) {
  let depth = 1;
  let k = i;
  while (k < src.length && k - i < max) {
    const c = src[k];
    if (c === '`' || c === "'" || c === '"') {
      const lit = readLiteral(src, k);
      if (lit) { k = lit.end; continue; }
    }
    if (c === '(' || c === '{' || c === '[') depth++;
    else if (c === ')' || c === '}' || c === ']') {
      depth--;
      if (depth === 0) return src.slice(i, k);
    }
    k++;
  }
  return src.slice(i, k);
}

/** Template text (with \u0001expr\u0002 markers) → normalized path or null when not a path. */
function templateToPath(text) {
  let t = text;
  // strip leading base variable (`${API_URL}/x`)
  const lead = t.match(/^\u0001([^\u0002]*)\u0002/);
  if (lead && BASE_VARS.some((v) => lead[1] === v || lead[1].endsWith(`.${v}`))) t = t.slice(lead[0].length);
  if (!t.startsWith('/')) return null;
  t = t.split('?')[0];
  const segs = t.split('/').map((seg, idx) => {
    if (idx === 0) return seg;
    if (/^\u0001[^\u0002]*\u0002$/.test(seg)) return '{}';
    // expression glued to the end of a static segment → query/suffix builder; drop it
    return seg.replace(/\u0001[^\u0002]*\u0002$/g, '').replace(/\u0001[^\u0002]*\u0002/g, '{}');
  });
  return normalizePath(segs.join('/').replace(/\/+$/, ''));
}

const calls = [];
const unresolved = [];

for (const file of walk(scanDir)) {
  const src = fs.readFileSync(file, 'utf8');
  const rel = path.relative(REPO_ROOT, file).replace(/\\/g, '/');
  const lineOf = (idx) => src.slice(0, idx).split('\n').length;
  const seen = new Set();
  const push = (method, p, idx, raw) => {
    const key = `${idx}`;
    if (seen.has(key)) return;
    seen.add(key);
    calls.push({ method, path: p, file: rel, line: lineOf(idx), raw });
  };

  // 1) helper / client-object calls
  const re = /(?<![\w$])(?:([A-Za-z_$][\w$]*)\s*\.\s*)?(get|getPaged|list|post|put|patch|del|remove|delete|downloadFile|download|useExport|sendKeepalive)\s*(?=[<(])/g;
  let m;
  while ((m = re.exec(src))) {
    const obj = m[1];
    const name = m[2];
    let i = m.index + m[0].length;
    if (src[i] === '<') {
      const e = skipGeneric(src, i);
      if (e < 0) continue;
      i = e;
    }
    while (/\s/.test(src[i])) i++;
    if (src[i] !== '(') continue;
    // skip declarations: `function get<T>(url…` / `async get(` / method shorthand definitions
    const before = src.slice(Math.max(0, m.index - 20), m.index);
    if (/(function|async)\s*$/.test(before) && !obj) continue;
    // ignore Map/URLSearchParams/headers/etc. object methods with non-path first args (filtered below)
    if (obj && ['Object', 'Array', 'headers', 'params', 'searchParams', 'map', 'cache', 'storage', 'SecureStore', 'AsyncStorage', 'qc', 'queryClient', 'localStorage', 'sessionStorage', 'Reflect', 'res', 'url', 'u'].includes(obj)) continue;
    i++;
    const args = argsSlice(src, i);
    let a = args.replace(/^\s+/, '');
    let method = HELPERS[name];
    let litStartOffset = i + (args.length - a.length);
    if (name === 'sendKeepalive') {
      const mm = a.match(/^['"`](GET|POST|PUT|PATCH|DELETE)['"`]\s*,\s*/);
      if (!mm) continue;
      method = mm[1];
      litStartOffset += mm[0].length;
      a = a.slice(mm[0].length);
    }
    if (!/^['"`]/.test(a)) {
      // non-literal first arg (variable) — record only for known HTTP helpers on api/http clients
      if (/^[A-Za-z_$][\w$.]*\s*[,)]?/.test(a) && (obj === 'api' || obj === 'http' || (!obj && ['getPaged', 'downloadFile', 'download', 'useExport'].includes(name)))) {
        const v = a.match(/^[A-Za-z_$][\w$.]*/)[0];
        if (!['url', 'path', 'u', 'p'].includes(v)) unresolved.push({ method, expr: v, file: rel, line: lineOf(m.index) });
      }
      continue;
    }
    const lit = readLiteral(src, litStartOffset);
    if (!lit) continue;
    const p = templateToPath(lit.text);
    if (!p) continue;
    const mo = args.match(/method\s*:\s*['"`](GET|POST|PUT|PATCH|DELETE)['"`]/i);
    if (mo) method = mo[1].toUpperCase();
    push(method, p, litStartOffset, lit.raw);
  }

  // 2) literals built on a base URL variable (fetch / EventSource / expo fetch)
  const reBase = new RegExp(`\`\\$\\{(?:[\\w$]+\\.)?(${BASE_VARS.join('|')})\\}/`, 'g');
  while ((m = reBase.exec(src))) {
    const lit = readLiteral(src, m.index);
    if (!lit) continue;
    const p = templateToPath(lit.text);
    if (!p || p === '/auth/refresh' && /refresh/.test(src.slice(m.index - 200, m.index))) {
      // keep refresh too; it is a real call
    }
    if (!p) continue;
    // already captured as a helper's first arg?
    if (seen.has(`${m.index}`)) continue;
    const look = src.slice(m.index, m.index + 900);
    const mo = look.match(/method\s*:\s*['"`](GET|POST|PUT|PATCH|DELETE)['"`]/i);
    let method = mo ? mo[1].toUpperCase() : 'GET';
    // axios.post(`${API_URL}/auth/refresh`, …)
    const pre = src.slice(Math.max(0, m.index - 80), m.index);
    const ax = pre.match(/\.(get|post|put|patch|delete)\s*(?:<[^()]*>)?\s*\(\s*$/);
    if (ax) method = ax[1].toUpperCase();
    push(method, p, m.index, lit.raw);
  }
}

// ── Match ──────────────────────────────────────────────────────────────────
function matchCall(c) {
  const exact = specIndex.get(c.path);
  if (exact) return exact.has(c.method) ? { ok: true, spec: c.path } : { ok: false, why: `method ${c.method} not in [${[...exact].join(',')}]` };
  // template match: `{}` in either side matches any single segment
  const segs = c.path.split('/');
  for (const [k, methods] of specIndex) {
    const ks = k.split('/');
    if (ks.length !== segs.length) continue;
    if (ks.every((s, i) => s === segs[i] || s === '{}')) {
      if (methods.has(c.method)) return { ok: true, spec: k, loose: true };
    }
  }
  // near miss hint
  const sameShape = [...specIndex.keys()].filter((k) => k.split('/').length === segs.length && k.split('/')[1] === segs[1]);
  return { ok: false, why: sameShape.length ? `no such path (near: ${sameShape.slice(0, 3).join(' | ')})` : 'no such path' };
}

const results = calls.map((c) => ({ ...c, ...matchCall(c) }));
const bad = results.filter((r) => !r.ok);
const uniq = new Set(results.map((r) => `${r.method} ${r.path}`));

if (opts.json) {
  console.log(JSON.stringify({ frontend: path.relative(REPO_ROOT, frontendDir), calls: results.length, unique: uniq.size, unmatched: bad, unresolved }, null, 2));
} else {
  const fe = path.relative(REPO_ROOT, frontendDir).replace(/\\/g, '/');
  console.log(`\nverify-endpoints: ${fe} (${path.relative(REPO_ROOT, scanDir).replace(/\\/g, '/')}) vs ${path.relative(REPO_ROOT, opts.openapi).replace(/\\/g, '/')}`);
  console.log(`  ${results.length} call sites, ${uniq.size} unique method+path, ${specIndex.size} spec paths\n`);
  if (opts.all) {
    console.log('| ok | method | path | file:line |\n|---|---|---|---|');
    for (const r of results.sort((x, y) => x.path.localeCompare(y.path))) console.log(`| ${r.ok ? 'OK' : 'XX'} | ${r.method} | \`${r.path}\` | ${r.file}:${r.line} |`);
    console.log('');
  }
  if (bad.length) {
    console.log(`UNMATCHED (${bad.length}):\n`);
    console.log('| method | path (normalized) | reason | file:line |\n|---|---|---|---|');
    for (const r of bad) console.log(`| ${r.method} | \`${r.path}\` | ${r.why} | ${r.file}:${r.line} |`);
  } else console.log('All calls match the OpenAPI document.');
  if (unresolved.length) {
    console.log(`\nUNRESOLVED (non-literal path argument, check manually) (${unresolved.length}):`);
    for (const u of unresolved) console.log(`  ${u.method} ${u.expr}  ${u.file}:${u.line}`);
  }
  console.log('');
}
process.exit(bad.length ? 1 : 0);
