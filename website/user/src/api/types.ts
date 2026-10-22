/**
 * DTO types for the EDUWAY API (docs/API_CONTRACT.md v1.0.0 — the binding contract).
 * Only the student/public surface used by website/user is modelled here.
 */

/* ------------------------------------------------------------------ §1.1 Primitives */

export type ID = string;
export type ISODate = string;
export type DateOnly = string;
export type Lang = 'en' | 'ar';
export type Localized = { en: string; ar: string };
export type Platform = 'web' | 'ios' | 'android';
export type IQD = number;
export type Currency = 'IQD' | 'USD';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type SubjectSlug = string;
export type OkDto = { ok: true };

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  nextCursor: string | null;
}

/** Envelopes (§0.1). */
export interface ApiSuccess<T, M = PageMeta> {
  success: true;
  data: T;
  meta?: M;
}
export interface ApiErrorBody {
  success: false;
  error: { code: ApiErrorCode; message: string; details?: Record<string, unknown> };
}
export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'TOKEN_EXPIRED'
  | 'SUBSCRIPTION_REQUIRED'
  | 'FORBIDDEN'
  | 'NOT_ENTITLED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'BUSINESS_RULE'
  | 'RATE_LIMITED'
  | 'INTERNAL'
  // client-side only
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'UNKNOWN';

/** A list payload together with its meta. */
export interface Paged<T, M = PageMeta> {
  items: T[];
  meta: M;
}

/* ------------------------------------------------------------------ §1.3 References */

export interface SubjectRef {
  id: ID;
  slug: SubjectSlug;
  name: Localized;
  color: string;
}
export interface UnitRef {
  id: ID;
  name: Localized;
  order: number;
}
export interface TopicRef {
  id: ID;
  name: Localized;
  order: number;
  unitId: ID;
}
export interface PackageRef {
  id: ID;
  name: Localized;
}
export interface AdminRef {
  id: ID;
  name: Localized;
  avatarUrl: string | null;
  roleName?: Localized;
}
export interface Governorate {
  id: string;
  name: Localized;
}
export interface TeacherRef {
  id: ID;
  name: Localized;
  avatarUrl: string | null;
}

/* ------------------------------------------------------------------ §1.4 Entitlement / lock */

export type LockedReason = 'NO_SUBSCRIPTION' | 'SUBJECT_NOT_IN_PACKAGE' | 'EXPIRED' | 'AI_NOT_INCLUDED';
export interface LockedPayload {
  reason: LockedReason;
  subjectId?: ID;
  subjectSlug?: SubjectSlug;
  packageIds?: ID[];
}
export interface Entitlement {
  id: ID;
  subjectId: ID;
  subjectSlug: SubjectSlug;
  source: 'package' | 'manual';
  startsAt: ISODate;
  expiresAt: ISODate;
  packageId: ID | null;
  grantedBy: AdminRef | null;
  reason: string | null;
}

/* ------------------------------------------------------------------ §1.5 Student identity */

export interface SessionDto {
  id: ID;
  device: string;
  platform: Platform | 'admin';
  browser: string | null;
  ip: string;
  location: Localized;
  countryCode: string | null;
  createdAt: ISODate;
  lastActive: ISODate;
  current: boolean;
}

export interface AiAllowance {
  enabled: boolean;
  disabledReason: 'GLOBAL' | 'USER' | 'NOT_INCLUDED' | null;
  used: number;
  quota: number;
  remaining: number;
  cycle: 'calendar' | 'billing';
  resetsAt: ISODate;
}

export type LegalDoc = 'terms' | 'privacy';
export type SubscriptionStatus = 'active' | 'trial' | 'expired' | 'cancelled' | 'none';

export interface StudentUser {
  id: ID;
  name: Localized;
  firstName: Localized;
  mobile: string;
  email: string | null;
  /** The email was confirmed via the emailed link (ME-12 / AUTH-30). */
  emailVerified?: boolean;
  gender: 'male' | 'female' | null;
  governorate: string;
  governorateName: Localized;
  schoolId: ID | null;
  school: Localized | null;
  avatar: string | null;
  language: Lang;
  packageId: ID | null;
  subscriptionStatus: SubscriptionStatus;
  subscriptionStart: ISODate | null;
  subscriptionEnd: ISODate | null;
  daysRemaining: number;
  aiUsed: number;
  aiQuota: number;
  streak: number;
  lastLessonId: ID | null;
  dailyGoalMinutes: number;
  memberSince: ISODate;
  profileComplete: boolean;
  pendingLegal: { doc: LegalDoc; version: string }[];
}

