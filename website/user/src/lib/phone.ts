import {
  AsYouType,
  getCountries,
  getCountryCallingCode,
  getExampleNumber,
  isValidPhoneNumber,
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js/max';
import examples from 'libphonenumber-js/mobile/examples';
import { COUNTRY_ALIASES, COUNTRY_NAMES } from '@/lib/countryNames';

/**
 * International phone helpers (libphonenumber-js, "max" metadata — same as the server).
 * Clients always send E.164 (e.g. "+447911123456"); the server re-normalizes and validates.
 */

export type { CountryCode };

/** Value of a phone field: selected country + the national part as typed/formatted (e.g. "770 123 4567"). */
export interface PhoneValue {
  country: string;
  national: string;
}

export const DEFAULT_COUNTRY: CountryCode = 'IQ';

/** Shown first in the country picker (Iraq, then the Gulf / region). */
export const PINNED_COUNTRIES: readonly CountryCode[] = ['IQ', 'SA', 'AE', 'KW', 'QA', 'BH', 'OM', 'JO', 'TR', 'IR', 'SY', 'LB', 'EG'];

/** Main region for shared calling codes when the number alone doesn't identify one (e.g. "+44" while typing). */
const MAIN_REGION: Record<string, CountryCode> = {
  '1': 'US', '7': 'RU', '44': 'GB', '47': 'NO', '61': 'AU', '212': 'MA', '262': 'RE', '290': 'SH', '358': 'FI', '590': 'GP', '599': 'CW',
};

const ALL_COUNTRIES = new Set<string>(getCountries());

/** Region for a calling code ("44" → GB, "964" → IQ); undefined when the code is incomplete/unknown. */
function regionForCallingCode(code: string): CountryCode | undefined {
  return MAIN_REGION[code] ?? getCountries().find((c) => getCountryCallingCode(c) === code);
}

export const isCountryCode = (c: string): c is CountryCode => ALL_COUNTRIES.has(c);
const asCountry = (c: string): CountryCode => (isCountryCode(c) ? c : DEFAULT_COUNTRY);

/** "IQ" → "🇮🇶" (regional-indicator symbols). Unknown/non-letter codes give a globe. */
export function flagEmoji(iso: string): string {
  if (!/^[A-Za-z]{2}$/.test(iso)) return '🌐';
  const base = 0x1f1e6 - 65;
  return String.fromCodePoint(...iso.toUpperCase().split('').map((ch) => base + ch.charCodeAt(0)));
}

export const dialCode = (country: string): string => `+${getCountryCallingCode(asCountry(country))}`;

/**
 * Reserved fictional UK numbers (+44 7700 900000–900999, Ofcom drama range). libphonenumber rejects them,
 * but the server accepts them outside production for testing — so we accept them only in dev builds.
 */
export const isDevTestNumber = (e164: string): boolean => import.meta.env.DEV && /^\+447700900\d{3}$/.test(e164);

const digitsOnly = (s: string) => s.replace(/\D/g, '');

/** Formats national input for `country` as you type, dropping a typed trunk prefix ("0770…" → "770 …"). */
export function formatNational(input: string, country: string): string {
  const cc = asCountry(country);
  const digits = digitsOnly(input);
  if (!digits) return '';
  const typer = new AsYouType(cc);
  typer.input(digits);
  const nsn = typer.getNumber()?.nationalNumber ?? digits;
  // Format in international style and drop the "+<code> " part: national formats of some countries
  // (Iraq included) only apply once the trunk "0" is typed, the international grouping always applies.
  const calling = getCountryCallingCode(cc);
  const intl = new AsYouType(cc).input(`+${calling}${nsn}`);
  const rest = intl.startsWith(`+${calling}`) ? intl.slice(calling.length + 1).trim() : '';
  return digitsOnly(rest) === nsn ? rest : nsn;
}

/**
 * Handles text typed or pasted into the number field. A full international number ("+44 7911…",
 * "0044 7911…", or the selected country's calling code followed by a valid number) switches the
 * country; anything else is formatted as a national number of the current country.
 */
export function applyPhoneInput(text: string, current: PhoneValue): PhoneValue {
  const trimmed = text.trim();
  let intl: string | null = null;
  if (trimmed.startsWith('+')) intl = `+${digitsOnly(trimmed)}`;
  else if (/^00[1-9]/.test(digitsOnly(trimmed)) && digitsOnly(trimmed).length > 8) intl = `+${digitsOnly(trimmed).slice(2)}`;
  else {
    // Autofill sometimes drops the "+": "9647701234567" with Iraq selected.
    const d = digitsOnly(trimmed);
    const code = getCountryCallingCode(asCountry(current.country));
    if (d.length > 10 && d.startsWith(code) && isValidPhoneNumber(`+${d}`)) intl = `+${d}`;
  }

  if (intl) {
    const cur = asCountry(current.country);
    const parsed = parsePhoneNumberFromString(intl);
    if (parsed?.nationalNumber) {
      const sameCode = getCountryCallingCode(cur) === parsed.countryCallingCode;
      const country = parsed.country ?? (sameCode ? cur : regionForCallingCode(parsed.countryCallingCode));
      if (country) return { country, national: formatNational(parsed.nationalNumber, country) };
    }
    // Only a calling code so far ("+44"): switch country once it is complete (calling codes are prefix-free).
    const region = regionForCallingCode(intl.slice(1));
    if (region) return { country: region, national: '' };
    // Still typing the calling code ("+9", "+96") — keep it as typed.
    return { ...current, national: trimmed.startsWith('+') ? intl : formatNational(trimmed, current.country) };
  }

  return { ...current, national: formatNational(trimmed, current.country) };
}

/** Best-effort E.164 for a field value ("IQ" + "770 123 4567" → "+9647701234567"). */
export function phoneToE164(value: PhoneValue): string {
  const cc = asCountry(value.country);
  const digits = digitsOnly(value.national);
  if (!digits) return '';
  const parsed = parsePhoneNumberFromString(digits, cc);
  if (parsed?.number) return parsed.number;
  return `+${getCountryCallingCode(cc)}${digits.replace(/^0+/, '')}`;
}

/** True when the field holds a valid number for its country (or a dev-only fictional test number). */
export function isValidPhone(value: PhoneValue): boolean {
  const e164 = phoneToE164(value);
  if (!e164) return false;
  return isValidPhoneNumber(e164) || isDevTestNumber(e164);
}

/** "+9647701234567" → "+964 770 123 4567". Leaves anything unparsable untouched. */
export function formatPhoneInternational(raw: string | null | undefined): string {
  if (!raw) return '';
  const s = raw.trim();
  const parsed = parsePhoneNumberFromString(s.startsWith('+') ? s : `+${digitsOnly(s)}`);
  return parsed ? parsed.formatInternational() : s;
}

/** "+9647701234567" → "+964 770 ••• 4567": keeps the calling code, first group and last 4 digits. */
export function maskPhone(raw: string | null | undefined): string {
  const formatted = formatPhoneInternational(raw);
  if (!formatted) return '';
  const parts = formatted.split(/\s+/);
  if (parts.length >= 4) return [parts[0], parts[1], ...parts.slice(2, -1).map((p) => '•'.repeat(Math.min(p.length, 3))), parts[parts.length - 1]].join(' ');
  const digits = digitsOnly(formatted);
  if (digits.length <= 4) return formatted;
  const keepFrom = formatted.length - 4;
  return formatted
    .split('')
    .map((ch, i) => {
      if (i < (parts[0]?.length ?? 0) || i >= keepFrom || !/\d/.test(ch)) return ch;
      return '•';
    })
    .join('');
}

/** Example national mobile number for a placeholder ("UK" → "7400 123456"). */
export function examplePlaceholder(country: string): string {
  try {
    const ex = getExampleNumber(asCountry(country), examples);
    return ex ? formatNational(ex.nationalNumber, country) : '';
  } catch {
    return '';
  }
}

/* ---------------------------------------------------------------- country list */

export interface CountryOption {
  code: CountryCode;
  name: string;
  dial: string;
  flag: string;
  /** Normalized EN + AR names, aliases, ISO code and calling code — for search. */
  search: string;
}

/** Lower-cases, strips Arabic diacritics/tatweel and unifies alef / ya / ta-marbuta forms. */
export const normalizeSearch = (s: string) =>
  s
    .toLowerCase()
    .replace(/[àáâãäå]/g, 'a')
    .replace(/[çč]/g, 'c')
    .replace(/[èéêë]/g, 'e')
    .replace(/[ìíîï]/g, 'i')
    .replace(/[òóôõö]/g, 'o')
    .replace(/[ùúûü]/g, 'u')
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .trim();

type DisplayNamesLike = { of: (code: string) => string | undefined };

/**
 * `Intl.DisplayNames` when the engine has it (JSC, Chrome); older engines may not — then `null`, and the
 * bundled EN/AR table in `@/lib/countryNames` is used.
 */
function makeDisplayNames(lang: 'en' | 'ar'): DisplayNamesLike | null {
  try {
    const Ctor = (Intl as unknown as { DisplayNames?: new (l: string[], o: { type: 'region' }) => DisplayNamesLike }).DisplayNames;
    if (!Ctor) return null;
    const dn = new Ctor([lang], { type: 'region' });
    // Some engines construct it but return the code back (no locale data) — treat as missing.
    const probe = dn.of('IQ');
    return probe && probe !== 'IQ' ? dn : null;
  } catch {
    return null;
  }
}

const displayNamesCache: Partial<Record<'en' | 'ar', DisplayNamesLike | null>> = {};

/**
 * Localized country name: `Intl.DisplayNames` when available, else the bundled EN/AR table, else the code.
 */
export function countryName(code: string, lang: 'en' | 'ar'): string {
  if (!(lang in displayNamesCache)) displayNamesCache[lang] = makeDisplayNames(lang);
  try {
    const name = displayNamesCache[lang]?.of(code);
    if (name && name !== code) return name;
  } catch {
    // fall through to the bundled table
  }
  const bundled = COUNTRY_NAMES[code];
  return bundled ? bundled[lang === 'ar' ? 1 : 0] : code;
}

const listCache: Partial<Record<'en' | 'ar', CountryOption[]>> = {};

/** All countries: pinned (Iraq first) then alphabetical by localized name. Cached per language. */
export function countryOptions(lang: 'en' | 'ar'): CountryOption[] {
  const cached = listCache[lang];
  if (cached) return cached;
  const all = getCountries().map<CountryOption>((code) => {
    const calling = getCountryCallingCode(code);
    const en = countryName(code, 'en');
    const ar = countryName(code, 'ar');
    return {
      code,
      name: lang === 'ar' ? ar : en,
      dial: `+${calling}`,
      flag: flagEmoji(code),
      // Both the runtime and bundled names are searchable, so results don't depend on the engine.
      search: normalizeSearch(`${en} ${ar} ${COUNTRY_NAMES[code]?.join(' ') ?? ''} ${COUNTRY_ALIASES[code] ?? ''} ${code}`),
    };
  });
  const pinned = PINNED_COUNTRIES.map((c) => all.find((o) => o.code === c)).filter((o): o is CountryOption => !!o);
  const rest = all
    .filter((o) => !PINNED_COUNTRIES.includes(o.code))
    .sort((a, b) => a.name.localeCompare(b.name, lang));
  const list = [...pinned, ...rest];
  listCache[lang] = list;
  return list;
}

/** Matches by EN/AR name, alias, ISO code or calling code ("+44", "44", "brit", "بريط", "gb"). */
export function filterCountries(list: CountryOption[], query: string): CountryOption[] {
  const raw = query.trim();
  if (!raw) return list;
  const dialQuery = raw.replace(/[\s+()-]/g, '');
  if (/^\d+$/.test(dialQuery)) {
    // Exact calling code first ("1" → +1 countries before +1xxx prefixes don't exist, "9" → +9x).
    return list
      .filter((o) => o.dial.slice(1).startsWith(dialQuery))
      .sort((a, b) => Number(a.dial.length !== dialQuery.length + 1) - Number(b.dial.length !== dialQuery.length + 1));
  }
  const q = normalizeSearch(raw);
  return list.filter((o) => o.search.includes(q));
}

/**
 * Free-text phone ("0770 123 4567", "+44 7911 123456", "0044…") → E.164, or '' when it is not a valid number.
 * Numbers without "+"/"00" are read as `defaultCountry` (Iraq by default), like the server does.
 */
export function textToE164(raw: string, defaultCountry: CountryCode = DEFAULT_COUNTRY): string {
  const s = raw.trim().replace(/[\s()\-.]/g, '');
  if (!/^\+?\d{6,20}$/.test(s)) return '';
  const intl = s.startsWith('+') ? s : s.startsWith('00') ? `+${s.slice(2)}` : null;
  const parsed = intl ? parsePhoneNumberFromString(intl) : parsePhoneNumberFromString(s, defaultCountry);
  const e164 = parsed?.number ?? intl ?? '';
  return e164 && (isValidPhoneNumber(e164) || isDevTestNumber(e164)) ? e164 : '';
}
