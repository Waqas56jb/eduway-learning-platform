/**
 * Admin quiz rules (ADM-QZR-*): subject defaults (always materialized for every subject — CONTRACT_GAPS F1#6)
 * and per-lesson overrides.
 */
import { T } from '../../config/constants.js';
import { db } from '../../config/db.js';
import { NotFoundError } from '../../common/errors/index.js';
import type { Localized } from '../../common/i18n/index.js';
import { conflictError, ruleError, sqlSearch, type QuizRuleValues } from '../learning-core/index.js';
import { effectiveRule, lessonBasics, systemDefaultRule, type QuizRuleRow } from './engine.js';

export interface QuizRuleDto extends QuizRuleValues {
  id: string;
  scope: 'subject' | 'lesson';
  subjectId: string;
  subject: { id: string; slug: string; name: Localized; color: string };
  lessonId: string | null;
  lesson: { id: string; title: Localized; order: number; subjectId: string; subjectSlug: string } | null;
  updatedAt: string;
}

type Row = QuizRuleRow & { s_id: string; s_slug: string; s_name_en: string; s_name_ar: string; s_color: string; l_title_en: string | null; l_title_ar: string | null; l_sort: number | null; l_subject: string | null };

const SELECT = `r.*, s.id AS s_id, s.slug AS s_slug, s.name_en AS s_name_en, s.name_ar AS s_name_ar, s.color AS s_color,
  l.title_en AS l_title_en, l.title_ar AS l_title_ar, l.sort_order AS l_sort, l.subject_id AS l_subject`;
const FROM = `${T.quiz_rules} r
  LEFT JOIN ${T.lessons} l ON l.id = r.lesson_id
  JOIN ${T.subjects} s ON s.id = COALESCE(r.subject_id, l.subject_id)`;

const toDto = (r: Row): QuizRuleDto => ({
  id: r.id,
  scope: r.scope === 'lesson' ? 'lesson' : 'subject',
  subjectId: r.s_id,
  subject: { id: r.s_id, slug: r.s_slug, name: { en: r.s_name_en, ar: r.s_name_ar }, color: r.s_color },
  lessonId: r.lesson_id,
  lesson: r.lesson_id ? { id: r.lesson_id, title: { en: r.l_title_en ?? '', ar: r.l_title_ar ?? '' }, order: r.l_sort ?? 0, subjectId: r.s_id, subjectSlug: r.s_slug } : null,
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
  updatedAt: r.updated_at.toISOString(),
});

const COLS = ['question_count', 'pool_size', 'randomize_questions', 'randomize_options', 'alternative_sets', 'pass_threshold', 'retry_policy', 'max_retries', 'cooldown_minutes', 'show_explanation', 'require_completion_to_unlock'] as const;
const valuesOf = (v: QuizRuleValues) => [v.questionCount, Math.max(v.poolSize, v.questionCount), v.randomize, v.randomize, v.alternativeSets, v.passThreshold, v.retryPolicy, v.maxRetries, v.cooldownMinutes, v.showExplanation, v.requireCompletionToUnlock];

/** Create stored subject defaults (system default values) for subjects that have none. */
async function materializeSubjectDefaults() {
  const missing = await db.many<{ id: string }>(
    `SELECT s.id FROM ${T.subjects} s WHERE s.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM ${T.quiz_rules} r WHERE r.scope = 'subject' AND r.subject_id = s.id)`,
  );
  if (!missing.length) return;
  const def = await systemDefaultRule();
  for (const m of missing) {
    await db.query(
      `INSERT INTO ${T.quiz_rules} (scope, subject_id, ${COLS.join(', ')}) VALUES ('subject', $1, ${COLS.map((_, i) => `$${i + 2}`).join(', ')}) ON CONFLICT DO NOTHING`,
      [m.id, ...valuesOf(def)],
    );
  }
}

async function get(id: string): Promise<QuizRuleDto> {
  const r = await db.maybeOne<Row>(`SELECT ${SELECT} FROM ${FROM} WHERE r.id = $1 AND r.scope <> 'global'`, [id]);
  if (!r) throw new NotFoundError('quizRule');
  return toDto(r);
}

function validate(v: QuizRuleValues) {
  if (v.poolSize < v.questionCount) throw ruleError('QUESTION_INVALID', { field: 'poolSize', why: 'poolSize must be ≥ questionCount' });
}

export interface RuleFilter {
  scope?: 'subject' | 'lesson';
  subjectId?: string;
  q?: string;
  ids?: string[];
}

