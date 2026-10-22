/** Shapes of the converted frontend mock data in ./data (admin-mock.json = website/admin src/data). */
export interface L {
  en: string;
  ar: string;
}

export interface AdminMock {
  mockNow: string;
  governorates: { id: string; name_en: string; name_ar: string }[];
  subjects: { id: string; key: string; name_en: string; name_ar: string; color: string; image: string; order: number; status: 'active' | 'hidden'; sequentialUnlock: boolean }[];
  teachers: { id: string; name_en: string; name_ar: string; subjectId: string; avatar: string }[];
  packages: { id: string; name_en: string; name_ar: string; description_en: string; description_ar: string; subjectIds: string[]; price: number; validityType: 'days' | 'months' | 'until_date'; validityValue: number; validUntil: string | null; renewal: 'manual' | 'auto' | 'none'; accessStart: 'immediate' | 'from_date'; accessStartDate: string | null; status: 'active' | 'draft' | 'archived'; featured: boolean }[];
  schools: { id: string; name_en: string; name_ar: string; code: string; city_en: string; city_ar: string; governorateId: string; contactName: string; contactMobile: string; marketerId: string | null; contractStart: string; contractEnd: string; status: 'active' | 'pending' | 'suspended' }[];
  marketers: { id: string; name_en: string; name_ar: string; mobile: string; email: string; avatar: string; governorateId: string; schoolIds: string[]; status: 'active' | 'inactive'; joinedAt: string }[];
  students: {
    id: string;
    name_en: string;
    name_ar: string;
    mobile: string;
    email: string | null;
    gender: 'male' | 'female';
    avatar: string | null;
    governorateId: string;
    schoolId: string | null;
    packageId: string | null;
    subscriptionStatus: 'active' | 'expired' | 'trial' | 'none' | 'cancelled';
    subscriptionExpiresAt: string | null;
    source: 'organic' | 'school' | 'marketer' | 'referral' | 'campaign';
    referralCode: string | null;
    marketerId: string | null;
    locked: boolean;
    lastActive: string;
    createdAt: string;
    progress: number;
    avgScore: number;
    aiQuestionsUsed: number;
    sessions: { id: string; device: string; platform: 'android' | 'ios' | 'web'; ip: string; location: string; lastSeen: string; current: boolean }[];
    notes: { id: string; author: string; body: string; createdAt: string }[];
  }[];
  transactions: {
    id: string;
    ref: string;
    studentId: string;
    packageId: string;
    amount: number;
    currency: 'IQD' | 'USD';
    discount: number;
    gateway: string;
    status: string;
    refundedAmount: number;
    promoCode: string | null;
    schoolId: string | null;
    marketerId: string | null;
    createdAt: string;
    timeline: { id: string; status: string; at: string; note: string }[];
    webhooks: { id: string; type: string; verified: boolean; idempotencyKey: string; receivedAt: string; payload: Record<string, unknown> }[];
  }[];
  refunds: { id: string; transactionId: string; studentId: string; amount: number; kind: 'full' | 'partial'; reason: string; status: 'pending' | 'approved' | 'rejected'; requestedBy: string; requestedAt: string; decidedBy: string | null; decidedAt: string | null }[];
  adminUsers: { id: string; name: string; name_ar: string; email: string; mobile: string; roleId: string; avatar: string; mfaEnabled: boolean; status: 'active' | 'invited' | 'deactivated'; lastLogin: string | null; createdAt: string }[];
  auditLogs: { id: string; at: string; actor: string; actorRole: string; action: string; entity: string; entityId: string; summary: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null; ip: string; device: string }[];
  incentiveRules: { id: string; version: number; name_en: string; name_ar: string; partnerType: 'school' | 'marketer'; qualificationThreshold: number; tiers: { id: string; from: number; to: number | null; rewardType: 'per_student' | 'fixed'; amount: number; label: string }[]; period: string; effectiveFrom: string; effectiveTo: string | null; status: 'active' | 'superseded' | 'draft'; createdBy: string; createdAt: string }[];
  milestoneRules: { id: string; version: number; threshold: number; reward: number; label_en: string; label_ar: string; status: 'active' | 'superseded' | 'draft'; effectiveFrom: string }[];
  settlements: { id: string; partnerType: 'school' | 'marketer'; partnerId: string; period: string; qualifiedStudents: number; amount: number; currency: string; status: 'pending' | 'approved' | 'paid'; approvedBy: string | null; paidAt: string | null }[];
  promotions: { id: string; code: string; type: string; discountType: 'percent' | 'fixed'; discountValue: number; packageIds: string[]; eligibility: string; usageLimit: number; used: number; validFrom: string; validTo: string; enabled: boolean; ownerId: string | null }[];
  generalSettings: { platformName: string; platformName_ar: string; defaultLanguage: 'ar' | 'en'; currency: string; timezone: string; dateFormat: string; academicYear: string };
  otpSettings: { expirySeconds: number; codeLength: 4 | 6; resendLimit: number; resendCooldownSeconds: number; maxAttempts: number; lockoutMinutes: number; provider: string; fallbackProvider: string };
  appSettings: { minVersionIos: string; minVersionAndroid: string; latestVersion: string; forceUpdate: boolean; maintenanceMode: boolean; maintenanceMessage_en: string; maintenanceMessage_ar: string; deviceLimit: number; sessionTimeoutMinutes: number };
  supportContacts: { phone: string; whatsapp: string; email: string; hours_en: string; hours_ar: string; address_en: string; address_ar: string; facebook: string; instagram: string; telegram: string; youtube: string };
  featureFlags: { id: string; key: string; name_en: string; name_ar: string; description_en: string; description_ar: string; enabled: boolean; environment: string; updatedAt: string }[];
  legalVersions: { id: string; doc: 'terms' | 'privacy'; version: string; body_en: string; body_ar: string; status: 'published' | 'draft' | 'retired'; publishedAt: string | null; acceptances: number }[];
  adminSessions: { id: string; adminId: string; device: string; browser: string; ip: string; location: string; startedAt: string; lastActive: string; current: boolean }[];
  securityAlerts: { id: string; kind: string; severity: string; subject: string; subjectId: string | null; detail: string; status: string; createdAt: string }[];
  templates: { id: string; name: string; type: string; channel: string; subject_en: string; subject_ar: string; body_en: string; body_ar: string; variables: string[]; active: boolean; updatedAt: string }[];
  campaigns: { id: string; name: string; channel: string; templateId: string | null; audienceCount: number; filters: Record<string, unknown>; status: string; scheduledAt: string | null; sentAt: string | null; createdBy: string }[];
  aiSettings: { enabled: boolean; monthlyAllowance: number; resetCycle: 'calendar' | 'billing'; provider: string; model: string; temperature: number; maxTokens: number; retrieval: { transcripts: boolean; explanations: boolean; lessonNotes: boolean }; safetyRules: string; disabledUserIds: string[]; rateLimitPerMinute: number; rateLimitPerHour: number; blockedKeywords: string[] };
  flaggedConversations: { id: string; studentId: string; subjectId: string; excerpt: string; reason: string; severity: string; status: string; createdAt: string }[];
  supportTickets: { id: string; studentId: string; subject_en: string; subject_ar: string; category: string; priority: string; status: string; assignee: string; createdAt: string }[];
  quizRules: { id: string; scope: 'subject' | 'lesson'; subjectId: string; lessonId: string | null; questionCount: number; poolSize: number; randomize: boolean; alternativeSets: number; passThreshold: number; retryPolicy: string; maxRetries: number; showExplanation: boolean; requireCompletionToUnlock: boolean }[];
  blueprints: { id: string; name_en: string; name_ar: string; rows: { id: string; subjectId: string; topicId: string | null; count: number; easy: number; medium: number; hard: number }[]; durationMin: number; randomize: boolean; scoring: string; attemptLimit: number; reviewBeforeSubmit: boolean; availableFrom: string; availableTo: string; status: string }[];
}

