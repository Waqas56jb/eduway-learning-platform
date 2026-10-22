import {
  AsYouType,
  getCountries,
  getCountryCallingCode,
  isValidPhoneNumber,
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js/max';

export type { CountryCode };

/** EDUWAY is Iraq-first: local formats (07…, 7…, 964…) resolve to +964. */
export const DEFAULT_COUNTRY: CountryCode = 'IQ';

/** Ofcom drama range (+44 7700 900xxx) — accepted in dev builds for testing. */
const TEST_RANGE = /^\+447700900\d{3}$/;
const PHONE_LIKE = /^\+?[\d\s\-().]{6,}$/;

const compact = (raw: string) => raw.replace(/[\s\-().]/g, '');
const isTestNumber = (raw: string) => import.meta.env.DEV && TEST_RANGE.test(compact(raw));

/** True when `raw` is a valid number (international, or local to `country`). */
export function isValidPhone(raw: string | null | undefined, country: CountryCode = DEFAULT_COUNTRY): boolean {
  const v = (raw ?? '').trim();
  if (!v) return false;
  if (isTestNumber(v)) return true;
  try {
    return isValidPhoneNumber(v, country);
  } catch {
    return false;
  }
}

/** Normalises any accepted input to E.164 (`+9647701234567`), or `null` when unparseable. */
export function toE164(raw: string | null | undefined, country: CountryCode = DEFAULT_COUNTRY): string | null {
  const v = (raw ?? '').trim();
  if (!v) return null;
  if (isTestNumber(v)) return compact(v);
  try {
    return parsePhoneNumberFromString(v, country)?.number ?? null;
  } catch {
    return null;
  }
}

/**
 * Display formatter: `+9647701234567` → `+964 770 123 4567`, `+447911123456` → `+44 7911 123456`.
 * Anything that isn't phone-shaped (names, emails, empty) is returned unchanged.
 */
export function formatPhone(raw: string | null | undefined): string {
  const v = (raw ?? '').trim();
  if (!v || !PHONE_LIKE.test(v)) return raw ?? '';
  try {
    const p = parsePhoneNumberFromString(v, DEFAULT_COUNTRY);
    return p ? p.formatInternational() : v;
  } catch {
    return v;
  }
}

/** `tel:` href for a stored phone (E.164 when parseable). */
export const phoneHref = (raw: string | null | undefined) => `tel:${toE164(raw) ?? compact(raw ?? '')}`;

/** Regional-indicator flag emoji for an ISO 3166-1 alpha-2 code. */
export const flagEmoji = (cc: string) =>
  cc.toUpperCase().replace(/[A-Z]/g, (ch) => String.fromCodePoint(0x1f1e6 + ch.charCodeAt(0) - 65));

export interface CountryOption {
  code: CountryCode;
  dial: string;
  flag: string;
  name_en: string;
  name_ar: string;
}

const displayNames = (lang: 'en' | 'ar') => {
  try {
    return new Intl.DisplayNames([lang], { type: 'region' });
  } catch {
    return null;
  }
};

/** Main country for calling codes shared by several regions (+1 → US, +7 → RU, …). */
const MAIN_COUNTRY: Record<string, CountryCode> = { '1': 'US', '7': 'RU', '39': 'IT', '44': 'GB', '47': 'NO', '61': 'AU', '212': 'MA', '262': 'RE', '290': 'SH', '358': 'FI', '590': 'GP', '599': 'CW' };

export function countryForCallingCode(dial: string | undefined): CountryCode | undefined {
  if (!dial) return undefined;
  return MAIN_COUNTRY[dial] ?? getCountries().find((c) => getCountryCallingCode(c) === dial);
}

let cached: CountryOption[] | null = null;
/** All countries libphonenumber knows, with EN/AR names (ISO code fallback). */
export function countryOptions(): CountryOption[] {
  if (cached) return cached;
  const en = displayNames('en');
  const ar = displayNames('ar');
  const name = (dn: Intl.DisplayNames | null, c: string) => {
    try {
      return dn?.of(c) ?? c;
    } catch {
      return c;
    }
  };
  cached = getCountries()
    .map((code) => ({ code, dial: getCountryCallingCode(code), flag: flagEmoji(code), name_en: name(en, code), name_ar: name(ar, code) }))
    .sort((a, b) => a.name_en.localeCompare(b.name_en));
  return cached;
}

/** Splits a stored value into a country + national display string for editing. */
export function splitPhone(raw: string | null | undefined, fallback: CountryCode = DEFAULT_COUNTRY): { country: CountryCode; national: string } {
  const v = (raw ?? '').trim();
  if (!v) return { country: fallback, national: '' };
  try {
    const p = parsePhoneNumberFromString(v, fallback);
    if (p) {
      const country = p.country ?? countryForCallingCode(p.countryCallingCode) ?? fallback;
      return { country, national: formatNational(String(p.nationalNumber), country).display };
    }
  } catch {
    /* fall through */
  }
  return { country: fallback, national: v };
}

/**
 * Live-formats national digits for `country` and returns the E.164 value
 * (or a best-effort `+<dial><digits>` so validation can report it).
 */
export function formatNational(input: string, country: CountryCode): { display: string; e164: string } {
  const digits = input.replace(/\D/g, '');
  if (!digits) return { display: '', e164: '' };
  const dial = `+${getCountryCallingCode(country)}`;
  const fmt = new AsYouType(country);
  let display = fmt.input(digits);
  // Without a trunk prefix (e.g. "770…" rather than "0770…") some regions don't format
  // nationally — borrow the international grouping and drop the dial code.
  if (/^\d+$/.test(display) && digits.length > 3) {
    const intl = new AsYouType().input(`${dial}${digits}`);
    if (intl.startsWith(dial)) display = intl.slice(dial.length).trim() || display;
  }
  const e164 = fmt.getNumber()?.number ?? `${dial}${digits.replace(/^0+/, '')}`;
  return { display, e164 };
}

/** Parses a pasted/typed `+…` international string; returns the detected country when known. */
export function parseInternational(input: string): { country?: CountryCode; national: string; e164: string } {
  const fmt = new AsYouType();
  fmt.input(input);
  const num = fmt.getNumber();
  const country = fmt.getCountry() ?? num?.country ?? countryForCallingCode(fmt.getCallingCode());
  const nn = num?.nationalNumber ? String(num.nationalNumber) : '';
  const e164 = num?.number ?? `+${input.replace(/\D/g, '')}`;
  if (country && nn) return { country, national: formatNational(nn, country).display, e164 };
  return { national: input, e164 };
}

/** Bidi isolates (LRI … PDI) keep "+964 770 …" intact when embedded in RTL text. */
const LRI = String.fromCharCode(0x2066);
const PDI = String.fromCharCode(0x2069);
/** `formatPhone` wrapped in an LTR isolate — for phones inside plain strings (toasts, sentences, sub-labels). */
export const isolatePhone = (raw: string | null | undefined) => {
  const f = formatPhone(raw);
  return f ? `${LRI}${f}${PDI}` : '';
};
