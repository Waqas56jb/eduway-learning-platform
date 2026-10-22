/**
 * Read-through cache for the published catalog (subjects + lesson sequence), which is identical for every student
 * and read on almost every student screen (home, subjects, subject detail, lesson detail, progress). See
 * docs/PERFORMANCE.md.
 *
 * Consistency: any successful mutating admin request (or provider webhook, e.g. video ready) clears the cache in
 * this process (`catalogCacheInvalidator`, registered in app.ts), so admin edits are visible immediately on a single
 * instance; with several API instances other instances converge within CATALOG_TTL_MS. Time-based visibility
 * (lesson publish_at, exam availability windows) may lag by at most the TTL.
 * Disabled under NODE_ENV=test so integration tests always read through.
 * Cached arrays are shared between requests — callers must treat them as read-only.
 */
import type { NextFunction, Request, Response } from 'express';
import { TtlCache } from '../utils/cache.js';

export const CATALOG_TTL_MS = 15_000;
const cache = new TtlCache<unknown>(CATALOG_TTL_MS, 500);
const inflight = new Map<string, Promise<unknown>>();
const enabled = () => process.env.NODE_ENV !== 'test';
let generation = 0;

export const catalogCache = {
  /** Cached result for `key`; concurrent misses share one load (no thundering herd on expiry). */
  async get<V>(key: string, loader: () => Promise<V>): Promise<V> {
    if (!enabled()) return loader();
    const hit = cache.get(key);
    if (hit !== undefined) return hit as V;
    const pending = inflight.get(key);
    if (pending) return pending as Promise<V>;
    const gen = generation;
    const p = loader()
      .then((v) => {
        if (gen === generation) cache.set(key, v); // don't store a value loaded before an invalidation
        return v;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  },

  invalidate(): void {
    generation++;
    cache.clear();
    inflight.clear();
  },
};

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const CATALOG_WRITERS = /\/(admin|webhooks)\//;

/** Clears the catalog cache after every successful admin / webhook mutation. */
export function catalogCacheInvalidator(req: Request, res: Response, next: NextFunction): void {
  if (MUTATING.has(req.method) && CATALOG_WRITERS.test(req.path)) {
    res.on('finish', () => {
      if (res.statusCode < 400) catalogCache.invalidate();
    });
  }
  next();
}