export interface UserSubject {
  id: string;
  name: L;
  tagline: L;
  description: L;
  color: string;
  icon: string;
  hours: number;
  questionsCount: number;
  image: string;
  teacher: L;
  lessonsCount: number;
  units: { id: string; title: L; chapters: { id: string; title: L }[] }[];
}

export interface UserLesson {
  id: string;
  subjectId: string;
  unitId: string;
  chapterId: string;
  order: number;
  title: L;
  description: L;
  duration: number;
  thumbnail: string;
  teacher: L;
  status: 'completed' | 'in-progress' | 'not-started';
  progress: number;
  videoUrl: string;
  resources: { title: L; size: string; pages: number }[];
}

export interface UserQuestion {
  id: string;
  subjectId: string;
  unitId: string;
  lessonId?: string;
  topic: L;
  difficulty: 'easy' | 'medium' | 'hard';
  tags: string[];
  text: L;
  formula?: string;
  options: L[];
  correctIndex: number;
  explanation: L;
}

export interface UserExam {
  id: string;
  subjectId: string;
  title: L;
  description: L;
  questionCount: number;
  durationMin: number;
  attemptsLeft: number;
  attemptsTotal: number;
  passMark: number;
  questionIds: string[];
  bestScore?: number;
}

export interface UserPackage {
  id: string;
  name: L;
  tagline: L;
  priceMonthly: number;
  priceYearly: number;
  currency: L;
  subjects: string[];
  aiQuota: number;
  popular?: boolean;
  features: L[];
}
