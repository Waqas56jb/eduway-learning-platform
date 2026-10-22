import type { ModuleDefinition } from '../index.js';
import { router } from './routes.js';

export { analyticsService } from './service.js';
export { exportsService, reportRows } from './exports.js';
export { rollupDailyAnalytics, loadDailyMetrics } from './metrics.js';

export const analyticsModule: ModuleDefinition = { name: 'analytics', router };
