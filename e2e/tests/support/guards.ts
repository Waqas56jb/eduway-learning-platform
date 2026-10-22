import fs from 'node:fs';
import path from 'node:path';
import { expect, type Page, type Response } from '@playwright/test';
import { API_URL, ROOT, SHOT_DIR, type AppName } from './env';

/* ------------------------------------------------------------------ i18n namespaces */

/** Top-level i18n namespaces of an app — a visible "<ns>.<key>" string means a missing translation. */
function namespaces(app: AppName): string[] {
  const base = path.join(ROOT, 'website', app, 'src', 'i18n');
  const ns = new Set(Object.keys(JSON.parse(fs.readFileSync(path.join(base, 'en.json'), 'utf8'))));
  if (app === 'user') {
    for (const f of fs.readdirSync(path.join(base, 'locales', 'en'))) ns.add(f.replace(/\.json$/, ''));
  } else {
    for (const f of fs.readdirSync(path.join(base, 'modules'))) {
      const m = f.match(/^([\w-]+)\.en\.json$/);
      if (m) ns.add(m[1]);
    }
  }
  return [...ns];
}

const KEY_RE: Record<AppName, RegExp> = {
  user: new RegExp(`(?<![@/\\w.-])(?:${namespaces('user').join('|')})\\.[a-zA-Z_][a-zA-Z0-9_]*(?:\\.[a-zA-Z0-9_]+)*\\b`, 'g'),
  admin: new RegExp(`(?<![@/\\w.-])(?:${namespaces('admin').join('|')})\\.[a-zA-Z_][a-zA-Z0-9_]*(?:\\.[a-zA-Z0-9_]+)*\\b`, 'g'),
};
/** Generic dotted lower-camel identifiers (`foo.barBaz`) that look like keys even outside a known namespace. */
const GENERIC_KEY_RE = /(?<![@/\w.:-])[a-z]+(?:\.[a-zA-Z0-9_]+)+\b(?![@/-])/g;
/** Generic matches that are legitimate prose: domains / e-mail hosts, abbreviations, file names. */
const GENERIC_OK = /\.(iq|com|net|org|io|app|dev|edu|gov|csv|pdf|png|jpg|mp4|json|xlsx)$|^(e\.g|i\.e|etc)$|^\w\.\w$/i;
const BAD_TEXT_RE = /\bundefined\b|\bNaN\b|\[object Object\]|\{\{\s*\w+\s*\}\}|\bInvalid Date\b/g;

/* ------------------------------------------------------------------ console noise allow-list */

/**
 * Console errors that are NOT application bugs. Each entry carries its justification.
 * Resource-load failures of API calls are not listed here — they are caught (and judged) by the
 * network guard instead, so we ignore the duplicate console line only for those.
 */
const BENIGN_CONSOLE: { re: RegExp; why: string }[] = [
  {
    re: /Failed to load resource: .*(net::ERR_|status of 4\d\d|status of 5\d\d)/,
    why: 'Browser echo of a failed request — API failures are asserted by the network guard; third-party media failures are judged there too.',
  },
  { re: /Download the React DevTools/, why: 'React dev-mode banner (dev pass only).' },
];

export interface Guard {
  pageErrors: string[];
  consoleErrors: string[];
  apiFailures: { method: string; url: string; status: number; body?: string }[];
  requestFailures: string[];
  /** Allow API failures whose `METHOD path` matches (intentionally tested errors). */
  allow: (re: RegExp) => void;
  reset: () => void;
}

const apiOrigin = new URL(API_URL).origin;

