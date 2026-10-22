/* Admin assessments: quiz rules, exam blueprints, attempts (contract §23). */
import type { Attempt, BlueprintRow, Difficulty, ExamBlueprint, QuizRule } from '@/types';
import { api, type Query } from './client';
import type { ID, ISODate, LessonRef, Localized, OkDto, Platform, StudentRef, SubjectRef } from './types';

// ─── Quiz rules ──────────────────────────────────────────────────────────────
export interface QuizRuleDto {
  id: ID;
  scope: 'subject' | 'lesson';
  subjectId: ID;
  subject: SubjectRef;
  lessonId: ID | null;
  lesson: (LessonRef & { title: Localized }) | null;
  questionCount: number;
  poolSize: number;
  randomize: boolean;
  alternativeSets: number;
  passThreshold: number;
  retryPolicy: 'unlimited' | 'limited' | 'cooldown';
  maxRetries: number;
  cooldownMinutes: number;
  showExplanation: boolean;
  requireCompletionToUnlock: boolean;
  updatedAt: ISODate;
}
export type QuizRuleWriteDto = Pick<
  QuizRuleDto,
  'questionCount' | 'poolSize' | 'randomize' | 'alternativeSets' | 'passThreshold' | 'retryPolicy' | 'maxRetries' | 'cooldownMinutes' | 'showExplanation' | 'requireCompletionToUnlock'
>;
export type QuizRuleVM = QuizRule & { cooldownMinutes: number; subject: SubjectRef | null; lesson: QuizRuleDto['lesson'] };

export const toQuizRuleVM = (r: QuizRuleDto): QuizRuleVM => ({
  id: r.id,
  scope: r.scope,
  subjectId: r.subjectId,
  lessonId: r.lessonId,
  questionCount: r.questionCount,
  poolSize: r.poolSize,
  randomize: r.randomize,
  alternativeSets: r.alternativeSets,
  passThreshold: r.passThreshold,
  retryPolicy: r.retryPolicy,
  maxRetries: r.maxRetries,
  cooldownMinutes: r.cooldownMinutes ?? 60,
  showExplanation: r.showExplanation,
  requireCompletionToUnlock: r.requireCompletionToUnlock,
  subject: r.subject ?? null,
  lesson: r.lesson ?? null,
});

export const quizRulesApi = {
  list: async (params: Query) => {
    const r = await api.list<QuizRuleDto>('/admin/quiz-rules', params);
    return { items: r.items.map(toQuizRuleVM), meta: r.meta };
  },
  upsertSubject: async (subjectId: ID, body: QuizRuleWriteDto) => toQuizRuleVM(await api.put<QuizRuleDto>(`/admin/quiz-rules/subjects/${subjectId}`, body)),
  create: async (body: QuizRuleWriteDto & { lessonId: ID }) => toQuizRuleVM(await api.post<QuizRuleDto>('/admin/quiz-rules', body)),
  update: async (id: ID, body: Partial<QuizRuleWriteDto>) => toQuizRuleVM(await api.patch<QuizRuleDto>(`/admin/quiz-rules/${id}`, body)),
  remove: (id: ID) => api.delete<OkDto>(`/admin/quiz-rules/${id}`),
};

// ─── Exam blueprints ─────────────────────────────────────────────────────────
export interface ExamBlueprintDto {
  id: ID;
  name: Localized;
  description: Localized;
  rows: BlueprintRow[];
  subjects: SubjectRef[];
  questionCount: number;
  durationMin: number;
  randomize: boolean;
  scoring: 'standard' | 'negative' | 'weighted';
  attemptLimit: number;
  reviewBeforeSubmit: boolean;
  passMark: number;
  availableFrom: ISODate;
  availableTo: ISODate;
  status: 'draft' | 'published' | 'archived';
  attempts: number;
  updatedAt: ISODate;
  createdAt: ISODate;
}
export type BlueprintVM = ExamBlueprint & {
  description_en: string;
  description_ar: string;
  passMark: number;
  subjects: SubjectRef[];
  questionCount: number;
};
export const toBlueprintVM = (b: ExamBlueprintDto): BlueprintVM => ({
  id: b.id,
  name_en: b.name.en,
  name_ar: b.name.ar,
  description_en: b.description?.en ?? '',
  description_ar: b.description?.ar ?? '',
  rows: b.rows ?? [],
  durationMin: b.durationMin,
  randomize: b.randomize,
  scoring: b.scoring,
  attemptLimit: b.attemptLimit,
  reviewBeforeSubmit: b.reviewBeforeSubmit,
  availableFrom: b.availableFrom,
  availableTo: b.availableTo,
  status: b.status,
  attempts: b.attempts ?? 0,
  updatedAt: b.updatedAt,
  passMark: b.passMark ?? 50,
  subjects: b.subjects ?? [],
  questionCount: b.questionCount ?? (b.rows ?? []).reduce((s, r) => s + r.count, 0),
});
export type BlueprintWriteDto = Omit<ExamBlueprintDto, 'id' | 'subjects' | 'questionCount' | 'attempts' | 'updatedAt' | 'createdAt' | 'rows'> & {
  rows: Omit<BlueprintRow, 'id'>[];
};
export const toBlueprintWrite = (b: BlueprintVM): BlueprintWriteDto => ({
  name: { en: b.name_en, ar: b.name_ar },
  description: { en: b.description_en, ar: b.description_ar },
  rows: b.rows.map(({ subjectId, topicId, count, easy, medium, hard }) => ({ subjectId, topicId, count, easy, medium, hard })),
  durationMin: b.durationMin,
  randomize: b.randomize,
  scoring: b.scoring,
  attemptLimit: b.attemptLimit,
  reviewBeforeSubmit: b.reviewBeforeSubmit,
  passMark: b.passMark,
  availableFrom: b.availableFrom,
  availableTo: b.availableTo,
  status: b.status,
});

