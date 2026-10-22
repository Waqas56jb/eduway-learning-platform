import type { ModuleDefinition } from '../index.js';
import { router } from './routes.js';

export { whatsappService } from './service.js';

export const whatsappModule: ModuleDefinition = { name: 'whatsapp', router };
