import fs from 'node:fs';
import { test as base, type BrowserContext, type Page } from '@playwright/test';
import { attachGuard, type Guard } from './guards';
import { ADMIN_URL, LANG_KEYS, STATE, USER_URL, type AppName, type Lang } from './env';

/**
 * Session handling: both apps rotate the refresh token on every use (reuse detection revokes the whole
 * family), so a saved storage state goes stale as soon as a page loads. Each test therefore starts from
 * the latest saved state and writes the (rotated) state back when it ends. Tests run serially.
 */
export async function openApp(
  browser: import('@playwright/test').Browser,
  opts: { app: AppName; lang?: Lang; auth?: boolean; contextOptions?: Parameters<import('@playwright/test').Browser['newContext']>[0] },
): Promise<{ context: BrowserContext; page: Page; guard: Guard; save: () => Promise<void> }> {
  const stateFile = opts.app === 'user' ? STATE.student : STATE.admin;
  const useState = opts.auth !== false && fs.existsSync(stateFile);
  const context = await browser.newContext({
    ...opts.contextOptions,
    baseURL: opts.app === 'user' ? USER_URL : ADMIN_URL,
    storageState: useState ? stateFile : undefined,
  });
  if (opts.lang) {
    // Set the language once per tab (the first document), so in-app language switches persist across reloads.
    await context.addInitScript(
      ([key, lang]) => {
        try {
          if (!sessionStorage.getItem('e2e.lang.applied')) {
            localStorage.setItem(key, lang);
            sessionStorage.setItem('e2e.lang.applied', '1');
          }
        } catch {
          /* storage unavailable */
        }
      },
      [LANG_KEYS[opts.app], opts.lang] as const,
    );
  }
  const page = await context.newPage();
  const guard = attachGuard(page);
  const save = async () => {
    if (!useState) return;
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
    await context.storageState({ path: stateFile });
  };
  return { context, page, guard, save };
}

type Fixtures = {
  lang: Lang;
  userPage: { page: Page; guard: Guard };
  adminPage: { page: Page; guard: Guard };
};

export const test = base.extend<Fixtures>({
  lang: ['en', { option: true }],
  userPage: async ({ browser, lang }, use, testInfo) => {
    const { context, page, guard, save } = await openApp(browser, {
      app: 'user',
      lang,
      contextOptions: { ...pickDevice(testInfo.project.use) },
    });
    await use({ page, guard });
    await save();
    await context.close();
  },
  adminPage: async ({ browser, lang }, use, testInfo) => {
    const { context, page, guard, save } = await openApp(browser, {
      app: 'admin',
      lang,
      contextOptions: { ...pickDevice(testInfo.project.use) },
    });
    await use({ page, guard });
    await save();
    await context.close();
  },
});

function pickDevice(u: import('@playwright/test').PlaywrightTestOptions | Record<string, unknown>) {
  const o = u as Record<string, unknown>;
  const keys = ['viewport', 'userAgent', 'deviceScaleFactor', 'isMobile', 'hasTouch', 'locale', 'acceptDownloads'] as const;
  return Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
}

export { expect } from '@playwright/test';
