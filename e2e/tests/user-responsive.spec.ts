import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { openApp } from './support/fixtures';
import { expectRendered } from './support/guards';
import { SHOT_DIR, STATE, waitForApi, type Lang } from './support/env';

/**
 * Responsive audit of every route of website/user (project `user-responsive`).
 *
 * For each language × width (360, 390, 768, 1024, 1280, 1920) every route is opened, scrolled through
 * (so `whileInView` animations have settled), screenshotted, and every tab of every `[role=tablist]` is
 * clicked; the dashboard also opens the top-bar overlays (drawer, search, menus) and the subscription page
 * the checkout sheet. The page must never scroll horizontally — at phone widths (360 / 390) and at every
 * other audited width: `scrollWidth` of the document may not exceed the viewport. Offending elements are
 * listed in the failure message and in
 * `screenshots/responsive/<phase>/report.json`.
 *
 * Screenshots: `screenshots/responsive/<phase>/<lang>/<width>/<route>[--tab-N].png`, where phase is
 * `E2E_SHOT_PHASE` (default `after`). Widths can be narrowed with `E2E_RESPONSIVE_WIDTHS=360,390`.
 * The exam room is not opened (it starts an attempt-consuming exam); it is covered by user-flows.
 */
const PHASE = process.env.E2E_SHOT_PHASE ?? 'after';
const WIDTHS = (process.env.E2E_RESPONSIVE_WIDTHS ?? '360,390,768,1024,1280,1920').split(',').map(Number);
// Phone widths are the contract (360/390); every other audited width is held to the same rule.
const STRICT_WIDTHS = [360, 390, ...WIDTHS];
const ONLY = process.env.E2E_RESPONSIVE_ROUTES?.split(',');
const HEIGHT: Record<number, number> = { 360: 780, 390: 844, 768: 1024, 1024: 768, 1280: 800, 1920: 1080 };

interface R {
  name: string;
  path: string;
  auth: boolean;
}

const ids = () => JSON.parse(fs.readFileSync(STATE.ids, 'utf8')) as { student: { subjectId: string; lessonId: string; attemptId: string } };

function routes(): R[] {
  const s = ids().student;
  const list: R[] = [
    { name: 'landing', path: '/', auth: false },
    { name: 'pricing', path: '/pricing', auth: false },
    { name: 'about', path: '/about', auth: false },
    { name: 'contact', path: '/contact', auth: false },
    { name: 'terms', path: '/terms', auth: false },
    { name: 'privacy', path: '/privacy', auth: false },
    { name: 'verify-email', path: '/verify-email?token=e2e-invalid-token', auth: false },
    { name: 'not-found', path: '/this-page-does-not-exist', auth: false },
    { name: 'login', path: '/login', auth: false },
    { name: 'register', path: '/register', auth: false },
    { name: 'verify-otp', path: '/verify-otp', auth: false },
    { name: 'landing-signed-in', path: '/', auth: true },
    { name: 'dashboard', path: '/student/dashboard', auth: true },
    { name: 'subjects', path: '/student/subjects', auth: true },
    { name: 'subject-detail', path: `/student/subjects/${s.subjectId}`, auth: true },
    { name: 'lesson', path: `/student/lesson/${s.lessonId}`, auth: true },
    { name: 'ai-tutor', path: '/student/ai-tutor', auth: true },
    { name: 'question-bank', path: '/student/question-bank', auth: true },
    { name: 'mistakes', path: '/student/mistakes', auth: true },
    { name: 'exams', path: '/student/exams', auth: true },
    { name: 'exam-result', path: `/student/exams/result/${s.attemptId}`, auth: true },
    { name: 'progress', path: '/student/progress', auth: true },
    { name: 'subscription', path: '/student/subscription', auth: true },
    { name: 'notifications', path: '/student/notifications', auth: true },
    { name: 'profile', path: '/student/profile', auth: true },
  ];
  return ONLY ? list.filter((r) => ONLY.includes(r.name)) : list;
}

interface Overflow {
  scrollWidth: number;
  clientWidth: number;
  offenders: string[];
}

