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
}

export interface Resource {
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
  correctIndex: number;
  explanation: Localized;
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
  link?: string;
}

export interface Session {
  id: string;
  device: string;
  location: Localized;
  lastActive: string; // ISO
  current: boolean;
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
  sessions: Session[];
}


