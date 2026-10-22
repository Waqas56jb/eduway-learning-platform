import { DEFAULT_LOCALE, LOCALES, type Locale } from '../../config/constants.js';
import { CODE_MESSAGES, ENTITY_LABELS, REASON_MESSAGES, type ErrorCode, type ErrorReason } from './messages.js';

export { CODE_MESSAGES, REASON_MESSAGES, ENTITY_LABELS, type ErrorCode, type ErrorReason };

export type MessageParams = Record<string, string | number | null | undefined>;

/** Parse an Accept-Language header (`ar-IQ,ar;q=0.9,en;q=0.8`) into one of our locales (default `ar`). */
export function resolveLocale(header: string | undefined | null, fallback: Locale = DEFAULT_LOCALE): Locale {
  if (!header) return fallback;
  const ranked = header
    .split(',')
    .map((part) => {
      const [tag = '', ...rest] = part.trim().split(';');
      const q = rest.find((r) => r.trim().startsWith('q='));
      return { lang: tag.trim().toLowerCase().slice(0, 2), q: q ? Number(q.split('=')[1]) || 0 : 1 };
    })
    .filter((x) => x.lang)
    .sort((a, b) => b.q - a.q);
  for (const r of ranked) {
    if ((LOCALES as readonly string[]).includes(r.lang)) return r.lang as Locale;
  }
  return fallback;
}

function interpolate(template: string, params: MessageParams | undefined, locale: Locale): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const raw = params?.[key];
    if (key === 'entity') return ENTITY_LABELS[String(raw ?? 'resource')]?.[locale] ?? String(raw ?? '');
    if (raw === undefined || raw === null) return '';
    return String(raw);
  });
}

export function isKnownCode(code: string): code is ErrorCode {
  return Object.prototype.hasOwnProperty.call(CODE_MESSAGES, code);
}

export function isKnownReason(reason: string): reason is ErrorReason {
  return Object.prototype.hasOwnProperty.call(REASON_MESSAGES, reason);
}

/** Localized message for a code (+ optional reason, which wins when it has a translation). */
export function translate(code: string, locale: Locale, params?: MessageParams, reason?: string | null): string {
  const entry =
    (reason && isKnownReason(reason) ? REASON_MESSAGES[reason] : undefined) ??
    (isKnownCode(code) ? CODE_MESSAGES[code] : (REASON_MESSAGES as Record<string, { en: string; ar: string }>)[code]) ??
    CODE_MESSAGES.INTERNAL;
  return interpolate(entry[locale] ?? entry.en, params, locale);
}

/** Bilingual helpers used by DTO mappers: row `{ title_en, title_ar }` → `{ en, ar }`. */
export type Localized = { en: string; ar: string };
export function loc(en: string | null | undefined, ar: string | null | undefined): Localized {
  return { en: en ?? '', ar: ar ?? '' };
}
export function locField(row: Record<string, unknown>, field: string): Localized {
  return loc(row[`${field}_en`] as string | null, row[`${field}_ar`] as string | null);
}
