import { useCallback, useMemo } from 'react';
import { demoUser, getPackage, subjects } from '@/data';
import { useAuth } from '@/hooks/useAuth';
import { AVATARS } from '@/lib/images';
import type { SubjectId } from '@/types';

/**
 * Subject access derived from the student's subscription package.
 * A subject (and all of its lessons) is unlocked only when it is part of the active package.
 */
export function useSubjectAccess() {
  const { user } = useAuth();
  const pkg = getPackage((user ?? demoUser).packageId);
  const allowed = useMemo(() => new Set<SubjectId>(pkg?.subjects ?? []), [pkg]);
  const isUnlocked = useCallback((sid: SubjectId) => allowed.has(sid), [allowed]);
  const unlockedCount = subjects.filter((s) => allowed.has(s.id)).length;
  return { pkg, isUnlocked, unlockedCount };
}

const TEACHER_AVATAR_INDEX: Record<SubjectId, number> = { math: 0, physics: 2, chemistry: 1, biology: 3, english: 5 };

/** Teacher portrait for a subject (mock data has no teacher photos; pick a stable avatar). */
export const teacherAvatar = (sid: SubjectId) => AVATARS[TEACHER_AVATAR_INDEX[sid]] ?? AVATARS[0];
