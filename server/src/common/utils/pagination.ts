/**
 * Pagination: offset (`page`, `pageSize`) or keyset cursor (`cursor`).
 *
 *   const q = req.query  // validated with paginationQuery.extend({...})
 *   const p = toPagination(q);
 *   const rows = await db.many(`... ORDER BY created_at DESC, id DESC LIMIT $1 OFFSET $2`, [p.limit, p.offset]);
 *   return paged(rows.map(toDto), offsetMeta(p, total));
 *
 * Cursor mode: `decodeCursor(q.cursor)` → { v, id } for `WHERE (created_at, id) < ($1, $2)`, fetch limit+1 rows,
 * then `cursorPage(rows, p.pageSize, (r) => [r.created_at, r.id])`.
 */
import { z } from '../validation/zod.js';
import type { PageMeta } from './response.js';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  cursor: z.string().max(500).optional(),
  sort: z.string().max(64).optional(),
  q: z.string().trim().max(200).optional(),
});
export type PaginationQuery = z.infer<typeof paginationQuery>;

export interface Pagination {
  page: number;
  pageSize: number;
  limit: number;
  offset: number;
  cursor?: string;
}

export function toPagination(q: Partial<Pick<PaginationQuery, 'page' | 'pageSize' | 'cursor'>>): Pagination {
  const pageSize = Math.min(Math.max(q.pageSize ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const page = Math.max(q.page ?? 1, 1);
  return { page, pageSize, limit: pageSize, offset: (page - 1) * pageSize, cursor: q.cursor };
}

export function offsetMeta(p: Pagination, total: number): PageMeta {
  return {
    page: p.page,
    pageSize: p.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / p.pageSize)),
    hasMore: p.offset + p.pageSize < total,
  };
}

export interface CursorValue {
  v: string | number;
  id: string;
}

export function encodeCursor(v: string | number | Date, id: string): string {
  const value = v instanceof Date ? v.toISOString() : v;
  return Buffer.from(JSON.stringify({ v: value, id }), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string | undefined): CursorValue | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Partial<CursorValue>;
    if ((typeof parsed.v === 'string' || typeof parsed.v === 'number') && typeof parsed.id === 'string') {
      return { v: parsed.v, id: parsed.id };
    }
    return null;
  } catch {
    return null;
  }
}

/** Trim the extra (+1) row and compute nextCursor. */
export function cursorPage<R>(rows: R[], pageSize: number, key: (row: R) => [string | number | Date, string]): { items: R[]; meta: PageMeta } {
  const hasMore = rows.length > pageSize;
  const items = hasMore ? rows.slice(0, pageSize) : rows;
  const last = items[items.length - 1];
  const nextCursor = hasMore && last ? encodeCursor(...key(last)) : null;
  return { items, meta: { pageSize, nextCursor, hasMore } };
}

/**
 * Translate `sort=-createdAt` into a safe ORDER BY using a whitelist (never interpolate user input).
 *   orderBy(q.sort, { createdAt: 'u.created_at', name: 'u.name_en' }, '-createdAt')
 */
export function orderBy(sort: string | undefined, allowed: Record<string, string>, fallback: string): string {
  const pick = (s: string) => {
    const desc = s.startsWith('-');
    const key = desc ? s.slice(1) : s;
    const col = allowed[key];
    return col ? `${col} ${desc ? 'DESC' : 'ASC'} NULLS LAST` : null;
  };
  return pick(sort ?? '') ?? pick(fallback) ?? '1';
}
