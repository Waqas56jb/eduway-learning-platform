import type { ModuleDefinition } from '../index.js';
import { router } from './routes.js';

export { usersService, firstWord, effectiveStreak, prefsOf } from './service.js';
export type { StudentUser, MeStudentDto, NotificationPrefs } from './types.js';

export const usersModule: ModuleDefinition = { name: 'users', router };
