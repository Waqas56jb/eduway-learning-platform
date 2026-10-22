/**
 * Pure learning rules (no I/O) — unit-tested in tests/unit/learning-*.test.ts.
 * Quiz rule merge/retry policy/alternative sets, exam timing/scoring/grading/paper assembly, mistake mastery,
 * lesson locks, watch-progress & streak updates.
 */
import type { AccessDecision } from '../../common/entitlements.js';
import type { LockedReason } from '../../common/errors/index.js';
import { rngFor, shuffle, type Rng } from './random.js';

// ── Quiz rules ──────────────────────────────────────────────────────────────────────────────────────

export type RetryPolicy = 'unlimited' | 'limited' | 'cooldown';

export interface QuizRuleValues {
  questionCount: number;
  poolSize: number;
  randomize: boolean;
  alternativeSets: number;
  passThreshold: number;
  retryPolicy: RetryPolicy;
  maxRetries: number;
  cooldownMinutes: number;
  showExplanation: boolean;
  requireCompletionToUnlock: boolean;
}

/** Override wins field by field; `null`/`undefined` layers are skipped. */
export function mergeQuizRules(base: QuizRuleValues, ...layers: (Partial<QuizRuleValues> | null | undefined)[]): QuizRuleValues {
  const out = { ...base };
  for (const l of layers) {
    if (!l) continue;
    for (const [k, v] of Object.entries(l)) if (v !== undefined && v !== null) (out as Record<string, unknown>)[k] = v;
  }
  out.questionCount = Math.max(1, Math.min(50, Math.round(out.questionCount)));
  out.poolSize = Math.max(out.questionCount, Math.min(200, Math.round(out.poolSize)));
  out.alternativeSets = Math.max(1, Math.min(5, Math.round(out.alternativeSets)));
  return out;
}

export interface RetryState {
  allowed: boolean;
  reason: 'QUIZ_RETRY_EXHAUSTED' | 'QUIZ_COOLDOWN' | null;
  retriesLeft: number | null;
  retryAt: Date | null;
}

/** `attemptsUsed` = finished attempts; `lastFinishedAt` = most recent submission. */
export function quizRetryState(rule: Pick<QuizRuleValues, 'retryPolicy' | 'maxRetries' | 'cooldownMinutes'>, attemptsUsed: number, lastFinishedAt: Date | null, now = new Date()): RetryState {
  if (rule.retryPolicy === 'limited') {
    const retriesLeft = attemptsUsed === 0 ? rule.maxRetries : Math.max(0, rule.maxRetries - (attemptsUsed - 1));
    const allowed = attemptsUsed <= rule.maxRetries;
    return { allowed, reason: allowed ? null : 'QUIZ_RETRY_EXHAUSTED', retriesLeft, retryAt: null };
  }
  if (rule.retryPolicy === 'cooldown' && lastFinishedAt && rule.cooldownMinutes > 0) {
    const retryAt = new Date(lastFinishedAt.getTime() + rule.cooldownMinutes * 60_000);
    if (retryAt.getTime() > now.getTime()) return { allowed: false, reason: 'QUIZ_COOLDOWN', retriesLeft: null, retryAt };
  }
  return { allowed: true, reason: null, retriesLeft: null, retryAt: null };
}

/** UI estimate: 0.8 min per question, at least 1. */
export const estimatedQuizMinutes = (questionCount: number) => Math.max(1, Math.ceil(questionCount * 0.8));

/**
 * Up to `alternativeSets` (≤5) question sets of `questionCount` drawn from the pool, deterministic per `seed`.
 * Sets rotate through a seeded shuffle of the pool so consecutive sets overlap as little as the pool allows.
 */
export function buildQuizSets(poolIds: readonly string[], questionCount: number, alternativeSets: number, seed: string): string[][] {
  const pool = [...new Set(poolIds)];
  if (!pool.length) return [];
  const n = Math.min(questionCount, pool.length);
  const setCount = Math.max(1, Math.min(5, alternativeSets));
  const order = shuffle(pool, rngFor(`${seed}:pool`));
  const sets: string[][] = [];
  for (let k = 0; k < setCount; k++) {
    const start = (k * n) % order.length;
    const set: string[] = [];
    for (let i = 0; set.length < n && i < order.length; i++) {
      const id = order[(start + i) % order.length] as string;
      if (!set.includes(id)) set.push(id);
    }
    sets.push(set);
  }
  return sets;
}

/** Set served for the n-th attempt (1-based): rotates through the available sets. */
export const setForAttempt = (attemptNo: number, setCount: number) => (setCount <= 0 ? 1 : ((Math.max(1, attemptNo) - 1) % setCount) + 1);

