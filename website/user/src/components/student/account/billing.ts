import type { BillingCycle, Gateway } from '@/api/types';

/** Gateway ids from `/public/payment-methods` (zaincash | fastpay | qicard | asiahawala | visa | mock). */
export type PaymentMethod = Gateway;
export type BillingPeriod = BillingCycle;

/** Arabic-Indic (U+0660–9) / Persian (U+06F0–9) digit → ASCII; anything else unchanged. */
const asciiDigit = (c: string) => {
  const k = c.charCodeAt(0);
  if (k >= 0x0660 && k <= 0x0669) return String(k - 0x0660);
  if (k >= 0x06f0 && k <= 0x06f9) return String(k - 0x06f0);
  return c;
};

/**
 * Iraqi mobile-wallet number (ZainCash / FastPay / AsiaHawala are Iraqi-only) in any common form —
 * 07XXXXXXXXX, 7XXXXXXXXX, 9647…, +964 7…, 00964…, spaces / dashes, Arabic-Indic digits — → "07XXXXXXXXX",
 * or null when it isn't one. The server applies the same rule.
 */
export function iraqiWalletLocal(input: string | null | undefined): string | null {
  const d = Array.from(input ?? '', asciiDigit).join('').replace(/\D/g, '');
  const intl = d.startsWith('00964') ? d.slice(2) : d.startsWith('964') ? d : d.startsWith('07') && d.length === 11 ? `964${d.slice(1)}` : d.startsWith('7') && d.length === 10 ? `964${d}` : d;
  return /^9647\d{9}$/.test(intl) ? `0${intl.slice(3)}` : null;
}

/** Keep what a student may type into a wallet-number field (digits incl. Arabic-Indic, +, spaces, dashes, brackets). */
export const sanitizeWalletInput = (v: string) => Array.from(v, asciiDigit).join('').replace(/[^0-9+ ()-]/g, '').slice(0, 24);

/** Customer test wallets published by ZainCash for its UAT sandbox (docs.zaincash.iq → Test Credentials; PIN 1111, OTP 111111). */
export const SANDBOX_TEST_WALLETS: Partial<Record<Gateway, string[]>> = {
  zaincash: ['07802999569', '07829744432', '07829744464', '07829744474'],
};

export const formatCardNumber = (v: string) =>
  v
    .replace(/\D/g, '')
    .slice(0, 16)
    .replace(/(\d{4})(?=\d)/g, '$1 ');

export function formatExpiry(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
}

export function isValidExpiry(v: string, now = new Date()) {
  const m = /^(\d{2})\/(\d{2})$/.exec(v);
  if (!m) return false;
  const month = Number(m[1]);
  const year = 2000 + Number(m[2]);
  if (month < 1 || month > 12) return false;
  return new Date(year, month, 0, 23, 59, 59) >= now;
}
