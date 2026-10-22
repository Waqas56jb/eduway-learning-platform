export type Lang = 'en' | 'ar';
export type Localized = { en: string; ar: string };

export type SubjectId = 'math' | 'physics' | 'chemistry' | 'biology' | 'english';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type LessonStatus = 'completed' | 'in-progress' | 'not-started';

export interface Chapter {
  id: string;
  title: Localized;
}

export interface Unit {
  id: string;
  title: Localized;
  chapters: Chapter[];
}

export interface Subject {
  id: SubjectId;
  name: Localized;
  tagline: Localized;
  description: Localized;
  color: string;
  image: string;
  icon: string;
  lessonsCount: number;
  hours: number;
  questionsCount: number;
  teacher: Localized;
  units: Unit[];
  /** API uuid (the app keys subjects by slug: `id`). */
  uuid?: string;
  examsCount?: number;
  /** Caller entitlement: false = entitled, null when unknown. */
  locked?: boolean | null;
  /** Mean lesson progress 0–100 (server `progress.avgPct`). */
  progressPct?: number;
  completedLessons?: number;
}

export interface Resource {
  id?: string;
  mimeType?: string;
  title: Localized;
  size: string;
  pages: number;
}

export interface Lesson {
  id: string;
  subjectId: SubjectId;
  unitId: string;
  chapterId: string;
  order: number;
  title: Localized;
  description: Localized;
  duration: number; // seconds
  thumbnail: string;
  teacher: Localized;
  status: LessonStatus;
  progress: number; // 0-100
  videoUrl: string;
  resources: Resource[];
  topicId?: string;
  locked?: boolean;
  lockReason?: string | null;
  positionSec?: number;
  teacherAvatar?: string | null;
  teacherId?: string | null;
}

export interface Question {
  id: string;
  subjectId: SubjectId;
  unitId: string;
  lessonId?: string;
  topic: Localized;
  difficulty: Difficulty;
  tags: string[];
  text: Localized;
  /** Optional LaTeX shown under the question text */
  formula?: string;
  options: Localized[];
  /** Index of the correct option; -1 while unknown (answers are revealed by the server). */
  correctIndex: number;
  explanation: Localized;
  /** Option ids in served order (parallel to `options`). */
  optionIds?: string[];
  code?: string;
  topicId?: string;
  imageUrl?: string | null;
  bookmarked?: boolean;
  locked?: boolean;
  type?: 'mcq' | 'true_false' | 'fill_blank';
}

export type MistakeStatus = 'unresolved' | 'reviewed' | 'mastered';

export interface Mistake {
  id: string;
  questionId: string;
  chosenIndex: number;
  status: MistakeStatus;
  repeatCount: number;
  date: string; // ISO
  source: 'quiz' | 'bank' | 'exam';
}

export interface ExamBlueprint {
  id: string;
  subjectId: SubjectId;
  title: Localized;
  description: Localized;
  questionCount: number;
  durationMin: number;
  attemptsLeft: number;
  attemptsTotal: number;
  passMark: number;
  questionIds: string[];
  bestScore?: number;
}

export interface Package {
  id: string;
  name: Localized;
  tagline: Localized;
  priceMonthly: number;
  priceYearly: number;
  currency: Localized;
  subjects: SubjectId[];
  aiQuota: number;
  popular?: boolean;
  features: Localized[];
}

export type NotificationType = 'lesson' | 'exam' | 'payment' | 'subscription' | 'system';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: Localized;
  body: Localized;
  date: string; // ISO
  read: boolean;
  link?: string | null;
}

export interface Session {
  id: string;
  device: string;
  location: Localized;
  lastActive: string; // ISO
  current: boolean;
  platform?: string;
  ip?: string;
}

export interface User {
  id: string;
  name: Localized;
  firstName: Localized;
  mobile: string;
  governorate: string; // key into governorates list
  school: Localized;
  avatar: string;
  packageId: string;
  subscriptionStart: string;
  subscriptionEnd: string;
  daysRemaining: number;
  aiUsed: number;
  aiQuota: number;
  streak: number;
  lastLessonId: string;
  language: Lang;
  /** @deprecated sessions come from GET /me/sessions (`useSessions`). Always empty. */
  sessions: Session[];
  governorateName?: Localized;
  schoolId?: string | null;
  email?: string | null;
  subscriptionStatus?: 'active' | 'trial' | 'expired' | 'cancelled' | 'none';
  dailyGoalMinutes?: number;
  memberSince?: string;
  profileComplete?: boolean;
}