/** Attaches collectors for page errors, console errors and failing API requests. */
export function attachGuard(page: Page): Guard {
  const allowed: RegExp[] = [];
  const g: Guard = {
    pageErrors: [],
    consoleErrors: [],
    apiFailures: [],
    requestFailures: [],
    allow: (re) => void allowed.push(re),
    reset: () => {
      g.pageErrors.length = 0;
      g.consoleErrors.length = 0;
      g.apiFailures.length = 0;
      g.requestFailures.length = 0;
    },
  };
  page.on('pageerror', (err) => g.pageErrors.push(`${err.name}: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (BENIGN_CONSOLE.some((b) => b.re.test(text))) return;
    g.consoleErrors.push(text.slice(0, 500));
  });
  page.on('response', async (res: Response) => {
    const url = res.url();
    if (!url.startsWith(apiOrigin) || res.status() < 400) return;
    const req = res.request();
    const sig = `${req.method()} ${new URL(url).pathname}`;
    if (allowed.some((re) => re.test(sig))) return;
    let body: string | undefined;
    try {
      body = (await res.text()).slice(0, 300);
    } catch {
      /* body unavailable */
    }
    // 401 TOKEN_EXPIRED is the documented reactive-refresh handshake: both API clients catch it, refresh
    // once (single-flight) and replay the request. A failed replay still surfaces (as 401 UNAUTHORIZED,
    // a refresh failure, or the page bouncing to /login, which the route assertions catch).
    if (res.status() === 401 && body?.includes('"TOKEN_EXPIRED"')) return;
    g.apiFailures.push({ method: req.method(), url, status: res.status(), body });
  });
  page.on('requestfailed', (req) => {
    const url = req.url();
    const err = req.failure()?.errorText ?? '';
    // Aborted requests happen legitimately on navigation / react-query cancellation.
    if (/ERR_ABORTED|NS_BINDING_ABORTED|cancelled/i.test(err)) return;
    if (!url.startsWith(apiOrigin)) return; // third-party media (Unsplash, sample video CDNs) is outside our control
    const sig = `${req.method()} ${new URL(url).pathname}`;
    if (allowed.some((re) => re.test(sig))) return;
    g.requestFailures.push(`${sig} → ${err}`);
  });
  return g;
}

export function expectClean(g: Guard, label = '') {
  const problems = [
    ...g.pageErrors.map((e) => `pageerror: ${e}`),
    ...g.consoleErrors.map((e) => `console.error: ${e}`),
    ...g.apiFailures.map((f) => `api ${f.status}: ${f.method} ${f.url} ${f.body ?? ''}`),
    ...g.requestFailures.map((f) => `requestfailed: ${f}`),
  ];
  expect(problems, `runtime problems ${label}`).toEqual([]);
}

/* ------------------------------------------------------------------ page content checks */

const SKELETON_SELECTOR = '[class*="animate-[shimmer"], .animate-shimmer, [aria-busy="true"]';

/** Waits (≤10 s) until the page shows real content: no skeletons, and visible text in the main region. */
export async function expectRendered(page: Page, timeout = 10_000) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForLoadState('networkidle', { timeout }).catch(() => undefined);
  await expect
    .poll(
      async () =>
        page.evaluate((sel) => {
          const visible = (el: Element) => {
            const r = (el as HTMLElement).getBoundingClientRect();
            const s = getComputedStyle(el as HTMLElement);
            return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
          };
          const sk = [...document.querySelectorAll(sel)].filter(visible).length;
          const main = document.querySelector('main') ?? document.body;
          const text = (main as HTMLElement).innerText.trim().length;
          return sk === 0 && text > 20 ? 'ok' : `skeletons=${sk} text=${text}`;
        }, SKELETON_SELECTOR),
      { timeout, message: 'page still loading (skeleton) or empty after 10 s' },
    )
    .toBe('ok');
}

/** No raw i18n keys / undefined / NaN / [object Object] in visible text. */
export async function expectNoRawText(page: Page, app: AppName) {
  // Technical identifiers deliberately rendered verbatim in monospace (audit action codes such as
  // `auth.login`, webhook event types such as `payment.succeeded`) are not translatable copy.
  // Options of a closed <select> are not visible (only the chosen one is): drop the others.
  const text = await page.evaluate(() => {
    document.querySelectorAll('option').forEach((o) => o.toggleAttribute('data-e2e-chosen', (o as HTMLOptionElement).selected));
    const clone = document.body.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('option:not([data-e2e-chosen])').forEach((el) => el.remove());
    clone.querySelectorAll('code, kbd, pre, .font-mono').forEach((el) => el.remove());
    // innerText needs layout: measure the clone off-screen.
    clone.style.cssText = 'position:absolute;left:-99999px;top:0;width:1400px';
    document.body.appendChild(clone);
    const out = clone.innerText;
    clone.remove();
    return out;
  });
  const found = new Set<string>();
  for (const re of [KEY_RE[app], BAD_TEXT_RE]) for (const m of text.matchAll(re)) found.add(m[0]);
  for (const m of text.matchAll(GENERIC_KEY_RE)) if (!GENERIC_OK.test(m[0])) found.add(m[0]);
  // Visible attributes users read too (placeholders, aria labels on icon buttons, titles).
  const attrs = await page.evaluate(() =>
    [...document.querySelectorAll('[placeholder],[aria-label],[title],img[alt]')]
      .map((el) => [el.getAttribute('placeholder'), el.getAttribute('aria-label'), el.getAttribute('title'), el.getAttribute('alt')].filter(Boolean).join(' '))
      .join('\n'),
  );
  for (const m of attrs.matchAll(KEY_RE[app])) found.add(`[attr] ${m[0]}`);
  for (const m of attrs.matchAll(BAD_TEXT_RE)) found.add(`[attr] ${m[0]}`);
  expect([...found], 'raw i18n keys / bad values in visible text').toEqual([]);
}

export async function expectDir(page: Page, lang: 'en' | 'ar') {
  await expect(page.locator('html')).toHaveAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
  await expect(page.locator('html')).toHaveAttribute('lang', lang);
}

export async function shot(page: Page, app: string, lang: string, name: string) {
  const file = path.join(SHOT_DIR, app, lang, `${name.replace(/[^\w.-]+/g, '_')}.png`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await page.screenshot({ path: file, fullPage: true, animations: 'disabled' }).catch(() => page.screenshot({ path: file }));
}
