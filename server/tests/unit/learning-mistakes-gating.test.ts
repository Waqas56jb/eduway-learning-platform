/**
 * Mistakes mastery transitions, answer grading/concealment, lesson locks & entitlement gating, watch progress,
 * streaks and Arabic-normalized search helpers (Agent B). No database.
 */
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { evaluateSubjectAccess, lockedError, type EntitlementRecord } from '../../src/common/entitlements.js';
import { closeDb } from '../../src/config/db.js';
import { generateOpenApiDocument } from '../../src/docs/openapi.js';
import { grade, toConcealedReview, toPublic, toReview, type LoadedQuestion } from '../../src/modules/learning-core/questions.js';
import { afterRetry, afterWrongAnswer, displayStreak, heatLevel, isRepeated, lessonLock, nextStreak, nextWatchProgress } from '../../src/modules/learning-core/rules.js';
import { answersMatch, normalizeText, similarity } from '../../src/modules/learning-core/text.js';

const q = (type: 'mcq' | 'fill_blank' = 'mcq'): LoadedQuestion => ({
  row: {
    id: 'q1', code: 'MATH-CN-0001', subject_id: 's1', subject_slug: 'math', subject_name_en: 'Math', subject_name_ar: 'رياضيات', subject_color: '#000', subject_sort: 1,
    unit_id: 'u1', unit_title_en: 'U', unit_title_ar: 'و', unit_sort: 1, topic_id: 't1', topic_title_en: 'Complex', topic_title_ar: 'مركبة', topic_sort: 1,
    topic_label_en: 'Complex', topic_label_ar: 'مركبة', lesson_ref_id: 'l1', type, difficulty: 'easy', body_en: 'What is $i^2$?', body_ar: 'ما قيمة $i^2$؟',
    formula: null, image_url: null, explanation_en: 'By definition.', explanation_ar: 'حسب التعريف.', status: 'published',
  },
  options: [
    { id: 'o1', question_id: 'q1', sort_order: 1, text_en: '1', text_ar: '1', is_correct: false },
    { id: 'o2', question_id: 'q1', sort_order: 2, text_en: '-1', text_ar: '-1', is_correct: true },
    { id: 'o3', question_id: 'q1', sort_order: 3, text_en: 'i', text_ar: 'i', is_correct: false },
  ],
  tags: ['basics'],
  imageUrl: null,
});

describe('mistake mastery (API_CONTRACT §34.1 #8)', () => {
  it('a first miss is unresolved with repeat 1; each further miss increments', () => {
    const first = afterWrongAnswer(null);
    expect(first).toEqual({ status: 'unresolved', repeatCount: 1 });
    expect(afterWrongAnswer({ status: 'mastered', repeatCount: 2 })).toEqual({ status: 'unresolved', repeatCount: 3 });
  });
  it('correct retry → mastered (repeat kept); wrong retry → unresolved + 1', () => {
    expect(afterRetry({ status: 'reviewed', repeatCount: 2 }, true)).toEqual({ status: 'mastered', repeatCount: 2 });
    expect(afterRetry({ status: 'reviewed', repeatCount: 2 }, false)).toEqual({ status: 'unresolved', repeatCount: 3 });
  });
  it('"repeated" = repeatCount ≥ 2', () => {
    expect(isRepeated({ repeatCount: 1 })).toBe(false);
    expect(isRepeated({ repeatCount: 2 })).toBe(true);
  });
});

