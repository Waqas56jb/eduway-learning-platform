import type {
  AppNotification,
  ExamBlueprint,
  FaqItem,
  Lesson,
  Localized,
  Mistake,
  Package,
  Question,
  Subject,
  SubjectId,
  Testimonial,
  User,
} from '@/types';
import subjectsJson from './subjects.json';
import lessonsJson from './lessons.json';
import questionsJson from './questions.json';
import mistakesJson from './mistakes.json';
import examsJson from './exams.json';
import packagesJson from './packages.json';
import notificationsJson from './notifications.json';
import userJson from './user.json';
import testimonialsJson from './testimonials.json';
import faqJson from './faq.json';
import governoratesJson from './governorates.json';

export const subjects = subjectsJson as Subject[];
export const lessons = lessonsJson as Lesson[];
export const questions = questionsJson as Question[];
export const mistakes = mistakesJson as Mistake[];
export const exams = examsJson as ExamBlueprint[];
export const packages = packagesJson as Package[];
export const notifications = notificationsJson as AppNotification[];
export const demoUser = userJson as User;
export const testimonials = testimonialsJson as Testimonial[];
export const faq = faqJson as FaqItem[];
export const governorates = governoratesJson as { id: string; name: Localized }[];

export const getSubject = (id: string | undefined) => subjects.find((s) => s.id === id);
export const getLesson = (id: string | undefined) => lessons.find((l) => l.id === id);
export const getQuestion = (id: string) => questions.find((q) => q.id === id);
export const getExam = (id: string | undefined) => exams.find((e) => e.id === id);
export const getPackage = (id: string | undefined) => packages.find((p) => p.id === id);
export const lessonsBySubject = (sid: SubjectId) =>
  lessons.filter((l) => l.subjectId === sid).sort((a, b) => a.order - b.order);
export const questionsBySubject = (sid: SubjectId) => questions.filter((q) => q.subjectId === sid);
export const getGovernorate = (id: string) => governorates.find((g) => g.id === id);

/** Weekly study minutes for the dashboard chart. */
export const weeklyStudy = [
  { day: { en: 'Sat', ar: 'السبت' }, minutes: 95, questions: 34 },
  { day: { en: 'Sun', ar: 'الأحد' }, minutes: 120, questions: 41 },
  { day: { en: 'Mon', ar: 'الاثنين' }, minutes: 80, questions: 22 },
  { day: { en: 'Tue', ar: 'الثلاثاء' }, minutes: 145, questions: 58 },
  { day: { en: 'Wed', ar: 'الأربعاء' }, minutes: 110, questions: 37 },
  { day: { en: 'Thu', ar: 'الخميس' }, minutes: 165, questions: 64 },
  { day: { en: 'Fri', ar: 'الجمعة' }, minutes: 60, questions: 18 },
];

/** Quiz averages over the last 8 weeks, per subject. */
export const quizTrend = [
  { week: 1, math: 62, physics: 58, chemistry: 66, biology: 70, english: 74 },
  { week: 2, math: 66, physics: 61, chemistry: 64, biology: 72, english: 76 },
  { week: 3, math: 71, physics: 63, chemistry: 69, biology: 71, english: 79 },
  { week: 4, math: 69, physics: 68, chemistry: 72, biology: 75, english: 81 },
  { week: 5, math: 75, physics: 70, chemistry: 71, biology: 78, english: 83 },
  { week: 6, math: 79, physics: 72, chemistry: 76, biology: 80, english: 84 },
  { week: 7, math: 82, physics: 76, chemistry: 78, biology: 81, english: 87 },
  { week: 8, math: 86, physics: 79, chemistry: 81, biology: 84, english: 89 },
];

/** Weak topics derived from mistakes + quiz performance. */
export const weakTopics: { subjectId: SubjectId; topic: Localized; accuracy: number; lessonId: string }[] = [
  { subjectId: 'physics', topic: { en: 'Transformers & turns ratio', ar: 'المحولات ونسبة اللفات' }, accuracy: 48, lessonId: 'physics-l10' },
  { subjectId: 'math', topic: { en: "Rolle's theorem conditions", ar: 'شروط مبرهنة رول' }, accuracy: 54, lessonId: 'math-l9' },
  { subjectId: 'biology', topic: { en: 'Sex-linked inheritance', ar: 'الوراثة المرتبطة بالجنس' }, accuracy: 57, lessonId: 'biology-l9' },
  { subjectId: 'chemistry', topic: { en: 'Electrode potentials', ar: 'جهود الأقطاب' }, accuracy: 61, lessonId: 'chemistry-l7' },
  { subjectId: 'english', topic: { en: 'Reported questions', ar: 'نقل الأسئلة' }, accuracy: 66, lessonId: 'english-l4' },
];

