import fs from 'node:fs';
import path from 'node:path';
import { test } from '@playwright/test';
import { ROOT, STATE, type Lang } from './support/env';
import { sweepRoute, type RouteCase } from './support/sweep';

/**
 * Every route of website/admin × EN/AR (desktop). The route table is parsed from
 * website/admin/src/routes/index.tsx at run time, so pages added later are swept automatically.
 * `:id` params are filled with real ids resolved by the setup project.
 */
const ROUTES_FILE = path.join(ROOT, 'website', 'admin', 'src', 'routes', 'index.tsx');

/** Param route prefix → key in .auth/ids.json `admin` (also used for routes other agents add later). */
const PARAM_IDS: Record<string, string> = {
  '/users/:id': 'userId',
  '/content/lessons/:id': 'lessonId',
  '/questions/:id': 'questionId',
  '/assessments/blueprints/:id': 'blueprintId',
  '/payments/transactions/:id': 'transactionId',
  '/schools/:id': 'schoolId',
  '/marketers/:id': 'marketerId',
  '/notifications/templates/:id': 'templateId',
  '/security/roles/:id': 'roleId',
  '/content/teachers/:id': 'teacherId',
  '/support/:id': 'ticketId',
  '/support/tickets/:id': 'ticketId',
  '/schools/incentive-rules/:id': 'schoolRuleId',
  '/schools/settlements/:id': 'schoolSettlementId',
  '/marketers/incentive-rules/:id': 'marketerRuleId',
  '/marketers/settlements/:id': 'marketerSettlementId',
  '/notifications/campaigns/:id': 'campaignId',
};

function parseRoutes(): { path: string; redirect?: string; guest?: boolean }[] {
  const src = fs.readFileSync(ROUTES_FILE, 'utf8');
  const out: { path: string; redirect?: string; guest?: boolean }[] = [];
  for (const m of src.matchAll(/page\('([^']+)'/g)) out.push({ path: m[1] });
  for (const m of src.matchAll(/\{\s*path:\s*'([^']+)',\s*element:\s*<Navigate to="([^"]+)"/g)) out.push({ path: m[1], redirect: m[2] });
  for (const m of src.matchAll(/\{\s*path:\s*'(\/[a-z0-9-]+)',\s*element:\s*<(?:Suspense[^>]*>\s*<)?(\w+)/g)) {
    if (['Navigate'].includes(m[2]) || out.some((r) => r.path === m[1])) continue;
    out.push({ path: m[1], guest: m[1] !== '/profile' });
  }
  return out;
}

const PARSED = parseRoutes();
const ids = () => (JSON.parse(fs.readFileSync(STATE.ids, 'utf8')) as { admin: Record<string, string | null> }).admin;
const slug = (p: string) => (p === '/' ? 'dashboard' : p.replace(/^\//, '').replace(/[/:]+/g, '-'));

function toCase(r: { path: string; redirect?: string; guest?: boolean }): RouteCase | { skip: string } {
  let url = r.path;
  if (url.includes(':')) {
    const key = PARAM_IDS[url];
    const id = key ? ids()[key] : null;
    if (!id) return { skip: `no id source for ${url}` };
    url = url.replace(/:[a-zA-Z]+/, id);
  }
  if (r.guest) {
    // Guest-only / token pages: visited signed-out. Without a token, verify-2fa bounces to /login.
    return { name: slug(r.path), path: url, auth: false, expectPath: r.path === '/verify-2fa' ? /^\/(verify-2fa|login)$/ : undefined };
  }
  return {
    name: slug(r.path),
    path: url,
    expectPath: r.redirect ? new RegExp(`^${r.redirect}$`) : undefined,
    // GET /admin/dashboard aggregates ~15 queries: 5–20 s against the remote dev DB (see docs/E2E.md).
    renderTimeout: r.path === '/' ? 30_000 : undefined,
  };
}

const EXTRA: RouteCase[] = [{ name: 'not-found', path: '/this-page-does-not-exist' }];

for (const lang of ['en', 'ar'] as Lang[]) {
  test.describe(`admin portal @routes ${lang}`, () => {
    for (const r of [...PARSED, ...EXTRA.map((e) => ({ path: e.path, extra: e }))]) {
      const name = 'extra' in r ? (r.extra as RouteCase).name : slug(r.path);
      test(`${lang} ${name}`, async ({ browser }, testInfo) => {
        const rc = 'extra' in r ? (r.extra as RouteCase) : toCase(r);
        if ('skip' in rc) test.skip(true, rc.skip);
        await sweepRoute(browser, testInfo, 'admin', lang, rc as RouteCase, testInfo.project.name.includes('mobile') ? 'admin-mobile' : 'admin');
      });
    }
  });
}