/** Document horizontal overflow + the outermost elements that stick out of the viewport (diagnostics). */
async function measure(page: Page): Promise<Overflow> {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const vw = doc.clientWidth;
    const clipped = (el: Element) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX;
        if (ox !== 'visible') return true;
      }
      return false;
    };
    const describe = (el: Element) => {
      const h = el as HTMLElement;
      const cls = typeof h.className === 'string' ? h.className.split(/\s+/).slice(0, 6).join('.') : '';
      const r = h.getBoundingClientRect();
      const txt = (h.innerText ?? '').trim().slice(0, 40).replace(/\s+/g, ' ');
      return `${h.tagName.toLowerCase()}${h.id ? `#${h.id}` : ''}${cls ? `.${cls}` : ''} [${Math.round(r.left)}..${Math.round(r.right)}] "${txt}"`;
    };
    const out: Element[] = [];
    for (const el of document.body.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right <= vw + 1 && r.left >= -1) continue;
      const s = getComputedStyle(el);
      if (s.position === 'fixed' || s.visibility === 'hidden') continue;
      if (clipped(el)) continue;
      if (out.some((o) => o.contains(el))) continue;
      out.push(el);
    }
    return { scrollWidth: doc.scrollWidth, clientWidth: vw, offenders: out.slice(0, 8).map(describe) };
  });
}