/** Active-day heatmap for the last 16 weeks (0–4 intensity). Deterministic pseudo-random. */
export const activityHeatmap: { date: string; level: number }[] = (() => {
  const out: { date: string; level: number }[] = [];
  const end = new Date('2026-10-22T12:00:00Z');
  let seed = 7;
  for (let i = 16 * 7 - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setUTCDate(end.getUTCDate() - i);
    seed = (seed * 9301 + 49297) % 233280;
    const r = seed / 233280;
    const level = i < 12 ? 2 + Math.round(r * 2) : r < 0.18 ? 0 : Math.ceil(r * 4);
    out.push({ date: d.toISOString().slice(0, 10), level: Math.min(4, level) });
  }
  return out;
})();

export const recentActivity: {
  id: string;
  kind: 'lesson' | 'quiz' | 'exam' | 'ai';
  title: Localized;
  meta: Localized;
  date: string;
}[] = [
  { id: 'a1', kind: 'lesson', title: { en: 'Completed “Related Rates”', ar: 'أكملت درس "المعدلات المرتبطة"' }, meta: { en: 'Mathematics · 18 min', ar: 'الرياضيات · 18 دقيقة' }, date: '2026-10-22T07:40:00Z' },
  { id: 'a2', kind: 'quiz', title: { en: 'Scored 4/5 on Electromagnetic Induction quiz', ar: 'حصلت على 4/5 في اختبار الحث الكهرومغناطيسي' }, meta: { en: 'Physics · Quiz', ar: 'الفيزياء · اختبار' }, date: '2026-10-21T19:15:00Z' },
  { id: 'a3', kind: 'ai', title: { en: 'Asked the AI Tutor about Kc vs Kp', ar: 'سألت المدرس الذكي عن الفرق بين Kc و Kp' }, meta: { en: 'Chemistry · AI Tutor', ar: 'الكيمياء · المدرس الذكي' }, date: '2026-10-21T16:02:00Z' },
  { id: 'a4', kind: 'exam', title: { en: 'Mathematics mock exam — 78%', ar: 'امتحان الرياضيات التجريبي — 78%' }, meta: { en: 'Exam Simulator', ar: 'محاكي الامتحانات' }, date: '2026-10-20T18:30:00Z' },
  { id: 'a5', kind: 'lesson', title: { en: 'Completed “Passive with Modal Verbs”', ar: 'أكملت درس "المجهول مع الأفعال الناقصة"' }, meta: { en: 'English · 14 min', ar: 'الإنكليزي · 14 دقيقة' }, date: '2026-10-20T15:10:00Z' },
];

export const upcomingExams: { id: string; examId: string; title: Localized; date: string }[] = [
  { id: 'u1', examId: 'exam-math-final', title: { en: 'Mathematics — Ministerial Mock', ar: 'الرياضيات — وزاري تجريبي' }, date: '2026-10-23T15:00:00Z' },
  { id: 'u2', examId: 'exam-physics-mid', title: { en: 'Physics — Capacitors & Induction', ar: 'الفيزياء — المتسعات والحث' }, date: '2026-10-26T15:00:00Z' },
  { id: 'u3', examId: 'exam-chem-organic', title: { en: 'Chemistry — Comprehensive Review', ar: 'الكيمياء — مراجعة شاملة' }, date: '2026-11-02T15:00:00Z' },
];