export interface NotificationPrefs {
  lessons: boolean;
  exams: boolean;
  payments: boolean;
  progress: boolean;
  weekly: boolean;
  push: boolean;
  sms: boolean;
  whatsapp: boolean;
  email: boolean;
}

export interface MeStudentDto {
  user: StudentUser;
  entitlements: Entitlement[];
  subscription: MySubscription | null;
  aiAllowance: AiAllowance;
  unreadNotifications: number;
  notificationPrefs: NotificationPrefs;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresAt: ISODate;
}

/* ------------------------------------------------------------------ §1.6 Catalog */

export type LessonStatus = 'completed' | 'in-progress' | 'not-started';

export interface Chapter {
  id: ID;
  title: Localized;
}
export interface StudentUnit {
  id: ID;
  title: Localized;
  order: number;
  chapters: Chapter[];
}

export interface SubjectSummary {
  id: ID;
  slug: SubjectSlug;
  name: Localized;
  tagline: Localized;
  description: Localized;
  color: string;
  image: string;
  icon: string;
  lessonsCount: number;
  hours: number;
  questionsCount: number;
  examsCount: number;
  teacher: Localized;
  teacherRef: TeacherRef | null;
  order: number;
  sequentialUnlock: boolean;
  locked: boolean | null;
  progress: { completed: number; total: number; pct: number; avgPct: number } | null;
}

export interface SubjectDetail extends SubjectSummary {
  units: StudentUnit[];
  lessons: LessonSummary[];
  nextLessonId: ID | null;
}

export interface StudentResource {
  id: ID;
  title: Localized;
  size: string;
  sizeBytes: number;
  pages: number | null;
  mimeType: string;
}

export type LessonLockReason = LockedReason | 'PREREQUISITE' | 'SEQUENTIAL';

export interface LessonSummary {
  id: ID;
  subjectId: ID;
  subjectSlug: SubjectSlug;
  unitId: ID;
  chapterId: ID;
  topicId: ID;
  order: number;
  title: Localized;
  description: Localized;
  duration: number;
  thumbnail: string;
  teacher: Localized;
  teacherRef: TeacherRef | null;
  locked: boolean;
  lockReason: LessonLockReason | null;
  status: LessonStatus;
  progress: number;
  positionSec: number;
}

export interface LessonDetail extends LessonSummary {
  videoUrl: null;
  hasVideo: boolean;
  resources: StudentResource[];
  completionThreshold: number;
  prerequisiteId: ID | null;
  unitTitle: Localized;
  unitIndex: number;
  prevLessonId: ID | null;
  nextLessonId: ID | null;
  unitProgress: { done: number; total: number };
  bestQuizScore: number | null;
  quiz: { available: boolean; questionCount: number; estimatedMinutes: number; passThreshold: number };
  note: string;
}

export interface StreamUrlDto {
  url: string;
  type: 'hls' | 'mp4';
  expiresAt: ISODate;
  renditions: { quality: '1080p' | '720p' | '480p' | '360p'; url: string }[];
  captions: { lang: Lang; label: Localized; url: string }[];
  poster: string;
  durationSec: number;
  resumePositionSec: number;
  heartbeatSeconds: number;
}

export interface TeacherDto {
  id: ID;
  name: Localized;
  bio: Localized;
  avatarUrl: string | null;
  subjectId: ID;
  subjectSlug: SubjectSlug;
  yearsExperience: number | null;
  studentsCount: number | null;
  rating: number | null;
  active: boolean;
}

export interface QuestionStatsDto {
  total: number;
  byDifficulty: Record<Difficulty, number>;
  byUnit: { unitId: ID; title: Localized; order: number; total: number; easy: number; medium: number; hard: number }[];
  samples: QuestionPublic[];
}

/* ------------------------------------------------------------------ §1.7 Questions */

export type QuestionType = 'mcq' | 'true_false' | 'fill_blank';
export interface QuestionOptionPublic {
  id: ID;
  text: Localized;
}

