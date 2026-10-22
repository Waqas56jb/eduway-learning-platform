import { expect, type Page } from '@playwright/test';
import type { Guard } from './guards';
import { STUDENT } from './env';

/**
 * Student OTP sign-in through the real UI: /login → mobile → "Send code" → /verify-otp → 6 digits.
 * Handles two real UX branches instead of bypassing them:
 *  - resend cool-down ("Please wait N seconds…") → waits N seconds and submits again;
 *  - device limit (2 devices) → the modal lists active sessions; we sign out the least recently active one.
 * Returns the access token issued to this browser (for read-only id lookups).
 */
export async function studentOtpLogin(page: Page, guard?: Guard): Promise<string> {
  // Intentional 4xx answers of this flow (cool-down 429 / device limit 422) are part of the UX under test.
  guard?.allow(/^POST \/api\/v1\/auth\/(send-otp|verify-otp)$/);
  await page.goto('/login');
  const mobile = page.locator('input[type="tel"], input[inputmode="tel"]').first();
  await mobile.fill(STUDENT.local);
  const submit = page.locator('form button[type="submit"]').first();

  for (let attempt = 0; attempt < 4; attempt++) {
    const sent = page.waitForResponse((r) => r.url().endsWith('/auth/send-otp') && r.request().method() === 'POST');
    await submit.click();
    const res = await sent;
    if (res.ok()) break;
    const body = (await res.json().catch(() => ({}))) as { error?: { details?: { retryAfterSeconds?: number } } };
    const wait = body.error?.details?.retryAfterSeconds ?? Number(res.headers()['retry-after'] ?? 30);
    expect(wait, `send-otp ${res.status()} without retry hint`).toBeLessThan(120);
    await page.waitForTimeout((wait + 1) * 1000);
  }
  await page.waitForURL(/\/verify-otp/);

  const verified = page.waitForResponse((r) => r.url().endsWith('/auth/verify-otp') && r.request().method() === 'POST');
  await page.locator('input[inputmode="numeric"]').first().click();
  await page.keyboard.type(STUDENT.otp, { delay: 40 });
  let res = await verified;
  if (res.status() === 422) {
    const body = (await res.json()) as { error: { details: { reason?: string; sessions?: { lastActive: string }[] } } };
    expect(body.error.details.reason).toBe('DEVICE_LIMIT_REACHED');
    const sessions = body.error.details.sessions ?? [];
    const oldest = sessions.reduce((best, s, i) => (new Date(s.lastActive) < new Date(sessions[best].lastActive) ? i : best), 0);
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const again = page.waitForResponse((r) => r.url().endsWith('/auth/verify-otp') && r.request().method() === 'POST');
    await dialog.locator('li').nth(oldest).getByRole('button').click();
    res = await again;
  }
  expect(res.status(), `verify-otp → ${await res.text()}`).toBe(200);
  const token = ((await res.json()) as { data: { tokens: { accessToken: string } } }).data.tokens.accessToken;
  await page.waitForURL(/\/student\/dashboard/, { timeout: 20_000 });
  return token;
}
