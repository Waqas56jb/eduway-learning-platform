import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { ADMIN_URL, AUTH_DIR, E2E_DIR, LANG_KEYS, USER_URL, adminCredentials } from './support/env';
import { waitForApi } from './support/env';
import { attachGuard, expectClean, expectRendered, shot, type Guard } from './support/guards';

/**
 * Admin journeys through the real portal UI. Everything created here is removed again
 * (lesson draft, question, teacher, price change, maintenance mode). Student support notes are
 * append-only by design (no delete endpoint) — the note is clearly tagged "[E2E]".
 */
test.describe.configure({ mode: 'serial' });

let context: BrowserContext;
let page: Page;
let guard: Guard;
const STAMP = `E2E ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
const created: { lessonTitle?: string; questionText?: string; teacherName?: string } = {};
let maintenanceOn = false;

test.beforeAll(async ({ browser }) => {
  context = await browser.newContext({ baseURL: ADMIN_URL, viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  await context.addInitScript(([k]) => {
    if (!sessionStorage.getItem('e2e.lang.applied')) {
      localStorage.setItem(k, 'en');
      sessionStorage.setItem('e2e.lang.applied', '1');
    }
  }, [LANG_KEYS.admin]);
  page = await context.newPage();
  guard = attachGuard(page);
});

test.afterAll(async () => {
  // Safety net: never leave the platform in maintenance mode.
  if (maintenanceOn) await toggleMaintenance(false).catch(() => undefined);
  await context?.close();
});

test.beforeEach(async () => {
  await waitForApi();
  guard.reset();
});
test.afterEach(async ({}, testInfo) => {
  await shot(page, 'flows-admin', 'en', testInfo.title.replace(/\W+/g, '-')).catch(() => undefined);
});

const confirmDialog = async (button: RegExp, typeToConfirm?: string) => {
  const dlg = page.getByRole('dialog').or(page.getByRole('alertdialog')).last();
  await expect(dlg).toBeVisible();
  if (typeToConfirm) await dlg.getByRole('textbox').fill(typeToConfirm);
  await dlg.getByRole('button', { name: button }).last().click();
};

/** The list toolbar's search field (labelled "Search"). */
const searchBox = () => page.locator('main').getByRole('textbox', { name: /search/i }).first();

/** Opens a row's "More actions" menu (the row containing `text`) and picks `item`. */
const rowAction = async (text: string | RegExp, item: RegExp) => {
  const row = page.locator('tr', { hasText: text }).first();
  await row.getByRole('button', { name: /more actions/i }).click();
  await page.getByRole('menuitem', { name: item }).click();
};

async function toggleMaintenance(on: boolean) {
  await page.goto('/settings/app');
  await expectRendered(page);
  const sw = page.getByRole('switch', { name: /maintenance mode/i });
  if ((await sw.getAttribute('aria-checked')) === String(on)) return;
  await sw.click();
  const saved = page.waitForResponse((r) => r.url().includes('/admin/settings') && ['PUT', 'PATCH'].includes(r.request().method()));
  await page.getByRole('button', { name: /^save changes$/i }).click();
  if (on) await confirmDialog(/enable maintenance/i, 'MAINTENANCE');
  expect((await saved).status()).toBe(200);
  maintenanceOn = on;
  await expect(sw).toHaveAttribute('aria-checked', String(on));
}

test('@flow admin signs in', async () => {
  const { email, password } = adminCredentials();
  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL((u) => u.pathname === '/');
  await expectRendered(page);
  expectClean(guard, 'admin login');
});

test('@flow dashboard renders KPIs', async () => {
  await expect(page.locator('main h1').first()).toBeVisible();
  await expect(page.locator('main').getByText(/\d/).first()).toBeVisible();
  expectClean(guard, 'dashboard');
});

test('@flow students: filter → open detail → add a support note', async () => {
  await page.getByRole('link', { name: /^users$|^students$/i }).first().click().catch(() => page.goto('/users'));
  await page.waitForURL(/\/users$/);
  await expectRendered(page);
  const list = page.waitForResponse((r) => r.url().includes('/admin/students?') && r.url().includes('Ahmed'));
  await searchBox().fill('Ahmed');
  await list;
  await page.locator('main select').first().selectOption({ label: 'Status: Active' }).catch(() => undefined);
  await page.waitForLoadState('networkidle');
  const firstStudent = page.locator('main tbody tr', { hasText: /ahmed/i }).first();
  await expect(firstStudent).toBeVisible();
  await firstStudent.locator('td').nth(1).click();
  await page.waitForURL(/\/users\/[\w-]+$/);
  await expectRendered(page);
  await page.getByRole('tab', { name: /support notes/i }).click();
  const note = `[${STAMP}] automated browser test note — safe to ignore.`;
  await page.getByLabel(/add note/i).first().fill(note);
  const saved = page.waitForResponse((r) => /\/admin\/students\/[\w-]+\/notes$/.test(r.url()) && r.request().method() === 'POST');
  await page.getByRole('button', { name: /^add note$/i }).click();
  expect((await saved).status()).toBe(201);
  await expect(page.getByText(note)).toBeVisible();
  expectClean(guard, 'students');
});

test('@flow content: create a lesson draft → move it on the workflow board → delete it', async () => {
  test.setTimeout(180_000);
  created.lessonTitle = `${STAMP} lesson draft`;
  await page.goto('/content/lessons/new');
  await expectRendered(page);
  await page.locator('input[name="title_en"]').fill(created.lessonTitle);
  await page.locator('input[name="title_ar"]').fill(`درس تجريبي ${STAMP}`);
  const selects = page.locator('main select');
  await selects.nth(0).selectOption({ label: 'Mathematics' });
  await expect(selects.nth(1).locator('option')).not.toHaveCount(1);
  await selects.nth(1).selectOption({ index: 1 });
  await expect(selects.nth(2).locator('option')).not.toHaveCount(1);
  await selects.nth(2).selectOption({ index: 1 });
  await selects.nth(3).selectOption({ index: 1 }); // teacher
  const createdRes = page.waitForResponse((r) => r.url().endsWith('/admin/lessons') && r.request().method() === 'POST');
  await page.getByRole('button', { name: /^save draft$/i }).click();
  expect((await createdRes).status()).toBe(201);
  await page.waitForURL(/\/content\/lessons\/[\w-]+$/);

  // workflow board: drag the card from Draft to In Review
  await page.goto('/content/workflow');
  await expectRendered(page);
  await searchBox().fill(STAMP);
  const card = page.locator('[aria-roledescription="draggable lesson"]', { hasText: created.lessonTitle });
  await expect(card).toBeVisible();
  const target = page.locator('section[aria-label="In Review"]');
  const from = (await card.boundingBox())!;
  await target.scrollIntoViewIfNeeded();
  const to = (await target.boundingBox())!;
  const moved = page.waitForResponse((r) => /\/admin\/lessons\/[\w-]+\/(status|transition|submit|workflow)/.test(r.url()) || (/\/admin\/lessons\/[\w-]+$/.test(r.url()) && r.request().method() !== 'GET'));
  await page.mouse.move(from.x + from.width / 2, from.y + 20);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + 30, { steps: 3 });
  await page.mouse.move(to.x + to.width / 2, to.y + 120, { steps: 15 });
  // dnd-kit auto-scrolls the board while dragging → re-aim at the column's current position before dropping
  for (let i = 0; i < 3; i++) {
    await page.waitForTimeout(300);
    const now = (await target.boundingBox())!;
    await page.mouse.move(now.x + now.width / 2, now.y + 120, { steps: 5 });
  }
  await page.mouse.up();
  expect((await moved).status()).toBeLessThan(300);
  await expect(target.locator('[aria-roledescription="draggable lesson"]', { hasText: created.lessonTitle })).toBeVisible();

  // delete it from the editor
  await target.getByRole('link', { name: created.lessonTitle }).click();
  await page.waitForURL(/\/content\/lessons\/[\w-]+$/);
  await expectRendered(page);
  const del = page.waitForResponse((r) => /\/admin\/lessons\/[\w-]+$/.test(r.url()) && r.request().method() === 'DELETE');
  await page.getByRole('button', { name: /^delete$/i }).click();
  await confirmDialog(/^delete$/i);
  expect((await del).status()).toBeLessThan(300);
  created.lessonTitle = undefined;
  expectClean(guard, 'content workflow');
});

test('@flow questions: create → delete', async () => {
  test.setTimeout(120_000);
  created.questionText = `${STAMP}: what is 2 + 2?`;
  await page.goto('/questions/new');
  await expectRendered(page);
  await page.getByPlaceholder(/e\.g\. find the modulus/i).fill(created.questionText);
  await page.getByPlaceholder(/مثال: جد مقياس/).fill(`${STAMP}: كم يساوي ٢ + ٢؟`);
  for (const [i, v] of ['3', '4', '5', '6'].entries()) {
    const letter = 'ABCD'[i];
    await page.getByLabel(`Option (English) ${letter}`).fill(v);
    await page.getByLabel(`Option (Arabic) ${letter}`).fill(v);
  }
  await page.getByRole('radio', { name: /^B$/ }).click();
  // explanation editors (EN, AR) are the 3rd and 4th rich-text areas
  await page.locator('main textarea').nth(2).fill('2 + 2 = 4.');
  await page.locator('main textarea').nth(3).fill('٢ + ٢ = ٤.');
  const selects = page.locator('main select');
  await selects.nth(0).selectOption({ label: 'Mathematics' });
  await expect(selects.nth(1).locator('option')).not.toHaveCount(1);
  await selects.nth(1).selectOption({ index: 1 });
  await expect(selects.nth(2).locator('option')).not.toHaveCount(1);
  await selects.nth(2).selectOption({ index: 1 });
  await page.getByRole('radio', { name: /^easy$/i }).click();
  const saved = page.waitForResponse((r) => r.url().endsWith('/admin/questions') && r.request().method() === 'POST');
  await page.getByRole('button', { name: /^save draft$/i }).click();
  expect((await saved).status()).toBe(201);
  await page.waitForURL(/\/questions\/[\w-]+$/);

  // delete through the list's bulk action (also sweeps leftovers of an earlier interrupted run)
  await page.goto('/questions');
  await expectRendered(page);
  await searchBox().fill('E2E 20');
  await expect(page.locator('main tbody tr', { hasText: STAMP }).first()).toBeVisible();
  const rows = page.locator('main tbody tr', { hasText: /E2E 20\d\d-\d\d-\d\d/ });
  for (let i = 0; i < (await rows.count()); i++) await rows.nth(i).getByRole('checkbox').check();
  const del = page.waitForResponse((r) => r.url().includes('/admin/questions/bulk') && r.request().method() === 'POST');
  await page.getByRole('button', { name: /^delete$/i }).first().click();
  await confirmDialog(/^delete$/i);
  expect((await del).status()).toBeLessThan(300);
  await expect(page.locator('main tbody tr', { hasText: STAMP })).toHaveCount(0);
  created.questionText = undefined;
  expectClean(guard, 'questions');
});

test('@flow packages: edit a price and put it back', async () => {
  await page.goto('/packages');
  await expectRendered(page);
  await page.getByRole('button', { name: /^edit$/i }).first().click();
  const drawer = page.getByRole('dialog');
  await expect(drawer).toBeVisible();
  const price = drawer.getByRole('spinbutton', { name: /^price/i });
  const original = await price.inputValue();
  for (const value of [String(Number(original) + 1000), original]) {
    await price.fill(value);
    const saved = page.waitForResponse((r) => /\/admin\/packages\/[\w-]+$/.test(r.url()) && ['PUT', 'PATCH'].includes(r.request().method()));
    await drawer.getByRole('button', { name: /^(save|save changes|update)/i }).click();
    expect((await saved).status()).toBe(200);
    if (value !== original) {
      await expect(drawer).toBeHidden();
      await page.getByRole('button', { name: /^edit$/i }).first().click();
      await expect(drawer).toBeVisible();
      await expect(price).toHaveValue(value);
    }
  }
  expectClean(guard, 'packages');
});

test('@flow settings: maintenance on → student site shows maintenance → off', async ({ browser }) => {
  test.setTimeout(150_000);
  await toggleMaintenance(true);
  const student = await browser.newContext({ baseURL: USER_URL });
  await student.addInitScript(([k]) => localStorage.setItem(k, 'en'), [LANG_KEYS.user]);
  const sp = await student.newPage();
  await sp.goto('/login');
  await expect(sp.getByRole('heading', { name: /we'll be right back/i })).toBeVisible({ timeout: 20_000 });
  await expect(sp.getByRole('button', { name: /check again/i })).toBeVisible();
  await expect(sp.locator('input[type="tel"]')).toHaveCount(0);
  await shot(sp, 'flows-admin', 'en', 'student-maintenance-screen');
  await toggleMaintenance(false);
  await sp.reload();
  await expect(sp.locator('input[type="tel"]').first()).toBeVisible({ timeout: 20_000 });
  await student.close();
  expectClean(guard, 'maintenance');
});

test('@flow analytics: export download', async () => {
  await page.goto('/analytics/exports');
  await expectRendered(page);
  await page.getByRole('radio', { name: /^students/i }).click();
  const download = page.waitForEvent('download', { timeout: 60_000 });
  await page.getByRole('button', { name: /^generate export$/i }).click();
  const file = await download;
  const target = path.join(E2E_DIR, 'test-results', 'downloads', file.suggestedFilename());
  await file.saveAs(target);
  expect(fs.statSync(target).size).toBeGreaterThan(20);
  // re-download the stored file from the history table (only stored exports offer the button)
  const again = page.waitForEvent('download', { timeout: 60_000 });
  await page.locator('main tbody tr').first().getByRole('button', { name: /^download$/i }).click();
  expect((await again).suggestedFilename()).toMatch(/\.(csv|xlsx)$/);
  expectClean(guard, 'exports');
});

test('@flow teachers: create with avatar upload → delete', async () => {
  test.setTimeout(150_000);
  created.teacherName = `${STAMP} Teacher`;
  await page.goto('/content/teachers');
  await expectRendered(page);
  await page.getByRole('button', { name: /^new teacher$/i }).click();
  const drawer = page.getByRole('dialog');
  await expect(drawer).toBeVisible();
  const upload = page.waitForResponse((r) => r.url().includes('/storage') || r.url().includes('/upload'), { timeout: 60_000 });
  await drawer.locator('input[type="file"]').first().setInputFiles(path.join(E2E_DIR, 'fixtures', 'avatar.png'));
  expect((await upload).status()).toBeLessThan(300);
  await drawer.locator('#t-en').fill(created.teacherName);
  await drawer.locator('#t-ar').fill(`مدرس تجريبي ${STAMP}`);
  await drawer.locator('#t-subject').selectOption({ label: 'Physics' });
  const saved = page.waitForResponse((r) => r.url().endsWith('/admin/teachers') && r.request().method() === 'POST');
  await drawer.getByRole('button', { name: /^(create|save)/i }).last().click();
  expect((await saved).status()).toBe(201);
  await expect(drawer).toBeHidden();
  await searchBox().fill(STAMP);
  const row = page.locator('tr', { hasText: created.teacherName }).first();
  await expect(row).toBeVisible();
  await expect(row.locator('img').first()).toBeVisible();
  const del = page.waitForResponse((r) => /\/admin\/teachers\/[\w-]+$/.test(r.url()) && r.request().method() === 'DELETE');
  await rowAction(created.teacherName, /delete/i);
  await confirmDialog(/^delete$/i);
  expect((await del).status()).toBeLessThan(300);
  created.teacherName = undefined;
  expectClean(guard, 'teachers');
});

test('@flow support: tabs, ticket drawer, reply, deep link, resolve', async () => {
  test.setTimeout(150_000);
  const marker = fs.existsSync(path.join(AUTH_DIR, 'contact-ticket.json'))
    ? (JSON.parse(fs.readFileSync(path.join(AUTH_DIR, 'contact-ticket.json'), 'utf8')) as { marker: string; ticketId: string })
    : null;
  await page.goto('/support');
  await expectRendered(page);
  for (const tab of [/^awaiting reply/i, /^resolved/i, /^all/i, /^open/i]) {
    await page.getByRole('tab', { name: tab }).click();
    await page.waitForLoadState('networkidle');
    await expectRendered(page);
  }
  // open a ticket from the list (the contact-form ticket from user-flows when available)
  if (marker) {
    await page.getByRole('tab', { name: /^all/i }).click();
    await searchBox().fill(marker.marker);
    await page.waitForLoadState('networkidle');
  }
  await page.locator('main tbody tr').first().click();
  const drawer = page.getByRole('dialog');
  await expect(drawer).toBeVisible();
  await expect(page).toHaveURL(/[?&]ticket=/);
  const ticketId = new URL(page.url()).searchParams.get('ticket')!;
  if (marker) {
    // only reply to / resolve the ticket this run created — seeded tickets are left untouched
    expect(ticketId).toBe(marker.ticketId);
    await drawer.locator('#tk-reply').fill(`[${STAMP}] Thanks — this is an automated E2E reply.`);
    const replied = page.waitForResponse((r) => r.url().includes(`/admin/support-tickets/${ticketId}`) && r.request().method() === 'POST');
    await drawer.getByRole('button', { name: /^reply & resolve$/i }).click();
    expect((await replied).status()).toBeLessThan(300);
    await expect(drawer.getByText(/automated E2E reply/)).toBeVisible();
  }
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  // deep link
  await page.goto(`/support?ticket=${ticketId}`);
  await expectRendered(page);
  await expect(page.getByRole('dialog')).toBeVisible();
  expectClean(guard, 'support');
});

test('@flow marketer detail: attributed students + incentive card', async () => {
  await page.goto('/marketers');
  await expectRendered(page);
  await page.locator('main tbody tr').first().locator('td').nth(1).click();
  await page.waitForURL(/\/marketers\/[\w-]+$/);
  await expectRendered(page);
  await expect(page.getByText(/^attributed students$/i)).toBeVisible();
  await expect(page.getByText(/students via the marketer's referral code/i)).toBeVisible();
  await expect(page.getByText(/incentive/i).first()).toBeVisible();
  expectClean(guard, 'marketer detail');
});

test('@flow delivery log: stat cards follow the filters', async () => {
  await page.goto('/notifications/delivery-log');
  await expectRendered(page);
  const cards = page.locator('main').getByRole('button', { name: /messages/i });
  const before = await cards.allInnerTexts();
  expect(before.length).toBeGreaterThan(0);
  await page.locator('main select').filter({ hasText: 'Channel:' }).selectOption({ label: 'In-app' }).catch(async () => {
    await page.locator('main select').first().selectOption({ index: 2 });
  });
  await expect.poll(async () => (await cards.allInnerTexts()).join('|')).not.toBe(before.join('|'));
  expectClean(guard, 'delivery log');
});

test('@flow security audit log shows this run\'s actions', async () => {
  await page.goto('/security/audit-logs');
  await expectRendered(page);
  // filter by each action this run performed; the newest row must be ours (performed minutes ago)
  let checked = 0;
  for (const action of ['lesson.create', 'lesson.delete', 'question.create', 'settings.update', 'teacher.create']) {
    const filter = page.locator(`main select:has(option[value="${action}"])`);
    if (!(await filter.count())) continue; // action name not used by this server build
    await filter.selectOption(action);
    const row = page.locator('main tbody tr').first();
    await expect(row).toContainText(action);
    await expect(row).toContainText(/second|minute|just now/i);
    checked++;
  }
  expect(checked).toBeGreaterThanOrEqual(3);
  expectClean(guard, 'audit');
});

test('@flow admin logs out', async () => {
  await page.getByRole('button', { name: /super admin/i }).first().click();
  const out = page.waitForResponse((r) => r.url().endsWith('/auth/logout'));
  await page.getByRole('menuitem', { name: /sign out|log out/i }).click();
  expect((await out).status()).toBe(200);
  await page.waitForURL(/\/login/);
  expectClean(guard, 'logout');
});