export interface QuestionPublic {
  id: ID;
  code: string;
  subjectId: ID;
  subjectSlug: SubjectSlug;
  unitId: ID;
  topicId: ID;
  lessonId: ID | null;
  topic: Localized;
  difficulty: Difficulty;
  type: QuestionType;
  tags: string[];
  text: Localized;
  formula: string | null;
  imageUrl: string | null;
  options: QuestionOptionPublic[];
  bookmarked: boolean;
  locked: boolean;
}

export interface QuestionReview extends QuestionPublic {
  correctOptionId: ID | null;
  correctIndex: number;
  acceptedAnswers: Localized[];
  explanation: Localized;
}

export interface AnswerFeedback {
  questionId: ID;
  correct: boolean;
  correctOptionId: ID | null;
  correctIndex: number;
  explanation: Localized | null;
  mistake: MistakeEntry | null;
}

export interface Breakdown {
  key: string;
  label: Localized;
  correct: number;
  total: number;
  accuracy: number;
}
export interface TopicStat {
  key: ID;
  topic: Localized;
  correct: number;
  total: number;
  pct: number;
  accuracy: number;
  missed: number;
  missedLessonIds: ID[];
}
export interface RevisionItem {
  lessonId: ID;
  title: Localized;
  topic: Localized;
  missed: number;
  topicPct: number;
}
export interface AnswerRecord {
  questionId: ID;
  question: QuestionReview;
  chosenOptionId: ID | null;
  chosenIndex: number;
  textAnswer: string | null;
  correct: boolean;
  flagged: boolean;
  timeSec: number | null;
}

/* ------------------------------------------------------------------ §1.8 Misc student */

export interface ActivityItem {
  id: ID;
  kind: 'lesson' | 'quiz' | 'exam' | 'ai';
  title: Localized;
  meta: Localized;
  date: ISODate;
  link: string | null;
}

export type NotificationType = 'lesson' | 'exam' | 'payment' | 'subscription' | 'system';
export type NotificationTargetKind =
  | 'lesson'
  | 'subject'
  | 'exams'
  | 'exam_result'
  | 'mistakes'
  | 'subscription'
  | 'notifications'
  | 'progress'
  | 'tutor'
  | 'none';

export interface AppNotification {
  id: ID;
  type: NotificationType;
  title: Localized;
  body: Localized;
  date: ISODate;
  read: boolean;
  link: string | null;
  target: { kind: NotificationTargetKind; id: ID | null };
}

export interface LegalDocumentDto {
  doc: LegalDoc;
  version: string;
  publishedAt: ISODate;
  updatedAt: ISODate;
  title: Localized;
  subtitle: Localized;
  intro: Localized;
  sections: { id: string; title: Localized; body: Localized }[];
  contactEmail: string;
}

/* ------------------------------------------------------------------ §1.10 Uploads / §16 */

export type UploadPurpose = 'student_avatar' | 'ai_attachment';
export interface SignedUploadDto {
  uploadUrl: string;
  method: 'PUT';
  headers: Record<string, string>;
  fileKey: string;
  expiresAt: ISODate;
  tusEndpoint: string | null;
}

/* ------------------------------------------------------------------ §3 Public / CMS */

export interface SupportContactsDto {
  phone: string;
  whatsapp: string;
  email: string;
  hours: Localized;
  address: Localized;
  facebook: string;
  instagram: string;
  telegram: string;
  youtube: string;
  tiktok: string;
}

export type GradeBandKey = 'excellent' | 'veryGood' | 'good' | 'pass' | 'needsWork';

