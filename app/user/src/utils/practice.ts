import type { BankQuery, Breakdown, PracticeStartBody } from '@/api/types';
import type { Difficulty } from '@/types';

export type { Breakdown };

export type DifficultyFilter = Difficulty | 'all';
/** Fallback session sizes; the live list comes from `/public/app-config` → `learning.practiceSessionSizes`. */
export const SESSION_COUNTS = [10, 20, 50] as const;
export const DEFAULT_COUNT = 10;

export interface PracticeFilters {
  /** Subject slug. */
  subjectId?: string;
  unitId?: string;
  /** Topic id (from `/bank/facets` → `topics[].topicId`). */
  topic?: string;
  difficulty?: DifficultyFilter;
  tags?: string[];
  search?: string;
}

const DIFFICULTY_ORDER: Difficulty[] = ['easy', 'medium', 'hard'];

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

/** Filters → BNK-01/BNK-02 query params. */
export function toBankQuery(f: PracticeFilters): Omit<BankQuery, 'page' | 'pageSize' | 'reveal'> {
  const q: Omit<BankQuery, 'page' | 'pageSize' | 'reveal'> = {};
  if (f.subjectId) q.subjectId = f.subjectId;
  if (f.unitId) q.unitId = f.unitId;
  if (f.topic) q.topicId = f.topic;
  if (f.difficulty && f.difficulty !== 'all') q.difficulty = [f.difficulty];
  if (f.tags && f.tags.length) q.tags = f.tags;
  if (f.search && f.search.trim()) q.q = f.search.trim();
  return q;
}

/** Filters → PRA-01 `filters` object. */
export function toPracticeFilters(f: PracticeFilters): NonNullable<PracticeStartBody['filters']> {
  return {
    subjectId: f.subjectId,
    unitId: f.unitId,
    topicId: f.topic,
    difficulty: f.difficulty && f.difficulty !== 'all' ? f.difficulty : 'all',
    tags: f.tags && f.tags.length ? f.tags : undefined,
    q: f.search?.trim() || undefined,
  };
}

/* ---------------------------- route params ---------------------------- */

export type PracticeMode = 'bookmarks' | 'mistakes';

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
  ids?: string;
};

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

/** Serialize filters to string route params (empty values omitted). */
export function toParams(
  f: PracticeFilters,
  count: number,
  mode?: PracticeMode,
  include?: string,
  ids?: string[],
): Record<string, string> {
  const p: Record<string, string> = { count: String(count) };
  if (mode) p.mode = mode;
  if (include) p.include = include;
  if (ids && ids.length) p.ids = ids.join(',');
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
  mode?: PracticeMode;
  include?: string;
  ids?: string[];
} {
  const diff = first(raw.difficulty);
  const countN = Number(first(raw.count));
  const tags = first(raw.tags);
  const mode = first(raw.mode);
  const ids = first(raw.ids);
  return {
    filters: {
      subjectId: first(raw.subjectId),
      unitId: first(raw.unitId),
      topic: first(raw.topic),
      difficulty: diff && (DIFFICULTY_ORDER as string[]).includes(diff) ? (diff as Difficulty) : 'all',
      tags: tags ? tags.split(',').filter(Boolean) : [],
      search: first(raw.search),
    },
    count: Number.isFinite(countN) && countN > 0 ? Math.min(100, Math.round(countN)) : DEFAULT_COUNT,
    mode: mode === 'bookmarks' || mode === 'mistakes' ? mode : undefined,
    include: first(raw.include),
    ids: ids ? ids.split(',').filter(Boolean) : undefined,
  };
}

/* --------------------------- plain-text previews --------------------------- */

const SUPERSCRIPTS: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  n: 'ⁿ', '+': '⁺', '-': '⁻', i: 'ⁱ',
};

