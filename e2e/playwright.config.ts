import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { ADMIN_URL, MODE, ROOT, USER_URL } from './tests/support/env';

/**
 * EDUWAY browser E2E.
 *  - E2E_MODE=preview (default): production bundles (`npm run build:apps` → e2e/.dist) served by `vite preview`.
 *  - E2E_MODE=dev: the apps' Vite dev servers.
 * The API is NOT started here — it must already be running (default http://localhost:4100/api/v1).
 * Ports are dedicated to the suite (4273/4274 preview, 5373/5374 dev) so they never clash with a developer's servers.
 *
 * Everything runs serially (workers: 1): the student/admin sessions use rotating refresh tokens that are
 * carried from test to test, and the admin "maintenance" flow briefly affects the whole student site.
 */
const preview = MODE === 'preview';
const userPort = new URL(USER_URL).port;
const adminPort = new URL(ADMIN_URL).port;
const vite = (app: 'user' | 'admin', port: string) =>
  preview
    ? `node node_modules/vite/bin/vite.js preview --port ${port} --strictPort --outDir "${path.join(ROOT, 'e2e', '.dist', app)}"`
    : `node node_modules/vite/bin/vite.js --port ${port} --strictPort`;

const desktop = { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } };
const mobile = { ...devices['iPhone 13'], browserName: 'chromium' as const, defaultBrowserType: 'chromium' as const, viewport: { width: 390, height: 844 } };

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  fullyParallel: false,
  workers: 1,
  // One retry absorbs a transient API restart (the dev API runs under `tsx watch`); retried passes are reported as flaky.
  retries: 1,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }], ['json', { outputFile: 'test-results/results.json' }]],
  use: {
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    acceptDownloads: true,
  },
  globalTeardown: './scripts/teardown.ts',
  webServer: [
    { command: vite('user', userPort), cwd: path.join(ROOT, 'website', 'user'), url: USER_URL, reuseExistingServer: false, timeout: 120_000 },
    { command: vite('admin', adminPort), cwd: path.join(ROOT, 'website', 'admin'), url: ADMIN_URL, reuseExistingServer: false, timeout: 120_000 },
  ],
  projects: [
    { name: 'setup-user', testMatch: /setup\/.*\.setup\.ts/, grep: /student logs in/, use: desktop },
    { name: 'setup-admin', testMatch: /setup\/.*\.setup\.ts/, grep: /super admin logs in/, use: desktop },
    { name: 'user-routes-desktop', testMatch: /user-routes\.spec\.ts/, dependencies: ['setup-user'], use: desktop },
    { name: 'user-routes-mobile', testMatch: /user-routes\.spec\.ts/, dependencies: ['setup-user'], use: mobile },
    { name: 'admin-routes', testMatch: /admin-routes\.spec\.ts/, dependencies: ['setup-admin'], use: desktop },
    // Phone-width pass of the admin portal: shell/dashboard plus the newest pages (teachers, support tickets,
    // marketer detail with attributed students, delivery log) and the list/detail pages they link to.
    {
      name: 'admin-routes-mobile',
      testMatch: /admin-routes\.spec\.ts/,
      grep: / (en|ar) (dashboard|users|users-id|content-teachers|support|marketers|marketers-id|notifications-delivery-log|login)$/,
      dependencies: ['setup-admin'],
      use: mobile,
    },
    // Responsive audit: every student-site route × EN/AR × 360/390/768/1024/1280/1920 px; fails on document
    // horizontal overflow at 360/390 px. Screenshots → screenshots/responsive/<E2E_SHOT_PHASE>/.
    { name: 'user-responsive', testMatch: /user-responsive\.spec\.ts/, dependencies: ['setup-user'], use: desktop },
    // Branded Edge ships the proprietary H.264/AAC codecs the lesson videos (MP4) need; Playwright's bundled
    // Chromium cannot play them, so the lesson heartbeat would never fire there. Override with E2E_FLOW_CHANNEL.
    { name: 'user-flows', testMatch: /user-flows\.spec\.ts/, dependencies: ['setup-user'], use: { ...desktop, channel: process.env.E2E_FLOW_CHANNEL ?? 'msedge' } },
    { name: 'admin-flows', testMatch: /admin-flows\.spec\.ts/, dependencies: ['setup-admin', 'setup-user'], use: desktop },
  ],
});