export interface AppConfigDto {
  platformName: Localized;
  logoUrl: string | null;
  defaultLanguage: Lang;
  currency: Currency;
  timezone: string;
  dateFormat: string;
  academicYear: string;
  maintenance: { enabled: boolean; message: Localized };
  update: {
    minVersion: { ios: string; android: string };
    latestVersion: string;
    forceUpdate: boolean;
    required: boolean;
    recommended: boolean;
    storeUrls: { ios: string | null; android: string | null };
  };
  deviceLimit: number;
  sessionTimeoutMinutes: number;
  otp: { codeLength: 4 | 6; resendCooldownSeconds: number; expirySeconds: number };
  featureFlags: Record<string, boolean>;
  support: SupportContactsDto;
  social: { facebook: string; instagram: string; telegram: string; youtube: string; tiktok: string | null };
  appLinks: { appStore: string | null; googlePlay: string | null };
  learning: {
    quizQuestionCount: number;
    quizPassMark: number;
    examDefaultPassMark: number;
    practiceSessionSizes: number[];
    practiceMaxSize: number;
    dailyGoalMinutes: number;
    watchHeartbeatSeconds: number;
    examAutosaveSeconds: number;
    gradeBands: { key: GradeBandKey; min: number }[];
  };
  promoCodesEnabled: boolean;
  avatarPresets: string[];
  tagLabels: Record<string, Localized>;
  serverTime: ISODate;
}

export interface PublicSchool {
  id: ID;
  name: Localized;
  governorate: string;
  code: null;
}

export interface ReferralCheckDto {
  valid: boolean;
  kind: 'school' | 'marketer' | 'referral' | 'campaign' | null;
  label: Localized | null;
}

export interface PublicStatsDto {
  students: number;
  lessons: number;
  questions: number;
  subjects: number;
  governorates: number;
  satisfactionPct: number;
  passRatePct: number;
  rating: number;
  ratingCount: number;
  displayOverrides: Partial<Record<'students' | 'lessons' | 'questions', string>>;
}

export interface Testimonial {
  id: ID;
  name: Localized;
  city: Localized;
  role: Localized;
  quote: Localized;
  avatar: string | null;
  rating: number;
  order: number;
}

export interface FaqItem {
  id: ID;
  q: Localized;
  a: Localized;
  order: number;
}

export type ContactSubject = 'general' | 'support' | 'billing' | 'partnerships' | 'schools';
export interface ContactBody {
  name: string;
  contact: string;
  subject: ContactSubject;
  message: string;
  locale?: Lang;
}

/* ------------------------------------------------------------------ §4 Auth */

export type OtpPurpose = 'login' | 'register';

export interface SendOtpDto {
  phone: string;
  maskedPhone: string;
  purpose: OtpPurpose;
  isRegistered: boolean;
  codeLength: 4 | 6;
  expiresInSeconds: number;
  resendInSeconds: number;
  resendsLeft: number;
  channel: 'sms' | 'whatsapp';
}

export interface RegisterDto {
  name: string;
  governorateId: string;
  schoolId?: ID | null;
  schoolName?: string | null;
  referralCode?: string | null;
  acceptTerms: true;
  acceptedLegal: { doc: LegalDoc; version: string }[];
  language?: Lang;
  email?: string | null;
  gender?: 'male' | 'female' | null;
}

export interface VerifyOtpBody {
  phone: string;
  code: string;
  purpose: OtpPurpose;
  deviceId: string;
  platform: Platform;
  deviceName?: string;
  registration?: RegisterDto;
  revokeSessionId?: ID;
}

export interface VerifyOtpDto {
  tokens: AuthTokens;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: StudentUser;
  isNewUser: boolean;
  me: MeStudentDto;
}

/* ------------------------------------------------------------------ §5 Me */

export interface UpdateMeBody {
  name?: string;
  governorateId?: string;
  schoolId?: ID | null;
  schoolName?: string | null;
  avatarFileKey?: string | null;
  avatarPreset?: string;
  language?: Lang;
  dailyGoalMinutes?: number;
  email?: string | null;
  gender?: 'male' | 'female' | null;
}

/* ------------------------------------------------------------------ §7 Progress */

export interface LessonProgressDto {
  lessonId: ID;
  status: LessonStatus;
  progress: number;
  positionSec: number;
  completedAt: ISODate | null;
  justCompleted: boolean;
}

export type WatchEvent = 'heartbeat' | 'pause' | 'leave' | 'ended' | 'seek';
export interface WatchBody {
  lessonId: ID;
  positionSec: number;
  durationSec: number;
  event: WatchEvent;
  watchedSecDelta?: number;
  platform?: Platform;
}

export interface SubjectProgressDto {
  subjectId: ID;
  slug: SubjectSlug;
  name: Localized;
  color: string;
  completed: number;
  total: number;
  pct: number;
  avgPct: number;
  quizAverage: number | null;
  mastery: number | null;
  studyMinutes: number;
  locked: boolean;
}

