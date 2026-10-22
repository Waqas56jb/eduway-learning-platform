/**
 * Storage module — HTTP surface only. The service (bucket rules, signed URLs, upload registry, attachUpload)
 * lives in src/common/services/storage.ts so every module can use it.
 */
import type { ModuleDefinition } from '../index.js';
import { router } from './routes.js';

export { storage, PURPOSE_RULES, UPLOAD_PURPOSES } from '../../common/services/storage.js';

export const storageModule: ModuleDefinition = { name: 'storage', router };
