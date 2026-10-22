export type ClassValue = string | number | false | null | undefined | ClassValue[];

/** Tiny className joiner (no tailwind-merge needed for this codebase). */
export function cn(...xs: ClassValue[]): string {
  const out: string[] = [];
  for (const x of xs) {
    if (!x) continue;
    if (Array.isArray(x)) out.push(cn(...x));
    else out.push(String(x));
  }
  return out.join(' ');
}

/** 754 → "12:34", 3725 → "1:02:05" */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

/** Duration in whole minutes, rounded up. */
export const toMinutes = (seconds: number) => Math.ceil(seconds / 60);

/** Fisher–Yates shuffle (returns a new array). */
export function shuffle<T>(arr: readonly T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Time-of-day bucket for greetings. */
export function dayPart(d = new Date()): 'morning' | 'afternoon' | 'evening' {
  const h = d.getHours();
  if (h < 12) return 'morning';
  if (h < 18) return 'afternoon';
  return 'evening';
}

/** 48213 → "48K+", 950 → "900+" (marketing counters; rounded down). */
export function compactCount(n: number, fmt: (n: number) => string = (x) => x.toLocaleString('en-US')): string {
  if (n >= 1_000_000) return `${fmt(Math.floor(n / 100_000) / 10)}M+`;
  if (n >= 10_000) return `${fmt(Math.floor(n / 1000))}K+`;
  if (n >= 100) return `${fmt(Math.floor(n / 100) * 100)}+`;
  return fmt(n);
}
