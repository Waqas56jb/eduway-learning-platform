import type { ModuleDefinition } from '../index.js';
import { router } from './routes.js';

export { schoolsService } from './service.js';
export type { SchoolDto } from './service.js';

export const schoolsModule: ModuleDefinition = { name: 'schools', router };
