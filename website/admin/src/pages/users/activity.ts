import { format, subDays } from 'date-fns';
import type { Lesson, Student, SubjectKey } from '@/types';
import { createRng, MOCK_NOW } from '@/utils/random';

/* Per-student learning activity, generated deterministically from the student id so the
   detail page is stable across visits. Mock telemetry — not stored. */

export interface WatchItem {
  id: string;
  lessonId: string;
  watchedSec: number;
  durationSec: number;
  completed: boolean;
  at: string;
}

export interface QuizItem {
  id: string;
  lessonId: string;
  correct: number;
  total: number;
  score: number;
  passed: boolean;
  at: string;
}

export interface ExamItem {
  id: string;
  title_en: string;
  title_ar: string;
  score: number;
  durationMin: number;
  status: 'passed' | 'failed' | 'abandoned';
  at: string;
}

export interface AiQuestion {
  id: string;
  subject: SubjectKey;
  text_en: string;
  text_ar: string;
  at: string;
}

export interface StudentActivity {
  watch: WatchItem[];
  quizzes: QuizItem[];
  exams: ExamItem[];
  aiDaily: { date: string; questions: number }[];
  aiRecent: AiQuestion[];
}

const seedFrom = (id: string) => [...id].reduce((h, c) => (h * 33 + c.charCodeAt(0)) >>> 0, 5381);

const EXAMS: [string, string][] = [
  ['Ministerial Mock Exam — Mid-Year', 'الامتحان الوزاري التجريبي — نصف السنة'],
  ['Mathematics Unit Test: Complex Numbers', 'اختبار وحدة الرياضيات: الأعداد المركبة'],
  ['Physics Chapter Exam: Capacitors', 'امتحان فصل الفيزياء: المتسعات'],
  ['Chemistry Practice Exam: Equilibrium', 'امتحان تدريبي في الكيمياء: الاتزان'],
  ['Full Ministerial Simulation 2025', 'محاكاة الامتحان الوزاري الكامل 2025'],
];

const AI_QS: [SubjectKey, string, string][] = [
  ['math', 'Why is i² equal to −1 and not 1?', 'لماذا i² تساوي −1 وليس 1؟'],
  ['math', 'How do I find the focus of y² = 12x?', 'كيف أجد بؤرة القطع y² = 12x؟'],
  ['math', 'Can you explain integration by substitution step by step?', 'هل يمكنك شرح التكامل بالتعويض خطوة بخطوة؟'],
  ['physics', 'What happens to capacitance when a dielectric is inserted?', 'ماذا يحدث للسعة عند إدخال مادة عازلة؟'],
  ['physics', "How do I apply Lenz's law to find current direction?", 'كيف أطبق قانون لنز لإيجاد اتجاه التيار؟'],
  ['chemistry', 'Why does adding a catalyst not shift equilibrium?', 'لماذا لا يؤدي إضافة العامل المساعد إلى إزاحة الاتزان؟'],
  ['chemistry', 'How do I calculate pH of 0.01 M HCl?', 'كيف أحسب pH لمحلول HCl بتركيز 0.01 مولاري؟'],
  ['biology', 'What is the difference between codominance and incomplete dominance?', 'ما الفرق بين السيادة المشتركة والسيادة غير التامة؟'],
  ['biology', 'Explain the role of mRNA in translation.', 'اشرح دور mRNA في عملية الترجمة.'],
  ['english', 'When do I use past perfect instead of past simple?', 'متى أستخدم الماضي التام بدلاً من الماضي البسيط؟'],
  ['english', 'How do I convert a sentence to reported speech?', 'كيف أحوّل جملة إلى الكلام المنقول؟'],
];

const SUBJECT_KEY: Record<string, SubjectKey> = { sub_math: 'math', sub_phys: 'physics', sub_chem: 'chemistry', sub_bio: 'biology', sub_eng: 'english' };

export function generateActivity(student: Student, lessons: Lesson[]): StudentActivity {
  const rng = createRng(seedFrom(student.id));
  const subjectIds = new Set(student.entitlements.map((e) => e.subjectId));
  const pool = lessons.filter((l) => l.status === 'published' && (subjectIds.size === 0 || subjectIds.has(l.subjectId)));
  const engaged = student.subscriptionStatus === 'active' || student.subscriptionStatus === 'trial';
  const scale = engaged ? 1 : 0.35;
  const lastActiveDays = Math.max(0, Math.floor((MOCK_NOW.getTime() - new Date(student.lastActive).getTime()) / 86_400_000));
  const at = (offset: number) => subDays(MOCK_NOW, lastActiveDays + offset).toISOString();

  const watchCount = pool.length ? Math.round(rng.int(4, 9) * scale) : 0;
  const watch: WatchItem[] = rng
    .shuffle(pool)
    .slice(0, watchCount)
    .map((l, i) => {
      const completed = rng.bool(0.65);
      return {
        id: `w_${student.id}_${i}`,
        lessonId: l.id,
        durationSec: l.durationSec,
        watchedSec: completed ? l.durationSec : Math.round(l.durationSec * rng.float(0.15, 0.85)),
        completed,
        at: new Date(new Date(at(i * rng.int(1, 3))).getTime() - rng.int(1, 20) * 3_600_000).toISOString(),
      };
    });

  const quizzes: QuizItem[] = watch
    .filter((w) => w.completed)
    .map((w, i) => {
      const total = rng.pick([5, 8, 10]);
      const base = student.avgScore / 100;
      const correct = Math.max(0, Math.min(total, Math.round(total * (base + rng.float(-0.2, 0.15)))));
      const score = Math.round((correct / total) * 100);
      return { id: `q_${student.id}_${i}`, lessonId: w.lessonId, correct, total, score, passed: score >= 70, at: w.at };
    });

  const exams: ExamItem[] = Array.from({ length: Math.round(rng.int(1, 4) * scale) }, (_, i) => {
    const [en, ar] = EXAMS[(i + rng.int(0, 4)) % EXAMS.length];
    const score = Math.max(18, Math.min(99, Math.round(student.avgScore + rng.int(-14, 10))));
    return {
      id: `e_${student.id}_${i}`,
      title_en: en,
      title_ar: ar,
      score,
      durationMin: rng.int(48, 180),
      status: rng.bool(0.08) ? 'abandoned' : score >= 50 ? 'passed' : 'failed',
      at: at(i * rng.int(5, 12) + 2),
    };
  });

  const avgDaily = student.aiQuestionsUsed / 22;
  const aiDaily = Array.from({ length: 14 }, (_, i) => {
    const d = subDays(MOCK_NOW, 13 - i);
    const active = 13 - i >= lastActiveDays;
    return { date: format(d, 'yyyy-MM-dd'), questions: active ? Math.max(0, Math.round(avgDaily * rng.float(0.2, 2.1))) : 0 };
  });

  const allowed = new Set([...subjectIds].map((s) => SUBJECT_KEY[s]));
  const qpool = AI_QS.filter(([s]) => allowed.size === 0 || allowed.has(s));
  const aiRecent: AiQuestion[] = student.aiQuestionsUsed
    ? rng
        .shuffle(qpool)
        .slice(0, Math.min(5, Math.ceil(student.aiQuestionsUsed / 15)))
        .map(([subject, en, ar], i) => ({ id: `ai_${student.id}_${i}`, subject, text_en: en, text_ar: ar, at: at(i) }))
    : [];

  return { watch, quizzes, exams, aiDaily, aiRecent };
}
