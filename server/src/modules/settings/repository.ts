/**
 * Settings persistence lives in the shared settings store (src/common/services/settings-store.ts) and in the
 * sub-services legal.ts / cms.ts / service.ts (feature flags). This file re-exports them so the module keeps
 * the standard layout.
 */
export { settingsStore, SETTINGS_SCHEMAS, appSettingsSchema } from '../../common/services/settings-store.js';