/** Served question order + per-question option order for one attempt. */
export function randomizePaper(questionIds: readonly string[], optionsByQuestion: ReadonlyMap<string, readonly string[]>, opts: { randomizeQuestions: boolean; randomizeOptions: boolean; rnd: Rng }) {
  const order = opts.randomizeQuestions ? shuffle(questionIds, opts.rnd) : [...questionIds];
  const optionOrders: Record<string, string[]> = {};
  for (const id of order) {
    const opt = optionsByQuestion.get(id) ?? [];
    optionOrders[id] = opts.randomizeOptions ? shuffle(opt, opts.rnd) : [...opt];
  }
  return { order, optionOrders };
}

export const pctScore = (correct: number, total: number) => (total > 0 ? Math.round((correct / total) * 1000) / 10 : 0);

// ── Exams ───────────────────────────────────────────────────────────────────────────────────────────

export interface ExamTiming {
  endsAt: Date;
  /** endsAt + grace: autosave/submit accepted until then; afterwards the attempt is auto-submitted. */
  hardDeadline: Date;
  expired: boolean;
  remainingSec: number;
}

export function examTiming(startedAt: Date, durationMin: number, graceSeconds: number, now = new Date(), deadline?: Date): ExamTiming {
  const endsAt = deadline ?? new Date(startedAt.getTime() + durationMin * 60_000);
  const hardDeadline = new Date(endsAt.getTime() + Math.max(0, graceSeconds) * 1000);
  return { endsAt, hardDeadline, expired: now.getTime() > hardDeadline.getTime(), remainingSec: Math.max(0, Math.round((endsAt.getTime() - now.getTime()) / 1000)) };
}

export type Scoring = 'standard' | 'negative' | 'weighted';
export type Difficulty = 'easy' | 'medium' | 'hard';

export interface ScoredItem {
  difficulty: Difficulty;
  /** null = unanswered */
  correct: boolean | null;
}

export interface ExamScore {
  correct: number;
  incorrect: number;
  unanswered: number;
  rawScore: number;
  maxScore: number;
  pct: number;
}

const WEIGHT: Record<Difficulty, number> = { easy: 1, medium: 2, hard: 3 };
export const NEGATIVE_PENALTY = 0.25;

export function scoreExam(items: readonly ScoredItem[], scoring: Scoring): ExamScore {
  let correct = 0;
  let incorrect = 0;
  let unanswered = 0;
  let raw = 0;
  let max = 0;
  for (const it of items) {
    const w = scoring === 'weighted' ? WEIGHT[it.difficulty] : 1;
    max += w;
    if (it.correct === null) unanswered++;
    else if (it.correct) {
      correct++;
      raw += w;
    } else {
      incorrect++;
      if (scoring === 'negative') raw -= NEGATIVE_PENALTY;
    }
  }
  raw = Math.max(0, Math.round(raw * 100) / 100);
  return { correct, incorrect, unanswered, rawScore: raw, maxScore: max, pct: max > 0 ? Math.round((raw / max) * 1000) / 10 : 0 };
}

export type Grade = 'excellent' | 'veryGood' | 'good' | 'pass' | 'needsWork';
const GRADES: readonly Grade[] = ['excellent', 'veryGood', 'good', 'pass', 'needsWork'];

export function gradeFor(pct: number, bands: readonly { key: string; min: number }[]): Grade {
  const sorted = [...bands].sort((a, b) => b.min - a.min);
  for (const b of sorted) if (pct >= b.min && (GRADES as readonly string[]).includes(b.key)) return b.key as Grade;
  return 'needsWork';
}

export interface PoolQuestion {
  id: string;
  subjectId: string;
  topicId: string | null;
  difficulty: Difficulty;
}
export interface PaperSection {
  subjectId: string;
  topicId: string | null;
  easy: number;
  medium: number;
  hard: number;
}

/**
 * Assemble an exam paper: per section draw the requested easy/medium/hard counts from the matching pool
 * (subject [+ topic]); shortfalls are filled from the section's remaining questions of any difficulty.
 */
export function assemblePaper(sections: readonly PaperSection[], pool: readonly PoolQuestion[], rnd: Rng): string[] {
  const used = new Set<string>();
  const out: string[] = [];
  for (const s of sections) {
    const candidates = pool.filter((q) => q.subjectId === s.subjectId && (!s.topicId || q.topicId === s.topicId));
    const wanted = s.easy + s.medium + s.hard;
    const picked: string[] = [];
    for (const d of ['easy', 'medium', 'hard'] as const) {
      const avail = shuffle(candidates.filter((q) => q.difficulty === d && !used.has(q.id)), rnd);
      for (const q of avail.slice(0, s[d])) {
        used.add(q.id);
        picked.push(q.id);
      }
    }
    if (picked.length < wanted) {
      for (const q of shuffle(candidates.filter((c) => !used.has(c.id)), rnd).slice(0, wanted - picked.length)) {
        used.add(q.id);
        picked.push(q.id);
      }
    }
    out.push(...picked);
  }
  return out;
}

/** Percent mix (sum 100) → integer counts (sum = count). */
export function mixToCounts(count: number, easyPct: number, hardPct: number): { easy: number; medium: number; hard: number } {
  const easy = Math.min(count, Math.round((count * easyPct) / 100));
  const hard = Math.min(count - easy, Math.round((count * hardPct) / 100));
  return { easy, medium: count - easy - hard, hard };
}

