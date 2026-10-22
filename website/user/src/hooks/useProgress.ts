import { useMemo } from 'react';
import { useBookmarks } from '@/api/bookmarks';
import { useUnreadCount } from '@/api/notifications';
import { useProgressSummary, useSubjectProgress } from '@/api/progress';
import type { SubjectProgressDto } from '@/api/types';

/** Student-wide state shared by many widgets: unread badge (NTF-02) and bookmarks (BMK-02/03/04). */
export function useStudent() {
  const unread = useUnreadCount();
  const bookmarks = useBookmarks();
  return { unreadCount: unread.data?.unreadCount ?? 0, ...bookmarks };
}

/** Per-subject (PRG-05, keyed by slug) and overall (PRG-06) progress numbers. */
export function useProgress() {
  const subjectsQ = useSubjectProgress();
  const summaryQ = useProgressSummary();
  return useMemo(() => {
    const bySubject: Record<string, SubjectProgressDto> = {};
    for (const s of subjectsQ.data ?? []) {
      bySubject[s.slug] = s;
      bySubject[s.subjectId] = s;
    }
    const sm = summaryQ.data;
    return {
      bySubject,
      subjects: subjectsQ.data ?? [],
      summary: sm,
      completedLessons: sm?.completedLessons ?? 0,
      totalLessons: sm?.totalLessons ?? 0,
      overallPct: sm?.overallPct ?? 0,
      isLoading: subjectsQ.isLoading || summaryQ.isLoading,
      isError: subjectsQ.isError || summaryQ.isError,
      refetch: () => {
        void subjectsQ.refetch();
        void summaryQ.refetch();
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectsQ.data, summaryQ.data, subjectsQ.isLoading, summaryQ.isLoading, subjectsQ.isError, summaryQ.isError]);
}
