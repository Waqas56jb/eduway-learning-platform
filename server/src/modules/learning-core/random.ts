/**
 * Deterministic pseudo-randomness (seeded) for quiz sets, option shuffles, practice draws and exam papers.
 * Seeds make results reproducible (tests, alternative sets stable per lesson) while still varying per attempt.
 */

/** 32-bit string hash (xmur3 finalizer). */
export function hashSeed(input: string): number {
  let h = 1779033703 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    h = Math.imul(h ^ input.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

/** mulberry32 PRNG → floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rng = () => number;

export const rngFor = (seed: string): Rng => mulberry32(hashSeed(seed));

/** Fisher–Yates on a copy. */
export function shuffle<T>(items: readonly T[], rnd: Rng): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

/** `n` distinct items (all when n ≥ length). */
export function sample<T>(items: readonly T[], n: number, rnd: Rng): T[] {
  return shuffle(items, rnd).slice(0, Math.max(0, n));
}
