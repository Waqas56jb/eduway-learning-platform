import { DEFAULT_COUNTRY, formatNational, formatPhoneInternational, maskPhone, textToE164, type PhoneValue } from '@/lib/phone';

/** Number pre-filled by the "demo account" shortcut (Iraq, national format). */
export const DEMO_MOBILE = '0770 123 4567';

/** Initial value of a phone field: Iraq selected, nothing typed. */
export const emptyPhone = (): PhoneValue => ({ country: DEFAULT_COUNTRY, national: '' });

/** The demo student's number as a phone-field value. */
export const demoPhone = (): PhoneValue => ({ country: DEFAULT_COUNTRY, national: formatNational(DEMO_MOBILE, DEFAULT_COUNTRY) });

/** Any valid phone number typed as free text (Iraqi 07… or international +…). */
export const isValidMobileText = (raw: string) => textToE164(raw) !== '';

/** "+9647701234567" → "+964 770 123 4567"; "+447911123456" → "+44 7911 123456". */
export const normalizeMobile = (raw: string): string => formatPhoneInternational(raw);

/** "+9647701234567" → "+964 770 ••• 4567" */
export const maskMobile = (mobile: string): string => maskPhone(mobile);
