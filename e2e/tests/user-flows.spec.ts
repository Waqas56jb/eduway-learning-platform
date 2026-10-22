import fs from 'node:fs';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { AdminApi } from './support/adminApi';
import { AUTH_DIR, LANG_KEYS, STATE, USER_URL } from './support/env';
import { waitForApi } from './support/env';
import { attachGuard, expectClean, expectRendered, shot, type Guard } from './support/guards';
import { studentOtpLogin } from './support/student';

/**
 * Student journeys driven through the real UI (clicks + typing), one signed-in tab shared by the
 * serial steps: OTP login → lesson video + heartbeat → lesson quiz → practice → mistakes retry →
 * exam (autosave, submit, result) → AI tutor → checkout with the mock gateway → notifications →
 * profile + language switch → contact form → logout.
 */
test.describe.configure({ mode: 'serial' });

let context: BrowserContext;
let page: Page;
let guard: Guard;
const admin = new AdminApi();
let examBlueprintId: string | null = null;
/** Debug aid: E2E_REUSE_SESSION=1 starts from the saved student session instead of a new OTP login (OTP sends are rate limited). */
const REUSE = process.env.E2E_REUSE_SESSION === '1' && fs.existsSync(STATE.student);
export const CONTACT_MARKER_FILE = `${AUTH_DIR}/contact-ticket.json`;

test.beforeAll(async ({ browser }) => {
  context = await browser.newContext({ baseURL: USER_URL, viewport: { width: 1440, height: 900 }, acceptDownloads: true, storageState: REUSE ? STATE.student : undefined });
  await context.addInitScript(([k]) => {
    if (!sessionStorage.getItem('e2e.lang.applied')) {
      localStorage.setItem(k, 'en');
      sessionStorage.setItem('e2e.lang.applied', '1');
    }
  }, [LANG_KEYS.user]);
  page = await context.newPage();
  guard = attachGuard(page);
});

test.afterAll(async () => {
  // Fixture cleanup: the paper cannot be deleted once attempted (HAS_DEPENDENTS) → archive it.
  if (examBlueprintId) {
    await admin.del(`/admin/exam-blueprints/${examBlueprintId}`).catch(() => admin.post(`/admin/exam-blueprints/${examBlueprintId}/archive`).catch(() => undefined));
  }
  await admin.logout();
  if (REUSE) await context?.storageState({ path: STATE.student }).catch(() => undefined);
  await context?.close();
});

test.beforeEach(async () => {
  await waitForApi();
  guard.reset();
});
test.afterEach(async ({}, testInfo) => {
  await shot(page, 'flows-user', 'en', testInfo.title.replace(/\W+/g, '-')).catch(() => undefined);
});

test('@flow student signs in with the OTP code', async () => {
  if (REUSE) await page.goto('/student/dashboard');
  else await studentOtpLogin(page, guard);
  await expectRendered(page);
  await expect(page.getByRole('link', { name: /^dashboard$/i }).first()).toBeVisible();
  expectClean(guard, 'otp login');
});

