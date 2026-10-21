import type { IconName } from '@/components/icons';

export type PaymentMethodId = 'zaincash' | 'fastpay' | 'asiahawala' | 'qicard' | 'visa' | 'mastercard';
export type PaymentMethodKind = 'wallet' | 'card';

export interface PaymentMethod {
  id: PaymentMethodId;
  kind: PaymentMethodKind;
  icon: IconName;
  /** Brand tint used for the method badge. */
  color: string;
  /** Short monogram shown inside the badge (Latin brand initials, rendered LTR). */
  mark: string;
}

export const PAYMENT_METHODS: PaymentMethod[] = [
  { id: 'zaincash', kind: 'wallet', icon: 'wallet', color: '#C2185B', mark: 'ZC' },
  { id: 'fastpay', kind: 'wallet', icon: 'wallet', color: '#E53935', mark: 'FP' },
  { id: 'asiahawala', kind: 'wallet', icon: 'wallet', color: '#0F766E', mark: 'AH' },
  { id: 'qicard', kind: 'card', icon: 'card', color: '#1D4ED8', mark: 'Qi' },
  { id: 'visa', kind: 'card', icon: 'card', color: '#1A1F71', mark: 'VISA' },
  { id: 'mastercard', kind: 'card', icon: 'card', color: '#EB5E28', mark: 'MC' },
];

export const getPaymentMethod = (id: string | undefined): PaymentMethod | undefined =>
  PAYMENT_METHODS.find((m) => m.id === id);

/** Mock promo codes → percentage off. */
export const PROMO_CODES: Record<string, number> = { EDU20: 20 };

/** Yearly saving vs. paying monthly for 12 months (rounded %). */
export function yearlySavingPercent(priceMonthly: number, priceYearly: number): number {
  const full = priceMonthly * 12;
  return full > 0 ? Math.round(((full - priceYearly) / full) * 100) : 0;
}

/** "EDW-7K3P9QXA" */
export function generateReceiptNumber(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 8; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `EDW-${out}`;
}
