/* Domain types for the EDUWAY admin portal. All mock data in src/data conforms to these. */

export type Lang = 'en' | 'ar';
export type ID = string;

/** Bilingual text pair. Most entities carry `name_en`/`name_ar` or `title_en`/`title_ar` directly. */
export interface I18nText {
  en: string;
  ar: string;
}

// ─── RBAC ───────────────────────────────────────────────────────────────────
export const MODULES = [
  'dashboard',
  'users',
  'content',
  'questions',
  'assessments',
  'packages',
  'payments',
  'schools',
  'marketers',
  'aitutor',
  'analytics',
  'notifications',
  'settings',
  'security',
] as const;
export type ModuleKey = (typeof MODULES)[number];

export const ACTIONS = ['view', 'create', 'edit', 'delete', 'approve', 'export'] as const;
export type PermAction = (typeof ACTIONS)[number];

export type PermissionMatrix = Record<ModuleKey, Record<PermAction, boolean>>;

export type RoleKey =
  | 'super_admin'
  | 'finance_admin'
  | 'academic_supervisor'
  | 'content_teacher'
  | 'support'
  | (string & {});

export interface Role {
  id: ID;
  key: RoleKey;
  name_en: string;
  name_ar: string;
  description_en: string;
  description_ar: string;
  system: boolean;
  permissions: PermissionMatrix;
  createdAt: string;
}

export interface AdminUser {
  id: ID;
  name: string;
  name_ar: string;
  email: string;
  mobile: string;
  roleId: ID;
  avatar: string;
  mfaEnabled: boolean;
  status: 'active' | 'invited' | 'deactivated';
  lastLogin: string | null;
  createdAt: string;
}

// ─── Geography / students ────────────────────────────────────────────────────
export interface Governorate {
  id: ID;
  name_en: string;
  name_ar: string;
}

export type SubscriptionStatus = 'active' | 'expired' | 'trial' | 'none' | 'cancelled';
export type AcquisitionSource = 'organic' | 'school' | 'marketer' | 'referral' | 'campaign';

export interface Entitlement {
  subjectId: ID;
  expiresAt: string;
  source: 'package' | 'manual';
}

export interface DeviceSession {
  id: ID;
  device: string;
  platform: 'android' | 'ios' | 'web';
  ip: string;
  location: string;
  lastSeen: string;
  current: boolean;
}

export interface SupportNote {
  id: ID;
  author: string;
  body: string;
  createdAt: string;
}

export interface Student {
  id: ID;
  name_en: string;
  name_ar: string;
  mobile: string;
  email: string | null;
  gender: 'male' | 'female';
  avatar: string | null;
  governorateId: ID;
  schoolId: ID | null;
  packageId: ID | null;
  subscriptionStatus: SubscriptionStatus;
  subscriptionExpiresAt: string | null;
  entitlements: Entitlement[];
  source: AcquisitionSource;
  referralCode: string | null;
  marketerId: ID | null;
  locked: boolean;
  lastActive: string;
  createdAt: string;
  progress: number; // 0-100
  avgScore: number; // 0-100
  aiQuestionsUsed: number;
  sessions: DeviceSession[];
  notes: SupportNote[];
}

// ─── Content ─────────────────────────────────────────────────────────────────
export type ContentStatus = 'draft' | 'in_review' | 'approved' | 'scheduled' | 'published' | 'archived';
export type SubjectKey = 'math' | 'physics' | 'chemistry' | 'biology' | 'english';

export interface Subject {
  id: ID;
  key: SubjectKey;
  name_en: string;
  name_ar: string;
  color: string;
  image: string;
  order: number;
  status: 'active' | 'hidden';
  sequentialUnlock: boolean;
}

export interface Topic {
  id: ID;
  unitId: ID;
  name_en: string;
  name_ar: string;
  order: number;
}

export interface Unit {
  id: ID;
  subjectId: ID;
  name_en: string;
  name_ar: string;
  order: number;
}

export interface LessonResource {
  id: ID;
  name: string;
  sizeKb: number;
}

export interface LessonVersion {
  id: ID;
  version: number;
  author: string;
  note: string;
  status: ContentStatus;
  createdAt: string;
}

export type VideoState = 'none' | 'uploading' | 'processing' | 'ready' | 'failed';

