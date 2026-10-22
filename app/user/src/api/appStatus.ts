import { create } from 'zustand';
import type { Localized } from '@/types';

/**
 * App-wide server status flags that block the UI: maintenance mode and forced updates.
 * Fed by `/public/app-config` on boot/foreground and by `MAINTENANCE` / `UPDATE_REQUIRED` errors.
 */
interface AppStatusState {
  maintenance: { enabled: boolean; message: Localized | null };
  update: { required: boolean; storeUrl: string | null };
  setMaintenance: (enabled: boolean, message?: Localized | null) => void;
  setUpdateRequired: (required: boolean, storeUrl?: string | null) => void;
}

export const useAppStatus = create<AppStatusState>()((set) => ({
  maintenance: { enabled: false, message: null },
  update: { required: false, storeUrl: null },
  setMaintenance: (enabled, message = null) =>
    set((s) =>
      s.maintenance.enabled === enabled && s.maintenance.message === message
        ? s
        : { maintenance: { enabled, message: message ?? s.maintenance.message } },
    ),
  setUpdateRequired: (required, storeUrl = null) =>
    set((s) =>
      s.update.required === required && s.update.storeUrl === storeUrl ? s : { update: { required, storeUrl } },
    ),
}));
