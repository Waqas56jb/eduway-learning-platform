/**
 * Quiz rule resolution + question pool (shared by CAT-05/CAT-10, QUZ-*, ADM-QZR-06).
 * Layers: settings.learning defaults → global row → subject default → lesson override (override wins).
 */
import { T } from '../../config/constants.js';
import { db, type Executor } from '../../config/db.js';
import { NotFoundError } from '../../common/errors/index.js';
import { settingsStore } from '../../common/services/settings-store.js';
import { estimatedQuizMinutes, isUuid, mergeQuizRules, questionPool, quizRetryState, type QuizRuleValues } from '../learning-core/index.js';

export interface QuizRuleRow {
  id: string;
  scope: 'global' | 'subject' | 'lesson';
  subject_id: string | null;
  lesson_id: string | null;
  question_count: number;
  pool_size: number;
  randomize_questions: boolean;
  randomize_options: boolean;
  alternative_sets: number;
  pass_threshold: number;
  retry_policy: 'unlimited' | 'limited' | 'cooldown';
  max_retries: number;
  cooldown_minutes: number;
  show_explanation: boolean;
  require_completion_to_unlock: boolean;
  updated_at: Date;
}

export const ruleValuesOf = (r: QuizRuleRow): QuizRuleValues => ({
  questionCount: r.question_count,
  poolSize: r.pool_size,
  randomize: r.randomize_questions || r.randomize_options,
  alternativeSets: r.alternative_sets,
  passThreshold: r.pass_threshold,
  retryPolicy: r.retry_policy,
  maxRetries: r.max_retries,
  cooldownMinutes: r.cooldown_minutes,
  showExplanation: r.show_explanation,
  requireCompletionToUnlock: r.require_completion_to_unlock,
});

/** System default (settings + global row) — what a subject uses when it has no stored default. */
export async function systemDefaultRule(ex?: Executor): Promise<QuizRuleValues> {
  const learning = await settingsStore.get('learning');
  const base: QuizRuleValues = {
    questionCount: learning.quizQuestionCount,
    poolSize: Math.max(15, learning.quizQuestionCount * 3),
    randomize: true,
    alternativeSets: 3,
    passThreshold: learning.quizPassMark,
    retryPolicy: 'unlimited',
    maxRetries: 0,
    cooldownMinutes: 60,
    showExplanation: true,
    requireCompletionToUnlock: false,
  };
  const global = await db.maybeOne<QuizRuleRow>(`SELECT * FROM ${T.quiz_rules} WHERE scope = 'global' LIMIT 1`, [], ex);
  return mergeQuizRules(base, global ? { ...ruleValuesOf(global), passThreshold: global.pass_threshold } : null);
}

export interface LessonBasics {
  id: string;
  subject_id: string;
  unit_id: string;
  topic_id: string | null;
  title_en: string;
  title_ar: string;
  status: string;
  deleted_at: Date | null;
  is_free_preview: boolean;
  prerequisite_lesson_id: string | null;
}

export async function lessonBasics(idOrSlug: string, ex?: Executor): Promise<LessonBasics | null> {
  return db.maybeOne<LessonBasics>(
    `SELECT id, subject_id, unit_id, topic_id, title_en, title_ar, status, deleted_at, is_free_preview, prerequisite_lesson_id
       FROM ${T.lessons} WHERE ${isUuid(idOrSlug) ? 'id = $1::uuid' : 'slug = $1'}`,
    [idOrSlug],
    ex,
  );
}

export async function requireLiveLesson(idOrSlug: string): Promise<LessonBasics> {
  const l = await lessonBasics(idOrSlug);
  if (!l || l.deleted_at || l.status !== 'published') throw new NotFoundError('lesson');
  return l;
}

export async function effectiveRule(lesson: Pick<LessonBasics, 'id' | 'subject_id'>, ex?: Executor): Promise<{ values: QuizRuleValues; source: 'subject' | 'lesson'; subjectRule: QuizRuleRow | null; lessonRule: QuizRuleRow | null }> {
  const rows = await db.many<QuizRuleRow>(
    `SELECT * FROM ${T.quiz_rules} WHERE (scope = 'subject' AND subject_id = $1) OR (scope = 'lesson' AND lesson_id = $2)`,
    [lesson.subject_id, lesson.id],
    ex,
  );
  const subjectRule = rows.find((r) => r.scope === 'subject') ?? null;
  const lessonRule = rows.find((r) => r.scope === 'lesson') ?? null;
  const base = await systemDefaultRule(ex);
  const values = mergeQuizRules(base, subjectRule ? ruleValuesOf(subjectRule) : null, lessonRule ? ruleValuesOf(lessonRule) : null);
  return { values, source: lessonRule ? 'lesson' : 'subject', subjectRule, lessonRule };
}

/**
 * Quiz pool for a lesson: published mcq/true_false questions — lesson-linked & topic first, then unit, then subject —
 * capped at `poolSize`. Deterministic order.
 */
export async function lessonPool(lesson: Pick<LessonBasics, 'id' | 'subject_id' | 'unit_id' | 'topic_id'>, poolSize: number, ex?: Executor): Promise<string[]> {
  const all = await questionPool({ subjectIds: [lesson.subject_id], types: ['mcq', 'true_false'] }, 5000, ex);
  const rank = (q: (typeof all)[number]) => (q.lesson_id === lesson.id ? 0 : lesson.topic_id && q.topic_id === lesson.topic_id ? 1 : q.unit_id === lesson.unit_id ? 2 : 3);
  return all
    .map((q) => ({ q, r: rank(q) }))
    .sort((a, b) => a.r - b.r || a.q.code.localeCompare(b.q.code))
    .slice(0, poolSize)
    .map((x) => x.q.id);
}

export interface EffectiveQuizRuleDto extends QuizRuleValues {
  lessonId: string;
  source: 'subject' | 'lesson';
  attemptsUsed: number;
  retriesLeft: number | null;
  retryAt: string | null;
  estimatedMinutes: number;
  bestScore: number | null;
}

export async function attemptStats(userId: string, lessonId: string, ex?: Executor) {
  return db.one<{ used: number; last: Date | null; best: number | null }>(
    `SELECT count(*)::int AS used, max(submitted_at) AS last, max(score) AS best FROM ${T.quiz_attempts}
      WHERE user_id = $1 AND lesson_id = $2 AND status IN ('passed','failed')`,
    [userId, lessonId],
    ex,
  );
}

export async function effectiveQuizRuleDto(lesson: Pick<LessonBasics, 'id' | 'subject_id'>, userId: string | null): Promise<EffectiveQuizRuleDto> {
  const { values, source } = await effectiveRule(lesson);
  const stats = userId ? await attemptStats(userId, lesson.id) : { used: 0, last: null, best: null };
  const retry = quizRetryState(values, stats.used, stats.last);
  return {
    lessonId: lesson.id,
    source,
    ...values,
    attemptsUsed: stats.used,
    retriesLeft: retry.retriesLeft,
    retryAt: retry.retryAt?.toISOString() ?? null,
    estimatedMinutes: estimatedQuizMinutes(values.questionCount),
    bestScore: stats.best === null ? null : Number(stats.best),
  };
}
