/** Compare `a` vs `b` semver-ish strings ("2.4.0"). Returns -1, 0 or 1. Non-numeric parts count as 0. */
export function compareSemver(a: string, b: string): number {
  const pa = a.split(/[.+-]/).slice(0, 3).map((x) => Number.parseInt(x, 10) || 0);
  const pb = b.split(/[.+-]/).slice(0, 3).map((x) => Number.parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}