test('@flow subject → lesson: signed video URL + progress heartbeat', async () => {
  await page.getByRole('link', { name: /^subjects$/i }).first().click();
  await page.waitForURL(/\/student\/subjects$/);
  await page.getByRole('link', { name: /mathematics/i }).first().click();
  await page.waitForURL(/\/student\/subjects\/[\w-]+$/);
  await expectRendered(page);
  const stream = page.waitForResponse((r) => /\/lessons\/[\w-]+\/stream-url$/.test(r.url()));
  await page.locator('a[href*="/student/lesson/"]').first().click();
  await page.waitForURL(/\/student\/lesson\//);
  const res = await stream;
  expect(res.status()).toBe(200);
  const { data } = (await res.json()) as { data: { url: string; heartbeatSeconds?: number } };
  expect(data.url).toMatch(/^https?:\/\//);
  const video = page.locator('video').first();
  await expect.poll(async () => video.evaluate((v: HTMLVideoElement) => v.currentSrc || v.src), { timeout: 15_000 }).not.toBe('');

  // Press play and wait for the watch heartbeat (PUT /progress/watch).
  const heartbeat = page.waitForRequest((r) => r.url().endsWith('/progress/watch') && r.method() === 'PUT', { timeout: 45_000 });
  await page.getByRole('button', { name: /^play/i }).first().click();
  const hb = await heartbeat;
  expect(JSON.parse(hb.postData() ?? '{}')).toMatchObject({ lessonId: expect.any(String) });
  await page.getByRole('button', { name: /^pause/i }).first().click().catch(() => undefined);
  expectClean(guard, 'lesson');
});

test('@flow lesson quiz to the result screen', async () => {
  test.setTimeout(240_000);
  const dialog = page.getByRole('dialog');
  // Some quizzes are unavailable for the demo student: sequentially locked lessons (button disabled) or a quiz
  // taken recently (cool-down: "You can retake this quiz a little later"). Walk the lesson lists until one is open.
  const candidates: string[] = [];
  const collect = async () => {
    for (const href of await page.locator('a[href*="/student/lesson/"]').evaluateAll((as) => as.map((a) => a.getAttribute('href') ?? '')))
      if (href && !candidates.includes(href)) candidates.push(href);
  };
  await collect();
  for (const slug of ['physics', 'chemistry', 'biology', 'english']) {
    await page.goto(`/student/subjects/${slug}`);
    await expectRendered(page);
    await collect();
  }
  let opened = false;
  // QUIZ_COOLDOWN (422) answers are the expected "retake later" state handled by the UI.
  guard.allow(/^POST \/api\/v1\/quizzes\/[\w-]+\/start$/);
  const starts: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && /\/quizzes\/[\w-]+\/start$/.test(r.url())) starts.push(r.url());
  });
  for (const href of candidates) {
    starts.length = 0;
    await page.goto(href);
    await expectRendered(page);
    const take = page.getByRole('button', { name: /take the quiz/i }).first();
    if (!(await take.isEnabled().catch(() => false))) continue;
    await take.click();
    await expect(dialog).toBeVisible();
    const cooldown = dialog.getByText(/retake this quiz a little later|no questions are available/i);
    // QUZ-01 (draws + persists the paper) measured 8–11 s against the remote dev DB → generous wait.
    await expect(dialog.getByRole('radio').first().or(cooldown)).toBeVisible({ timeout: 30_000 });
    if (!(await cooldown.isVisible())) {
      opened = true;
      break;
    }
    await dialog.getByRole('button', { name: /^close$/i }).click();
  }
  expect(opened, 'an available lesson quiz').toBe(true);
  // Regression: opening the quiz once must create exactly one attempt (QUZ-01 was sent twice).
  expect(starts, 'QUZ-01 calls for one opening').toHaveLength(1);
  const retry = dialog.getByRole('button', { name: /retry quiz/i });
  const next = dialog.getByRole('button', { name: /^(next|see my score)$/i });
  // Answer → Next until the result screen. The outgoing question animates out with disabled options and
  // "See my score" stays disabled while QUZ-03 runs, so each step polls for whichever state comes next.
  for (let i = 0; i < 40; i++) {
    let state = '';
    await expect(async () => {
      if (await retry.isVisible()) return void (state = 'done');
      if (await next.isEnabled().catch(() => false)) return void (state = 'next');
      const option = dialog.locator('[role="radio"]:not([disabled])').first();
      if (await option.isVisible().catch(() => false)) return void (state = 'answer');
      throw new Error('quiz busy');
    }).toPass({ timeout: 30_000 });
    if (state === 'done') break;
    if (state === 'answer') await dialog.locator('[role="radio"]:not([disabled])').first().click();
    else await next.click();
  }
  await expect(dialog.getByRole('progressbar', { name: /your score/i })).toBeVisible();
  await expect(dialog.getByText(/\d+ \/ \d+ correct/i)).toBeVisible();
  await expect(retry).toBeVisible();
  await page.keyboard.press('Escape');
  expectClean(guard, 'quiz');
});

