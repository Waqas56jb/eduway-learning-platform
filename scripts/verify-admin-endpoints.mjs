#!/usr/bin/env node
/**
 * Static endpoint cross-check: extracts every HTTP method + path a frontend calls and matches it against
 * server/docs/openapi.json.
 *
 *   node scripts/verify-admin-endpoints.mjs [frontendDir=website/admin] [openapi=server/docs/openapi.json] [--json]
 *
 * Recognised call shapes (whole `src/` tree, .ts/.tsx):
 *   api.get|list|post|put|patch|delete<Generic>('path' | `path/${x}`, …)
 *   download('path', { method: 'POST' | body: … })      → POST when a body/method POST is present, else GET
 *   useExport('path', …)                                 → POST
 *   string constants `'/admin/…/export'` inside `*_EXPORT = { … }` objects → POST
 * Template segments `${…}` become path params. Exit code 1 when any call has no matching operation.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const asJson = process.argv.includes('--json');
const feDir = resolve(root, args[0] ?? 'website/admin');
const specPath = resolve(root, args[1] ?? 'server/docs/openapi.json');
const spec = JSON.parse(readFileSync(specPath, 'utf8'));

// ── operations from OpenAPI ───────────────────────────────────────────────────
const basePrefix = (spec.servers?.[0]?.url ?? '').replace(/^https?:\/\/[^/]+/, '');
const ops = [];
for (const [p, item] of Object.entries(spec.paths)) {
  const path = p.startsWith('/api/v1') ? p.slice('/api/v1'.length) : p.startsWith(basePrefix) && basePrefix ? p.slice(basePrefix.length) : p;
  for (const m of Object.keys(item)) {
    if (!['get', 'post', 'put', 'patch', 'delete'].includes(m)) continue;
    const segs = path.split('/').filter(Boolean);
    ops.push({ method: m.toUpperCase(), path, segs, used: false });
  }
}

// ── frontend call extraction ──────────────────────────────────────────────────
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'dist') continue;
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.d\.ts$/.test(name)) out.push(p);
  }
  return out;
}

/** Skip balanced <...> generics starting at i (s[i] === '<'). Returns index after the closing '>'. */
function skipGenerics(s, i) {
  let depth = 0;
  for (; i < s.length; i++) {
    const c = s[i];
    if (c === '<') depth++;
    else if (c === '>' && s[i - 1] !== '=') {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return i;
}

/** Read a string literal ('…', "…", `…`) starting at i (after whitespace). */
function readString(s, i) {
  while (/\s/.test(s[i])) i++;
  const q = s[i];
  if (q !== "'" && q !== '"' && q !== '`') return null;
  let j = i + 1;
  let out = '';
  while (j < s.length && s[j] !== q) {
    if (q === '`' && s[j] === '$' && s[j + 1] === '{') {
      let depth = 1;
      j += 2;
      while (j < s.length && depth) {
        if (s[j] === '{') depth++;
        else if (s[j] === '}') depth--;
        j++;
      }
      out += '{param}';
      continue;
    }
    out += s[j++];
  }
  return { value: out, end: j + 1 };
}

/** Text of the call's argument list from index i (just after '(') to the matching ')'. */
function callArgs(s, i) {
  let depth = 1;
  let j = i;
  while (j < s.length && depth) {
    if (s[j] === '(') depth++;
    else if (s[j] === ')') depth--;
    j++;
  }
  return s.slice(i, j - 1);
}

const lineOf = (s, idx) => s.slice(0, idx).split('\n').length;
const calls = [];
for (const file of walk(join(feDir, 'src'))) {
  const s = readFileSync(file, 'utf8');
  const rel = relative(root, file).replace(/\\/g, '/');
  const re = /\bapi\.(get|list|post|put|patch|delete)\s*(<)?/g;
  let m;
  while ((m = re.exec(s))) {
    let i = m.index + m[0].length;
    if (m[2]) i = skipGenerics(s, i - 1);
    while (/\s/.test(s[i])) i++;
    if (s[i] !== '(') continue;
    const str = readString(s, i + 1);
    if (!str || !str.value.startsWith('/')) continue;
    const method = m[1] === 'list' ? 'GET' : m[1].toUpperCase();
    calls.push({ method, path: str.value, file: rel, line: lineOf(s, m.index) });
  }
  const dl = /\b(download|useExport)\s*\(/g;
  while ((m = dl.exec(s))) {
    if (/function\s+$/.test(s.slice(Math.max(0, m.index - 12), m.index))) continue;
    const i = m.index + m[0].length;
    const str = readString(s, i);
    if (!str || !str.value.startsWith('/')) continue;
    let method = 'POST';
    if (m[1] === 'download') {
      const a = callArgs(s, i);
      method = /method:\s*'POST'|\bbody\s*[:,]/.test(a) ? 'POST' : 'GET';
    }
    calls.push({ method, path: str.value, file: rel, line: lineOf(s, m.index) });
  }
  const exp = /\b[A-Z_]*EXPORT\s*=\s*\{([^}]*)\}/g;
  while ((m = exp.exec(s))) {
    for (const lit of m[1].matchAll(/'(\/[^']+)'/g)) calls.push({ method: 'POST', path: lit[1], file: rel, line: lineOf(s, m.index) });
  }
}

// ── matching ──────────────────────────────────────────────────────────────────
const isParam = (seg) => /^\{.+\}$/.test(seg) || seg.startsWith(':');
function match(call) {
  const path = call.path.split('?')[0];
  const segs = path.split('/').filter(Boolean);
  const candidates = ops.filter((o) => o.method === call.method && o.segs.length === segs.length);
  // prefer exact literal matches over param matches (e.g. /admin/students/stats vs /admin/students/{id})
  let best = null;
  let bestScore = -1;
  for (const o of candidates) {
    let score = 0;
    let ok = true;
    for (let k = 0; k < segs.length; k++) {
      const fe = segs[k];
      const be = o.segs[k];
      if (fe === be) score += 2;
      else if (isParam(be) && (fe.includes('{param}') ? fe === '{param}' : true)) score += 1;
      else if (fe.includes('{param}') && !isParam(be)) {
        // dynamic frontend segment vs literal server segment (e.g. /admin/settings/${section})
        const rx = new RegExp('^' + fe.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{param\}/g, '[^/]+') + '$');
        if (rx.test(be)) score += 0.5;
        else ok = false;
      } else ok = false;
      if (!ok) break;
    }
    if (ok && score > bestScore) {
      best = o;
      bestScore = score;
    }
  }
  return best;
}

const seen = new Map();
for (const c of calls) {
  const key = `${c.method} ${c.path}`;
  if (!seen.has(key)) seen.set(key, { ...c, refs: [] });
  seen.get(key).refs.push(`${c.file}:${c.line}`);
}
const results = [];
for (const c of seen.values()) {
  const op = match(c);
  if (op) op.used = true;
  results.push({ ...c, ok: !!op, op: op ? `${op.method} ${op.path}` : null });
}

const bad = results.filter((r) => !r.ok);
if (asJson) {
  console.log(JSON.stringify({ frontend: relative(root, feDir), calls: results.length, missing: bad }, null, 2));
} else {
  console.log(`Frontend: ${relative(root, feDir) || '.'}  ·  spec: ${relative(root, specPath)}  (${ops.length} operations)`);
  console.log(`Unique calls: ${results.length}  ·  matched: ${results.length - bad.length}  ·  missing: ${bad.length}`);
  for (const b of bad) console.log(`  ✗ ${b.method.padEnd(6)} ${b.path}   ← ${b.refs.join(', ')}`);
  if (process.argv.includes('--verbose')) for (const r of results.filter((x) => x.ok)) console.log(`  ✓ ${r.method.padEnd(6)} ${r.path}  →  ${r.op}`);
}
process.exit(bad.length ? 1 : 0);
