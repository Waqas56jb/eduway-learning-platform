import '../learning-core/index.js';
import type { ModuleDefinition } from '../index.js';
import { router } from './routes.js';

export { catalogService, lessonSummariesFor, assertLessonUnlocked } from './catalog.service.js';
export { publishScheduledLessons } from './lessons.service.js';
export { markVideoProcessed, processVideoCallback } from './videos.service.js';
export type { LessonSummary, SubjectSummary } from './types.js';

export const contentModule: ModuleDefinition = { name: 'content', router };
