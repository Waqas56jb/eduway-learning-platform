import type { Attempt, AttemptAnswer, ExamBlueprint, QuizRule } from '@/types';
import { createRng, daysAgo, daysAhead } from '@/utils/random';
import { lessons, students } from './index';
import { questions } from './questions';

const rng = createRng(5150);

// ─── Quiz rules ──────────────────────────────────────────────────────────────
const subjectDefault = (subjectId: string, over: Partial<QuizRule> = {}): QuizRule => ({
  id: `qr_${subjectId.slice(4)}`,
  scope: 'subject',
  subjectId,
  lessonId: null,
  questionCount: 10,
  poolSize: 30,
  randomize: true,
  alternativeSets: 3,
  passThreshold: 70,
  retryPolicy: 'cooldown',
  maxRetries: 3,
  showExplanation: true,
  requireCompletionToUnlock: false,
  ...over,
});

const lessonOverride = (lessonId: string, over: Partial<QuizRule>): QuizRule => {
  const lesson = lessons.find((l) => l.id === lessonId)!;
  return { ...subjectDefault(lesson.subjectId), id: `qr_${lessonId}`, scope: 'lesson', lessonId, ...over };
};

export const quizRules: QuizRule[] = [
  subjectDefault('sub_math', { questionCount: 10, poolSize: 30, requireCompletionToUnlock: true, passThreshold: 70 }),
  subjectDefault('sub_phys', { questionCount: 8, poolSize: 24, requireCompletionToUnlock: true, alternativeSets: 4 }),
  subjectDefault('sub_chem', { questionCount: 10, poolSize: 30, retryPolicy: 'limited', maxRetries: 2 }),
  subjectDefault('sub_bio', { questionCount: 12, poolSize: 36, passThreshold: 65, alternativeSets: 2 }),
  subjectDefault('sub_eng', { questionCount: 15, poolSize: 40, randomize: false, alternativeSets: 1, passThreshold: 60, retryPolicy: 'unlimited', maxRetries: 0 }),
  lessonOverride('les_001', { questionCount: 5, poolSize: 15, passThreshold: 60, alternativeSets: 2 }),
  lessonOverride('les_004', { questionCount: 12, poolSize: 36, passThreshold: 75, alternativeSets: 5 }),
  lessonOverride('les_011', { questionCount: 15, poolSize: 40, passThreshold: 80, retryPolicy: 'limited', maxRetries: 2 }),
  lessonOverride('les_016', { questionCount: 6, poolSize: 18, showExplanation: false }),
  lessonOverride('les_030', { questionCount: 10, poolSize: 25, retryPolicy: 'cooldown', maxRetries: 2, passThreshold: 75 }),
  lessonOverride('les_045', { questionCount: 8, poolSize: 20, requireCompletionToUnlock: true }),
];

// ─── Exam blueprints ─────────────────────────────────────────────────────────
export const blueprints: ExamBlueprint[] = [
  {
    id: 'bp_1',
    name_en: 'Ministerial Mock Exam — Mid-Year',
    name_ar: 'الامتحان الوزاري التجريبي — نصف السنة',
    rows: [
      { id: 'bpr_1_1', subjectId: 'sub_math', topicId: null, count: 20, easy: 30, medium: 50, hard: 20 },
      { id: 'bpr_1_2', subjectId: 'sub_phys', topicId: null, count: 15, easy: 30, medium: 50, hard: 20 },
      { id: 'bpr_1_3', subjectId: 'sub_chem', topicId: null, count: 15, easy: 30, medium: 45, hard: 25 },
      { id: 'bpr_1_4', subjectId: 'sub_bio', topicId: null, count: 15, easy: 35, medium: 45, hard: 20 },
      { id: 'bpr_1_5', subjectId: 'sub_eng', topicId: null, count: 15, easy: 40, medium: 40, hard: 20 },
    ],
    durationMin: 180,
    randomize: true,
    scoring: 'standard',
    attemptLimit: 2,
    reviewBeforeSubmit: true,
    availableFrom: daysAgo(12),
    availableTo: daysAhead(24),
    status: 'published',
    attempts: 412,
    updatedAt: daysAgo(13),
  },
  {
    id: 'bp_2',
    name_en: 'Physics Chapter Test — Capacitors & Induction',
    name_ar: 'اختبار فصل الفيزياء — المتسعات والحث',
    rows: [
      { id: 'bpr_2_1', subjectId: 'sub_phys', topicId: 'unit_phys_1_t1', count: 5, easy: 40, medium: 40, hard: 20 },
      { id: 'bpr_2_2', subjectId: 'sub_phys', topicId: 'unit_phys_1_t2', count: 5, easy: 40, medium: 40, hard: 20 },
      { id: 'bpr_2_3', subjectId: 'sub_phys', topicId: 'unit_phys_2_t1', count: 5, easy: 20, medium: 50, hard: 30 },
      { id: 'bpr_2_4', subjectId: 'sub_phys', topicId: 'unit_phys_2_t2', count: 5, easy: 20, medium: 50, hard: 30 },
    ],
    durationMin: 45,
    randomize: true,
    scoring: 'standard',
    attemptLimit: 3,
    reviewBeforeSubmit: true,
    availableFrom: daysAgo(30),
    availableTo: daysAhead(60),
    status: 'published',
    attempts: 186,
    updatedAt: daysAgo(31),
  },
  {
    id: 'bp_3',
    name_en: 'Final Ministerial Simulation 2027',
    name_ar: 'محاكاة الامتحان الوزاري النهائي 2027',
    rows: [
      { id: 'bpr_3_1', subjectId: 'sub_math', topicId: null, count: 25, easy: 20, medium: 45, hard: 35 },
      { id: 'bpr_3_2', subjectId: 'sub_phys', topicId: null, count: 25, easy: 20, medium: 45, hard: 35 },
      { id: 'bpr_3_3', subjectId: 'sub_chem', topicId: null, count: 25, easy: 20, medium: 45, hard: 35 },
      { id: 'bpr_3_4', subjectId: 'sub_bio', topicId: null, count: 25, easy: 20, medium: 45, hard: 35 },
      { id: 'bpr_3_5', subjectId: 'sub_eng', topicId: null, count: 25, easy: 25, medium: 45, hard: 30 },
    ],
    durationMin: 180,
    randomize: true,
    scoring: 'negative',
    attemptLimit: 1,
    reviewBeforeSubmit: false,
    availableFrom: '2027-05-15T08:00:00+03:00',
    availableTo: '2027-06-10T23:59:00+03:00',
    status: 'draft',
    attempts: 0,
    updatedAt: daysAgo(2),
  },
];

