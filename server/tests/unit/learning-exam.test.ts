/** Exam timer / auto-submit decision, scoring, grading and paper assembly (Agent B). Pure — no database. */
import { describe, expect, it } from 'vitest';
import { assemblePaper, countsToMix, examTiming, gradeFor, mixToCounts, scoreExam, type PoolQuestion } from '../../src/modules/learning-core/rules.js';
import { rngFor } from '../../src/modules/learning-core/random.js';

const BANDS = [
  { key: 'excellent', min: 90 },
  { key: 'veryGood', min: 80 },
  { key: 'good', min: 70 },
  { key: 'pass', min: 50 },
  { key: 'needsWork', min: 0 },
];

describe('exam timer (server-authoritative)', () => {
  const start = new Date('2026-10-22T10:00:00Z');

  it('endsAt = start + duration; accepts saves until endsAt + grace', () => {
    const t = examTiming(start, 60, 30, new Date('2026-10-22T11:00:20Z'));
    expect(t.endsAt.toISOString()).toBe('2026-10-22T11:00:00.000Z');
    expect(t.hardDeadline.toISOString()).toBe('2026-10-22T11:00:30.000Z');
    expect(t.expired).toBe(false);
    expect(t.remainingSec).toBe(0);
  });

  it('is expired (auto-submit due) after endsAt + grace', () => {
    expect(examTiming(start, 60, 30, new Date('2026-10-22T11:00:31Z')).expired).toBe(true);
  });

  it('uses the stored deadline when given (duration edits never move a running attempt)', () => {
    const t = examTiming(start, 999, 0, new Date('2026-10-22T10:10:00Z'), new Date('2026-10-22T10:20:00Z'));
    expect(t.remainingSec).toBe(600);
    expect(t.expired).toBe(false);
  });
});

describe('exam scoring', () => {
  const items = [
    { difficulty: 'easy' as const, correct: true },
    { difficulty: 'medium' as const, correct: false },
    { difficulty: 'hard' as const, correct: true },
    { difficulty: 'hard' as const, correct: null },
  ];

  it('standard', () => {
    expect(scoreExam(items, 'standard')).toEqual({ correct: 2, incorrect: 1, unanswered: 1, rawScore: 2, maxScore: 4, pct: 50 });
  });

  it('weighted: easy 1 / medium 2 / hard 3', () => {
    expect(scoreExam(items, 'weighted')).toMatchObject({ rawScore: 4, maxScore: 9, pct: 44.4 });
  });

  it('negative: −0.25 per wrong answer, never below 0', () => {
    expect(scoreExam(items, 'negative')).toMatchObject({ rawScore: 1.75, pct: 43.8 });
    expect(scoreExam([{ difficulty: 'easy', correct: false }], 'negative')).toMatchObject({ rawScore: 0, pct: 0 });
  });

  it('grade bands from settings', () => {
    expect(gradeFor(95, BANDS)).toBe('excellent');
    expect(gradeFor(80, BANDS)).toBe('veryGood');
    expect(gradeFor(55, BANDS)).toBe('pass');
    expect(gradeFor(10, BANDS)).toBe('needsWork');
  });
});

describe('blueprint difficulty mix & paper assembly', () => {
  it('converts % mix ↔ counts exactly', () => {
    expect(mixToCounts(10, 30, 20)).toEqual({ easy: 3, medium: 5, hard: 2 });
    expect(mixToCounts(3, 50, 50)).toEqual({ easy: 2, medium: 0, hard: 1 });
    const m = countsToMix(3, 5, 2);
    expect(m.easy + m.medium + m.hard).toBe(100);
  });

  it('draws the requested counts per section without duplicates and fills shortfalls', () => {
    const pool: PoolQuestion[] = [
      ...Array.from({ length: 4 }, (_, i) => ({ id: `e${i}`, subjectId: 'S', topicId: 'T1', difficulty: 'easy' as const })),
      ...Array.from({ length: 4 }, (_, i) => ({ id: `m${i}`, subjectId: 'S', topicId: 'T1', difficulty: 'medium' as const })),
      ...Array.from({ length: 1 }, (_, i) => ({ id: `h${i}`, subjectId: 'S', topicId: 'T2', difficulty: 'hard' as const })),
      { id: 'other', subjectId: 'X', topicId: null, difficulty: 'hard' },
    ];
    const paper = assemblePaper([{ subjectId: 'S', topicId: null, easy: 2, medium: 2, hard: 3 }], pool, rngFor('p'));
    expect(paper).toHaveLength(7);
    expect(new Set(paper).size).toBe(7);
    expect(paper).not.toContain('other');
    expect(paper.filter((id) => id.startsWith('h'))).toEqual(['h0']);
  });

  it('respects topic-scoped sections', () => {
    const pool: PoolQuestion[] = [
      { id: 'a', subjectId: 'S', topicId: 'T1', difficulty: 'easy' },
      { id: 'b', subjectId: 'S', topicId: 'T2', difficulty: 'easy' },
    ];
    expect(assemblePaper([{ subjectId: 'S', topicId: 'T2', easy: 1, medium: 0, hard: 0 }], pool, rngFor('t'))).toEqual(['b']);
  });
});
