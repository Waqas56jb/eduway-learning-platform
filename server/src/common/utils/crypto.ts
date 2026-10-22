import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env.js';

/** HMAC-SHA256 (keyed with JWT_REFRESH_SECRET) — used to store refresh tokens, OTP codes, reset tokens. */
export function hashToken(token: string, purpose = 'token'): string {
  return createHmac('sha256', env.JWT_REFRESH_SECRET).update(`${purpose}:${token}`).digest('hex');
}

export function sha256(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

/** URL-safe random token (default 48 bytes ≈ 64 chars). */
export function randomToken(bytes = 48): string {
  return randomBytes(bytes).toString('base64url');
}

/** Numeric code of `length` digits using a CSPRNG (OTP). */
export function randomNumericCode(length = 6): string {
  let out = '';
  for (let i = 0; i < length; i++) out += String(randomInt(0, 10));
  return out;
}

const ALPHANUM = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O/1/I

/** Human-friendly code (referral codes, receipts…). */
export function randomCode(length = 8, alphabet = ALPHANUM): string {
  let out = '';
  for (let i = 0; i < length; i++) out += alphabet[randomInt(0, alphabet.length)];
  return out;
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Generate a strong password satisfying our policy (used by seed/create-admin when none is supplied). */
export function generateStrongPassword(length = 20): string {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#$%^&*-_=+?'];
  const all = sets.join('');
  const chars = sets.map((s) => s[randomInt(0, s.length)] as string);
  while (chars.length < length) chars.push(all[randomInt(0, all.length)] as string);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [chars[i], chars[j]] = [chars[j] as string, chars[i] as string];
  }
  return chars.join('');
}

/** Password policy: ≥10 chars, upper, lower, digit, symbol. */
export function isStrongPassword(pw: string): boolean {
  return pw.length >= 10 && /[A-Z]/.test(pw) && /[a-z]/.test(pw) && /\d/.test(pw) && /[^A-Za-z0-9]/.test(pw);
}
