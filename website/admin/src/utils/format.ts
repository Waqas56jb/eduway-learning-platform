import { format as fnsFormat, formatDistanceToNowStrict, parseISO } from 'date-fns';
import { ar as arLocale, enUS } from 'date-fns/locale';
import i18n from '@/i18n';
import type { Currency } from '@/types';

const lang = () => (i18n.language === 'ar' ? 'ar' : 'en');
/** Latin digits in both languages — admins compare figures across languages. */
const numLocale = () => (lang() === 'ar' ? 'ar-IQ-u-nu-latn' : 'en-US');
const dateLocale = () => (lang() === 'ar' ? arLocale : enUS);

export const fmtNumber = (n: number, opts?: Intl.NumberFormatOptions) =>
  new Intl.NumberFormat(numLocale(), opts).format(n);

export const fmtCompact = (n: number) =>
  new Intl.NumberFormat(numLocale(), { notation: 'compact', maximumFractionDigits: 1 }).format(n);

export const fmtPercent = (n: number, dp = 0) =>
  `${fmtNumber(n, { maximumFractionDigits: dp, minimumFractionDigits: dp })}%`;

export const currencyLabel = (c: Currency) => (c === 'USD' ? '$' : lang() === 'ar' ? 'د.ع' : 'IQD');

export function fmtMoney(amount: number, currency: Currency = 'IQD', compact = false) {
  if (currency === 'USD') {
    return compact
      ? `$${fmtCompact(amount)}`
      : new Intl.NumberFormat(numLocale(), { style: 'currency', currency: 'USD' }).format(amount);
  }
  return `${compact ? fmtCompact(amount) : fmtNumber(Math.round(amount))} ${currencyLabel('IQD')}`;
}

const toDate = (d: string | Date) => (typeof d === 'string' ? parseISO(d) : d);

export const fmtDate = (d: string | Date | null | undefined, pattern = 'd MMM yyyy') =>
  d ? fnsFormat(toDate(d), pattern, { locale: dateLocale() }) : '—';

export const fmtDateTime = (d: string | Date | null | undefined) => fmtDate(d, 'd MMM yyyy, HH:mm');

export const fmtRelative = (d: string | Date | null | undefined) =>
  d ? formatDistanceToNowStrict(toDate(d), { addSuffix: true, locale: dateLocale() }) : '—';

export function fmtDuration(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function fmtBytes(kb: number) {
  if (kb >= 1024 * 1024) return `${fmtNumber(kb / 1024 / 1024, { maximumFractionDigits: 1 })} GB`;
  if (kb >= 1024) return `${fmtNumber(kb / 1024, { maximumFractionDigits: 1 })} MB`;
  return `${fmtNumber(kb)} KB`;
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
