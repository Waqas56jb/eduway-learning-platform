import type { Lang } from '@/types';

const AR_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

/** Format a number for display. Arabic UI keeps Western digits for math readability unless `arabicDigits`. */
export function formatNumber(n: number, lang: Lang, arabicDigits = false): string {
  const s = new Intl.NumberFormat('en-US').format(n);
  return lang === 'ar' && arabicDigits ? s.replace(/\d/g, (d) => AR_DIGITS[Number(d)]!) : s;
}

/** 272 → "04:32"; 3725 → "1:02:05" */
export function formatDuration(totalSec: number): string {
  const sec = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (x: number) => String(x).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** 742 sec → "12 min" / "12 د" */
export function formatMinutes(totalSec: number, lang: Lang): string {
  const m = Math.max(1, Math.round(totalSec / 60));
  return lang === 'ar' ? `${m} د` : `${m} min`;
}

export function formatPrice(amount: number, lang: Lang): string {
  const n = new Intl.NumberFormat('en-US').format(amount);
  return lang === 'ar' ? `${n} د.ع` : `${n} IQD`;
}

export function formatDate(iso: string, lang: Lang, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }): string {
  try {
    return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-IQ' : 'en-GB', opts).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

/** "5m ago" / "منذ 5 د" — coarse relative time. */
export function timeAgo(iso: string, lang: Lang, now: Date = new Date()): string {
  const diff = Math.max(0, (now.getTime() - new Date(iso).getTime()) / 1000);
  const ar = lang === 'ar';
  if (diff < 60) return ar ? 'الآن' : 'just now';
  if (diff < 3600) return ar ? `منذ ${Math.floor(diff / 60)} د` : `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return ar ? `منذ ${Math.floor(diff / 3600)} س` : `${Math.floor(diff / 3600)}h ago`;
  const d = Math.floor(diff / 86400);
  return ar ? `منذ ${d} يوم` : `${d}d ago`;
}

/** Format an Iraqi mobile number (digits after +964): "7701234567" → "770 123 4567". */
export function formatIraqiMobile(digits: string): string {
  const d = digits.replace(/\D/g, '').replace(/^0/, '').slice(0, 10);
  return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 10)].filter(Boolean).join(' ');
}

/** Valid Iraqi mobile: 10 digits starting with 7 (75x/77x/78x/79x…). */
export function isValidIraqiMobile(digits: string): boolean {
  return /^7[0-9]{9}$/.test(digits.replace(/\D/g, '').replace(/^0/, ''));
}

export function shuffle<T>(arr: readonly T[], seed?: number): T[] {
  const a = [...arr];
  let s = seed ?? Math.floor(Math.random() * 1e9);
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
