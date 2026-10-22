import type { ModuleDefinition } from '../index.js';
import { router } from './routes.js';

export { subscriptionEngine, expireSubscriptionsAndRemind } from './engine.js';
export { subscriptionsService } from './service.js';

export const subscriptionsModule: ModuleDefinition = { name: 'subscriptions', router };
