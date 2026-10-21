import type { Localized, SubjectId } from '@/types';

export type PlanKind = 'lesson' | 'quiz' | 'mistakes' | 'exam';

/** Route target for a plan item (expo-router href object or plain path). */
export type PlanTarget = string | { pathname: string; params: Record<string, string> };

export interface PlanItem {
  id: string;
  kind: PlanKind;
  subjectId: SubjectId;
  title: Localized;
  meta: Localized;
  minutes: number;
  target: PlanTarget;
  /** Initial completion state (the checklist is local state on the Home screen). */
  done: boolean;
}

/** "Today's plan" — a short, achievable checklist generated for the student. */
export const todayPlan: PlanItem[] = [
  {
    id: 'p1',
    kind: 'lesson',
    subjectId: 'math',
    title: { en: "Finish “Rolle's & Mean Value Theorems”", ar: 'أكمل درس "مبرهنتا رول والقيمة المتوسطة"' },
    meta: { en: 'Mathematics · Lesson', ar: 'الرياضيات · درس' },
    minutes: 7,
    target: { pathname: '/lesson/[id]', params: { id: 'math-l9' } },
    done: false,
  },
  {
    id: 'p2',
    kind: 'mistakes',
    subjectId: 'chemistry',
    title: { en: 'Review 5 mistakes from this week', ar: 'راجع 5 أخطاء من هذا الأسبوع' },
    meta: { en: 'My Mistakes · Review', ar: 'أخطائي · مراجعة' },
    minutes: 10,
    target: '/mistakes',
    done: true,
  },
  {
    id: 'p3',
    kind: 'quiz',
    subjectId: 'physics',
    title: { en: "Take the Faraday's Law quiz", ar: 'أدِّ اختبار قانون فاراداي' },
    meta: { en: 'Physics · 5 questions', ar: 'الفيزياء · 5 أسئلة' },
    minutes: 8,
    target: { pathname: '/quiz/[lessonId]', params: { lessonId: 'physics-l7' } },
    done: false,
  },
  {
    id: 'p4',
    kind: 'exam',
    subjectId: 'math',
    title: { en: 'Warm up for tomorrow’s ministerial mock', ar: 'تهيّأ للامتحان الوزاري التجريبي غداً' },
    meta: { en: 'Exam Simulator · Mathematics', ar: 'محاكي الامتحانات · الرياضيات' },
    minutes: 25,
    target: '/exams',
    done: false,
  },
];

/** Minutes studied in the previous week — used for the week-over-week delta on the chart card. */
export const lastWeekStudyMinutes = 662;

/** Maps the English weekday abbreviation in `weeklyStudy` to a `home:days.*` i18n key. */
export const dayKey = (en: string): string => en.toLowerCase().slice(0, 3);
