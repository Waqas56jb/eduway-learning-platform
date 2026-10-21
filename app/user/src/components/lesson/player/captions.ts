import type { Localized } from '@/types';

/** Mock bilingual caption track — cycles every CUE_SEC seconds through the lesson. */
export const CUE_SEC = 6;

export const sampleCaptions: Localized[] = [
  { en: "Welcome back! Let's start by reviewing the key idea from last time.", ar: 'أهلاً بعودتك! لنبدأ بمراجعة الفكرة الأساسية من الدرس السابق.' },
  { en: 'Write this rule down — it appears in almost every ministerial exam.', ar: 'اكتب هذه القاعدة عندك — تتكرر تقريباً في كل امتحان وزاري.' },
  { en: 'Notice how each step follows directly from the definition.', ar: 'لاحظ كيف تنتج كل خطوة مباشرة من التعريف.' },
  { en: 'Now pause the video and try the next example on your own.', ar: 'الآن أوقف الفيديو وحاول حل المثال التالي بنفسك.' },
  { en: "A common mistake here is forgetting the sign. Let's fix that.", ar: 'من الأخطاء الشائعة هنا نسيان الإشارة. لنصحّح ذلك.' },
  { en: 'Great — substitute the values and simplify carefully.', ar: 'ممتاز — عوّض القيم وبسّط بعناية.' },
  { en: 'Remember: units must be consistent before you calculate.', ar: 'تذكّر: يجب توحيد الوحدات قبل الحساب.' },
  { en: "That's the full method. We'll practise it in the quiz.", ar: 'هذه هي الطريقة كاملة. سنتدرّب عليها في الاختبار.' },
];

export function captionAt(sec: number): Localized {
  const i = Math.floor(Math.max(0, sec) / CUE_SEC) % sampleCaptions.length;
  return sampleCaptions[i]!;
}

export const SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;
export const QUALITIES = ['auto', '1080p', '720p', '480p'] as const;
export type Quality = (typeof QUALITIES)[number];
