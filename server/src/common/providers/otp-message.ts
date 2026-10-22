/**
 * WhatsApp OTP message text (Baileys provider + admin preview). Bilingual: the student's language first, the
 * other language below it, so a student who reads either language understands the message.
 */
export type OtpLocale = 'en' | 'ar';

/** Whole minutes for an expiry in seconds (never below 1) — same rounding as the SMS template. */
export const otpMinutes = (ttlSeconds: number): number => Math.max(1, Math.round(ttlSeconds / 60));

/** Arabic counted noun for minutes (1 دقيقة واحدة, 2 دقيقتين, 3–10 دقائق, 11+ دقيقة). */
export function arabicMinutes(n: number): string {
  if (n === 1) return 'دقيقة واحدة';
  if (n === 2) return 'دقيقتين';
  if (n >= 3 && n <= 10) return `${n} دقائق`;
  return `${n} دقيقة`;
}

export function englishMinutes(n: number): string {
  return n === 1 ? '1 minute' : `${n} minutes`;
}

export function otpMessageAr(code: string, ttlSeconds: number): string {
  return `رمز التحقق الخاص بك في EDUWAY هو: ${code}\nصالح لمدة ${arabicMinutes(otpMinutes(ttlSeconds))}. لا تشارك هذا الرمز مع أي شخص.`;
}

export function otpMessageEn(code: string, ttlSeconds: number): string {
  return `Your EDUWAY verification code is: ${code}\nValid for ${englishMinutes(otpMinutes(ttlSeconds))}. Do not share this code with anyone.`;
}

/** Full WhatsApp OTP text: primary language block, blank line, secondary language block. */
export function buildWhatsAppOtpText(code: string, ttlSeconds: number, locale: OtpLocale = 'ar'): string {
  const ar = otpMessageAr(code, ttlSeconds);
  const en = otpMessageEn(code, ttlSeconds);
  return locale === 'en' ? `${en}\n\n${ar}` : `${ar}\n\n${en}`;
}