/** Integer counts → percent mix that sums to exactly 100. */
export function countsToMix(easy: number, medium: number, hard: number): { easy: number; medium: number; hard: number } {
  const total = easy + medium + hard;
  if (total <= 0) return { easy: 0, medium: 100, hard: 0 };
  const e = Math.round((easy * 100) / total);
  const h = Math.round((hard * 100) / total);
  return { easy: e, medium: 100 - e - h, hard: h };
}

// ── Mistakes ────────────────────────────────────────────────────────────────────────────────────────

export type MistakeStatus = 'unresolved' | 'reviewed' | 'mastered';
export interface MistakeState {
  status: MistakeStatus;
  repeatCount: number;
}

/** A new wrong answer (quiz/practice/exam): unresolved, repeat count +1 (1 for a first miss). */
export const afterWrongAnswer = (existing: MistakeState | null): MistakeState => ({ status: 'unresolved', repeatCount: existing ? existing.repeatCount + 1 : 1 });

/** Retry outcome (API_CONTRACT §34.1 #8): correct → mastered; wrong → unresolved + repeat count +1. */
export const afterRetry = (s: MistakeState, correct: boolean): MistakeState => (correct ? { status: 'mastered', repeatCount: s.repeatCount } : { status: 'unresolved', repeatCount: s.repeatCount + 1 });

export const isRepeated = (s: Pick<MistakeState, 'repeatCount'>) => s.repeatCount >= 2;

// ── Lesson locks ────────────────────────────────────────────────────────────────────────────────────

export type LessonLockReason = LockedReason | 'PREREQUISITE' | 'SEQUENTIAL';

export interface LessonLockInput {
  /** null = anonymous caller. */
  access: AccessDecision | null;
  freePreview: boolean;
  /** null = the lesson has no (published) prerequisite. */
  prerequisiteDone: boolean | null;
  /** null = subject without sequential unlock, or first lesson. */
  previousDone: boolean | null;
}

export function lessonLock(i: LessonLockInput): { locked: boolean; lockReason: LessonLockReason | null } {
  if (!i.access) return { locked: true, lockReason: 'NO_SUBSCRIPTION' };
  if (!i.access.allowed && !i.freePreview) return { locked: true, lockReason: i.access.reason ?? 'NO_SUBSCRIPTION' };
  if (i.prerequisiteDone === false) return { locked: true, lockReason: 'PREREQUISITE' };
  if (i.previousDone === false) return { locked: true, lockReason: 'SEQUENTIAL' };
  return { locked: false, lockReason: null };
}

// ── Watch progress & streaks ────────────────────────────────────────────────────────────────────────

export type WatchEvent = 'heartbeat' | 'pause' | 'leave' | 'ended' | 'seek';

export function nextWatchProgress(prev: { progress: number; completed: boolean } | null, positionSec: number, durationSec: number, event: WatchEvent, threshold: number) {
  if (prev?.completed) return { progress: 100, completed: true, justCompleted: false };
  const raw = durationSec > 0 ? Math.round((Math.max(0, positionSec) / durationSec) * 100) : 0;
  const progress = Math.max(prev?.progress ?? 0, Math.min(99, raw));
  if (event === 'ended' || progress >= threshold) return { progress: 100, completed: true, justCompleted: true };
  return { progress, completed: false, justCompleted: false };
}

export interface StreakState {
  current: number;
  longest: number;
  lastDate: string | null;
}

const prevDay = (date: string) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

/** Activity on `today` (YYYY-MM-DD, platform tz). */
export function nextStreak(s: StreakState | null, today: string): StreakState {
  if (!s || !s.lastDate) return { current: 1, longest: Math.max(1, s?.longest ?? 0), lastDate: today };
  if (s.lastDate === today) return s;
  const current = s.lastDate === prevDay(today) ? s.current + 1 : 1;
  return { current, longest: Math.max(s.longest, current), lastDate: today };
}

/** Streak as displayed: broken when the last active day is before yesterday. */
export const displayStreak = (s: StreakState | null, today: string) => (s?.lastDate && (s.lastDate === today || s.lastDate === prevDay(today)) ? s.current : 0);

/** Heatmap level 0..4 from minutes and ascending thresholds (settings.learning.heatmapLevels). */
export function heatLevel(minutes: number, levels: readonly number[]): 0 | 1 | 2 | 3 | 4 {
  if (minutes <= 0) return 0;
  let lvl = 1;
  for (let i = 1; i < Math.min(levels.length, 5); i++) if (minutes >= (levels[i] as number)) lvl = i;
  return Math.min(4, Math.max(1, lvl)) as 0 | 1 | 2 | 3 | 4;
}

export const practiceBand = (score: number): 'excellent' | 'good' | 'fair' | 'low' => (score >= 85 ? 'excellent' : score >= 65 ? 'good' : score >= 50 ? 'fair' : 'low');