export interface WeeklyStudyDto {
  weekStart: DateOnly;
  days: { date: DateOnly; day: Localized; minutes: number; questions: number }[];
  totalMinutes: number;
  dailyAverageMinutes: number;
  lastWeekTotalMinutes: number;
  changePct: number | null;
}

export interface UpcomingExamDto {
  id: ID;
  examId: ID;
  title: Localized;
  date: ISODate;
  kind: 'opens' | 'closes';
  subjectSlug: SubjectSlug;
}

export interface StudentDashboardDto {
  greetingName: Localized;
  subscription: { packageName: Localized | null; daysRemaining: number; totalDays: number; status: SubscriptionStatus };
  streak: { current: number; longest: number; last7: { date: DateOnly; active: boolean }[] };
  continueLesson: (LessonSummary & { subject: SubjectRef }) | null;
  lessons: { completed: number; total: number; pct: number };
  quizAverage: number | null;
  latestWeekQuizAverage: number | null;
  unresolvedMistakes: number;
  aiAllowance: AiAllowance;
  subjects: SubjectProgressDto[];
  weeklyStudy: WeeklyStudyDto;
  todayMinutes: number;
  dailyGoalMinutes: number;
  upcomingExams: UpcomingExamDto[];
  recentActivity: ActivityItem[];
}

export interface ProgressSummaryDto {
  overallPct: number;
  overallAvgPct: number;
  completedLessons: number;
  totalLessons: number;
  studyHours: number;
  streak: number;
  longestStreak: number;
  activeDays: number;
  activeDaysLast30: number;
  busiestWeekday: number | null;
  quizAverage: number | null;
  lessonsDoneThisWeek: number;
}

export interface ScoreTrendDto {
  weeks: { week: number; weekStart: DateOnly; label: Localized; scores: Record<SubjectSlug, number | null> }[];
  subjects: SubjectRef[];
}

export interface WeakTopicDto {
  subjectId: ID;
  subjectSlug: SubjectSlug;
  topicId: ID;
  topic: Localized;
  accuracy: number;
  attempts: number;
  lessonId: ID | null;
  lessonTitle: Localized | null;
}

export interface StreakCalendarDto {
  days: { date: DateOnly; minutes: number; level: 0 | 1 | 2 | 3 | 4 }[];
  current: number;
  longest: number;
  activeDays: number;
  activeDaysLast30: number;
  busiestWeekday: number | null;
}

export interface PlanItem {
  id: ID;
  kind: 'lesson' | 'quiz' | 'mistakes' | 'exam';
  subjectId: ID | null;
  subjectSlug: SubjectSlug | null;
  title: Localized;
  meta: Localized;
  minutes: number;
  target: { pathname: string; params: Record<string, string> };
  done: boolean;
}

/* ------------------------------------------------------------------ §8 Quizzes */

export interface EffectiveQuizRule {
  lessonId: ID;
  source: 'subject' | 'lesson';
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
  attemptsUsed: number;
  retriesLeft: number | null;
  retryAt: ISODate | null;
  estimatedMinutes: number;
  bestScore: number | null;
}

export interface QuizStartDto {
  attemptId: ID;
  lessonId: ID;
  setNo: number;
  attemptNo: number;
  rule: EffectiveQuizRule;
  questions: QuestionPublic[];
  startedAt: ISODate;
}

export interface QuizResultDto {
  attemptId: ID;
  lessonId: ID;
  attemptNo: number;
  score: number;
  correct: number;
  total: number;
  passed: boolean;
  passThreshold: number;
  timeSpentSec: number;
  mistakesAdded: number;
  bestScore: number;
  nextLessonId: ID | null;
  unlockedNextLesson: boolean;
  answers: AnswerRecord[];
}

export interface AnswerBody {
  questionId: ID;
  optionId?: ID;
  textAnswer?: string;
  timeSec?: number;
}

/* ------------------------------------------------------------------ §9 Bank / practice */

export interface BankFilters {
  subjectId?: string;
  unitId?: ID;
  topicId?: ID;
  topic?: string;
  difficulty?: Difficulty[];
  type?: QuestionType;
  tags?: string[];
  bookmarked?: boolean;
  q?: string;
}

