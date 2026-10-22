/**
 * Text helpers: Arabic-normalized free-text search (API_CONTRACT §0.6 `q`), token similarity for duplicate
 * detection (ADM-QST-11, import duplicates) and fill-blank answer comparison.
 */

const DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;

/** JS-side normalization (lowercase, diacritics/tatweel stripped, alef/yaa/taa-marbuta folded). */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(DIACRITICS, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * SQL expression normalizing a text column the same way (no DB function needed):
 *   `${sqlNorm('l.title_en')} LIKE $1`
 */
export function sqlNorm(expr: string): string {
  return `translate(regexp_replace(lower(coalesce(${expr}, '')), '[ً-ٰٟـ]', '', 'g'), 'أإآٱىة', 'اااايه')`;
}

/** Whitespace-separated words of `q` (normalized) — each must match (AND semantics). */
export function searchWords(q: string | undefined | null): string[] {
  if (!q) return [];
  return normalizeText(q)
    .split(' ')
    .map((w) => w.replace(/[%_\\]/g, ''))
    .filter(Boolean)
    .slice(0, 8);
}

/**
 * Builds `(norm(a) LIKE $n OR norm(b) LIKE $n) AND …` for each word, pushing params. Returns '' when no words.
 */
export function sqlSearch(q: string | undefined | null, columns: string[], params: unknown[]): string {
  const words = searchWords(q);
  if (!words.length || !columns.length) return '';
  const parts = words.map((w) => {
    params.push(`%${w}%`);
    const p = `$${params.length}`;
    return `(${columns.map((c) => `${sqlNorm(c)} LIKE ${p}`).join(' OR ')})`;
  });
  return parts.join(' AND ');
}

/** Tokens for similarity: normalized words ≥ 2 chars, LaTeX/markup stripped. */
export function tokens(s: string): Set<string> {
  const clean = normalizeText(s.replace(/\$[^$]*\$/g, (m) => ` ${m.replace(/[$\\{}^_]/g, ' ')} `).replace(/[*_`#>()[\]{},.;:!?"'«»،؛؟]/g, ' '));
  return new Set(clean.split(' ').filter((w) => w.length >= 2));
}

/** Jaccard similarity of two token sets (0..1). */
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size && !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

export const similarity = (a: string, b: string) => jaccard(tokens(a), tokens(b));

/** Fill-blank comparison: normalized, punctuation-insensitive equality. */
export function answersMatch(given: string, accepted: string): boolean {
  const n = (s: string) => normalizeText(s).replace(/[\s.,;:!?'"`]/g, '');
  return n(given) !== '' && n(given) === n(accepted);
}

/** Human file size label ("1.2 MB"). */
export function sizeLabel(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}