test('@flow practice session from the question bank', async () => {
  await page.getByRole('link', { name: /^question bank$/i }).first().click();
  await page.waitForURL(/question-bank/);
  await expectRendered(page);
  await page.getByRole('button', { name: /^start \d+ questions/i }).click();
  await expect(page.getByText(/practice session/i).first()).toBeVisible();
  for (let i = 0; i < 12; i++) {
    const radios = page.getByRole('radio').filter({ hasNot: page.locator('[aria-checked="true"]') });
    if (!(await radios.first().isVisible().catch(() => false))) break;
    await page.getByRole('radiogroup').getByRole('radio').first().click();
    const next = page.getByRole('button', { name: /^next$/i });
    if (await next.isVisible().catch(() => false) && (await next.isEnabled())) await next.click();
    else break;
  }
  await page.getByRole('button', { name: /^finish$/i }).first().click();
  const finishNow = page.getByRole('button', { name: /finish now/i });
  if (await finishNow.isVisible().catch(() => false)) await finishNow.click();
  await expect(page.getByText(/session complete/i)).toBeVisible();
  await expect(page.getByText(/You answered \d+ of \d+ questions correctly/i)).toBeVisible();
  expectClean(guard, 'practice');
});

test('@flow retry a mistake', async () => {
  await page.getByRole('link', { name: /^my mistakes$/i }).first().click();
  await page.waitForURL(/mistakes/);
  await expectRendered(page);
  await page.getByRole('tab', { name: /unresolved/i }).click();
  // open the first mistake, retry it, answer
  const item = page.locator('main button[aria-expanded]').first();
  if (await item.isVisible().catch(() => false)) await item.click();
  else await page.locator('main li button').first().click();
  await page.getByRole('button', { name: /^retry$/i }).first().click();
  const retry = page.waitForResponse((r) => /\/mistakes\/[\w-]+\/retry$/.test(r.url()) && r.request().method() === 'POST');
  await page.locator('main [role="radiogroup"]').filter({ visible: true }).first().getByRole('radio').first().click();
  const check = page.getByRole('button', { name: /^(check|submit|check answer)/i });
  if (await check.isVisible().catch(() => false)) await check.click();
  expect((await retry).status()).toBe(200);
  await expect(page.getByText(/correct — nicely done|not quite/i).first()).toBeVisible();
  expectClean(guard, 'mistakes');
});

test('@flow exam: start → answer → autosave → submit → result', async () => {
  test.setTimeout(180_000);
  // Fixture: the seeded papers are used up for the demo student → publish a fresh copy (cleaned up in afterAll).
  const dup = await admin.post<{ id: string }>('/admin/exam-blueprints/406f36fd-2fba-5cc0-85d1-ec2c4eba3a30/duplicate');
  examBlueprintId = dup.id;
  await admin.post(`/admin/exam-blueprints/${dup.id}/publish`, { force: true });

  await page.getByRole('link', { name: /^exam simulator$/i }).first().click();
  await page.waitForURL(/\/student\/exams$/);
  await expectRendered(page);
  await page.getByRole('button', { name: /^start exam$/i }).first().click();
  const dialog = page.getByRole('dialog');
  if (await dialog.isVisible().catch(() => false)) await dialog.getByRole('button', { name: /start/i }).last().click();
  await page.waitForURL(/\/student\/exams\/[\w-]+\/room$/);
  await expect(page.getByRole('radiogroup').first()).toBeVisible({ timeout: 20_000 });

  const autosave = page.waitForRequest((r) => /\/exams\/attempts\/[\w-]+\/autosave$/.test(r.url()) && r.method() === 'PUT', { timeout: 60_000 });
  await page.getByRole('radiogroup').first().getByRole('radio').first().click();
  await page.getByRole('button', { name: /^next$/i }).first().click();
  await page.getByRole('radiogroup').first().getByRole('radio').nth(1).click();
  const saved = await autosave;
  expect(JSON.parse(saved.postData() ?? '{}')).toHaveProperty('answers');

  await page.getByRole('button', { name: /^submit/i }).first().click();
  const confirm = page.getByRole('dialog');
  await expect(confirm.getByText(/submit your exam/i)).toBeVisible();
  await confirm.getByRole('button', { name: /^submit exam$/i }).click();
  await page.waitForURL(/\/student\/exams\/result\/[\w-]+$/, { timeout: 30_000 });
  await expectRendered(page);
  await expect(page.getByText(/%/).first()).toBeVisible();
  expectClean(guard, 'exam');
});

