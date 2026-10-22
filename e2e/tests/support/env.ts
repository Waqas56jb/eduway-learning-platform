import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const E2E_DIR = path.join(ROOT, 'e2e');
export const AUTH_DIR = path.join(E2E_DIR, '.auth');
export const SHOT_DIR = path.join(E2E_DIR, 'screenshots');

export const MODE = (process.env.E2E_MODE ?? 'preview') === 'dev' ? 'dev' : 'preview';
export const USER_URL = process.env.E2E_USER_URL ?? (MODE === 'dev' ? 'http://localhost:5373' : 'http://localhost:4273');
export const ADMIN_URL = process.env.E2E_ADMIN_URL ?? (MODE === 'dev' ? 'http://localhost:5374' : 'http://localhost:4274');
export const API_URL = (process.env.E2E_API_URL ?? 'http://localhost:4100/api/v1').replace(/\/+$/, '');

export const STUDENT = { phone: '+9647701234567', local: '07701234567', otp: '123456' };

/** Super-admin credentials, read at runtime from server/.env (never logged / copied). */
export function adminCredentials(): { email: string; password: string } {
  const file = path.join(ROOT, 'server', '.env');
  const parsed = fs.existsSync(file) ? dotenv.parse(fs.readFileSync(file)) : {};
  const email = process.env.E2E_ADMIN_EMAIL ?? parsed.SEED_SUPER_ADMIN_EMAIL ?? 'admin@eduway.iq';
  const password = process.env.E2E_ADMIN_PASSWORD ?? parsed.SEED_SUPER_ADMIN_PASSWORD;
  if (!password) throw new Error('SEED_SUPER_ADMIN_PASSWORD missing in server/.env (or set E2E_ADMIN_PASSWORD)');
  return { email, password };
}

export const STATE = {
  student: path.join(AUTH_DIR, 'student.json'),
  admin: path.join(AUTH_DIR, 'admin.json'),
  ids: path.join(AUTH_DIR, 'ids.json'),
};

export const LANG_KEYS = { user: 'eduway.lang', admin: 'eduway.admin.lang' } as const;
export type Lang = 'en' | 'ar';
export type AppName = 'user' | 'admin';

/**
 * The shared dev API runs under `tsx watch` and restarts whenever someone edits server code. A request
 * during that window fails with ECONNREFUSED — an environment hiccup, not an app bug — so every page check
 * first waits (≤ 90 s) until `/health` answers.
 */
export async function waitForApi(timeoutMs = 90_000): Promise<void> {
  const until = Date.now() + timeoutMs;
  let stable = 0;
  while (Date.now() < until) {
    try {
      const r = await fetch(`${API_URL}/health`);
      stable = r.ok ? stable + 1 : 0;
    } catch {
      stable = 0;
    }
    if (stable >= 2) return; // two consecutive answers → not mid-restart
    await new Promise((res) => setTimeout(res, 500));
  }
  throw new Error(`API ${API_URL} not reachable for ${timeoutMs / 1000}s`);
}
