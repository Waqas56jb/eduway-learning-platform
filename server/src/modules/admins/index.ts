import type { ModuleDefinition } from '../index.js';
import { router } from './routes.js';

export { adminsService, hashPassword, passwordPolicyCheck, toAdminDtos } from './service.js';
export { adminLookups, invalidateLookups, AI_MODELS } from './lookups.js';
export type { AdminUserDto, MeAdminDto } from './types.js';

export const adminsModule: ModuleDefinition = { name: 'admins', router };