test('@flow AI tutor answers (streamed) and the allowance changes', async () => {
  test.setTimeout(120_000);
  await page.getByRole('link', { name: /^ai tutor$/i }).first().click();
  await page.waitForURL(/ai-tutor/);
  await expectRendered(page);
  const allowance = page.getByLabel(/AI questions left this month/i).first();
  const before = (await allowance.getAttribute('aria-label')) ?? '';
  await page.getByRole('button', { name: /^new chat$/i }).click();
  await page.getByLabel(/^your question$/i).fill('In one sentence: what is the derivative of x squared?');
  const stream = page.waitForResponse((r) => r.url().includes('/ai-tutor/') && r.request().method() === 'POST' && /messages|stream|ask/.test(r.url()), { timeout: 60_000 });
  await page.getByRole('button', { name: /^send question$/i }).click();
  const res = await stream;
  expect(res.status()).toBeLessThan(400);
  const log = page.getByRole('log').or(page.getByLabel(/conversation with the ai tutor/i)).first();
  await expect(log.getByText(/derivative of x squared/i)).toBeVisible();
  // the assistant bubble finishes streaming → copy/feedback actions appear for it
  await expect(page.getByRole('button', { name: /^copy answer$/i }).last()).toBeVisible({ timeout: 60_000 });
  await expect.poll(async () => (await allowance.getAttribute('aria-label')) ?? '', { timeout: 15_000 }).not.toBe(before);
  expectClean(guard, 'ai tutor');
});

test('@flow subscription checkout with the mock gateway → receipt', async () => {
  test.setTimeout(120_000);
  await page.getByRole('link', { name: /^subscription$/i }).first().click();
  await page.waitForURL(/subscription/);
  await expectRendered(page);
  await page.getByRole('button', { name: /^renew plan$/i }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/complete your payment/i)).toBeVisible();
  await dialog.getByRole('button', { name: /^continue$/i }).click(); // summary → method
  await dialog.locator('input[type="radio"]').first().check({ force: true }).catch(() => undefined);
  await dialog.getByRole('button', { name: /^continue$/i }).click(); // method → details
  const card = dialog.getByLabel(/card number/i);
  if (await card.isVisible().catch(() => false)) {
    await card.fill('4242 4242 4242 4242');
    await dialog.getByLabel(/name on card/i).fill('Ahmed E2E');
    await dialog.getByLabel(/expiry/i).fill('12/30');
    await dialog.getByLabel(/^cvc/i).fill('123');
  }
  const phone = dialog.getByLabel(/wallet mobile number/i);
  if (await phone.isVisible().catch(() => false)) await phone.fill('07701234567');
  const confirmed = page.waitForResponse((r) => /\/payments\/mock\/[\w-]+\/confirm$/.test(r.url()), { timeout: 60_000 });
  await dialog.getByRole('button', { name: /^pay /i }).click();
  expect((await confirmed).status()).toBe(200);
  await expect(dialog.getByText(/payment successful/i)).toBeVisible({ timeout: 30_000 });
  await expect(dialog.getByText(/receipt number/i)).toBeVisible();
  await dialog.getByRole('button', { name: /^done$/i }).click();
  expectClean(guard, 'checkout');
});

