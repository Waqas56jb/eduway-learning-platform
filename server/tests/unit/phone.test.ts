import { describe, expect, it } from 'vitest';
import { formatPhone, isTestPhoneNumber, isValidPhone, maskPhone, normalizePhone, phoneCountry } from '../../src/common/utils/phone.js';
import { anyPhone, mobilePhone } from '../../src/common/validation/schemas.js';

describe('phone normalization — Iraqi legacy formats → +964', () => {
  it.each([
    ['07701234567', '+9647701234567'],
    ['7701234567', '+9647701234567'],
    ['+964 770 123 4567', '+9647701234567'],
    ['9647701234567', '+9647701234567'],
    ['00964-770-123-4567', '+9647701234567'],
    ['(0770) 123 4567', '+9647701234567'],
    ['٠٧٧٠١٢٣٤٥٦٧', '+9647701234567'],
    ['۰۷۷۰۱۲۳۴۵۶۷', '+9647701234567'],
    ['07501234567', '+9647501234567'],
    ['07801234567', '+9647801234567'],
    ['07901234567', '+9647901234567'],
    ['\u200e+964 770 123 4567', '+9647701234567'],
  ])('%s → %s', (input, out) => {
    expect(normalizePhone(input)).toBe(out);
  });

  it('keeps the demo student number stable', () => {
    expect(normalizePhone('+9647701234567', { mobileOnly: true })).toBe('+9647701234567');
  });
});

describe('phone normalization — international', () => {
  it.each([
    ['+1 (202) 555-0123', '+12025550123'],
    ['+1 415 555 2671', '+14155552671'],
    ['001 202 555 0123', '+12025550123'],
    ['+44 7911 123456', '+447911123456'],
    ['0044 7911 123456', '+447911123456'],
    ['+92 300 1234567', '+923001234567'],
    ['+92-321-7654321', '+923217654321'],
    ['+971 50 123 4567', '+971501234567'],
    ['00971501234567', '+971501234567'],
    ['+966 50 123 4567', '+966501234567'],
    ['+90 532 123 45 67', '+905321234567'],
    ['447911123456', '+447911123456'],
  ])('%s → %s', (input, out) => {
    expect(normalizePhone(input)).toBe(out);
  });

  it('national input with an explicit default country', () => {
    expect(normalizePhone('07911 123456', { defaultCountry: 'GB' })).toBe('+447911123456');
    expect(normalizePhone('0300 1234567', { defaultCountry: 'PK' })).toBe('+923001234567');
    expect(normalizePhone('050 123 4567', { defaultCountry: 'AE' })).toBe('+971501234567');
  });

  it.each([
    '', '   ', '123', 'abc', '0770123456', '077012345678', '+9617701234567', '07201234567', '+1 202 555 012', '+44 7911 12345',
    '+92 300 123', '+971 50 123', '+999 1234567', '+0 123 456 789', '+12345678901234567890', '07701234567x', null, undefined,
  ])('rejects %s', (input) => {
    expect(normalizePhone(input as string)).toBeNull();
    expect(isValidPhone(input as string)).toBe(false);
  });

  it('mobileOnly rejects fixed lines but accepts mobiles and shared NANP numbers', () => {
    expect(normalizePhone('+44 20 7946 0958')).toBe('+442079460958'); // London landline: valid contact number
    expect(normalizePhone('+44 20 7946 0958', { mobileOnly: true })).toBeNull();
    expect(normalizePhone('+44 7911 123456', { mobileOnly: true })).toBe('+447911123456');
    expect(normalizePhone('+1 202 555 0123', { mobileOnly: true })).toBe('+12025550123'); // FIXED_LINE_OR_MOBILE
    expect(normalizePhone('+44 800 123 4567', { mobileOnly: true })).toBeNull(); // toll-free
  });

  it('reserved fictional ranges are accepted outside production only', () => {
    expect(isTestPhoneNumber('+447700900123')).toBe(true);
    expect(isTestPhoneNumber('+447911123456')).toBe(false);
    expect(normalizePhone('+44 7700 900123', { allowTestNumbers: true, mobileOnly: true })).toBe('+447700900123');
    expect(normalizePhone('+44 7700 900123', { allowTestNumbers: false })).toBeNull();
  });

  it('zod schemas normalize and fail with the PHONE_INVALID reason', () => {
    expect(mobilePhone.parse(' 0770 123 4567 ')).toBe('+9647701234567');
    expect(anyPhone.parse('+44 20 7946 0958')).toBe('+442079460958');
    const bad = mobilePhone.safeParse('+44 20 7946 0958');
    expect(bad.success).toBe(false);
    expect(bad.error?.issues[0]?.message).toBe('PHONE_INVALID');
  });
});

describe('phone formatting / masking', () => {
  it('formats internationally', () => {
    expect(formatPhone('+9647701234567')).toBe('+964 770 123 4567');
    expect(formatPhone('+447911123456')).toBe('+44 7911 123456');
    expect(formatPhone('+12025550123')).toBe('+1 202 555 0123');
    expect(formatPhone('')).toBe('');
    expect(formatPhone('not a phone')).toBe('not a phone');
  });

  it('masks keeping country code, first 3 and last 2 national digits', () => {
    expect(maskPhone('+9647701234567')).toBe('+964 770 ••• ••67');
    expect(maskPhone('+447911123456')).toBe('+44 791• ••••56');
    expect(maskPhone('+923001234567')).toBe('+92 300 •••••67');
    expect(maskPhone(null)).toBe('');
    expect(maskPhone('garbage')).toBe('•••');
  });

  it('detects the country', () => {
    expect(phoneCountry('+9647701234567')).toBe('IQ');
    expect(phoneCountry('+971501234567')).toBe('AE');
    expect(phoneCountry(null)).toBeNull();
  });
});
