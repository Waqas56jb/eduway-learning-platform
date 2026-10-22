/** Shared catalog read cache (docs/PERFORMANCE.md). Pure — no database. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { catalogCache, catalogCacheInvalidator } from '../../src/common/services/catalog-cache.js';

const env = process.env.NODE_ENV;

describe('catalogCache', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'development'; // the cache is a pass-through under NODE_ENV=test
    catalogCache.invalidate();
  });
  afterEach(() => {
    process.env.NODE_ENV = env;
  });

  it('serves repeat reads from memory and collapses concurrent misses into one load', async () => {
    const loader = vi.fn(async () => [1, 2, 3]);
    const [a, b] = await Promise.all([catalogCache.get('k', loader), catalogCache.get('k', loader)]);
    await catalogCache.get('k', loader);
    expect(a).toEqual([1, 2, 3]);
    expect(b).toBe(a);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('invalidate() forces a reload and drops a value that was loading during the invalidation', async () => {
    let release!: (v: string) => void;
    const slow = catalogCache.get('k', () => new Promise<string>((r) => (release = r)));
    catalogCache.invalidate();
    release('stale');
    expect(await slow).toBe('stale');
    expect(await catalogCache.get('k', async () => 'fresh')).toBe('fresh');
  });

  it('is a pass-through under NODE_ENV=test', async () => {
    process.env.NODE_ENV = 'test';
    const loader = vi.fn(async () => 1);
    await catalogCache.get('t', loader);
    await catalogCache.get('t', loader);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('the middleware clears the cache after a successful admin mutation only', async () => {
    const run = (method: string, path: string, statusCode: number) => {
      const handlers: (() => void)[] = [];
      const res = { statusCode, on: (_e: string, fn: () => void) => handlers.push(fn) };
      catalogCacheInvalidator({ method, path } as never, res as never, () => undefined);
      handlers.forEach((h) => h());
    };
    const loader = vi.fn(async () => 'v');
    await catalogCache.get('m', loader);
    run('GET', '/api/v1/admin/lessons', 200);
    run('PATCH', '/api/v1/admin/lessons/1', 422);
    run('POST', '/api/v1/progress/watch', 200);
    await catalogCache.get('m', loader);
    expect(loader).toHaveBeenCalledTimes(1);
    run('PATCH', '/api/v1/admin/lessons/1', 200);
    await catalogCache.get('m', loader);
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
