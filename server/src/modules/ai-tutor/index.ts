import type { ModuleDefinition } from '../index.js';
import { router } from './routes.js';

export { aiTutorService } from './service.js';
export { aiAdminService } from './admin.service.js';
export { providerFor, setProviderOverride, MockAiProvider } from './providers/index.js';

export const aiTutorModule: ModuleDefinition = { name: 'ai-tutor', router };
