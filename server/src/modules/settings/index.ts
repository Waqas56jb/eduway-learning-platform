import type { ModuleDefinition } from '../index.js';
import { router } from './routes.js';

export { getSection, putSection, flagsService, diffKeys, SECTIONS } from './service.js';
export { legalService, parseLegalMarkdown } from './legal.js';
export { cmsService } from './cms.js';
export type { FeatureFlagDto, AppSettingsDto } from './service.js';
export type { LegalVersionDto, LegalDocumentDto } from './legal.js';

export const settingsModule: ModuleDefinition = { name: 'settings', router };
