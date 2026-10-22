import type { AppConfigDto, GradeBandKey } from '@/api/types';

export type Grade = GradeBandKey;

/**
 * Grade band for a score using the admin-configured bands (`/public/app-config` → learning.gradeBands).
 * The exam result endpoint already returns the grade; this is for client-side previews only.
 */
export function gradeFor(pct: number, passMark: number, bands?: AppConfigDto['learning']['gradeBands']): Grade {
  const sorted = [...(bands ?? [])].sort((a, b) => b.min - a.min);
  for (const b of sorted) {
    if (b.key === 'pass' ? pct >= Math.max(b.min, passMark) : pct >= b.min) return b.key;
  }
  return pct >= passMark ? 'pass' : 'needsWork';
}