/** Canned AI tutor responses. Matched by keyword; falls back to `tutorFallback`. */
export const tutorAnswers: { keywords: string[]; subjectId: SubjectId; answer: Localized }[] = [
  {
    keywords: ['induction', 'faraday', 'فاراداي', 'الحث', 'emf'],
    subjectId: 'physics',
    answer: {
      en: "Great question! **Faraday's law** says the induced emf equals the rate of change of magnetic flux through the coil:\n\n$$\\varepsilon = -N\\frac{d\\Phi_B}{dt}$$\n\n- **N** is the number of turns\n- **Φ_B = B·A·cos θ** is the magnetic flux\n- The minus sign is **Lenz's law**: the induced current opposes the change.\n\n**Example:** a 200-turn coil whose flux drops from 0.05 Wb to 0 in 0.1 s gives ε = 200 × 0.05 / 0.1 = **100 V**.",
      ar: 'سؤال ممتاز! **قانون فاراداي** ينص على أن القوة الدافعة المحتثة تساوي المعدل الزمني لتغير الفيض المغناطيسي خلال الملف:\n\n$$\\varepsilon = -N\\frac{d\\Phi_B}{dt}$$\n\n- **N** عدد اللفات\n- **Φ_B = B·A·cos θ** الفيض المغناطيسي\n- الإشارة السالبة تمثل **قانون لنز**: التيار المحتث يعاكس التغير.\n\n**مثال:** ملف 200 لفة يتغير فيضه من 0.05 Wb إلى صفر خلال 0.1 s يعطي ε = 200 × 0.05 / 0.1 = **100 V**.',
    },
  },
  {
    keywords: ['capacitor', 'capacitance', 'متسعة', 'المتسعات', 'السعة'],
    subjectId: 'physics',
    answer: {
      en: 'A capacitor stores charge Q at voltage V. Its capacitance is:\n\n$$C = \\frac{Q}{V} = \\frac{\\varepsilon_0 \\kappa A}{d}$$\n\nThe stored energy is $U = \\tfrac{1}{2}CV^2$.\n\n- **Series:** $\\frac{1}{C_{eq}} = \\sum \\frac{1}{C_i}$\n- **Parallel:** $C_{eq} = \\sum C_i$',
      ar: 'المتسعة تخزن شحنة Q عند فرق جهد V. وسعتها:\n\n$$C = \\frac{Q}{V} = \\frac{\\varepsilon_0 \\kappa A}{d}$$\n\nوالطاقة المختزنة $U = \\tfrac{1}{2}CV^2$.\n\n- **التوالي:** $\\frac{1}{C_{eq}} = \\sum \\frac{1}{C_i}$\n- **التوازي:** $C_{eq} = \\sum C_i$',
    },
  },
  {
    keywords: ['derivative', 'differentiat', 'chain rule', 'مشتقة', 'المشتقات', 'التفاضل', 'السلسلة'],
    subjectId: 'math',
    answer: {
      en: "The derivative measures the instantaneous rate of change. Key rules:\n\n$$\\frac{d}{dx}x^n = nx^{n-1}, \\quad \\frac{d}{dx}\\sin x = \\cos x$$\n\n**Chain rule:** $\\frac{d}{dx}f(g(x)) = f'(g(x))\\cdot g'(x)$\n\n**Example:** $y = \\sin(3x^2) \\Rightarrow y' = 6x\\cos(3x^2)$.",
      ar: "المشتقة تقيس معدل التغير اللحظي. أهم القواعد:\n\n$$\\frac{d}{dx}x^n = nx^{n-1}, \\quad \\frac{d}{dx}\\sin x = \\cos x$$\n\n**قاعدة السلسلة:** $\\frac{d}{dx}f(g(x)) = f'(g(x))\\cdot g'(x)$\n\n**مثال:** $y = \\sin(3x^2) \\Rightarrow y' = 6x\\cos(3x^2)$.",
    },
  },
  {
    keywords: ['integral', 'integrat', 'تكامل', 'التكامل'],
    subjectId: 'math',
    answer: {
      en: 'Integration reverses differentiation:\n\n$$\\int x^n\\,dx = \\frac{x^{n+1}}{n+1} + c \\quad (n \\neq -1)$$\n\nFor a definite integral, evaluate the antiderivative at the limits:\n\n$$\\int_a^b f(x)\\,dx = F(b) - F(a)$$',
      ar: 'التكامل عكس التفاضل:\n\n$$\\int x^n\\,dx = \\frac{x^{n+1}}{n+1} + c \\quad (n \\neq -1)$$\n\nوللتكامل المحدد نعوض الحدود في المشتقة العكسية:\n\n$$\\int_a^b f(x)\\,dx = F(b) - F(a)$$',
    },
  },
  {
    keywords: ['kc', 'kp', 'equilibrium', 'chatelier', 'اتزان', 'الاتزان', 'لوشاتلييه'],
    subjectId: 'chemistry',
    answer: {
      en: '**Kc** uses molar concentrations, **Kp** uses partial pressures. They are related by:\n\n$$K_p = K_c (RT)^{\\Delta n}$$\n\nwhere Δn = moles of gaseous products − moles of gaseous reactants. If Δn = 0, then **Kp = Kc**.',
      ar: '**Kc** يستخدم التراكيز المولارية و**Kp** يستخدم الضغوط الجزيئية. والعلاقة بينهما:\n\n$$K_p = K_c (RT)^{\\Delta n}$$\n\nحيث Δn = مولات النواتج الغازية − مولات المتفاعلات الغازية. إذا كانت Δn = 0 فإن **Kp = Kc**.',
    },
  },
  {
    keywords: ['genetic', 'mendel', 'cross', 'codominance', 'وراثة', 'الوراثة', 'مندل', 'تضريب'],
    subjectId: 'biology',
    answer: {
      en: 'For a monohybrid cross **Tt × Tt**:\n\n- Genotypes: 1 TT : 2 Tt : 1 tt\n- Phenotypes: **3 dominant : 1 recessive**\n\nFor a dihybrid cross **AaBb × AaBb** the phenotypic ratio is **9 : 3 : 3 : 1**.',
      ar: 'في التضريب الأحادي **Tt × Tt**:\n\n- الطرز الجينية: 1 TT : 2 Tt : 1 tt\n- الطرز المظهرية: **3 سائد : 1 متنحي**\n\nوفي التضريب الثنائي **AaBb × AaBb** تكون النسبة المظهرية **9 : 3 : 3 : 1**.',
    },
  },
  {
    keywords: ['passive', 'reported', 'المجهول', 'مجهول', 'منقول'],
    subjectId: 'english',
    answer: {
      en: 'The **passive voice** = form of **be** + **past participle**.\n\n- Present: *The lesson **is explained** by the teacher.*\n- Past: *The bridge **was built** in 1990.*\n- Modal: *The report **must be finished** today.*\n\nUse it when the action matters more than who did it.',
      ar: '**المبني للمجهول** = صيغة من **be** + **التصريف الثالث**.\n\n- المضارع: *The lesson **is explained** by the teacher.*\n- الماضي: *The bridge **was built** in 1990.*\n- مع الأفعال الناقصة: *The report **must be finished** today.*\n\nنستخدمه عندما يكون الحدث أهم من الفاعل.',
    },
  },
];