export interface AvailabilityDto {
  rows: {
    index: number;
    pool: number;
    ok: boolean;
    easy: { required: number; available: number };
    medium: { required: number; available: number };
    hard: { required: number; available: number };
  }[];
  shortRows: number;
}

export const blueprintsApi = {
  list: async (params: Query) => {
    const r = await api.list<ExamBlueprintDto>('/admin/exam-blueprints', params);
    return { items: r.items.map(toBlueprintVM), meta: r.meta };
  },
  stats: () => api.get<{ total: number; published: number; totalAttempts: number; avgDurationMin: number }>('/admin/exam-blueprints/stats'),
  get: async (id: ID) => toBlueprintVM(await api.get<ExamBlueprintDto>(`/admin/exam-blueprints/${id}`)),
  create: async (body: BlueprintWriteDto) => toBlueprintVM(await api.post<ExamBlueprintDto>('/admin/exam-blueprints', body)),
  update: async (id: ID, body: BlueprintWriteDto) => toBlueprintVM(await api.put<ExamBlueprintDto>(`/admin/exam-blueprints/${id}`, body)),
  remove: (id: ID) => api.delete<OkDto>(`/admin/exam-blueprints/${id}`),
  publish: async (id: ID, force?: boolean) => toBlueprintVM(await api.post<ExamBlueprintDto>(`/admin/exam-blueprints/${id}/publish`, { force })),
  archive: async (id: ID) => toBlueprintVM(await api.post<ExamBlueprintDto>(`/admin/exam-blueprints/${id}/archive`)),
  duplicate: async (id: ID) => toBlueprintVM(await api.post<ExamBlueprintDto>(`/admin/exam-blueprints/${id}/duplicate`)),
  availability: (rows: Omit<BlueprintRow, 'id'>[]) => api.post<AvailabilityDto>('/admin/exam-blueprints/availability', { rows }),
};

// ─── Attempts ────────────────────────────────────────────────────────────────
export interface AttemptRowDto {
  id: ID;
  kind: 'quiz' | 'exam' | 'practice';
  student: StudentRef;
  refId: ID;
  title: Localized;
  score: number;
  correct: number;
  total: number;
  timeSec: number;
  status: 'passed' | 'failed' | 'in_progress' | 'abandoned';
  platform: Platform | null;
  date: ISODate;
}
export interface AttemptDetailDto extends AttemptRowDto {
  answers: {
    questionId: ID;
    code: string | null;
    difficulty: Difficulty | null;
    body: Localized | null;
    selectedOptionId: ID | null;
    selectedText: Localized | null;
    correctOptionId: ID | null;
    correctText: Localized | null;
    correct: boolean;
    flagged: boolean;
    timeSec: number | null;
  }[];
}
export type AttemptVM = Omit<Attempt, 'kind'> & {
  kind: AttemptRowDto['kind'];
  student: StudentRef;
  correct: number;
  total: number;
  platform: Platform | null;
};
export const toAttemptVM = (a: AttemptRowDto): AttemptVM => ({
  id: a.id,
  studentId: a.student?.id ?? '',
  kind: a.kind,
  refId: a.refId,
  title_en: a.title.en,
  title_ar: a.title.ar,
  score: a.score,
  timeSec: a.timeSec,
  status: a.status,
  answers: [],
  date: a.date,
  student: a.student,
  correct: a.correct,
  total: a.total,
  platform: a.platform,
});

export const attemptsApi = {
  list: async (params: Query) => {
    const r = await api.list<AttemptRowDto>('/admin/attempts', params);
    return { items: r.items.map(toAttemptVM), meta: r.meta };
  },
  stats: (params: Query) => api.get<{ total: number; avgScore: number; passRate: number; avgTimeSec: number }>('/admin/attempts/stats', params),
  get: (id: ID) => api.get<AttemptDetailDto>(`/admin/attempts/${id}`),
};