describe('question read-model & grading', () => {
  it('QuestionPublic never carries the answer; QuestionReview does (index in served order)', () => {
    const order = ['o3', 'o2', 'o1'];
    const pub = toPublic(q(), { order }) as unknown as Record<string, unknown>;
    expect(pub.correctOptionId).toBeUndefined();
    expect(pub.explanation).toBeUndefined();
    const rev = toReview(q(), { order });
    expect(rev.options.map((o) => o.id)).toEqual(order);
    expect(rev).toMatchObject({ correctOptionId: 'o2', correctIndex: 1 });
  });
  it('concealed review (mistake detail before retry) hides answer + explanation', () => {
    expect(toConcealedReview(q())).toMatchObject({ correctOptionId: null, correctIndex: -1, explanation: { en: '', ar: '' } });
  });
  it('grades by option id or served index', () => {
    expect(grade(q(), { optionId: 'o2' })).toMatchObject({ correct: true, chosenIndex: 1, correctIndex: 1 });
    expect(grade(q(), { chosenIndex: 0 }, ['o2', 'o1', 'o3'])).toMatchObject({ correct: true, chosenOptionId: 'o2' });
    expect(grade(q(), { optionId: 'o1' })).toMatchObject({ correct: false, answered: true });
    expect(grade(q(), {})).toMatchObject({ answered: false });
  });
  it('fill-blank compares normalized text against every accepted answer', () => {
    const fb = q('fill_blank');
    fb.options = [{ id: 'a', question_id: 'q1', sort_order: 1, text_en: 'Mole', text_ar: 'المول', is_correct: true }];
    expect(grade(fb, { textAnswer: ' mole ' }).correct).toBe(true);
    expect(grade(fb, { textAnswer: 'المول' }).correct).toBe(true);
    expect(grade(fb, { textAnswer: 'gram' }).correct).toBe(false);
  });
});

describe('entitlement gating & lesson locks', () => {
  const now = new Date('2026-10-22T00:00:00Z');
  const rec = (subjectId: string, endsAt: string): EntitlementRecord => ({ id: subjectId, subjectId, source: 'package', subscriptionId: null, startsAt: new Date('2026-01-01'), endsAt: new Date(endsAt), revokedAt: null });

  it('402 NO_SUBSCRIPTION / EXPIRED, 403 SUBJECT_NOT_IN_PACKAGE with locked payload', () => {
    const none = lockedError(evaluateSubjectAccess([], 'math', now), { subjectId: 'math' });
    expect(none.status).toBe(402);
    expect(none.toDetails()).toMatchObject({ locked: { reason: 'NO_SUBSCRIPTION', subjectId: 'math' } });
    expect(lockedError(evaluateSubjectAccess([rec('math', '2026-06-01')], 'math', now), { subjectId: 'math' }).status).toBe(402);
    const other = lockedError(evaluateSubjectAccess([rec('physics', '2027-01-01')], 'math', now), { subjectId: 'math' });
    expect(other.status).toBe(403);
    expect(other.code).toBe('NOT_ENTITLED');
  });

  it('lock order: entitlement → prerequisite → sequential; free preview bypasses entitlement', () => {
    const denied = { allowed: false, reason: 'NO_SUBSCRIPTION' as const };
    const ok = { allowed: true };
    expect(lessonLock({ access: null, freePreview: true, prerequisiteDone: null, previousDone: null })).toEqual({ locked: true, lockReason: 'NO_SUBSCRIPTION' });
    expect(lessonLock({ access: denied, freePreview: false, prerequisiteDone: true, previousDone: true }).lockReason).toBe('NO_SUBSCRIPTION');
    expect(lessonLock({ access: denied, freePreview: true, prerequisiteDone: null, previousDone: null }).locked).toBe(false);
    expect(lessonLock({ access: ok, freePreview: false, prerequisiteDone: false, previousDone: true }).lockReason).toBe('PREREQUISITE');
    expect(lessonLock({ access: ok, freePreview: false, prerequisiteDone: true, previousDone: false }).lockReason).toBe('SEQUENTIAL');
    expect(lessonLock({ access: ok, freePreview: false, prerequisiteDone: null, previousDone: null }).locked).toBe(false);
  });
});

