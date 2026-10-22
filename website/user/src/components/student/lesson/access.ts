import { useCallback, useMemo } from 'react';
import type { TeacherRef } from '@/api/types';
import { useAuth } from '@/hooks/useAuth';
import { AVATARS } from '@/lib/images';

/**
 * Subject access from the student's server-side entitlements (`/auth/me` → `entitlements`, ME-11).
 * A subject is unlocked while an entitlement row covers "now". The server enforces the same rule on
 * every protected endpoint (402/403 with a `locked` payload) — this is only for rendering.
 */
export function useSubjectAccess() {
  const { me } = useAuth();
  const sub = me?.subscription ?? null;
  const pkg = sub && (sub.status === 'active' || sub.status === 'trial') ? sub.package : undefined;
  const allowed = useMemo(() => {
    const now = Date.now();
    const set = new Set<string>();
    for (const e of me?.entitlements ?? []) {
      if (new Date(e.startsAt).getTime() <= now && now < new Date(e.expiresAt).getTime()) {
        set.add(e.subjectId);
        set.add(e.subjectSlug);
      }
    }
    return set;
  }, [me?.entitlements]);
  const isUnlocked = useCallback((idOrSlug: string) => allowed.has(idOrSlug), [allowed]);
  const unlockedCount = new Set((me?.entitlements ?? []).filter((e) => allowed.has(e.subjectId)).map((e) => e.subjectId)).size;
  return { pkg, isUnlocked, unlockedCount };
}

/** Teacher portrait: the teacher's own avatar when the CMS has one, else a stable placeholder portrait. */
export function teacherAvatar(slug: string, ref?: TeacherRef | null) {
  if (ref?.avatarUrl) return ref.avatarUrl;
  let h = 0;
  for (const c of slug) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATARS[h % AVATARS.length];
}
