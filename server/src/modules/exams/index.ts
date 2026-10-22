import '../learning-core/index.js';
import type { ModuleDefinition } from '../index.js';
import { router } from './routes.js';

export { autoSubmitExpiredAttempts, examsService, type ExamCard, type UpcomingExamDto } from './student.service.js';
export { blueprintsService } from './blueprints.service.js';

export const examsModule: ModuleDefinition = { name: 'exams', router };
