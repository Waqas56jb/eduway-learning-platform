import type { Browser, Page, TestInfo } from '@playwright/test';
import { openApp } from './fixtures';
import { expectClean, expectDir, expectNoRawText, expectRendered, shot, type Guard } from './guards';
import { waitForApi, type AppName, type Lang } from './env';

export interface RouteCase {
  /** Screenshot / test name. */
  name: string;
  path: string;
  /** Visit as a signed-in user (default true). */
  auth?: boolean;
  /** Expected final pathname (after redirects); defaults to `path` without query. */
  expectPath?: RegExp;
  /** API failures that are expected on this page (`METHOD /api/v1/...` regex). */
  allow?: RegExp[];
  /** Render budget (default 10 s) — only raised for documented slow endpoints. */
  renderTimeout?: number;
  /** Extra page-specific assertion. */
  check?: (page: Page) => Promise<void>;
}

function deviceOptions(testInfo: TestInfo) {
  const u = testInfo.project.use as Record<string, unknown>;
  const keys = ['viewport', 'userAgent', 'deviceScaleFactor', 'isMobile', 'hasTouch'] as const;
  return Object.fromEntries(keys.filter((k) => u[k] !== undefined).map((k) => [k, u[k]]));
}

/** Full per-page check: rendered, dir/lang, no raw keys, screenshot, no runtime errors. */
export async function sweepRoute(browser: Browser, testInfo: TestInfo, app: AppName, lang: Lang, rc: RouteCase, shotApp: string) {
  await waitForApi();
  const { context, page, guard, save } = await openApp(browser, { app, lang, auth: rc.auth !== false, contextOptions: deviceOptions(testInfo) });
  try {
    for (const re of rc.allow ?? []) guard.allow(re);
    await page.goto(rc.path);
    await expectRendered(page, rc.renderTimeout);
    const expected = rc.expectPath ?? new RegExp(`^${rc.path.split('?')[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/?$`);
    if (!expected.test(new URL(page.url()).pathname)) {
      throw new Error(`expected ${rc.path} to stay on ${expected}, landed on ${new URL(page.url()).pathname}`);
    }
    await expectDir(page, lang);
    if (rc.check) await rc.check(page);
    await expectNoRawText(page, app);
    await shot(page, shotApp, lang, rc.name);
    // Give late requests (polling, lazy charts) a moment to surface errors.
    await page.waitForTimeout(500);
    expectClean(guard, `${app} ${lang} ${rc.path}`);
  } catch (e) {
    await shot(page, shotApp, lang, `${rc.name}.FAILED`).catch(() => undefined);
    throw e;
  } finally {
    await save();
    await context.close();
  }
}

export type { Guard };
