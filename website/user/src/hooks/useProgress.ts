import { useContext, useMemo } from 'react';
import { StudentContext } from '@/context/StudentContext';
import { lessons, subjects } from '@/data';
import type { SubjectId } from '@/types';

/** Access to the student's mutable learning state (progress, mistakes, bookmarks, …). */
export function useStudent() {
  const ctx = useContext(StudentContext);
  if (!ctx) throw new Error('useStudent must be used inside <StudentProvider>');
  return ctx;
}

/** Derived progress numbers per subject and overall. */
export function useProgress() {
  const student = useStudent();
  const { lessonProgress } = student;

  return useMemo(() => {
    const bySubject = {} as Record<SubjectId, { completed: number; total: number; pct: number }>;
    for (const s of subjects) {
      const ls = lessons.filter((l) => l.subjectId === s.id);
      const completed = ls.filter((l) => lessonProgress[l.id]?.status === 'completed').length;
      bySubject[s.id] = { completed, total: ls.length, pct: Math.round((completed / ls.length) * 100) };
    }
    const completed = lessons.filter((l) => lessonProgress[l.id]?.status === 'completed').length;
    return {
      ...student,
      bySubject,
      completedLessons: completed,
      totalLessons: lessons.length,
      overallPct: Math.round((completed / lessons.length) * 100),
    };
  }, [student, lessonProgress]);
}
