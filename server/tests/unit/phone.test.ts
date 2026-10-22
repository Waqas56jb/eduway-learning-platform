import { describe, expect, it } from 'vitest';
import { formatIraqiPhone, isValidIraqiPhone, maskPhone, normalizeIraqiPhone } from '../../src/common/utils/phone.js';

describe('Iraqi phone normalization (+964)', () => {
  it.each([
    ['07701234567', '+9647701234567'],
    ['7701234567', '+9647701234567'],
    ['+964 770 123 4567', '+9647701234567'],
    ['9647701234567', '+9647701234567'],
    ['00964-770-123-4567', '+9647701234567'],
    ['(0770) 123 4567', '+9647701234567'],
    ['٠٧٧٠١٢٣٤٥٦٧', '+9647701234567'],
    ['07501234567', '+9647501234567'],
    ['07801234567', '+9647801234567'],
    ['07901234567', '+9647901234567'],
  ])('%s → %s', (input, out) => {
    expect(normalizeIraqiPhone(input)).toBe(out);
  });

  it.each(['', '123', '0770123456', '077012345678', '+9617701234567', '06012345678', '07201234567', 'abc', null, undefined])('rejects %s', (input) => {
    expect(normalizeIraqiPhone(input as string)).toBeNull();
    expect(isValidIraqiPhone(input as string)).toBe(false);
  });

  it('formats and masks', () => {
    expect(formatIraqiPhone('+9647701234567')).toBe('+964 770 123 4567');
    expect(maskPhone('+9647701234567')).toBe('+964 770 ••• ••67');
    expect(maskPhone(null)).toBe('');
  });
});
