/** Tiny in-process TTL cache (single instance deployments; invalidate explicitly on writes). */
export class TtlCache<V> {
  private readonly store = new Map<string, { v: V; exp: number }>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 5000,
  ) {}

  get(key: string): V | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (hit.exp < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return hit.v;
  }

  set(key: string, v: V, ttlMs = this.ttlMs): void {
    if (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, { v, exp: Date.now() + ttlMs });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  /** Delete every key starting with `prefix`. */
  deletePrefix(prefix: string): void {
    for (const k of this.store.keys()) if (k.startsWith(prefix)) this.store.delete(k);
  }

  clear(): void {
    this.store.clear();
  }

  async getOrLoad(key: string, loader: () => Promise<V>, ttlMs = this.ttlMs): Promise<V> {
    const hit = this.get(key);
    if (hit !== undefined) return hit;
    const v = await loader();
    this.set(key, v, ttlMs);
    return v;
  }
}
