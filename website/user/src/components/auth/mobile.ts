/** Iraqi mobile numbers: optional +964 / 964 / 0 prefix, then 7[3-9] and eight more digits. */
export const IRAQI_MOBILE = /^(?:\+?964|0)?7[3-9]\d{8}$/;

/** Number pre-filled by the "demo account" shortcut. */
export const DEMO_MOBILE = '0770 123 4567';

const compact = (raw: string) => raw.replace(/[\s()-]/g, '');

export const isIraqiMobile = (raw: string) => IRAQI_MOBILE.test(compact(raw));

/** "0770 123 4567" / "+9647701234567" → "+964 770 123 4567". */
export function normalizeMobile(raw: string): string {
  const local = compact(raw).replace(/^(?:\+?964|0)/, '');
  return `+964 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
}

/** "+964 770 123 4567" → "+964 770 ••• ••67" */
export function maskMobile(mobile: string): string {
  const local = compact(mobile).replace(/^(?:\+?964|0)/, '');
  if (local.length < 10) return mobile;
  return `+964 ${local.slice(0, 3)} ••• ••${local.slice(8)}`;
}
