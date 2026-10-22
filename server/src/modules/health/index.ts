import type { ModuleDefinition } from '../index.js';
import { router } from './routes.js';

export { healthService } from './service.js';

export const healthModule: ModuleDefinition = { name: 'health', router };