describe('watch progress, streaks, heatmap', () => {
  it('progress only grows, caps at 99 until the completion threshold', () => {
    expect(nextWatchProgress({ progress: 50, completed: false }, 100, 1000, 'heartbeat', 80)).toEqual({ progress: 50, completed: false, justCompleted: false });
    expect(nextWatchProgress(null, 995, 1000, 'heartbeat', 100)).toMatchObject({ progress: 99, completed: false });
    expect(nextWatchProgress(null, 800, 1000, 'heartbeat', 80)).toEqual({ progress: 100, completed: true, justCompleted: true });
    expect(nextWatchProgress(null, 10, 1000, 'ended', 80).completed).toBe(true);
    expect(nextWatchProgress({ progress: 100, completed: true }, 0, 1000, 'seek', 80)).toMatchObject({ completed: true, justCompleted: false });
  });
  it('streak continues on consecutive days and resets after a gap', () => {
    const s1 = nextStreak(null, '2026-10-20');
    const s2 = nextStreak(s1, '2026-10-21');
    expect(s2).toMatchObject({ current: 2, longest: 2 });
    expect(nextStreak(s2, '2026-10-21')).toBe(s2);
    expect(nextStreak(s2, '2026-10-25')).toMatchObject({ current: 1, longest: 2 });
    expect(displayStreak(s2, '2026-10-22')).toBe(2);
    expect(displayStreak(s2, '2026-10-24')).toBe(0);
  });
  it('heat levels follow settings thresholds', () => {
    expect([0, 1, 30, 60, 100].map((m) => heatLevel(m, [0, 1, 25, 50, 80]))).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('Arabic-normalized text helpers', () => {
  it('folds alef/yaa/taa-marbuta and strips diacritics', () => {
    expect(normalizeText('إِسْتِراتيجيّة')).toBe(normalizeText('استراتيجيه'));
    expect(normalizeText('مستوى')).toBe('مستوي');
  });
  it('similarity ignores LaTeX markup noise; fill-blank matching is punctuation-insensitive', () => {
    expect(similarity('What is the value of $i^2$?', 'what is the value of $i^2$')).toBeGreaterThan(0.9);
    expect(similarity('Photosynthesis in plants', 'Integration by parts')).toBeLessThan(0.2);
    expect(answersMatch('Newton.', 'newton')).toBe(true);
  });
});

describe('learning HTTP surface (no DB)', () => {
  const app = createApp();
  afterAll(() => closeDb());

  it('student/admin learning routes require auth', async () => {
    for (const [m, p] of [
      ['get', '/api/v1/lessons/00000000-0000-4000-8000-000000000000'],
      ['post', '/api/v1/quizzes/00000000-0000-4000-8000-000000000000/start'],
      ['get', '/api/v1/mistakes'],
      ['get', '/api/v1/exams/available'],
      ['put', '/api/v1/progress/watch'],
      ['get', '/api/v1/bank/questions'],
      ['get', '/api/v1/search?q=ab'],
      ['get', '/api/v1/admin/lessons'],
      ['get', '/api/v1/admin/questions'],
      ['get', '/api/v1/admin/exam-blueprints'],
    ] as const) {
      const r = await request(app)[m](p);
      expect(r.status, `${m} ${p}`).toBe(401);
    }
  });

  it('OpenAPI documents every learning group', () => {
    const paths = Object.keys(generateOpenApiDocument().paths ?? {});
    for (const p of [
      '/api/v1/subjects', '/api/v1/subjects/{subjectId}', '/api/v1/lessons/{lessonId}/stream-url', '/api/v1/lessons/{lessonId}/quiz-rule',
      '/api/v1/progress/dashboard', '/api/v1/quizzes/{lessonId}/start', '/api/v1/bank/facets', '/api/v1/practice/start', '/api/v1/bookmarks/{questionId}',
      '/api/v1/mistakes/{id}/retry', '/api/v1/exams/{blueprintId}/start', '/api/v1/exams/attempts/{attemptId}/autosave', '/api/v1/search',
      '/api/v1/admin/subjects/order', '/api/v1/admin/lessons/{id}/transition', '/api/v1/admin/videos/{id}', '/api/v1/admin/questions/import/{importId}/commit',
      '/api/v1/admin/quiz-rules/effective', '/api/v1/admin/exam-blueprints/availability', '/api/v1/admin/attempts/{id}',
    ]) expect(paths, p).toContain(p);
  });
});