export interface BankFacetsDto {
  total: number;
  matchCount: number;
  subjects: { subjectId: ID; slug: SubjectSlug; name: Localized; count: number; locked: boolean; mastery: number | null }[];
  units: { unitId: ID; title: Localized; order: number; count: number }[];
  topics: { topicId: ID; key: string; label: Localized; count: number }[];
  difficulties: Record<Difficulty, number>;
  tags: { slug: string; label: Localized | null; count: number }[];
  bookmarkedCount: number;
}

export interface BankMeta extends PageMeta {
  bookmarkedCount: number;
}

export interface PracticeStartBody {
  mode: 'filters' | 'bookmarks' | 'mistakes';
  filters?: {
    subjectId?: string;
    unitId?: ID;
    topicId?: ID;
    topic?: string;
    difficulty?: Difficulty[] | Difficulty | 'all';
    tags?: string[];
    q?: string;
  };
  count: number;
  includeQuestionId?: ID;
  questionIds?: ID[];
  seed?: string;
}

export interface PracticeStartDto {
  sessionId: ID;
  title: Localized;
  subtitle: Localized;
  startedAt: ISODate;
  questions: QuestionPublic[];
}

export interface PracticeResultDto {
  sessionId: ID;
  attemptNo: number;
  subjectId: ID | null;
  subjectSlug: SubjectSlug | null;
  score: number;
  correct: number;
  incorrect: number;
  skipped: number;
  total: number;
  passed: boolean;
  band: 'excellent' | 'good' | 'fair' | 'low';
  timeSpentSec: number;
  mistakesAdded: number;
  breakdownByTopic: Breakdown[];
  breakdownByDifficulty: Breakdown[];
  answers: AnswerRecord[];
  date: ISODate;
}

/* ------------------------------------------------------------------ §10 Mistakes */

export type MistakeStatus = 'unresolved' | 'reviewed' | 'mastered';
export type MistakeSource = 'quiz' | 'bank' | 'exam';

export interface MistakeEntry {
  id: ID;
  questionId: ID;
  chosenIndex: number;
  chosenOptionId: ID | null;
  status: MistakeStatus;
  repeatCount: number;
  date: ISODate;
  firstMissedAt: ISODate;
  source: MistakeSource;
  sourceRefId: ID | null;
  question: QuestionReview;
  subject: SubjectRef;
  unit: UnitRef;
  topic: TopicRef;
  lessonId: ID | null;
  history: {
    date: ISODate;
    chosenIndex: number;
    chosenOptionId: ID | null;
    correct: boolean;
    source: 'retry' | 'quiz' | 'bank' | 'exam';
  }[];
}

export interface MistakeCounts {
  unresolved: number;
  reviewed: number;
  mastered: number;
  repeated: number;
  total: number;
}

export interface MistakesMeta extends PageMeta {
  counts: MistakeCounts;
  bySubject: { subjectId: ID; slug: SubjectSlug; count: number }[];
  groups?: { key: string; label: Localized; count: number; ids: ID[] }[];
}

export interface MistakeSummaryDto extends MistakeCounts {
  masteryPct: number;
}

export type MistakeRetryDto = AnswerFeedback & { mistake: MistakeEntry; nextUnresolvedId: ID | null };

/* ------------------------------------------------------------------ §11 Exams */

export interface ExamCard {
  id: ID;
  subjectId: ID;
  subjectSlug: SubjectSlug;
  subjectIds: ID[];
  title: Localized;
  description: Localized;
  questionCount: number;
  durationMin: number;
  passMark: number;
  attemptsTotal: number;
  attemptsUsed: number;
  attemptsLeft: number;
  bestScore: number | null;
  lastScore: number | null;
  scoring: 'standard' | 'negative' | 'weighted';
  reviewBeforeSubmit: boolean;
  availableFrom: ISODate;
  availableTo: ISODate;
  available: boolean;
  activeAttempt: { attemptId: ID; endsAt: ISODate; answeredCount: number } | null;
  locked: boolean;
}

export type ExamAttemptStatus = 'in_progress' | 'submitted' | 'auto_submitted';

