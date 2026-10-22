import { describe, expect, it } from 'vitest';
import { SETTINGS_SCHEMAS } from '../../src/common/services/settings-store.js';
import { hashToken, randomNumericCode, safeEqual } from '../../src/common/utils/crypto.js';
import { evaluateResend, isDevBypass, otpHash } from '../../src/modules/auth/student-auth.service.js';

const NOW = Date.parse('2026-10-22T12:00:00Z');

describe('OTP rules', () => {
  it('codes are numeric with the configured length', () => {
    for (const len of [4, 6]) {
      const c = randomNumericCode(len);
      expect(c).toMatch(new RegExp(`^\\d{${len}}$`));
    }
  });

  it('codes are stored hashed and bound to the phone', () => {
    const h = otpHash('+9647701234567', '482913');
    expect(h).not.toContain('482913');
    expect(safeEqual(h, otpHash('+9647701234567', '482913'))).toBe(true);
    expect(safeEqual(h, otpHash('+9647701234568', '482913'))).toBe(false);
    expect(hashToken('a', 'refresh')).not.toBe(hashToken('a', 'otp'));
  });

  it('defaults come from settings schema (never constants in code)', () => {
    const d = SETTINGS_SCHEMAS.otp.parse({});
    expect(d.expirySeconds).toBe(120);
    expect(d.maxAttempts).toBe(5);
    expect(d.resendCooldownSeconds).toBe(60);
    expect(d.lockoutMinutes).toBe(30);
    expect(() => SETTINGS_SCHEMAS.otp.parse({ expirySeconds: 5 })).toThrow();
  });

  const base = { now: NOW, cooldownSeconds: 60, resendLimit: 3, windowMinutes: 30, sendsInWindow: 0, oldestInWindow: null, lastSentAt: null };

  it('first send is allowed', () => {
    expect(evaluateResend(base)).toBeNull();
  });

  it('cooldown blocks a resend with remaining seconds', () => {
    expect(evaluateResend({ ...base, lastSentAt: new Date(NOW - 20_000), sendsInWindow: 1, oldestInWindow: new Date(NOW - 20_000) })).toEqual({ reason: 'OTP_RESEND_COOLDOWN', retryAfterSeconds: 40 });
  });

  it('after the cooldown a resend is allowed until the window limit', () => {
    expect(evaluateResend({ ...base, lastSentAt: new Date(NOW - 61_000), sendsInWindow: 2, oldestInWindow: new Date(NOW - 300_000) })).toBeNull();
    expect(evaluateResend({ ...base, lastSentAt: new Date(NOW - 61_000), sendsInWindow: 3, oldestInWindow: new Date(NOW - 600_000) })).toEqual({ reason: 'OTP_RESEND_LIMIT', retryAfterSeconds: 1200 });
  });

  it('dev bypass code only for listed phones and never in production', () => {
    const otp = { devBypassCode: '123456', devBypassPhones: ['+9647701234567'], devBypassAllPhones: false };
    expect(isDevBypass(otp, '+9647701234567', '123456')).toBe(true);
    expect(isDevBypass(otp, '+9647701234567', '000000')).toBe(false);
    expect(isDevBypass(otp, '+9647801234567', '123456')).toBe(false);
    expect(isDevBypass({ ...otp, devBypassAllPhones: true }, '+9647801234567', '123456')).toBe(true);
    expect(isDevBypass({ ...otp, devBypassCode: null }, '+9647701234567', '123456')).toBe(false);
  });
});
