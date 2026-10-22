/**
 * LIKE / ILIKE pattern helpers (SEC-29). User search text is always passed as a bound parameter; these escape the
 * wildcard characters `%` and `_` (and the escape character `\`, Postgres' default LIKE escape) so a search for
 * "50%" or "a_b" matches literally instead of scanning with wildcards.
 *
 *   params.push(likeContains(q.toLowerCase()));   …  `lower(u.name_en) LIKE $1`
 */

/** Escape `\`, `%` and `_` for use inside a LIKE/ILIKE pattern (default escape character `\`). */
export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** `%<escaped>%` — substring match. */
export const likeContains = (input: string): string => `%${escapeLike(input)}%`;

/** `<escaped>%` — prefix match. */
export const likePrefix = (input: string): string => `${escapeLike(input)}%`;
