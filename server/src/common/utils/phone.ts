/**
 * Iraqi mobile numbers → E.164 (`+9647XXXXXXXXX`).
 * Accepts: 07701234567, 7701234567, 9647701234567, +964 770 123 4567, 00964-770-123-4567,
 * and Arabic-Indic digits (٠٧٧٠١٢٣٤٥٦٧).
 * Iraqi mobile numbers: 10 national digits starting with 7 (operators 75x/77x/78x/79x …).
 */
const ARABIC_DIGITS = /[٠-٩۰-۹]/g;

function toLatinDigits(s: string): string {
  return s.replace(ARABIC_DIGITS, (d) => {
    const code = d.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}

/** Returns the E.164 form or null when the input is not a valid Iraqi mobile number. */
export function normalizeIraqiPhone(input: string | null | undefined): string | null {
  if (!input) return null;
  let digits = toLatinDigits(String(input)).replace(/[\s\-().]/g, '');
  if (!/^\+?\d+$/.test(digits)) return null;
  digits = digits.replace(/^\+/, '');
  if (digits.startsWith('00964')) digits = digits.slice(5);
  else if (digits.startsWith('964')) digits = digits.slice(3);
  if (digits.startsWith('0')) digits = digits.slice(1);
  // API_CONTRACT §4.1: after normalization `^\+9647[3-9]\d{8}$` (Korek 75x, Asiacell 77x, Zain 78x/79x, …).
  if (!/^7[3-9][0-9]{8}$/.test(digits)) return null;
  return `+964${digits}`;
}

export function isValidIraqiPhone(input: string | null | undefined): boolean {
  return normalizeIraqiPhone(input) !== null;
}

/** `+9647701234567` → `+964 770 123 4567` */
export function formatIraqiPhone(e164: string): string {
  const m = /^\+964(7\d{2})(\d{3})(\d{4})$/.exec(e164);
  return m ? `+964 ${m[1]} ${m[2]} ${m[3]}` : e164;
}

/** `+9647701234567` → `+964 770 ••• ••67` (API maskedPhone, logs, security alerts). */
export function maskPhone(e164: string | null | undefined): string {
  if (!e164) return '';
  const m = /^\+964(7\d{2})(\d{3})(\d{2})(\d{2})$/.exec(e164);
  return m ? `+964 ${m[1]} ••• ••${m[4]}` : '•••';
}
