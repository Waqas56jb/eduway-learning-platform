import fs from 'node:fs';
import { expect, test as setup, type APIRequestContext } from '@playwright/test';
import { attachGuard, expectClean } from '../support/guards';
import { studentOtpLogin } from '../support/student';
import { ADMIN_URL, API_URL, AUTH_DIR, LANG_KEYS, STATE, USER_URL, adminCredentials, waitForApi } from '../support/env';

/**
 * Logs both personas in through the real UI (OTP for the student, e-mail + password for the super admin),
 * saves their browser storage for the route sweeps, and resolves real entity ids for the
 * parameterised routes (read-only API calls with the access token issued to that browser login).
 */

const unwrap = async <T>(api: APIRequestContext, token: string, path: string): Promise<T> => {
  const res = await api.get(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${token}`, 'X-Client-Platform': 'web' } });
  expect(res.status(), `GET ${path}`).toBeLessThan(400);
  return ((await res.json()) as { data: T }).data;
};
const firstId = (rows: unknown): string | null => {
  const list = Array.isArray(rows) ? rows : ((rows as { items?: unknown[] })?.items ?? []);
  return ((list[0] as { id?: string } | undefined)?.id ?? null) as string | null;
};

setup('student logs in with OTP via the UI', async ({ browser, request }) => {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  await waitForApi();
  // The OTP resend policy allows only a few codes per 30 min, so a still-valid saved session is reused
  // (the full OTP UI flow — incl. the device-limit dialog — is exercised in user-flows.spec.ts anyway).
  let page = await browser.newPage({ baseURL: USER_URL, storageState: fs.existsSync(STATE.student) ? STATE.student : undefined });
  let guard = attachGuard(page);
  await page.addInitScript(([k]) => localStorage.setItem(k, 'en'), [LANG_KEYS.user]);
  let accessToken: string | null = null;
  if (fs.existsSync(STATE.student)) {
    const refreshed = page.waitForResponse((r) => r.url().endsWith('/auth/refresh'), { timeout: 15_000 }).catch(() => null);
    await page.goto('/student/dashboard');
    const res = await refreshed;
    if (res?.ok()) accessToken = ((await res.json()) as { data: { accessToken: string } }).data.accessToken;
  }
  if (!accessToken) {
    await page.context().close();
    page = await browser.newPage({ baseURL: USER_URL });
    guard = attachGuard(page);
    await page.addInitScript(([k]) => localStorage.setItem(k, 'en'), [LANG_KEYS.user]);
    accessToken = await studentOtpLogin(page, guard);
  }
  await expect(page).toHaveURL(/\/student\/dashboard/);
  await page.waitForLoadState('networkidle');
  expectClean(guard, 'student login');
  await page.context().storageState({ path: STATE.student });

  // ids for parameterised student routes
  const subjects = await unwrap<{ id: string; slug: string }[]>(request, accessToken, '/subjects');
  const math = subjects.find((s) => s.slug === 'math') ?? subjects[0];
  const subject = await unwrap<{ lessons: { id: string; locked?: boolean }[]; nextLessonId: string | null }>(request, accessToken, `/subjects/${math.id}`);
  const lessons = subject.lessons ?? [];
  const attempts = await unwrap<{ id: string; status: string }[]>(request, accessToken, '/exams/attempts?pageSize=5');
  const ids = {
    student: {
      subjectId: math.id,
      subjectSlug: math.slug,
      lessonId: (lessons.find((l) => !l.locked) ?? lessons[0])?.id ?? null,
      attemptId: attempts.find((a) => a.status === 'submitted' || a.status === 'graded')?.id ?? attempts[0]?.id ?? null,
    },
  };
  fs.writeFileSync(STATE.ids, JSON.stringify({ ...(fs.existsSync(STATE.ids) ? JSON.parse(fs.readFileSync(STATE.ids, 'utf8')) : {}), ...ids }, null, 2));
});

setup('super admin logs in via the UI', async ({ page, request }) => {
  const { email, password } = adminCredentials();
  await waitForApi();
  const guard = attachGuard(page);
  await page.addInitScript(([k]) => localStorage.setItem(k, 'en'), [LANG_KEYS.admin]);
  await page.goto(`${ADMIN_URL}/login`);
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  const login = page.waitForResponse((r) => r.url().includes('/auth/admin/login') && r.request().method() === 'POST');
  await page.getByRole('button', { name: /^sign in$/i }).click();
  const res = await login;
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { data: { tokens?: { accessToken: string }; mfaRequired?: boolean } };
  expect(body.data.tokens, 'super admin must not require MFA for the e2e run').toBeTruthy();
  const accessToken = body.data.tokens!.accessToken;
  await page.waitForURL((u) => u.pathname === '/', { timeout: 20_000 });
  await page.waitForLoadState('networkidle');
  expectClean(guard, 'admin login');
  await page.context().storageState({ path: STATE.admin });

  const get = <T>(p: string) => unwrap<T>(request, accessToken, p).catch(() => null);
  const ids = {
    admin: {
      userId: firstId(await get('/admin/students?pageSize=1')),
      lessonId: firstId(await get('/admin/lessons?pageSize=1')),
      questionId: firstId(await get('/admin/questions?pageSize=1')),
      blueprintId: firstId(await get('/admin/exam-blueprints?pageSize=1')),
      transactionId: firstId(await get('/admin/payments?pageSize=1')),
      schoolId: firstId(await get('/admin/schools?pageSize=1')),
      marketerId: firstId(await get('/admin/marketers?pageSize=1')),
      templateId: firstId(await get('/admin/notification-templates?pageSize=1')),
      roleId: firstId(await get('/admin/roles')),
      teacherId: firstId(await get('/admin/teachers')),
      ticketId: firstId(await get('/admin/support-tickets?pageSize=1')),
      schoolRuleId: firstId(await get('/admin/incentive-rules?partnerType=school')),
      marketerRuleId: firstId(await get('/admin/incentive-rules?partnerType=marketer')),
      schoolSettlementId: firstId(await get('/admin/settlements?partnerType=school&pageSize=1')),
      marketerSettlementId: firstId(await get('/admin/settlements?partnerType=marketer&pageSize=1')),
      campaignId: firstId(await get('/admin/campaigns?pageSize=1')),
    },
  };
  fs.writeFileSync(STATE.ids, JSON.stringify({ ...(fs.existsSync(STATE.ids) ? JSON.parse(fs.readFileSync(STATE.ids, 'utf8')) : {}), ...ids }, null, 2));
});