test('@flow notifications: open one (marks read) and mark all read', async () => {
  await page.getByRole('link', { name: /^notifications/i }).first().click();
  await page.waitForURL(/notifications/);
  await expectRendered(page);
  await page.getByRole('tab', { name: /^unread/i }).click();
  const first = page.locator('main').getByRole('button', { name: /ago/ }).first();
  if (await first.isVisible().catch(() => false)) {
    const read = page.waitForResponse((r) => /\/notifications\/[\w-]+\/read$/.test(r.url()));
    await first.click();
    expect((await read).status()).toBe(200);
    await page.goto('/student/notifications');
    await expectRendered(page);
  }
  const markAll = page.getByRole('button', { name: /^mark all as read$/i });
  if (await markAll.isEnabled().catch(() => false)) {
    const all = page.waitForResponse((r) => r.url().endsWith('/notifications/read-all'));
    await markAll.click();
    expect((await all).status()).toBe(200);
  }
  await page.getByRole('tab', { name: /^unread/i }).click();
  await expect(page.getByText(/no unread notifications|all caught up/i).first()).toBeVisible();
  expectClean(guard, 'notifications');
});

test('@flow profile edit + language switch EN ↔ AR', async () => {
  await page.getByRole('link', { name: /^profile & settings$/i }).first().click();
  await page.waitForURL(/profile/);
  await expectRendered(page);
  const school = page.getByPlaceholder(/your school's name/i);
  const original = await school.inputValue();
  for (const value of [`${original} (e2e)`, original]) {
    await school.fill(value);
    const saved = page.waitForResponse((r) => r.url().endsWith('/me') && r.request().method() === 'PATCH');
    await page.getByRole('button', { name: /^save changes$/i }).click();
    expect((await saved).status()).toBe(200);
    await expect(school).toHaveValue(value);
  }
  // language → Arabic (RTL) and back
  const langOption = (l: 'en' | 'ar') => page.locator(`label:has(input[name="language"][value="${l}"])`);
  await langOption('ar').click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await page.reload();
  await expectRendered(page);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await langOption('en').click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  expectClean(guard, 'profile');
});

test('@flow contact form creates a support ticket (submitted once)', async () => {
  // Public contact endpoint is rate limited (5/h/IP) → exactly one submission per run.
  await page.goto('/contact');
  await expectRendered(page);
  const marker = `E2E ${Date.now()}`;
  await page.getByPlaceholder(/your name/i).fill('E2E Browser Test');
  await page.getByPlaceholder(/0770 123 4567 or you@example.com/i).fill('07701234567');
  await page.getByPlaceholder(/tell us how we can help/i).fill(`${marker} — automated browser test message, safe to close.`);
  const sent = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/public/contact'));
  await page.getByRole('button', { name: /^send message$/i }).click();
  const res = await sent;
  expect(res.status()).toBe(201);
  const { data } = (await res.json()) as { data: { ticketId: string } };
  fs.writeFileSync(CONTACT_MARKER_FILE, JSON.stringify({ marker, ticketId: data.ticketId }));
  expectClean(guard, 'contact');
});

test('@flow logout', async () => {
  test.skip(REUSE, 'session reused for debugging — keep it');
  await page.goto('/student/dashboard');
  await expectRendered(page);
  const out = page.waitForResponse((r) => r.url().endsWith('/auth/logout'));
  await page.getByRole('button', { name: /^log out$/i }).first().click();
  const confirm = page.getByRole('dialog');
  if (await confirm.isVisible().catch(() => false)) await confirm.getByRole('button', { name: /log out/i }).last().click();
  expect((await out).status()).toBe(200);
  await page.waitForURL((u) => !u.pathname.startsWith('/student'));
  await page.goto('/student/dashboard');
  await page.waitForURL(/\/login/);
  expectClean(guard, 'logout');
});