export const quizRulesService = {
  async list(f: RuleFilter, page: number, pageSize: number) {
    await materializeSubjectDefaults();
    const params: unknown[] = [];
    const conds = [`r.scope IN ('subject','lesson')`, 's.deleted_at IS NULL', '(r.lesson_id IS NULL OR l.deleted_at IS NULL)'];
    if (f.scope) {
      params.push(f.scope);
      conds.push(`r.scope = $${params.length}`);
    }
    if (f.subjectId) {
      params.push(f.subjectId);
      conds.push(`s.id = $${params.length}`);
    }
    if (f.ids) {
      params.push(f.ids);
      conds.push(`r.id = ANY($${params.length}::uuid[])`);
    }
    const s = sqlSearch(f.q, ['l.title_en', 'l.title_ar', 's.name_en', 's.name_ar'], params);
    if (s) conds.push(s);
    const w = conds.join(' AND ');
    const total = (await db.scalar<number>(`SELECT count(*)::int FROM ${FROM} WHERE ${w}`, params)) ?? 0;
    params.push(pageSize, (page - 1) * pageSize);
    const rows = await db.many<Row>(`SELECT ${SELECT} FROM ${FROM} WHERE ${w} ORDER BY (r.scope = 'lesson'), s.sort_order, l.sort_order NULLS FIRST, r.id LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
    return { items: rows.map(toDto), total };
  },

  async upsertSubject(subjectId: string, v: QuizRuleValues) {
    validate(v);
    const ok = await db.scalar<number>(`SELECT count(*)::int FROM ${T.subjects} WHERE id = $1 AND deleted_at IS NULL`, [subjectId]);
    if (!ok) throw new NotFoundError('subject');
    const before = await db.maybeOne<{ id: string }>(`SELECT id FROM ${T.quiz_rules} WHERE scope = 'subject' AND subject_id = $1`, [subjectId]);
    let id = before?.id;
    if (id) await db.query(`UPDATE ${T.quiz_rules} SET ${COLS.map((c, i) => `${c} = $${i + 2}`).join(', ')} WHERE id = $1`, [id, ...valuesOf(v)]);
    else id = (await db.one<{ id: string }>(`INSERT INTO ${T.quiz_rules} (scope, subject_id, ${COLS.join(', ')}) VALUES ('subject', $1, ${COLS.map((_, i) => `$${i + 2}`).join(', ')}) RETURNING id`, [subjectId, ...valuesOf(v)])).id;
    return get(id);
  },

  async createOverride(lessonId: string, v: QuizRuleValues) {
    validate(v);
    const lesson = await lessonBasics(lessonId);
    if (!lesson || lesson.deleted_at) throw new NotFoundError('lesson');
    const exists = await db.scalar<number>(`SELECT count(*)::int FROM ${T.quiz_rules} WHERE scope = 'lesson' AND lesson_id = $1`, [lesson.id]);
    if (exists) throw conflictError('RULE_EXISTS', { lessonId: lesson.id });
    const r = await db.one<{ id: string }>(
      `INSERT INTO ${T.quiz_rules} (scope, subject_id, lesson_id, ${COLS.join(', ')}) VALUES ('lesson', $1, $2, ${COLS.map((_, i) => `$${i + 3}`).join(', ')}) RETURNING id`,
      [lesson.subject_id, lesson.id, ...valuesOf(v)],
    );
    return get(r.id);
  },

  async update(id: string, patch: Partial<QuizRuleValues>) {
    const cur = await get(id);
    const next = { ...cur, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) } as QuizRuleValues;
    validate(next);
    await db.query(`UPDATE ${T.quiz_rules} SET ${COLS.map((c, i) => `${c} = $${i + 2}`).join(', ')} WHERE id = $1`, [id, ...valuesOf(next)]);
    return get(id);
  },

  async remove(id: string) {
    const cur = await get(id);
    if (cur.scope === 'subject') throw ruleError('SUBJECT_DEFAULT_RULE');
    await db.query(`DELETE FROM ${T.quiz_rules} WHERE id = $1`, [id]);
    return cur;
  },

  async effective(lessonId: string) {
    const lesson = await lessonBasics(lessonId);
    if (!lesson || lesson.deleted_at) throw new NotFoundError('lesson');
    await materializeSubjectDefaults();
    const eff = await effectiveRule(lesson);
    const base = eff.lessonRule ?? eff.subjectRule;
    const dto = base ? await get(base.id) : null;
    const subj = await db.one<{ id: string; slug: string; name_en: string; name_ar: string; color: string }>(`SELECT id, slug, name_en, name_ar, color FROM ${T.subjects} WHERE id = $1`, [lesson.subject_id]);
    return {
      ...(dto ?? { id: '', scope: 'subject' as const, subjectId: subj.id, subject: { id: subj.id, slug: subj.slug, name: { en: subj.name_en, ar: subj.name_ar }, color: subj.color }, lessonId: null, lesson: null, updatedAt: new Date().toISOString() }),
      ...eff.values,
      source: eff.source,
    };
  },

  get,
};
