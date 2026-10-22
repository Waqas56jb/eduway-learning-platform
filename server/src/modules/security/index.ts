import type { ModuleDefinition } from '../index.js';
import { router } from './routes.js';

export { securityService, toAuditDto } from './service.js';
export type { AuditLogDto, SecurityAlertDto } from './types.js';

export const securityModule: ModuleDefinition = { name: 'security', router };