/** Scroll through the whole page so scroll-triggered animations run, then back to the top. */
async function settle(page: Page) {
  await page.evaluate(async () => {
    const step = Math.max(300, Math.floor(window.innerHeight * 0.8));
    // Bounded: pages that keep growing (lazy lists) must not loop forever.
    for (let y = 0, i = 0; y < document.documentElement.scrollHeight && i < 40; y += step, i++) {
      window.scrollTo({ top: y, behavior: 'instant' });
      await new Promise((r) => setTimeout(r, 60));
    }
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
    await new Promise((r) => setTimeout(r, 250));
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
  await page.waitForTimeout(700);
}

async function snap(page: Page, lang: Lang, width: number, name: string, fullPage = true) {
  const file = path.join(SHOT_DIR, 'responsive', PHASE, lang, String(width), `${name.replace(/[^\w.-]+/g, '_')}.png`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await page.screenshot({ path: file, fullPage, animations: 'disabled' }).catch(() => page.screenshot({ path: file }));
}

interface Finding {
  lang: Lang;
  width: number;
  route: string;
  state: string;
  scrollWidth: number;
  clientWidth: number;
  offenders: string[];
}

async function auditGroup(browser: Browser, lang: Lang, width: number, list: R[], auth: boolean, findings: Finding[]) {
  if (!list.length) return;
  const mobile = width < 768;
  const { context, page, save } = await openApp(browser, {
    app: 'user',
    lang,
    auth,
    contextOptions: { viewport: { width, height: HEIGHT[width] ?? 900 }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 },
  });
  try {
    for (const r of list) {
      const t0 = Date.now();
      try {
        await withTimeout(auditRoute(page, r), 120_000, `${r.name} audit`);
      } catch (e) {
        findings.push({ lang, width, route: r.name, state: `error: ${(e as Error).message.split('\n')[0]}`, scrollWidth: 0, clientWidth: 0, offenders: [] });
      }
      if (process.env.E2E_RESPONSIVE_DEBUG) console.log(`${lang} ${width} ${r.name} ${Date.now() - t0}ms`);
    }
  } finally {
    await save();
    await context.close();
  }

  async function auditRoute(page: Page, r: R) {
      await page.goto(r.path);
      await expectRendered(page, 15_000).catch(() => undefined);
      await settle(page);
      const record = async (state: string) => {
        const m = await measure(page);
        if (m.scrollWidth > m.clientWidth + 1 || m.offenders.length) {
          findings.push({ lang, width, route: r.name, state, ...m });
        }
      };
      await record('page');
      await snap(page, lang, width, r.name);
      // What the visitor actually sees first (top bar, fixed bars) — full-page shots stretch fixed elements.
      await snap(page, lang, width, `${r.name}--viewport`, false);

      // Shell overlays (top bar menus, mobile drawer / search) — opened once, on the dashboard.
      if (r.name === 'dashboard') {
        const overlays: [string, string][] = [
          ['drawer', 'header button[aria-haspopup="dialog"]'],
          ['search', 'header button[aria-label]:has(svg.lucide-search)'],
          ['notifications-menu', 'header button[aria-haspopup="true"]'],
          ['user-menu', 'header button[aria-haspopup="menu"]'],
        ];
        for (const [label, sel] of overlays) {
          const btn = page.locator(sel).first();
          if (!(await btn.isVisible().catch(() => false))) continue;
          await btn.click();
          await page.waitForTimeout(700);
          await record(label);
          await snap(page, lang, width, `${r.name}--${label}`, false);
          await page.goto(r.path);
          await expectRendered(page, 15_000).catch(() => undefined);
        }
      }

      // Checkout sheet (first step only — nothing is submitted).
      if (r.name === 'subscription') {
        const renew = page.locator('main button:has(svg.lucide-refresh-cw)').first();
        if (await renew.isEnabled().catch(() => false)) {
          await renew.click();
          await page.waitForTimeout(800);
          await record('checkout-modal');
          await snap(page, lang, width, `${r.name}--checkout`, false);
          await page.goto(r.path);
          await expectRendered(page, 15_000).catch(() => undefined);
        }
      }

      // Every tab of every tab bar (profile, notifications, subscription, exam result, lesson, …).
      const tablists = page.locator('main [role="tablist"], [role="tablist"]');
      const lists = await tablists.count();
      for (let li = 0; li < Math.min(lists, 4); li++) {
        const tabs = tablists.nth(li).locator('[role="tab"]');
        const n = await tabs.count();
        for (let ti = 0; ti < n; ti++) {
          const tab = tabs.nth(ti);
          if (!(await tab.isVisible()) || (await tab.getAttribute('aria-selected')) === 'true') continue;
          await tab.scrollIntoViewIfNeeded().catch(() => undefined);
          await tab.click().catch(() => undefined);
          await page.waitForTimeout(600);
          await record(`tab ${li}.${ti}`);
          if (width <= 768) await snap(page, lang, width, `${r.name}--tab-${li}-${ti}`);
        }
      }
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let id: NodeJS.Timeout;
  return Promise.race([p, new Promise<T>((_, rej) => (id = setTimeout(() => rej(new Error(`${what} timed out after ${ms} ms`)), ms)))]).finally(() => clearTimeout(id));
}

for (const lang of ['en', 'ar'] as Lang[]) {
  test.describe(`student site @responsive ${lang}`, () => {
    for (const width of WIDTHS) {
      test(`${lang} ${width}px`, async ({ browser }) => {
        test.setTimeout(15 * 60_000);
        await waitForApi();
        const findings: Finding[] = [];
        const all = routes();
        await auditGroup(browser, lang, width, all.filter((r) => !r.auth), false, findings);
        await auditGroup(browser, lang, width, all.filter((r) => r.auth), true, findings);

        const reportFile = path.join(SHOT_DIR, 'responsive', PHASE, 'report.json');
        fs.mkdirSync(path.dirname(reportFile), { recursive: true });
        const prev = fs.existsSync(reportFile) ? (JSON.parse(fs.readFileSync(reportFile, 'utf8')) as Finding[]) : [];
        const merged = prev.filter((f) => !(f.lang === lang && f.width === width)).concat(findings);
        fs.writeFileSync(reportFile, JSON.stringify(merged, null, 2));

        const overflow = findings.filter((f) => f.scrollWidth > f.clientWidth + 1 || f.state.startsWith('error'));
        if (STRICT_WIDTHS.includes(width)) {
          expect(
            overflow.map((f) => `${f.route} (${f.state}): scrollWidth ${f.scrollWidth} > ${f.clientWidth}\n    ${f.offenders.join('\n    ')}`),
            `pages with document horizontal overflow at ${width}px (${lang})`,
          ).toEqual([]);
        }
      });
    }
  });
}