export const tutorFallback: Localized = {
  en: "Here's how I'd approach it:\n\n1. **Identify** what is given and what is asked.\n2. **Pick** the law or rule that links them.\n3. **Substitute** carefully with units.\n\nFor example, Newton's second law:\n\n$$F = ma$$\n\nShare the exact question from your book and I'll solve it step by step.",
  ar: 'إليك طريقة الحل:\n\n1. **حدّد** المعطيات والمطلوب.\n2. **اختر** القانون الذي يربط بينهما.\n3. **عوّض** بعناية مع الوحدات.\n\nمثلاً قانون نيوتن الثاني:\n\n$$F = ma$$\n\nأرسل السؤال كما هو في كتابك وسأحله خطوة بخطوة.',
};

export const tutorSuggestions: Record<SubjectId, Localized[]> = {
  math: [
    { en: 'Explain the chain rule with an example', ar: 'اشرح قاعدة السلسلة مع مثال' },
    { en: 'How do I evaluate a definite integral?', ar: 'كيف أحسب التكامل المحدد؟' },
  ],
  physics: [
    { en: "Explain Faraday's law of induction", ar: 'اشرح قانون فاراداي للحث' },
    { en: 'How are capacitors combined in series?', ar: 'كيف تربط المتسعات على التوالي؟' },
  ],
  chemistry: [
    { en: 'What is the difference between Kc and Kp?', ar: 'ما الفرق بين Kc و Kp؟' },
    { en: "Explain Le Chatelier's principle", ar: 'اشرح مبدأ لوشاتلييه في الاتزان' },
  ],
  biology: [
    { en: 'Solve a Mendel cross Tt × Tt', ar: 'حل تضريب مندل Tt × Tt' },
    { en: 'What is codominance in genetics?', ar: 'ما هي السيادة المشتركة في الوراثة؟' },
  ],
  english: [
    { en: 'When do I use the passive voice?', ar: 'متى أستخدم المبني للمجهول؟' },
    { en: 'Turn a question into reported speech', ar: 'حوّل سؤالاً إلى كلام منقول' },
  ],
};