export interface ExamAttemptState {
  attemptId: ID;
  exam: ExamCard;
  attemptNo: number;
  status: ExamAttemptStatus;
  questions: QuestionPublic[];
  order: ID[];
  answers: Record<ID, ID | null>;
  flagged: ID[];
  currentIndex: number;
  startedAt: ISODate;
  endsAt: ISODate;
  serverNow: ISODate;
  autosaveSeconds: number;
  graceSeconds: number;
  lastSavedAt: ISODate | null;
}

export interface ExamAutosaveBody {
  answers: Record<ID, ID | null>;
  flagged: ID[];
  currentIndex: number;
  clientSavedAt: ISODate;
  seq: number;
}

export interface ExamAutosaveDto {
  savedAt: ISODate;
  serverNow: ISODate;
  endsAt: ISODate;
  seq: number;
}

export interface ExamSubmitBody {
  reason: 'manual' | 'timeout';
  answers?: Record<ID, ID | null>;
  flagged?: ID[];
  seq?: number;
}

export interface ExamSubmitDto {
  attemptId: ID;
  status: 'submitted' | 'auto_submitted';
  resultUrl: string;
}

export interface ExamResultDto {
  attemptId: ID;
  attemptNo: number;
  exam: { id: ID; title: Localized; passMark: number; durationMin: number; subjectId: ID; subjectSlug: SubjectSlug; scoring: string };
  student: { name: Localized };
  score: { total: number; correct: number; incorrect: number; unanswered: number; pct: number; rawScore: number; maxScore: number };
  passed: boolean;
  grade: GradeBandKey;
  accuracy: number;
  timeSpentSec: number;
  autoSubmitted: boolean;
  finishedAt: ISODate;
  attemptsLeft: number;
  topicBreakdown: TopicStat[];
  recommendations: RevisionItem[];
  answers: AnswerRecord[];
  mistakesAdded: number;
}

export interface ExamAttemptSummary {
  id: ID;
  examId: ID;
  title: Localized;
  subjectSlug: SubjectSlug;
  attemptNo: number;
  score: number;
  passed: boolean;
  status: ExamAttemptStatus;
  date: ISODate;
}

/* ------------------------------------------------------------------ §12 AI tutor */

export interface TutorMessage {
  id: ID;
  conversationId: ID;
  role: 'student' | 'tutor';
  kind: 'message' | 'welcome';
  text: string;
  content: Localized;
  imageUrl: string | null;
  status: 'pending' | 'streaming' | 'complete' | 'failed' | 'blocked';
  rating: 'up' | 'down' | null;
  date: ISODate;
  at: ISODate;
}

export interface ConversationSummary {
  id: ID;
  subjectId: ID;
  subjectSlug: SubjectSlug;
  title: string;
  lastMessagePreview: string;
  messageCount: number;
  updatedAt: ISODate;
  createdAt: ISODate;
}

export interface ConversationDto extends ConversationSummary {
  messages: TutorMessage[];
}

export interface SendTutorMessageBody {
  text: string;
  attachmentFileKey?: string;
  lang: Lang;
  clientMessageId?: string;
}

export interface TutorPollingStartDto {
  studentMessage: TutorMessage;
  tutorMessage: TutorMessage;
  allowance: AiAllowance;
  pollAfterMs: number;
}

/* ------------------------------------------------------------------ §13 Notifications */

export interface NotificationsMeta extends PageMeta {
  unreadCount: number;
  counts: Record<'all' | 'unread' | NotificationType, number>;
}

export type NotificationFilter = 'all' | 'unread' | NotificationType;

/* ------------------------------------------------------------------ §14 Packages & payments */

export type Gateway = 'zaincash' | 'fastpay' | 'qicard' | 'asiahawala' | 'visa' | 'mock';
export type BillingCycle = 'monthly' | 'yearly';

export interface PackageComparison {
  subjectsCount: number;
  lessons: boolean;
  quizzes: boolean;
  questionBank: 'subject' | 'full' | 'unlimited';
  mistakes: boolean;
  examSimulator: boolean | 'unlimited';
  aiQuota: number;
  pdfResources: boolean;
  analytics: boolean;
  devices: number;
  prioritySupport: boolean;
}