/** Ordered: longer commands first so `\rightarrow` wins over `\right`, `\leq` over `\le`. */
const SYMBOLS: [RegExp, string][] = [
  [/\\rightleftharpoons/g, '⇌'],
  [/\\rightarrow/g, '→'],
  [/\\Rightarrow/g, '⇒'],
  [/\\(?:left|right)(?![a-zA-Z])/g, ''],
  [/\\times/g, '×'],
  [/\\cdot/g, '·'],
  [/\\div/g, '÷'],
  [/\\pm/g, '±'],
  [/\\leq?(?![a-zA-Z])/g, '≤'],
  [/\\geq?(?![a-zA-Z])/g, '≥'],
  [/\\neq/g, '≠'],
  [/\\approx/g, '≈'],
  [/\\infty/g, '∞'],
  [/\\pi/g, 'π'],
  [/\\theta/g, 'θ'],
  [/\\alpha/g, 'α'],
  [/\\beta/g, 'β'],
  [/\\gamma/g, 'γ'],
  [/\\Delta/g, 'Δ'],
  [/\\delta/g, 'δ'],
  [/\\lambda/g, 'λ'],
  [/\\mu/g, 'μ'],
  [/\\omega/g, 'ω'],
  [/\\Omega/g, 'Ω'],
  [/\\sigma/g, 'σ'],
  [/\\phi/g, 'φ'],
  [/\\(?:var)?epsilon/g, 'ε'],
  [/\\varphi/g, 'φ'],
  [/\\Phi/g, 'Φ'],
  [/\\tau/g, 'τ'],
  [/\\eta/g, 'η'],
  [/\\nabla/g, '∇'],
  [/\\partial/g, '∂'],
  [/\\rho/g, 'ρ'],
  [/\\int/g, '∫'],
  [/\\sum/g, 'Σ'],
  [/\\to(?![a-zA-Z])/g, '→'],
  [/\\(?:degree|circ)(?![a-zA-Z])/g, '°'],
  [/\\angle/g, '∠'],
];

const toSuper = (s: string) => {
  const chars = [...s];
  return chars.every((c) => SUPERSCRIPTS[c]) ? chars.map((c) => SUPERSCRIPTS[c]).join('') : `^(${s})`;
};

const wrapTerm = (x: string) => (x.length > 1 && /[+\-\s]/.test(x) ? `(${x})` : x);

/**
 * Cheap LaTeX → readable plain text for list rows (no WebView). Detail views keep KaTeX via MathText/Formula.
 * Strips `$` delimiters, turns \frac{a}{b} into a/b, \sqrt{x} into √x, x^2 into x², common symbols into Unicode.
 */
export function plainMath(input: string | undefined): string {
  if (!input) return '';
  let s = input
    .replace(/\$\$?/g, '')
    .replace(/\^\{?\\circ\}?/g, '°')
    .replace(/\\(?:mathrm|text|operatorname|mathbf|vec)\{([^{}]*)\}/g, '$1');
  // Innermost first: scripts, then fractions/roots (repeat to unwrap nesting).
  for (let i = 0; i < 3; i++) {
    s = s
      .replace(/\^\{([^{}]*)\}/g, (_m, a: string) => toSuper(a))
      .replace(/_\{([^{}]*)\}/g, '$1')
      .replace(/\\[td]?frac\{([^{}]*)\}\{([^{}]*)\}/g, (_m, a: string, b: string) => `${wrapTerm(a)}/${wrapTerm(b)} `)
      .replace(/\\sqrt\{([^{}]*)\}/g, (_m, a: string) => (a.length > 1 ? `√(${a})` : `√${a}`));
  }
  SYMBOLS.forEach(([re, rep]) => {
    s = s.replace(re, rep);
  });
  return s
    .replace(/\\(sin|cos|tan|log|ln|lim|sec|csc|cot)(?![a-zA-Z])/g, (_m, fn: string, offset: number, all: string) =>
      offset > 0 && /[A-Za-z0-9]/.test(all.charAt(offset - 1)) ? ` ${fn}` : fn,
    )
    .replace(/\^([0-9a-z+-])/gi, (_m, a: string) => (SUPERSCRIPTS[a] ? SUPERSCRIPTS[a] : `^${a}`))
    .replace(/_([0-9a-z])/gi, '$1')
    .replace(/\\displaystyle/g, '')
    .replace(/\\[,;:! ]/g, ' ')
    .replace(/\\\\/g, ' ')
    .replace(/[{}]/g, '')
    .replace(/\\([a-zA-Z]+)/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}