export interface Lesson {
  id: ID;
  subjectId: ID;
  unitId: ID;
  topicId: ID;
  title_en: string;
  title_ar: string;
  description_en: string;
  description_ar: string;
  teacherId: ID;
  order: number;
  durationSec: number;
  thumbnail: string;
  videoState: VideoState;
  captions: string | null;
  resources: LessonResource[];
  completionThreshold: number;
  prerequisiteId: ID | null;
  status: ContentStatus;
  publishAt: string | null;
  updatedAt: string;
  views: number;
  versions: LessonVersion[];
}

export interface Teacher {
  id: ID;
  name_en: string;
  name_ar: string;
  subjectId: ID;
  avatar: string;
}

export interface VideoAsset {
  id: ID;
  assetId: string;
  lessonId: ID;
  sizeMb: number;
  durationSec: number;
  streamStatus: 'ready' | 'processing' | 'failed';
  cdnStatus: 'synced' | 'pending' | 'error';
  views: number;
  replays: number;
  resolution: '720p' | '1080p' | '4K';
  uploadedAt: string;
}

// ─── Questions & assessments ─────────────────────────────────────────────────
export type Difficulty = 'easy' | 'medium' | 'hard';
export type QuestionType = 'mcq' | 'true_false' | 'fill_blank';
export type QuestionStatus = 'draft' | 'in_review' | 'approved' | 'published' | 'archived';

export interface QuestionOption {
  id: ID;
  text_en: string;
  text_ar: string;
  correct: boolean;
}