export interface PackagePublic {
  id: ID;
  name: Localized;
  tagline: Localized;
  description: Localized;
  priceMonthly: IQD;
  priceYearly: IQD | null;
  yearlySavingPct: number | null;
  baseValidity: { type: 'days' | 'months' | 'until_date'; value: number; validUntil: ISODate | null; days: number };
  currency: Currency;
  currencyLabel: Localized;
  subjects: SubjectSlug[];
  subjectIds: ID[];
  aiQuota: number;
  popular: boolean;
  features: Localized[];
  comparison: PackageComparison;
  renewal: 'manual' | 'auto' | 'none';
  accessStart: 'immediate' | 'from_date';
  accessStartDate: ISODate | null;
  order: number;
  isCurrent: boolean | null;
}

export interface MySubscription {
  id: ID;
  status: 'active' | 'trial' | 'expired' | 'cancelled';
  package: PackagePublic;
  cycle: BillingCycle;
  startedAt: ISODate;
  endsAt: ISODate;
  daysRemaining: number;
  totalDays: number;
  remainingPct: number;
  subjects: SubjectRef[];
  aiAllowance: AiAllowance;
  renewal: 'manual' | 'auto' | 'none';
  source: 'payment' | 'manual' | 'trial';
  lastPaymentId: ID | null;
}

export interface PaymentMethodDto {
  id: Gateway;
  kind: 'wallet' | 'card';
  name: Localized;
  hint: Localized;
  color: string;
  logoUrl: string | null;
  enabled: boolean;
  requiresPhone: boolean;
  flow: 'redirect' | 'deeplink' | 'mock';
  /** live | sandbox (gateway test environment, no real money) | mock (dev) | disabled. */
  mode?: 'live' | 'sandbox' | 'mock' | 'disabled';
  sandbox?: boolean;
}

export interface PriceQuote {
  packageId: ID;
  cycle: BillingCycle;
  currency: Currency;
  subtotal: IQD;
  discount: IQD;
  prorationCredit: IQD;
  total: IQD;
  promo: { code: string; discountType: 'percent' | 'fixed'; discountValue: number } | null;
  intent: 'new' | 'renew' | 'upgrade' | 'downgrade';
  startsAt: ISODate;
  endsAt: ISODate;
}

export interface PromoValidationDto {
  valid: boolean;
  reason: string | null;
  message?: string;
  code: string;
  type: 'percent' | 'amount';
  value: number;
  discountAmount: IQD;
  total: IQD;
  quote: PriceQuote | null;
}

export type TxnStatus = 'initiated' | 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunded' | 'partially_refunded';

export interface StudentPaymentDto {
  id: ID;
  ref: string;
  receiptNumber: string | null;
  status: TxnStatus;
  gateway: Gateway;
  package: PackageRef;
  cycle: BillingCycle;
  amount: IQD;
  discount: IQD;
  refundedAmount: IQD;
  currency: Currency;
  promoCode: string | null;
  createdAt: ISODate;
  paidAt: ISODate | null;
}

export type PaymentDetailDto = StudentPaymentDto & { subscription: MySubscription | null };

export interface InitiatePaymentBody {
  packageId: ID;
  cycle: BillingCycle;
  gateway: Gateway;
  promoCode?: string;
  walletPhone?: string;
  returnUrl?: string;
}

export interface InitiatePaymentDto {
  paymentId: ID;
  ref: string;
  status: 'pending';
  quote: PriceQuote;
  amount: IQD;
  currency: Currency;
  redirectUrl: string | null;
  deeplink: string | null;
  mock: { confirmUrl: string } | null;
  expiresAt: ISODate;
}

export interface ReceiptDto {
  receiptNumber: string;
  ref: string;
  issuedAt: ISODate;
  paidAt: ISODate;
  company: { name: Localized; address: Localized; email: string };
  billedTo: { name: Localized; mobile: string };
  gateway: Gateway;
  gatewayName: Localized;
  lines: { description: Localized; amount: IQD }[];
  subtotal: IQD;
  discount: IQD;
  promoCode: string | null;
  total: IQD;
  refunded: IQD;
  currency: Currency;
  taxNote: Localized;
}

/* ------------------------------------------------------------------ §17 Search */

export interface SearchResultDto {
  lessons?: { id: ID; title: Localized; subjectSlug: SubjectSlug; subjectName: Localized; thumbnail: string }[];
  subjects?: SubjectRef[];
  questions?: { id: ID; code: string; text: Localized; subjectSlug: SubjectSlug }[];
}
