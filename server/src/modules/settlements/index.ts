import type { ModuleDefinition } from '../index.js';
import { router } from './routes.js';

export { settlements, calculateSettlements } from './service.js';

export const settlementsModule: ModuleDefinition = { name: 'settlements', router };
