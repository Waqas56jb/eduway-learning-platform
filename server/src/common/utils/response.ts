/**
 * Response envelope helpers (docs/ENGINEERING.md §2):
 *   success → { success: true, data, meta? }
 *   error   → { success: false, error: { code, message, details? } }   (see middleware/errorHandler.ts)
 */
import type { Response } from 'express';

export interface PageMeta {
  page?: number;
  pageSize?: number;
  total?: number;
  totalPages?: number;
  nextCursor?: string | null;
  hasMore?: boolean;
  [key: string]: unknown;
}

export interface SuccessEnvelope<T> {
  success: true;
  data: T;
  meta?: PageMeta;
}

export interface ErrorEnvelope {
  success: false;
  error: { code: string; message: string; details?: unknown };
}

export function ok<T>(res: Response, data: T, meta?: PageMeta, status = 200): Response {
  const body: SuccessEnvelope<T> = meta ? { success: true, data, meta } : { success: true, data };
  return res.status(status).json(body);
}

export function created<T>(res: Response, data: T, meta?: PageMeta): Response {
  return ok(res, data, meta, 201);
}

/** 200 with `data: null` (we prefer an envelope over 204 so clients always parse JSON). */
export function okEmpty(res: Response): Response {
  return ok(res, null);
}

const PAGED = Symbol.for('eduway.paged');

/** Return from a route handler to send `{ data: items, meta }`. */
export interface Paged<T> {
  [PAGED]: true;
  items: T[];
  meta: PageMeta;
}

export function paged<T>(items: T[], meta: PageMeta): Paged<T> {
  return { [PAGED]: true, items, meta };
}

export function isPaged(v: unknown): v is Paged<unknown> {
  return typeof v === 'object' && v !== null && (v as Record<symbol, unknown>)[PAGED] === true;
}
