import '../learning-core/index.js';
import type { ModuleDefinition } from '../index.js';
import { router } from './routes.js';

export { searchService } from './service.js';

export const searchModule: ModuleDefinition = { name: 'search', router };
