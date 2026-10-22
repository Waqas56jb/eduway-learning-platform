import type { ModuleDefinition } from '../index.js';
import { router } from './routes.js';

export { publicService } from './service.js';

export const publicModule: ModuleDefinition = { name: 'public', router };
