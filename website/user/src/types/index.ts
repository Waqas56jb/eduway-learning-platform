/**
 * App-wide types. The API DTOs (docs/API_CONTRACT.md) are the source of truth; the historical UI names
 * are kept as aliases so components read naturally.
 */
export * from '@/api/types';

import type {
  ExamCard,
  LessonSummary,
  MistakeEntry,
  PackagePublic,
  SessionDto,
  StudentUser,
  SubjectSlug,
  SubjectSummary,
} from '@/api/types';

/** Subject slug (`math`, `physics`, …) — admins may add more, so it is an open string. */
export type SubjectId = SubjectSlug;
export type Subject = SubjectSummary;
export type Lesson = LessonSummary;
export type Package = PackagePublic;
export type Session = SessionDto;
export type User = StudentUser;
export type Mistake = MistakeEntry;
export type ExamBlueprint = ExamCard;
