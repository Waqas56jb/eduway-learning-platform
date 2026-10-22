/** Content DTOs (API_CONTRACT §1.6, §21). */
import type { Localized } from '../../common/i18n/index.js';
import type { SubjectRef } from '../../common/dto/refs.js';
import type { LessonLockReason } from '../learning-core/index.js';
import type { ContentStatus } from './schemas.js';

export interface TeacherRef {
  id: string;
  name: Localized;
  avatarUrl: string | null;
}

export interface SubjectSummary {
  id: string;
  slug: string;
  name: Localized;
  tagline: Localized;
  description: Localized;
  color: string;
  image: string;
  icon: string;
  lessonsCount: number;
  hours: number;
  questionsCount: number;
  examsCount: number;
  teacher: Localized;
  teacherRef: TeacherRef | null;
  order: number;
  sequentialUnlock: boolean;
  locked: boolean | null;
  progress: { completed: number; total: number; pct: number; avgPct: number } | null;
}

export interface LessonSummary {
  id: string;
  subjectId: string;
  subjectSlug: string;
  unitId: string;
  chapterId: string;
  topicId: string;
  order: number;
  title: Localized;
  description: Localized;
  duration: number;
  thumbnail: string;
  teacher: Localized;
  teacherRef: TeacherRef | null;
  locked: boolean;
  lockReason: LessonLockReason | null;
  status: 'completed' | 'in-progress' | 'not-started';
  progress: number;
  positionSec: number;
}

export interface SubjectDetail extends SubjectSummary {
  units: { id: string; title: Localized; order: number; chapters: { id: string; title: Localized }[] }[];
  lessons: LessonSummary[];
  nextLessonId: string | null;
}

export interface StudentResource {
  id: string;
  title: Localized;
  size: string;
  sizeBytes: number;
  pages: number | null;
  mimeType: string;
}

export interface LessonDetail extends LessonSummary {
  videoUrl: null;
  hasVideo: boolean;
  resources: StudentResource[];
  completionThreshold: number;
  prerequisiteId: string | null;
  unitTitle: Localized;
  unitIndex: number;
  prevLessonId: string | null;
  nextLessonId: string | null;
  unitProgress: { done: number; total: number };
  bestQuizScore: number | null;
  quiz: { available: boolean; questionCount: number; estimatedMinutes: number; passThreshold: number };
  note: string;
}

export interface StreamUrlDto {
  url: string;
  type: 'hls' | 'mp4';
  expiresAt: string;
  renditions: { quality: '1080p' | '720p' | '480p' | '360p'; url: string }[];
  captions: { lang: 'en' | 'ar'; label: Localized; url: string }[];
  poster: string;
  durationSec: number;
  resumePositionSec: number;
  heartbeatSeconds: number;
}

export interface TeacherDto {
  id: string;
  name: Localized;
  bio: Localized;
  avatarUrl: string | null;
  subjectId: string;
  subjectSlug: string;
  yearsExperience: number | null;
  studentsCount: number | null;
  rating: number | null;
  active: boolean;
}

/** ADM-TCH-* response: TeacherDto + lessons referencing the teacher. */
export interface AdminTeacherDto extends TeacherDto {
  lessonsCount: number;
}

export interface AdminSubject {
  id: string;
  slug: string;
  name: Localized;
  tagline: Localized;
  description: Localized;
  color: string;
  icon: string;
  imageUrl: string | null;
  order: number;
  status: 'active' | 'hidden';
  sequentialUnlock: boolean;
  stats: { units: number; topics: number; lessons: number; published: number; publishedPct: number; questions: number };
  createdAt: string;
  updatedAt: string;
}

export interface AdminTopic {
  id: string;
  unitId: string;
  name: Localized;
  order: number;
  lessonCount: number;
}
export interface AdminUnit {
  id: string;
  subjectId: string;
  name: Localized;
  order: number;
  topicCount: number;
  lessonCount: number;
  topics: AdminTopic[];
}

export type VideoState = 'none' | 'uploading' | 'processing' | 'ready' | 'failed';

export interface LessonVersion {
  id: string;
  version: number;
  author: { id: string; name: Localized; avatarUrl: string | null };
  note: string;
  status: ContentStatus;
  createdAt: string;
}

export interface AdminLessonResource {
  id: string;
  name: string;
  title: Localized;
  sizeKb: number;
  pages: number | null;
  mimeType: string;
  url: string;
}

export interface AdminLesson {
  id: string;
  subjectId: string;
  unitId: string;
  topicId: string;
  subject: SubjectRef;
  unit: { id: string; name: Localized; order: number };
  topic: { id: string; name: Localized; order: number; unitId: string };
  title: Localized;
  description: Localized;
  teacherId: string;
  teacher: TeacherRef;
  order: number;
  durationSec: number;
  thumbnailUrl: string | null;
  videoState: VideoState;
  video: { id: string; assetId: string; streamStatus: 'ready' | 'processing' | 'failed'; fileName: string | null; sizeMb: number; renditions: string[] } | null;
  captions: string | null;
  captionTracks: { lang: 'en' | 'ar'; fileName: string; url: string }[];
  resources: AdminLessonResource[];
  completionThreshold: number;
  prerequisiteId: string | null;
  status: ContentStatus;
  publishAt: string | null;
  views: number;
  versions: LessonVersion[];
  createdAt: string;
  updatedAt: string;
}

export interface VideoAssetDto {
  id: string;
  assetId: string;
  lessonId: string;
  lesson: { id: string; title: Localized; subject: SubjectRef };
  fileName: string | null;
  sizeMb: number;
  durationSec: number;
  streamStatus: 'ready' | 'processing' | 'failed';
  cdnStatus: 'synced' | 'pending' | 'error';
  processingProgress: number | null;
  error: string | null;
  views: number;
  replays: number;
  resolution: '720p' | '1080p' | '4K';
  renditions: string[];
  uploadedAt: string;
}
