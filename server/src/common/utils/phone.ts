/**
 * International phone numbers → E.164 (libphonenumber-js, full "max" metadata so validation checks real
 * number ranges, not only lengths).
 *
 * Accepts any international format (`+44 7911 123456`, `0044-7911-123456`, `+1 (202) 555-0123`) and keeps the
 * legacy Iraqi local formats working: `07701234567`, `7701234567`, `9647701234567`, `00964 770 123 4567`
 * (numbers without a `+`/`00` prefix are read as Iraqi first — the platform's home market). Arabic-Indic and
 * Persian digits (٠٧٧٠١٢٣٤٥٦٧) are accepted too.
 *
 * Reserved fictional ranges (UK Ofcom drama numbers `+44 7700 900000–900999`, NANP `+1 NXX 555-01XX`) are
 * accepted outside production only, so QA can register test accounts without ever reaching a real person.
 */
import { parsePhoneNumberFromString, type CountryCode, type NumberType, type PhoneNumber } from 'libphonenumber-js/max';

const ARABIC_DIGITS = /[٠-٩۰-۹]/g;

function toLatinDigits(s: string): string {
  return s.replace(ARABIC_DIGITS, (d) => {
    const code = d.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}

/** Number types that can never receive an SMS / WhatsApp OTP. */
const NON_MOBILE_TYPES: ReadonlySet<NumberType> = new Set<NumberType>(['FIXED_LINE', 'TOLL_FREE', 'PREMIUM_RATE', 'SHARED_COST', 'VOICEMAIL', 'UAN', 'PAGER']);

/** Fictional/test ranges that libphonenumber (correctly) treats as invalid. */
const TEST_RANGES: readonly RegExp[] = [/^\+447700900\d{3}$/, /^\+1[2-9]\d{2}55501\d{2}$/];

export const isTestPhoneNumber = (e164: string): boolean => TEST_RANGES.some((r) => r.test(e164));

const isProduction = () => process.env.NODE_ENV === 'production';

export interface NormalizePhoneOptions {
  /** Country used for numbers typed without `+` / `00`. Default `IQ` (legacy 07… input). */
  defaultCountry?: CountryCode;
  /** Reject fixed-line / toll-free / premium numbers (student OTP login). Default false. */
  mobileOnly?: boolean;
  /** Accept reserved fictional test ranges. Default: everywhere except production. */
  allowTestNumbers?: boolean;
}

function accept(p: PhoneNumber | undefined, opts: NormalizePhoneOptions): string | null {
  if (!p) return null;
  const e164 = p.number;
  if (!/^\+[1-9]\d{6,14}$/.test(e164)) return null;
  if (!p.isValid()) {
    const allowTest = opts.allowTestNumbers ?? !isProduction();
    return allowTest && isTestPhoneNumber(e164) ? e164 : null;
  }
  if (opts.mobileOnly) {
    const type = p.getType();
    if (type && NON_MOBILE_TYPES.has(type)) return null;
  }
  return e164;
}

/** Returns the E.164 form (`+447911123456`) or null when the input is not a valid phone number. */
export function normalizePhone(input: string | null | undefined, opts: NormalizePhoneOptions = {}): string | null {
  if (input === null || input === undefined) return null;
  let s = toLatinDigits(String(input)).trim().replace(/[\s\-().‎‏‪-‮]/g, '');
  if (!s || !/^\+?\d+$/.test(s)) return null;
  if (s.length > 20) return null;
  if (s.startsWith('00')) s = `+${s.slice(2)}`;
  if (s.startsWith('+')) return accept(parsePhoneNumberFromString(s), opts);

  const country = opts.defaultCountry ?? 'IQ';
  // Legacy Iraqi input without a plus: 9647XXXXXXXXX.
  if (country === 'IQ' && /^9647\d{9}$/.test(s)) return accept(parsePhoneNumberFromString(`+${s}`), opts);
  // National format of the default country (07…, 7…), then digits that already carry a country code.
  return accept(parsePhoneNumberFromString(s, country), opts) ?? accept(parsePhoneNumberFromString(`+${s}`), opts);
}

export function isValidPhone(input: string | null | undefined, opts?: NormalizePhoneOptions): boolean {
  return normalizePhone(input, opts) !== null;
}

/** ISO-3166 alpha-2 country of an E.164 number (`+9647701234567` → `IQ`), or null. */
export function phoneCountry(e164: string | null | undefined): CountryCode | null {
  if (!e164) return null;
  return parsePhoneNumberFromString(e164)?.country ?? null;
}

/** `+9647701234567` → `+964 770 123 4567`; `+447911123456` → `+44 7911 123456`. Unparseable input is returned as is. */
export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return '';
  return parsePhoneNumberFromString(e164)?.formatInternational() ?? e164;
}

/**
 * `+9647701234567` → `+964 770 ••• ••67` (API maskedPhone, logs, security alerts): the country code, the first
 * three national digits and the last two stay visible; grouping follows the international format.
 */
export function maskPhone(e164: string | null | undefined): string {
  if (!e164) return '';
  const p = parsePhoneNumberFromString(e164);
  if (!p) return '•••';
  const formatted = p.formatInternational();
  const cc = `+${p.countryCallingCode}`;
  if (!formatted.startsWith(cc)) return '•••';
  const national = formatted.slice(cc.length);
  const total = national.replace(/\D/g, '').length;
  const head = total >= 8 ? 3 : 1;
  const tail = 2;
  let i = 0;
  const masked = national.replace(/\d/g, (d) => {
    const pos = i++;
    return pos < head || pos >= total - tail ? d : '•';
  });
  return `${cc}${masked}`;
}
