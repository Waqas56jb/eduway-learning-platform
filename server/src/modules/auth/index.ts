import type { ModuleDefinition } from '../index.js';
import { router } from './routes.js';

export { sessions, toSessionDto, toAdminSessionDto, ADMIN_SESSION_SELECT } from './sessions.js';
export type { AuthTokens, SessionDto, AdminSessionDto } from './sessions.js';

export const authModule: ModuleDefinition = { name: 'auth', router };
