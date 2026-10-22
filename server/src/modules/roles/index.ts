import type { ModuleDefinition } from '../index.js';
import { router } from './routes.js';

export { rolesService, toMatrix, normalizeMatrix, MODULE_LABELS } from './service.js';
export type { RoleDto, PermissionMatrix } from './types.js';

export const rolesModule: ModuleDefinition = { name: 'roles', router };
