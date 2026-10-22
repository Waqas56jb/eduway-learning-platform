import type { ModuleDefinition } from '../index.js';
import { router } from './routes.js';

export { marketersService } from './service.js';
export { decideAttribution } from './attribution.js';
export { awardMilestones, awardAllMilestones } from './milestones.js';

export const marketersModule: ModuleDefinition = { name: 'marketers', router };
