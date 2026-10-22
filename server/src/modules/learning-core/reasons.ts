/**
 * Domain `details.reason` values used by the learning modules (API_CONTRACT §0.3) with en/ar messages.
 *
 * The foundation catalogue (common/i18n/messages.ts) is owned by Agent A; these entries are registered into it at
 * import time (only keys that are not already defined), so the central error handler localizes them like any other
 * reason. Throw through the helpers below so call sites stay typed.
 */
import { BusinessRuleError, ConflictError, ForbiddenError } from '../../common/errors/index.js';
import { ENTITY_LABELS, REASON_MESSAGES, type ErrorReason, type Localized } from '../../common/i18n/index.js';

export const LEARNING_REASONS = {
  PREREQUISITE_NOT_MET: { en: 'Finish the prerequisite lesson first.', ar: 'أكمل الدرس المطلوب أولاً.' },
  SEQUENTIAL_LOCK: { en: 'Complete the previous lesson to unlock this one.', ar: 'أكمل الدرس السابق لفتح هذا الدرس.' },
  QUIZ_RETRY_EXHAUSTED: { en: 'You have used all attempts for this quiz.', ar: 'لقد استنفدت جميع محاولات هذا الاختبار.' },
  QUIZ_COOLDOWN: { en: 'You can retake this quiz later.', ar: 'يمكنك إعادة هذا الاختبار لاحقاً.' },
  QUIZ_NO_QUESTIONS: { en: 'This lesson has no quiz questions yet.', ar: 'لا توجد أسئلة اختبار لهذا الدرس بعد.' },
  NO_QUESTIONS: { en: 'No questions match your selection.', ar: 'لا توجد أسئلة تطابق اختيارك.' },
  EXAM_NOT_AVAILABLE: { en: 'This exam is not available right now.', ar: 'هذا الامتحان غير متاح حالياً.' },
  EXAM_ATTEMPTS_EXHAUSTED: { en: 'You have used all attempts for this exam.', ar: 'لقد استنفدت جميع محاولات هذا الامتحان.' },
  EXAM_ALREADY_SUBMITTED: { en: 'This exam attempt was already submitted.', ar: 'تم تسليم محاولة الامتحان هذه مسبقاً.' },
  EXAM_TIME_OVER: { en: 'Time is over — your exam was submitted automatically.', ar: 'انتهى الوقت — تم تسليم امتحانك تلقائياً.' },
  EXAM_IN_PROGRESS: { en: 'This exam attempt is still in progress.', ar: 'محاولة الامتحان هذه ما زالت جارية.' },
  ALREADY_ANSWERED: { en: 'This question was already answered.', ar: 'تمت الإجابة على هذا السؤال مسبقاً.' },
  ATTEMPT_IN_PROGRESS: { en: 'Finish this attempt to see the answers.', ar: 'أكمل هذه المحاولة لرؤية الإجابات.' },
  QUESTION_IN_ACTIVE_ATTEMPT: { en: 'This question is part of an exam or quiz you are taking right now.', ar: 'هذا السؤال ضمن امتحان أو اختبار تقوم به الآن.' },
  ATTEMPT_CLOSED: { en: 'This attempt is already finished.', ar: 'هذه المحاولة منتهية بالفعل.' },
  QUESTION_NOT_IN_ATTEMPT: { en: 'This question is not part of this attempt.', ar: 'هذا السؤال ليس ضمن هذه المحاولة.' },
  ANSWER_REQUIRED: { en: 'Choose an answer first.', ar: 'اختر إجابة أولاً.' },
  QUESTION_INVALID: { en: 'The question options are not valid.', ar: 'خيارات السؤال غير صالحة.' },
  VIDEO_NOT_READY: { en: 'The lesson video is not ready yet.', ar: 'فيديو الدرس غير جاهز بعد.' },
  VIDEO_NOT_AVAILABLE: { en: 'This lesson has no video yet.', ar: 'لا يوجد فيديو لهذا الدرس بعد.' },
  POOL_SHORT: { en: 'Not enough approved questions for this blueprint.', ar: 'لا توجد أسئلة معتمدة كافية لهذا المخطط.' },
  ROWS_INVALID: { en: 'Each row difficulty mix must add up to 100%.', ar: 'يجب أن يكون مجموع نسب الصعوبة في كل صف 100٪.' },
  WINDOW_INVALID: { en: 'The availability window is not valid.', ar: 'فترة الإتاحة غير صالحة.' },
  SUBJECT_DEFAULT_RULE: { en: 'Subject default rules cannot be deleted.', ar: 'لا يمكن حذف القواعد الافتراضية للمادة.' },
  RULE_EXISTS: { en: 'This lesson already has a quiz rule override.', ar: 'لهذا الدرس قاعدة اختبار خاصة بالفعل.' },
  IMPORT_NOT_READY: { en: 'The import is not ready to be committed.', ar: 'الاستيراد غير جاهز للحفظ.' },
  IMPORT_EXPIRED: { en: 'This import preview has expired. Upload the file again.', ar: 'انتهت صلاحية معاينة الاستيراد. ارفع الملف مجدداً.' },
  IMPORT_FILE_INVALID: { en: 'The import file is empty or missing required columns.', ar: 'ملف الاستيراد فارغ أو تنقصه أعمدة مطلوبة.' },
  PLACEMENT_INVALID: { en: 'The unit/topic does not belong to the chosen subject.', ar: 'الوحدة أو الموضوع لا ينتمي إلى المادة المختارة.' },
  REORDER_INVALID: { en: 'The order list must contain exactly the current items.', ar: 'يجب أن تحتوي قائمة الترتيب على العناصر الحالية بالضبط.' },
} as const satisfies Record<string, Localized>;

export type LearningReason = keyof typeof LEARNING_REASONS;

const ENTITIES: Record<string, Localized> = {
  blueprint: { en: 'exam', ar: 'الامتحان' },
  import: { en: 'import', ar: 'الاستيراد' },
  quizRule: { en: 'quiz rule', ar: 'قاعدة الاختبار' },
  tag: { en: 'tag', ar: 'الوسم' },
  practice: { en: 'practice session', ar: 'جلسة التدريب' },
  planItem: { en: 'plan item', ar: 'عنصر الخطة' },
};

/** Idempotent registration into the shared i18n catalogue (never overrides foundation entries). */
export function registerLearningMessages(): void {
  const reasons = REASON_MESSAGES as unknown as Record<string, Localized>;
  for (const [k, v] of Object.entries(LEARNING_REASONS)) if (!Object.prototype.hasOwnProperty.call(reasons, k)) reasons[k] = v;
  for (const [k, v] of Object.entries(ENTITIES)) if (!ENTITY_LABELS[k]) ENTITY_LABELS[k] = v;
}
registerLearningMessages();

const asReason = (r: LearningReason) => r as unknown as ErrorReason;

/** 422 BUSINESS_RULE with a learning reason. */
export const ruleError = (reason: LearningReason, details?: Record<string, unknown>) => new BusinessRuleError(asReason(reason), details);
/** 409 CONFLICT with a learning reason. */
export const conflictError = (reason: LearningReason, details?: Record<string, unknown>) => new ConflictError(asReason(reason), details);
/** 403 FORBIDDEN with a learning reason. */
export const forbiddenError = (reason: LearningReason, details?: Record<string, unknown>) => new ForbiddenError(asReason(reason), details);
