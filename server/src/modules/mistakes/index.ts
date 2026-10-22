import '../learning-core/index.js';
import type { ModuleDefinition } from '../index.js';
import { router } from './routes.js';

export { recordWrongAnswer, mistakeEntry, mistakesService, type AnswerFeedback, type MistakeEntry, type MistakeSource } from './service.js';

export const mistakesModule: ModuleDefinition = { name: 'mistakes', router };
