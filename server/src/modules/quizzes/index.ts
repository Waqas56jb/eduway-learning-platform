import '../learning-core/index.js';
import type { ModuleDefinition } from '../index.js';
import { router } from './routes.js';

export { quizzesService, answerRecords, type AnswerRecord } from './service.js';
export { effectiveRule, effectiveQuizRuleDto, lessonPool } from './engine.js';

export const quizzesModule: ModuleDefinition = { name: 'quizzes', router };
