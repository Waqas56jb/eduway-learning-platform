/** Quiz randomization + rule merge/retry policy (Agent B). Pure — no database. */
import { describe, expect, it } from 'vitest';
import { buildQuizSets, estimatedQuizMinutes, mergeQuizRules, quizRetryState, randomizePaper, setForAttempt, type QuizRuleValues } from '../../src/modules/learning-core/rules.js';
import { rngFor, shuffle } from '../../src/modules/learning-core/random.js';

const pool = Array.from({ length: 15 }, (_, i) => `q${i + 1}`);
const base: QuizRuleValues = {
  questionCount: 5,
  poolSize: 15,
  randomize: true,
  alternativeSets: 3,
  passThreshold: 60,
  retryPolicy: 'unlimited',
  maxRetries: 0,
  cooldownMinutes: 60,
  showExplanation: true,
  requireCompletionToUnlock: false,
};

describe('quiz alternative sets', () => {
  it('builds up to 5 sets of questionCount distinct pool questions', () => {
    const sets = buildQuizSets(pool, 5, 7, 'lesson-1');
    expect(sets).toHaveLength(5);
    for (const s of sets) {
      expect(s).toHaveLength(5);
      expect(new Set(s).size).toBe(5);
      for (const id of s) expect(pool).toContain(id);
    }
  });

  it('is deterministic per seed and differs across seeds', () => {
    expect(buildQuizSets(pool, 5, 3, 'L')).toEqual(buildQuizSets(pool, 5, 3, 'L'));
    expect(buildQuizSets(pool, 5, 3, 'L')).not.toEqual(buildQuizSets(pool, 5, 3, 'M'));
  });

  it('sets overlap as little as the pool allows (15 questions → 3 disjoint sets of 5)', () => {
    const sets = buildQuizSets(pool, 5, 3, 'disjoint');
    expect(new Set(sets.flat()).size).toBe(15);
  });

  it('caps the set size by the pool and handles an empty pool', () => {
    expect(buildQuizSets(['a', 'b'], 5, 2, 's')).toEqual([expect.arrayContaining(['a', 'b']), expect.arrayContaining(['a', 'b'])]);
    expect(buildQuizSets([], 5, 3, 's')).toEqual([]);
  });

  it('rotates sets across attempts', () => {
    expect([1, 2, 3, 4, 5, 6].map((n) => setForAttempt(n, 3))).toEqual([1, 2, 3, 1, 2, 3]);
    expect(setForAttempt(1, 0)).toBe(1);
  });
});

describe('per-attempt paper randomization', () => {
  const opts = new Map(pool.slice(0, 5).map((q) => [q, ['a', 'b', 'c', 'd'].map((o) => `${q}-${o}`)]));

  it('shuffles question order and option order but keeps the same members', () => {
    const p = randomizePaper(pool.slice(0, 5), opts, { randomizeQuestions: true, randomizeOptions: true, rnd: rngFor('attempt-1') });
    expect([...p.order].sort()).toEqual(pool.slice(0, 5).sort());
    for (const q of p.order) expect([...(p.optionOrders[q] ?? [])].sort()).toEqual([...(opts.get(q) ?? [])].sort());
  });

  it('keeps canonical order when randomization is off', () => {
    const p = randomizePaper(pool.slice(0, 5), opts, { randomizeQuestions: false, randomizeOptions: false, rnd: rngFor('x') });
    expect(p.order).toEqual(pool.slice(0, 5));
    expect(p.optionOrders.q1).toEqual(opts.get('q1'));
  });

  it('different attempts get different orders (with overwhelming probability)', () => {
    const a = shuffle(pool, rngFor('attempt-a'));
    const b = shuffle(pool, rngFor('attempt-b'));
    expect(a).not.toEqual(b);
  });
});

describe('quiz rule merge & retry policy', () => {
  it('lesson override wins over subject default, field by field', () => {
    const r = mergeQuizRules(base, { passThreshold: 70, alternativeSets: 4 }, { questionCount: 8, passThreshold: 80 });
    expect(r).toMatchObject({ questionCount: 8, passThreshold: 80, alternativeSets: 4, poolSize: 15 });
  });

  it('clamps alternative sets to 1..5 and pool ≥ question count', () => {
    expect(mergeQuizRules(base, { alternativeSets: 9, questionCount: 20, poolSize: 10 })).toMatchObject({ alternativeSets: 5, questionCount: 20, poolSize: 20 });
  });

  it('limited: first attempt + maxRetries retries', () => {
    const rule = { retryPolicy: 'limited' as const, maxRetries: 2, cooldownMinutes: 0 };
    expect(quizRetryState(rule, 0, null)).toMatchObject({ allowed: true, retriesLeft: 2 });
    expect(quizRetryState(rule, 2, null)).toMatchObject({ allowed: true, retriesLeft: 1 });
    expect(quizRetryState(rule, 3, null)).toMatchObject({ allowed: false, reason: 'QUIZ_RETRY_EXHAUSTED', retriesLeft: 0 });
  });

  it('cooldown: blocked until last attempt + cooldown', () => {
    const now = new Date('2026-10-22T10:00:00Z');
    const rule = { retryPolicy: 'cooldown' as const, maxRetries: 0, cooldownMinutes: 60 };
    const blocked = quizRetryState(rule, 1, new Date('2026-10-22T09:30:00Z'), now);
    expect(blocked).toMatchObject({ allowed: false, reason: 'QUIZ_COOLDOWN' });
    expect(blocked.retryAt?.toISOString()).toBe('2026-10-22T10:30:00.000Z');
    expect(quizRetryState(rule, 1, new Date('2026-10-22T08:30:00Z'), now).allowed).toBe(true);
  });

  it('unlimited never blocks; estimate is 0.8 min/question', () => {
    expect(quizRetryState(base, 99, new Date()).allowed).toBe(true);
    expect(estimatedQuizMinutes(5)).toBe(4);
  });
});
