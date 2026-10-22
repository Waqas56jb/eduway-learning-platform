import type { ModuleDefinition } from '../index.js';
import { router } from './routes.js';

export { packagesService } from './service.js';
export type { AdminPackage } from './types.js';

export const packagesModule: ModuleDefinition = { name: 'packages', router };
