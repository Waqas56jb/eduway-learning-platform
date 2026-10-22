import type { ModuleDefinition } from '../index.js';
import { router } from './routes.js';

export { promotionsService } from './service.js';
export { evaluatePromotion, discountFor, promoPhase } from './engine.js';

export const promotionsModule: ModuleDefinition = { name: 'promotions', router };
