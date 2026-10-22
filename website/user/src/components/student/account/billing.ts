import type { BillingCycle, Gateway } from '@/api/types';

/** Gateway ids from `/public/payment-methods` (zaincash | fastpay | qicard | asiahawala | visa | mock). */
export type PaymentMethod = Gateway;
export type BillingPeriod = BillingCycle;

/** "+964 770 123 4567" → "07701234567" */
export function toLocalMobile(mobile: string) {
  const d = mobile.replace(/\D/g, '');
  return d.startsWith('964') ? `0${d.slice(3)}` : d;
}

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
