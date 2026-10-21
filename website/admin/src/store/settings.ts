import { create } from 'zustand';
import {
  appSettings,
  featureFlags,
  generalSettings,
  legalVersions,
  otpSettings,
  supportContacts,
  type AppSettings,
  type GeneralSettings,
  type OtpSettings,
  type SupportContacts,
} from '@/data/settings';
import { diff, logAudit } from './audit';
import { createCollection } from './createCollection';

interface SingletonState<T> {
  value: T;
  save: (next: T) => boolean;
}

/** Singleton settings store; saving writes a before/after audit entry under `settings.update`. */
function createSingleton<T extends object>(entityId: string, label: string, initial: T) {
  return create<SingletonState<T>>()((set, get) => ({
    value: initial,
    save: (next) => {
      const d = diff(get().value, next);
      if (!d.changed) return false;
      set({ value: next });
      logAudit({
        action: 'settings.update',
        entity: 'settings',
        entityId,
        summary: `Updated ${label} settings (${Object.keys(d.after).join(', ')})`,
        before: d.before,
        after: d.after,
      });
      return true;
    },
  }));
}

export const useGeneralSettings = createSingleton<GeneralSettings>('general', 'general', generalSettings);
export const useOtpSettings = createSingleton<OtpSettings>('otp', 'OTP', otpSettings);
export const useAppSettings = createSingleton<AppSettings>('app', 'app', appSettings);
export const useSupportContacts = createSingleton<SupportContacts>('support', 'support contact', supportContacts);

export const useFeatureFlags = createCollection('feature_flag', featureFlags, (f) => f.name_en);
export const useLegalVersions = createCollection('legal_document', legalVersions, (l) => `${l.doc} v${l.version}`);