// ─── Attempts ────────────────────────────────────────────────────────────────
const usable = questions.filter((q) => q.status === 'published' && q.type === 'mcq');

function answersFor(pool: typeof usable, count: number, skill: number, partial = false): AttemptAnswer[] {
  const picked = rng.shuffle(pool).slice(0, count);
  return picked.map((q, i) => {
    const unanswered = partial && i >= Math.ceil(count / 2);
    const correct = !unanswered && rng.bool(skill);
    const wrongOpts = q.options.filter((o) => !o.correct);
    return {
      questionId: q.id,
      selectedOptionId: unanswered ? null : correct ? q.options.find((o) => o.correct)!.id : rng.pick(wrongOpts).id,
      correct,
      timeSec: unanswered ? 0 : rng.int(18, 110),
    };
  });
}

const activeStudents = students.filter((s) => s.subscriptionStatus === 'active');
const quizLessons = lessons.filter((l) => l.status === 'published');

export const attempts: Attempt[] = Array.from({ length: 20 }, (_, i): Attempt => {
  const student = activeStudents[(i * 7) % activeStudents.length];
  const skill = Math.min(0.95, Math.max(0.3, student.avgScore / 100 + rng.float(-0.1, 0.1)));
  const isExam = i % 10 === 3 || i % 10 === 7 || i === 15;
  const partial = i === 9 || i === 17;
  if (isExam) {
    const bp = blueprints[i % 2];
    const subjects = new Set(bp.rows.map((r) => r.subjectId));
    const topics = new Set(bp.rows.map((r) => r.topicId).filter(Boolean));
    const pool = usable.filter((q) => subjects.has(q.subjectId) && (topics.size === 0 || topics.has(q.topicId)));
    const answers = answersFor(pool, 10, skill, partial);
    const score = Math.round((answers.filter((a) => a.correct).length / answers.length) * 100);
    return {
      id: `att_${String(i + 1).padStart(3, '0')}`,
      studentId: student.id,
      kind: 'exam',
      refId: bp.id,
      title_en: bp.name_en,
      title_ar: bp.name_ar,
      score,
      timeSec: answers.reduce((s, a) => s + a.timeSec, 0) + rng.int(120, 600),
      status: partial ? 'abandoned' : score >= 60 ? 'passed' : 'failed',
      answers,
      date: daysAgo(rng.int(0, 12), rng.int(0, 20)),
    };
  }
  const lesson = quizLessons[(i * 5) % quizLessons.length];
  let pool = usable.filter((q) => q.topicId === lesson.topicId);
  if (pool.length < 4) pool = usable.filter((q) => q.subjectId === lesson.subjectId);
  const answers = answersFor(pool, Math.min(5, pool.length), skill, partial);
  const score = Math.round((answers.filter((a) => a.correct).length / answers.length) * 100);
  return {
    id: `att_${String(i + 1).padStart(3, '0')}`,
    studentId: student.id,
    kind: 'quiz',
    refId: lesson.id,
    title_en: lesson.title_en,
    title_ar: lesson.title_ar,
    score,
    timeSec: answers.reduce((s, a) => s + a.timeSec, 0),
    status: partial ? 'in_progress' : score >= 70 ? 'passed' : 'failed',
    answers,
    date: daysAgo(rng.int(0, 20), rng.int(0, 20)),
  };
}).sort((a, b) => b.date.localeCompare(a.date));
