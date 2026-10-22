import type { BankFilters, NotificationFilter } from './types';

/** React-query keys, one namespace per API module (ENGINEERING §5). */
export const keys = {
  // public / cms
  appConfig: ['public', 'app-config'] as const,
  governorates: ['public', 'governorates'] as const,
  schools: (governorateId?: string, q?: string) => ['public', 'schools', governorateId ?? '', q ?? ''] as const,
  referral: (code: string) => ['public', 'referral', code.toUpperCase()] as const,
  stats: ['public', 'stats'] as const,
  testimonials: (placement?: string) => ['public', 'testimonials', placement ?? 'landing'] as const,
  faq: (placement?: string) => ['public', 'faq', placement ?? 'landing'] as const,
  teachers: ['public', 'teachers'] as const,
  paymentMethods: ['public', 'payment-methods'] as const,
  legal: (doc: string) => ['legal', doc] as const,

  // auth / me
  me: ['auth', 'me'] as const,
  sessions: ['me', 'sessions'] as const,
  notificationPrefs: ['me', 'notification-prefs'] as const,
  entitlements: ['me', 'entitlements'] as const,

  // catalog
  subjects: (auth: boolean) => ['catalog', 'subjects', auth ? 'auth' : 'anon'] as const,
  subjectsAll: ['catalog', 'subjects'] as const,
  subject: (id: string) => ['catalog', 'subject', id] as const,
  questionStats: (id: string) => ['catalog', 'subject', id, 'question-stats'] as const,
  subjectExams: (id: string) => ['catalog', 'subject', id, 'exams'] as const,
  lesson: (id: string) => ['lessons', id] as const,
  lessonNote: (id: string) => ['lessons', id, 'note'] as const,
  quizRule: (id: string) => ['lessons', id, 'quiz-rule'] as const,

  // progress
  progress: ['progress'] as const,
  dashboard: ['progress', 'dashboard'] as const,
  progressSubjects: ['progress', 'subjects'] as const,
  progressSummary: ['progress', 'summary'] as const,
  scoreTrend: (weeks: number) => ['progress', 'score-trend', weeks] as const,
  weakTopics: (limit: number) => ['progress', 'weak-topics', limit] as const,
  streakCalendar: (weeks: number) => ['progress', 'streak-calendar', weeks] as const,
  activity: (limit: number) => ['progress', 'activity', limit] as const,
  todayPlan: ['progress', 'today-plan'] as const,

  // bank / practice / bookmarks
  bank: ['bank'] as const,
  bankQuestions: (f: BankFilters, pageSize: number) => ['bank', 'questions', f, pageSize] as const,
  bankFacets: (f: BankFilters) => ['bank', 'facets', f] as const,
  bookmarks: ['bookmarks'] as const,
  bookmarkIds: ['bookmarks', 'ids'] as const,

  // mistakes
  mistakes: ['mistakes'] as const,
  mistakeList: (params: Record<string, unknown>) => ['mistakes', 'list', params] as const,
  mistakeSummary: ['mistakes', 'summary'] as const,

  // exams
  exams: ['exams'] as const,
  examsAvailable: ['exams', 'available'] as const,
  examAttempts: ['exams', 'attempts'] as const,
  examAttempt: (id: string) => ['exams', 'attempt', id] as const,
  examResult: (id: string) => ['exams', 'result', id] as const,

  // ai tutor
  ai: ['ai'] as const,
  aiAllowance: ['ai', 'allowance'] as const,
  aiSuggestions: (subject: string) => ['ai', 'suggestions', subject] as const,
  aiConversations: (subject?: string) => ['ai', 'conversations', subject ?? 'all'] as const,
  aiConversation: (id: string) => ['ai', 'conversation', id] as const,

  // notifications
  notifications: ['notifications'] as const,
  notificationList: (filter: NotificationFilter, limit: number) => ['notifications', 'list', filter, limit] as const,
  unreadCount: ['notifications', 'unread-count'] as const,

  // packages / payments
  packages: (auth: boolean) => ['packages', auth ? 'auth' : 'anon'] as const,
  packagesAll: ['packages'] as const,
  mySubscription: ['subscriptions', 'my'] as const,
  payments: ['payments'] as const,
  myPayments: ['payments', 'my'] as const,
  payment: (id: string) => ['payments', id] as const,

  // search
  search: (q: string) => ['search', q] as const,
};
