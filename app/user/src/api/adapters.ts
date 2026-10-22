/**
 * DTO → app model adapters. The app keeps keying subjects by slug (`Subject.id` = slug) because colours,
 * icons and i18n keys are slug based, and every student endpoint accepts the slug in place of the uuid.
 */
import type {
  AppNotification,
  ExamBlueprint,
  Lesson,
  Localized,
  Package,
  Question,
  Session,
  Subject,
  SubjectId,
  User,
} from '@/types';
import type {
  AppNotificationDto,
  ExamCardDto,
  LessonDetail,
  LessonSummary,
  PackagePublic,
  QuestionPublic,
  QuestionReview,
  SessionDto,
  StudentUser,
  SubjectDetail,
  SubjectSummary,
} from './types';

export const EMPTY_L: Localized = { en: '', ar: '' };
export const asSubjectId = (slug: string | null | undefined) => (slug ?? '') as SubjectId;

export function toSubject(s: SubjectSummary | SubjectDetail): Subject {
  const units = 'units' in s ? s.units.map((u) => ({ id: u.id, title: u.title, chapters: u.chapters })) : [];
  return {
    id: asSubjectId(s.slug),
    uuid: s.id,
    name: s.name,
    tagline: s.tagline,
    description: s.description,
    color: s.color,
    image: s.image,
    icon: s.icon,
    lessonsCount: s.lessonsCount,
    hours: s.hours,
    questionsCount: s.questionsCount,
    examsCount: s.examsCount,
    teacher: s.teacher,
    units,
    locked: s.locked,
    progressPct: s.progress?.avgPct ?? 0,
    completedLessons: s.progress?.completed ?? 0,
  };
}

export function toLesson(l: LessonSummary | LessonDetail): Lesson {
  return {
    id: l.id,
    subjectId: asSubjectId(l.subjectSlug),
    unitId: l.unitId,
    chapterId: l.chapterId,
    topicId: l.topicId,
    order: l.order,
    title: l.title,
    description: l.description,
    duration: l.duration,
    thumbnail: l.thumbnail,
    teacher: l.teacher,
    teacherId: l.teacherRef?.id ?? null,
    teacherAvatar: l.teacherRef?.avatarUrl ?? null,
    status: l.status,
    progress: l.progress,
    positionSec: l.positionSec,
    locked: l.locked,
    lockReason: l.lockReason,
    videoUrl: '',
    resources:
      'resources' in l
        ? l.resources.map((r) => ({ id: r.id, title: r.title, size: r.size, pages: r.pages ?? 0, mimeType: r.mimeType }))
        : [],
  };
}

export function toQuestion(q: QuestionPublic | QuestionReview): Question {
  const review = 'correctIndex' in q ? (q as QuestionReview) : null;
  return {
    id: q.id,
    code: q.code,
    subjectId: asSubjectId(q.subjectSlug),
    unitId: q.unitId,
    topicId: q.topicId,
    lessonId: q.lessonId ?? undefined,
    topic: q.topic,
    difficulty: q.difficulty,
    tags: q.tags,
    text: q.text,
    formula: q.formula ?? undefined,
    imageUrl: q.imageUrl,
    options: q.options.map((o) => o.text),
    optionIds: q.options.map((o) => o.id),
    correctIndex: review ? review.correctIndex : -1,
    explanation: review?.explanation ?? EMPTY_L,
    bookmarked: q.bookmarked,
    locked: q.locked,
    type: q.type,
  };
}

export function toExam(e: ExamCardDto): ExamBlueprint & {
  uuid: string;
  available: boolean;
  availableFrom: string;
  availableTo: string;
  attemptsUsed: number;
  lastScore: number | null;
  locked: boolean;
  activeAttempt: ExamCardDto['activeAttempt'];
  reviewBeforeSubmit: boolean;
} {
  return {
    id: e.id,
    uuid: e.id,
    subjectId: asSubjectId(e.subjectSlug),
    title: e.title,
    description: e.description,
    questionCount: e.questionCount,
    durationMin: e.durationMin,
    attemptsLeft: e.attemptsLeft,
    attemptsTotal: e.attemptsTotal,
    attemptsUsed: e.attemptsUsed,
    passMark: e.passMark,
    questionIds: [],
    bestScore: e.bestScore ?? undefined,
    lastScore: e.lastScore,
    available: e.available,
    availableFrom: e.availableFrom,
    availableTo: e.availableTo,
    locked: e.locked,
    activeAttempt: e.activeAttempt,
    reviewBeforeSubmit: e.reviewBeforeSubmit,
  };
}

export function toPackage(p: PackagePublic): Package & { priceYearlyRaw: number | null; raw: PackagePublic } {
  return {
    id: p.id,
    name: p.name,
    tagline: p.tagline,
    priceMonthly: p.priceMonthly,
    priceYearly: p.priceYearly ?? 0,
    priceYearlyRaw: p.priceYearly,
    currency: p.currencyLabel,
    subjects: p.subjects.map(asSubjectId),
    aiQuota: p.aiQuota,
    popular: p.popular,
    features: p.features,
    raw: p,
  };
}

export const toNotification = (n: AppNotificationDto): AppNotification => ({
  id: n.id,
  type: n.type,
  title: n.title,
  body: n.body,
  date: n.date,
  read: n.read,
  link: n.link,
});

export const toSession = (s: SessionDto): Session => ({
  id: s.id,
  device: s.device,
  location: s.location,
  lastActive: s.lastActive,
  current: s.current,
  platform: s.platform,
  ip: s.ip,
});

export function toUser(u: StudentUser): User {
  return {
    id: u.id,
    name: u.name,
    firstName: u.firstName,
    mobile: u.mobile,
    governorate: u.governorate,
    governorateName: u.governorateName,
    schoolId: u.schoolId,
    school: u.school ?? EMPTY_L,
    avatar: u.avatar ?? '',
    packageId: u.packageId ?? '',
    subscriptionStart: u.subscriptionStart ?? '',
    subscriptionEnd: u.subscriptionEnd ?? '',
    subscriptionStatus: u.subscriptionStatus,
    daysRemaining: u.daysRemaining,
    aiUsed: u.aiUsed,
    aiQuota: u.aiQuota,
    streak: u.streak,
    lastLessonId: u.lastLessonId ?? '',
    language: u.language,
    sessions: [],
    email: u.email,
    dailyGoalMinutes: u.dailyGoalMinutes,
    memberSince: u.memberSince,
    profileComplete: u.profileComplete,
  };
}

/** Index of an option id within the served options (‑1 if absent). */
export const optionIndex = (q: { optionIds?: string[] }, optionId: string | null | undefined) =>
  optionId ? (q.optionIds?.indexOf(optionId) ?? -1) : -1;

/** Option id at a served index. */
export const optionIdAt = (q: { optionIds?: string[] }, index: number) =>
  index >= 0 ? q.optionIds?.[index] : undefined;