export interface Question {
  id: ID;
  code: string;
  subjectId: ID;
  unitId: ID;
  topicId: ID;
  type: QuestionType;
  difficulty: Difficulty;
  body_en: string; // may contain $...$ LaTeX
  body_ar: string;
  image: string | null;
  options: QuestionOption[];
  explanation_en: string;
  explanation_ar: string;
  tags: string[];
  source: string;
  year: number | null;
  status: QuestionStatus;
  authorId: ID;
  reviewerId: ID | null;
  usageCount: number;
  accuracy: number; // % students answering correctly
  duplicateOf: ID | null;
  reviewComment: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QuizRule {
  id: ID;
  scope: 'subject' | 'lesson';
  subjectId: ID;
  lessonId: ID | null;
  questionCount: number;
  poolSize: number;
  randomize: boolean;
  alternativeSets: number;
  passThreshold: number;
  retryPolicy: 'unlimited' | 'limited' | 'cooldown';
  maxRetries: number;
  showExplanation: boolean;
  requireCompletionToUnlock: boolean;
}

export interface BlueprintRow {
  id: ID;
  subjectId: ID;
  topicId: ID | null;
  count: number;
  easy: number;
  medium: number;
  hard: number;
}

export interface ExamBlueprint {
  id: ID;
  name_en: string;
  name_ar: string;
  rows: BlueprintRow[];
  durationMin: number;
  randomize: boolean;
  scoring: 'standard' | 'negative' | 'weighted';
  attemptLimit: number;
  reviewBeforeSubmit: boolean;
  availableFrom: string;
  availableTo: string;
  status: 'draft' | 'published' | 'archived';
  attempts: number;
  updatedAt: string;
}

export interface AttemptAnswer {
  questionId: ID;
  selectedOptionId: ID | null;
  correct: boolean;
  timeSec: number;
}

export interface Attempt {
  id: ID;
  studentId: ID;
  kind: 'quiz' | 'exam';
  refId: ID; // lessonId for quiz, blueprintId for exam
  title_en: string;
  title_ar: string;
  score: number;
  timeSec: number;
  status: 'passed' | 'failed' | 'in_progress' | 'abandoned';
  answers: AttemptAnswer[];
  date: string;
}

// ─── Commerce ────────────────────────────────────────────────────────────────
export type Currency = 'IQD' | 'USD';

export interface Package {
  id: ID;
  name_en: string;
  name_ar: string;
  description_en: string;
  description_ar: string;
  subjectIds: ID[];
  price: number;
  currency: Currency;
  taxBehavior: 'inclusive' | 'exclusive' | 'exempt';
  validityType: 'days' | 'months' | 'until_date';
  validityValue: number;
  validUntil: string | null;
  renewal: 'manual' | 'auto' | 'none';
  accessStart: 'immediate' | 'from_date';
  accessStartDate: string | null;
  status: 'active' | 'draft' | 'archived';
  featured: boolean;
  subscribers: number;
}

export type PromoType = 'promo' | 'school' | 'referral' | 'campaign';

export interface Promotion {
  id: ID;
  code: string;
  type: PromoType;
  discountType: 'percent' | 'fixed';
  discountValue: number;
  packageIds: ID[]; // empty = all
  eligibility: 'all' | 'new_users' | 'renewals' | 'school_students';
  usageLimit: number;
  used: number;
  validFrom: string;
  validTo: string;
  enabled: boolean;
  ownerId: ID | null; // schoolId / marketerId
}

export type TxnStatus =
  | 'initiated'
  | 'pending'
  | 'paid'
  | 'failed'
  | 'cancelled'
  | 'refunded'
  | 'partially_refunded';

export type Gateway = 'zaincash' | 'fastpay' | 'qicard' | 'asiahawala' | 'visa';

export interface TxnEvent {
  id: ID;
  status: TxnStatus | 'webhook' | 'refund_requested';
  at: string;
  note: string;
}

export interface WebhookEvent {
  id: ID;
  type: string;
  verified: boolean;
  idempotencyKey: string;
  receivedAt: string;
  payload: Record<string, unknown>;
}

export interface Transaction {
  id: ID;
  ref: string;
  studentId: ID;
  packageId: ID;
  amount: number;
  currency: Currency;
  discount: number;
  gateway: Gateway;
  status: TxnStatus;
  refundedAmount: number;
  promoCode: string | null;
  schoolId: ID | null;
  marketerId: ID | null;
  createdAt: string;
  timeline: TxnEvent[];
  webhooks: WebhookEvent[];
}

export interface Refund {
  id: ID;
  transactionId: ID;
  studentId: ID;
  amount: number;
  currency: Currency;
  kind: 'full' | 'partial';
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedBy: string;
  requestedAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
}

// ─── Partners ────────────────────────────────────────────────────────────────
export interface School {
  id: ID;
  name_en: string;
  name_ar: string;
  code: string;
  city_en: string;
  city_ar: string;
  governorateId: ID;
  contactName: string;
  contactMobile: string;
  marketerId: ID | null;
  contractStart: string;
  contractEnd: string;
  status: 'active' | 'pending' | 'suspended';
  verifiedPaidStudents: number;
  tier: string;
  pendingSettlement: number;
  notes: SupportNote[];
}

export interface Marketer {
  id: ID;
  name_en: string;
  name_ar: string;
  mobile: string;
  email: string;
  avatar: string;
  governorateId: ID;
  schoolIds: ID[];
  paidStudents: number;
  milestonesHit: number;
  pendingReward: number;
  status: 'active' | 'inactive';
  joinedAt: string;
}

export interface IncentiveTier {
  id: ID;
  from: number;
  to: number | null;
  rewardType: 'per_student' | 'fixed';
  amount: number;
  label: string;
}

export interface IncentiveRule {
  id: ID;
  version: number;
  name_en: string;
  name_ar: string;
  partnerType: 'school' | 'marketer';
  qualificationThreshold: number;
  tiers: IncentiveTier[];
  period: 'monthly' | 'quarterly' | 'semester' | 'yearly';
  effectiveFrom: string;
  effectiveTo: string | null;
  status: 'active' | 'superseded' | 'draft';
  createdBy: string;
  createdAt: string;
}

export interface MilestoneRule {
  id: ID;
  version: number;
  threshold: number;
  reward: number;
  label_en: string;
  label_ar: string;
  status: 'active' | 'superseded' | 'draft';
  effectiveFrom: string;
}

export interface Settlement {
  id: ID;
  partnerType: 'school' | 'marketer';
  partnerId: ID;
  period: string; // e.g. 2026-09
  qualifiedStudents: number;
  amount: number;
  currency: Currency;
  status: 'pending' | 'approved' | 'paid';
  approvedBy: string | null;
  paidAt: string | null;
}

// ─── AI tutor ────────────────────────────────────────────────────────────────
export interface AiDailyUsage {
  date: string;
  questions: number;
  activeUsers: number;
  tokens: number;
  costUsd: number;
  bySubject: Record<SubjectKey, number>;
}

export interface AiFlaggedConversation {
  id: ID;
  studentId: ID;
  subjectId: ID;
  excerpt: string;
  reason: 'off_topic' | 'abuse' | 'cheating' | 'prompt_injection' | 'self_harm';
  severity: 'low' | 'medium' | 'high';
  status: 'open' | 'reviewed' | 'dismissed';
  createdAt: string;
}

export interface AiSettings {
  enabled: boolean;
  monthlyAllowance: number;
  resetCycle: 'calendar' | 'billing';
  provider: 'openai' | 'anthropic' | 'azure';
  model: string;
  temperature: number;
  maxTokens: number;
  retrieval: { transcripts: boolean; explanations: boolean; lessonNotes: boolean };
  safetyRules: string;
  disabledUserIds: ID[];
  rateLimitPerMinute: number;
  rateLimitPerHour: number;
  blockedKeywords: string[];
}

// ─── Notifications ───────────────────────────────────────────────────────────
export type NotifChannel = 'push' | 'in_app' | 'sms' | 'whatsapp' | 'email';
export type NotifType =
  | 'otp'
  | 'payment_confirmation'
  | 'subscription_expiry'
  | 'new_lesson'
  | 'unfinished_lesson'
  | 'exam_reminder'
  | 'progress_reminder'
  | 'support_message';

export interface NotificationTemplate {
  id: ID;
  name: string;
  type: NotifType;
  channel: NotifChannel;
  subject_en: string;
  subject_ar: string;
  body_en: string;
  body_ar: string;
  variables: string[];
  active: boolean;
  updatedAt: string;
}

export interface Campaign {
  id: ID;
  name: string;
  channel: NotifChannel;
  templateId: ID | null;
  audienceCount: number;
  filters: Record<string, string | number | null>;
  status: 'sent' | 'scheduled' | 'draft' | 'sending';
  scheduledAt: string | null;
  sentAt: string | null;
  createdBy: string;
}

export interface DeliveryLogEntry {
  id: ID;
  campaignId: ID | null;
  templateId: ID;
  studentId: ID;
  channel: NotifChannel;
  provider: string;
  status: 'sent' | 'delivered' | 'failed' | 'queued';
  error: string | null;
  attempts: number;
  createdAt: string;
}

// ─── Settings & security ─────────────────────────────────────────────────────
export interface FeatureFlag {
  id: ID;
  key: string;
  name_en: string;
  name_ar: string;
  description_en: string;
  description_ar: string;
  enabled: boolean;
  environment: 'production' | 'staging' | 'beta';
  updatedAt: string;
}

export interface LegalVersion {
  id: ID;
  doc: 'terms' | 'privacy';
  version: string;
  body_en: string;
  body_ar: string;
  status: 'published' | 'draft' | 'retired';
  publishedAt: string | null;
  acceptances: number;
}

export interface AuditLog {
  id: ID;
  at: string;
  actor: string;
  actorRole: string;
  action: string; // e.g. "lesson.publish"
  entity: string; // e.g. "lesson"
  entityId: string;
  summary: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  ip: string;
  device: string;
}

export interface AdminSession {
  id: ID;
  adminId: ID;
  device: string;
  browser: string;
  ip: string;
  location: string;
  startedAt: string;
  lastActive: string;
  current: boolean;
}

export interface SecurityAlert {
  id: ID;
  kind: 'multiple_devices' | 'otp_bruteforce' | 'unusual_location' | 'payment_fraud' | 'admin_login_failure';
  severity: 'low' | 'medium' | 'high' | 'critical';
  subject: string; // student / admin name or mobile
  subjectId: ID | null;
  detail: string;
  status: 'open' | 'resolved' | 'blocked';
  createdAt: string;
}

export interface ExportRecord {
  id: ID;
  report: string;
  format: 'csv' | 'xlsx';
  range: string;
  rows: number;
  by: string;
  at: string;
}

export interface AppNotification {
  id: ID;
  title_en: string;
  title_ar: string;
  body_en: string;
  body_ar: string;
  at: string;
  read: boolean;
  href: string;
  kind: 'info' | 'warning' | 'success' | 'danger';
}
