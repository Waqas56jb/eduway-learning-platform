import '../learning-core/index.js';
import type { ModuleDefinition } from '../index.js';
import { router } from './routes.js';

export { progressService } from './service.js';

export const progressModule: ModuleDefinition = { name: 'progress', router };
