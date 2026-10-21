import { questions as allQuestions, getQuestion, subjects } from '@/data';
import type { AnswerRecord, Attempt } from '@/store/progressStore';
import type { Difficulty, Lang, Localized, Question, SubjectId } from '@/types';
import { shuffle } from '@/utils/format';

export type DifficultyFilter = Difficulty | 'all';
export const SESSION_COUNTS = [10, 20, 50] as const;
export type SessionCount = (typeof SESSION_COUNTS)[number];
export const DEFAULT_COUNT: SessionCount = 10;

export interface PracticeFilters {
  subjectId?: SubjectId;
  unitId?: string;
  /** Topic key = the English topic label (stable across languages). */
  topic?: string;
  difficulty?: DifficultyFilter;
  tags?: string[];
  search?: string;
}

export interface SessionConfig extends PracticeFilters {
  count: number;
  mode?: 'bookmarks' | 'filters';
  bookmarks?: string[];
  lang?: Lang;
  seed?: number;
  /** Question id to force to the front of the session (e.g. "Practice this"). */
  include?: string;
}

const DIFFICULTY_ORDER: Difficulty[] = ['easy', 'medium', 'hard'];

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    // strip Arabic diacritics (tashkeel) and tatweel so searches are forgiving
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .trim();

/** Filter the question bank. `search` matches question text (and topic) in the given language. */
export function filterQuestions(filters: PracticeFilters, lang: Lang = 'en', source: readonly Question[] = allQuestions): Question[] {
  const { subjectId, unitId, topic, difficulty, tags, search } = filters;
  const q = search ? normalize(search) : '';
  return source.filter((x) => {
    if (subjectId && x.subjectId !== subjectId) return false;
    if (unitId && x.unitId !== unitId) return false;
    if (topic && x.topic.en !== topic) return false;
    if (difficulty && difficulty !== 'all' && x.difficulty !== difficulty) return false;
    if (tags && tags.length && !tags.some((t) => x.tags.includes(t))) return false;
    if (q) {
      const hay = normalize(`${x.text[lang]} ${x.topic[lang]}`);
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/**
 * Build a practice session. Uses bookmarked questions in `bookmarks` mode, otherwise the filtered pool.
 * If fewer questions match than requested, returns everything available (shuffled).
 */
export function buildSession(config: SessionConfig): Question[] {
  const { count, mode, bookmarks = [], lang = 'en', seed, include, ...filters } = config;
  const pool =
    mode === 'bookmarks'
      ? bookmarks.map((id) => getQuestion(id)).filter((x): x is Question => !!x)
      : filterQuestions(filters, lang);
  const mixed = shuffle(pool, seed);
  const pinned = include ? getQuestion(include) : undefined;
  const ordered = pinned ? [pinned, ...mixed.filter((x) => x.id !== pinned.id)] : mixed;
  return ordered.slice(0, Math.max(1, count));
}

/** Count of active (non-default) filters, used for the badge on the Filters button. */
export function activeFilterCount(f: PracticeFilters): number {
  let n = 0;
  if (f.subjectId) n++;
  if (f.unitId) n++;
  if (f.topic) n++;
  if (f.difficulty && f.difficulty !== 'all') n++;
  if (f.tags && f.tags.length) n += f.tags.length;
  return n;
}

/** Topics available for the current subject/unit selection (keyed by English label). */
export function topicsFor(subjectId?: SubjectId, unitId?: string): { key: string; label: Localized }[] {
  const seen = new Map<string, Localized>();
  allQuestions.forEach((x) => {
    if (subjectId && x.subjectId !== subjectId) return;
    if (unitId && x.unitId !== unitId) return;
    if (!seen.has(x.topic.en)) seen.set(x.topic.en, x.topic);
  });
  return [...seen.entries()].map(([key, label]) => ({ key, label }));
}

/** Tags available for the current selection, most frequent first. */
export function tagsFor(subjectId?: SubjectId, unitId?: string): string[] {
  const counts = new Map<string, number>();
  allQuestions.forEach((x) => {
    if (subjectId && x.subjectId !== subjectId) return;
    if (unitId && x.unitId !== unitId) return;
    x.tags.forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1));
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
}

export function unitsFor(subjectId?: SubjectId) {
  return subjects.find((s) => s.id === subjectId)?.units ?? [];
}

/* ---------------------------- route params ---------------------------- */

export type SessionParams = {
  subjectId?: string;
  unitId?: string;
  topic?: string;
  difficulty?: string;
  tags?: string;
  search?: string;
  count?: string;
  mode?: string;
  include?: string;
};

const SUBJECT_IDS: SubjectId[] = ['math', 'physics', 'chemistry', 'biology', 'english'];
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

/** Serialize filters to string route params (empty values omitted). */
export function toParams(
  f: PracticeFilters,
  count: number,
  mode?: 'bookmarks',
  include?: string,
): Record<string, string> {
  const p: Record<string, string> = { count: String(count) };
  if (mode) p.mode = mode;
  if (include) p.include = include;
  if (f.subjectId) p.subjectId = f.subjectId;
  if (f.unitId) p.unitId = f.unitId;
  if (f.topic) p.topic = f.topic;
  if (f.difficulty && f.difficulty !== 'all') p.difficulty = f.difficulty;
  if (f.tags && f.tags.length) p.tags = f.tags.join(',');
  if (f.search && f.search.trim()) p.search = f.search.trim();
  return p;
}

/** Parse route params back into a session config (tolerant of junk). */
export function fromParams(raw: Record<string, string | string[] | undefined>): {
  filters: PracticeFilters;
  count: number;
  mode?: 'bookmarks';
  include?: string;
} {
  const subject = first(raw.subjectId);
  const diff = first(raw.difficulty);
  const countN = Number(first(raw.count));
  const tags = first(raw.tags);
  return {
    filters: {
      subjectId: subject && (SUBJECT_IDS as string[]).includes(subject) ? (subject as SubjectId) : undefined,
      unitId: first(raw.unitId),
      topic: first(raw.topic),
      difficulty: diff && (DIFFICULTY_ORDER as string[]).includes(diff) ? (diff as Difficulty) : 'all',
      tags: tags ? tags.split(',').filter(Boolean) : [],
      search: first(raw.search),
    },
    count: Number.isFinite(countN) && countN > 0 ? Math.min(100, Math.round(countN)) : DEFAULT_COUNT,
    mode: first(raw.mode) === 'bookmarks' ? 'bookmarks' : undefined,
    include: first(raw.include),
  };
}

/* ------------------------------ analytics ------------------------------ */

export interface Breakdown {
  key: string;
  label: Localized;
  correct: number;
  total: number;
  /** 0–100 */
  accuracy: number;
}

function group(answers: AnswerRecord[], keyOf: (q: Question) => { key: string; label: Localized }): Breakdown[] {
  const map = new Map<string, Breakdown>();
  answers.forEach((a) => {
    const q = getQuestion(a.questionId);
    if (!q) return;
    const { key, label } = keyOf(q);
    const row = map.get(key) ?? { key, label, correct: 0, total: 0, accuracy: 0 };
    row.total += 1;
    if (a.correct) row.correct += 1;
    map.set(key, row);
  });
  return [...map.values()].map((r) => ({ ...r, accuracy: r.total ? Math.round((r.correct / r.total) * 100) : 0 }));
}

export function breakdownByTopic(answers: AnswerRecord[]): Breakdown[] {
  return group(answers, (q) => ({ key: q.topic.en, label: q.topic })).sort((a, b) => a.accuracy - b.accuracy);
}

/** Difficulty labels are resolved by the caller via i18n; `label` holds the raw key in both languages. */
export function breakdownByDifficulty(answers: AnswerRecord[]): Breakdown[] {
  return group(answers, (q) => ({ key: q.difficulty, label: { en: q.difficulty, ar: q.difficulty } })).sort(
    (a, b) => DIFFICULTY_ORDER.indexOf(a.key as Difficulty) - DIFFICULTY_ORDER.indexOf(b.key as Difficulty),
  );
}

/**
 * Mastery % for a subject from every recorded answer (quiz, practice, exam) on that subject's questions.
 * Falls back to a seeded baseline so new users see a meaningful figure.
 */
export function subjectMastery(attempts: Attempt[], subjectId: SubjectId, fallback: number): number {
  let correct = 0;
  let total = 0;
  attempts.forEach((a) =>
    a.answers.forEach((ans) => {
      const q = getQuestion(ans.questionId);
      if (q?.subjectId !== subjectId) return;
      total += 1;
      if (ans.correct) correct += 1;
    }),
  );
  if (!total) return fallback;
  return Math.round((correct / total) * 100);
}

/** Majority subject of a set of answers (used to tag a practice attempt). */
export function dominantSubject(questionIds: string[]): SubjectId | undefined {
  const counts = new Map<SubjectId, number>();
  questionIds.forEach((id) => {
    const q = getQuestion(id);
    if (q) counts.set(q.subjectId, (counts.get(q.subjectId) ?? 0) + 1);
  });
  let best: SubjectId | undefined;
  let max = 0;
  counts.forEach((n, s) => {
    if (n > max) {
      max = n;
      best = s;
    }
  });
  return best;
}
