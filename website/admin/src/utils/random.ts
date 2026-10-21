/** Deterministic PRNG so mock data is identical on every load. */
export function createRng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min,
    float: (min: number, max: number, dp = 2) => +(next() * (max - min) + min).toFixed(dp),
    pick: <T>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)],
    bool: (p = 0.5) => next() < p,
    weighted: <T>(entries: [T, number][]): T => {
      const total = entries.reduce((s, [, w]) => s + w, 0);
      let r = next() * total;
      for (const [v, w] of entries) {
        if ((r -= w) <= 0) return v;
      }
      return entries[entries.length - 1][0];
    },
    shuffle: <T>(arr: readonly T[]): T[] => {
      const out = [...arr];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
}

export type Rng = ReturnType<typeof createRng>;

/** Fixed "now" for mock data so relative dates stay sensible. */
export const MOCK_NOW = new Date('2026-10-22T09:30:00+03:00');

export const daysAgo = (d: number, h = 0) =>
  new Date(MOCK_NOW.getTime() - d * 86_400_000 - h * 3_600_000).toISOString();
export const daysAhead = (d: number) => new Date(MOCK_NOW.getTime() + d * 86_400_000).toISOString();
