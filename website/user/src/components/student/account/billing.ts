export type PaymentMethod = 'zain' | 'fastpay' | 'asiahawala' | 'card';
export type BillingPeriod = 'monthly' | 'yearly';

export interface BillingRecord {
  id: string;
  receipt: string;
  date: string; // ISO
  packageId: string;
  period: BillingPeriod;
  amount: number;
  method: PaymentMethod;
}

export const BILLING_STORE_KEY = 'eduway.billing.v1';
export const PROMO_CODE = 'EDU10';
export const PROMO_RATE = 0.1;

/** Brand-neutral initials "logos" for the supported gateways. */
export const PAYMENT_METHODS: { id: PaymentMethod; initials: string; bg: string; fg: string }[] = [
  { id: 'zain', initials: 'ZC', bg: '#2B1B4A', fg: '#E6C77A' },
  { id: 'fastpay', initials: 'FP', bg: '#BE123C', fg: '#FFFFFF' },
  { id: 'asiahawala', initials: 'AH', bg: '#0369A1', fg: '#FFFFFF' },
  { id: 'card', initials: '', bg: '#0B1F3A', fg: '#E6C77A' },
];

export const seedBilling: BillingRecord[] = [
  { id: 'b4', receipt: 'EW-48213', date: '2026-10-14T12:30:00Z', packageId: 'full', period: 'monthly', amount: 50000, method: 'zain' },
  { id: 'b3', receipt: 'EW-37105', date: '2026-09-14T10:05:00Z', packageId: 'full', period: 'monthly', amount: 50000, method: 'fastpay' },
  { id: 'b2', receipt: 'EW-29840', date: '2026-08-14T18:42:00Z', packageId: 'science', period: 'monthly', amount: 35000, method: 'card' },
  { id: 'b1', receipt: 'EW-21576', date: '2026-07-14T09:15:00Z', packageId: 'science', period: 'monthly', amount: 35000, method: 'zain' },
];

export const newReceipt = () => `EW-${Math.floor(10000 + Math.random() * 90000)}`;

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
