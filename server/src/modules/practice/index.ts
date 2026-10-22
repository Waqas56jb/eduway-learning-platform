import '../learning-core/index.js';
import type { ModuleDefinition } from '../index.js';
import { router } from './routes.js';

export { practiceService } from './service.js';

export const practiceModule: ModuleDefinition = { name: 'practice', router };
