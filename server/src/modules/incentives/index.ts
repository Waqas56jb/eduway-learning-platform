import type { ModuleDefinition } from '../index.js';
import { router } from './routes.js';

export { incentiveRules, activateScheduledRules, activateScheduledRules as activateScheduledIncentiveRules } from './service.js';
export { calcIncentive, validateTiers, parsePeriodKey, periodFor } from './calculator.js';

export const incentivesModule: ModuleDefinition = { name: 'incentives', router };
