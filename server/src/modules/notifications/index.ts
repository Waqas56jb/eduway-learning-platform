import type { ModuleDefinition } from '../index.js';
import { router } from './routes.js';

export { notify, notifyOrThrow, type NotifyInput } from './notify.js';
export { campaignsService, deliveriesService } from './service.js';
export { dispatchQueued, checkPushReceipts } from './dispatch.js';

export const notificationsModule: ModuleDefinition = { name: 'notifications', router };
