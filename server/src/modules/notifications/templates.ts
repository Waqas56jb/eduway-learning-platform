/** Template helpers (pure): variable extraction, rendering, SMS segment maths, variable catalogue (ADM-NTT-08/09). */

export type NotifChannel = 'push' | 'in_app' | 'sms' | 'whatsapp' | 'email';
export type NotifType = 'otp' | 'payment_confirmation' | 'subscription_expiry' | 'new_lesson' | 'unfinished_lesson' | 'exam_reminder' | 'progress_reminder' | 'support_message';
export const NOTIF_CHANNELS: NotifChannel[] = ['push', 'in_app', 'sms', 'whatsapp', 'email'];
export const NOTIF_TYPES: NotifType[] = ['otp', 'payment_confirmation', 'subscription_expiry', 'new_lesson', 'unfinished_lesson', 'exam_reminder', 'progress_reminder', 'support_message'];

type L = { en: string; ar: string };

/** `{token}` names in order of first appearance (deduplicated). */
export function extractVariables(...texts: string[]): string[] {
  const out: string[] = [];
  for (const t of texts) for (const m of t.matchAll(/\{([a-z][a-z0-9_]*)\}/gi)) if (!out.includes(m[1] as string)) out.push(m[1] as string);
  return out;
}

/** Replace `{var}` with values (Localized values pick `lang`); unknown variables render as ''. */
export function renderTemplate(text: string, vars: Record<string, string | number | L | null | undefined>, lang: 'en' | 'ar'): string {
  return text.replace(/\{([a-z][a-z0-9_]*)\}/gi, (_, k: string) => {
    const v = vars[k];
    if (v === null || v === undefined) return '';
    if (typeof v === 'object') return v[lang] ?? v.en;
    return String(v);
  });
}

const GSM7 = new Set(
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà',
);
const GSM7_EXT = new Set('^{}\\[~]|€');

/** SMS length info: GSM-7 (160/153 per segment, extension chars count double) or UCS-2 (70/67). */
export function smsInfo(text: string): { chars: number; segments: number; encoding: 'GSM-7' | 'UCS-2' } {
  const chars = [...text];
  const gsm = chars.every((c) => GSM7.has(c) || GSM7_EXT.has(c));
  if (gsm) {
    const units = chars.reduce((n, c) => n + (GSM7_EXT.has(c) ? 2 : 1), 0);
    return { chars: units, segments: units === 0 ? 0 : units <= 160 ? 1 : Math.ceil(units / 153), encoding: 'GSM-7' };
  }
  const units = chars.reduce((n, c) => n + ((c.codePointAt(0) ?? 0) > 0xffff ? 2 : 1), 0);
  return { chars: units, segments: units === 0 ? 0 : units <= 70 ? 1 : Math.ceil(units / 67), encoding: 'UCS-2' };
}

/** Notification-preference category for a template type (null = cannot be opted out of). */
export function categoryForType(type: string): 'lessons' | 'exams' | 'payments' | 'progress' | null {
  switch (type) {
    case 'new_lesson':
    case 'unfinished_lesson':
      return 'lessons';
    case 'exam_reminder':
      return 'exams';
    case 'payment_confirmation':
    case 'subscription_expiry':
      return 'payments';
    case 'progress_reminder':
      return 'progress';
    default:
      return null;
  }
}

/** Student inbox type (`AppNotification.type`) for a template type. */
export function inboxTypeFor(type: string): 'lesson' | 'exam' | 'payment' | 'subscription' | 'system' {
  if (type === 'new_lesson' || type === 'unfinished_lesson') return 'lesson';
  if (type === 'exam_reminder') return 'exam';
  if (type === 'payment_confirmation') return 'payment';
  if (type === 'subscription_expiry') return 'subscription';
  return 'system';
}

/** Default deep link per template type (canonical app routes, §1.8). */
export function linkForType(type: string): { link: string | null; target: { kind: string; id: string | null } } {
  switch (type) {
    case 'new_lesson':
    case 'unfinished_lesson':
      return { link: '/progress', target: { kind: 'progress', id: null } };
    case 'exam_reminder':
      return { link: '/exams', target: { kind: 'exams', id: null } };
    case 'payment_confirmation':
    case 'subscription_expiry':
      return { link: '/subscription', target: { kind: 'subscription', id: null } };
    case 'progress_reminder':
      return { link: '/progress', target: { kind: 'progress', id: null } };
    default:
      return { link: '/notifications', target: { kind: 'notifications', id: null } };
  }
}

export interface VariableDef {
  key: string;
  sample: L;
  description: L;
  types: NotifType[] | null;
}

export const TEMPLATE_VARIABLES: VariableDef[] = [
  { key: 'student_name', sample: { en: 'Zahraa Kareem', ar: 'زهراء كريم' }, description: { en: "Student's full name", ar: 'اسم الطالب الكامل' }, types: null },
  { key: 'lesson_title', sample: { en: 'The Definite Integral', ar: 'التكامل المحدد' }, description: { en: 'Lesson title', ar: 'عنوان الدرس' }, types: ['new_lesson', 'unfinished_lesson'] },
  { key: 'subject_name', sample: { en: 'Mathematics', ar: 'الرياضيات' }, description: { en: 'Subject name', ar: 'اسم المادة' }, types: ['new_lesson', 'unfinished_lesson', 'exam_reminder', 'progress_reminder'] },
  { key: 'expiry_date', sample: { en: '31 Oct 2026', ar: '31 تشرين الأول 2026' }, description: { en: 'Subscription expiry date', ar: 'تاريخ انتهاء الاشتراك' }, types: ['subscription_expiry'] },
  { key: 'otp_code', sample: { en: '482913', ar: '482913' }, description: { en: 'One-time verification code', ar: 'رمز التحقق لمرة واحدة' }, types: ['otp'] },
  { key: 'amount', sample: { en: '150,000 IQD', ar: '150,000 د.ع' }, description: { en: 'Paid amount', ar: 'المبلغ المدفوع' }, types: ['payment_confirmation'] },
  { key: 'package_name', sample: { en: 'Full Year — All Subjects', ar: 'الباقة السنوية الشاملة' }, description: { en: 'Package name', ar: 'اسم الباقة' }, types: ['payment_confirmation', 'subscription_expiry'] },
  { key: 'exam_date', sample: { en: 'Saturday 14 Nov, 10:00', ar: 'السبت 14 تشرين الثاني، 10:00' }, description: { en: 'Exam date and time', ar: 'موعد الامتحان' }, types: ['exam_reminder'] },
  { key: 'progress', sample: { en: '68%', ar: '68%' }, description: { en: 'Overall progress', ar: 'نسبة التقدم' }, types: ['progress_reminder'] },
  { key: 'ticket_id', sample: { en: 'SUP-20418', ar: 'SUP-20418' }, description: { en: 'Support ticket number', ar: 'رقم تذكرة الدعم' }, types: ['support_message'] },
  { key: 'support_message', sample: { en: 'Your video playback issue has been resolved.', ar: 'تم حل مشكلة تشغيل الفيديو لديك.' }, description: { en: 'Message from support', ar: 'رسالة من فريق الدعم' }, types: ['support_message'] },
];

export const SAMPLE_VARS: Record<string, L> = Object.fromEntries(TEMPLATE_VARIABLES.map((v) => [v.key, v.sample]));
