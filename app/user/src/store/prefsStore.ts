import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { asyncJSONStorage } from './storage';

export type ThemeMode = 'system' | 'light' | 'dark';

/**
 * True client preferences only (theme, onboarding). Notification preferences are server state:
 * `useNotificationPrefs` / `useUpdateNotificationPrefs` in `@/api` (ME-09 / ME-10).
 */
interface PrefsState {
  themeMode: ThemeMode;
  onboardingSeen: boolean;
  hydrated: boolean;
  setThemeMode: (mode: ThemeMode) => void;
  setOnboardingSeen: (seen: boolean) => void;
}

export const usePrefsStore = create<PrefsState>()(
  persist(
    (set) => ({
      themeMode: 'system',
      onboardingSeen: false,
      hydrated: false,
      setThemeMode: (themeMode) => set({ themeMode }),
      setOnboardingSeen: (onboardingSeen) => set({ onboardingSeen }),
    }),
    {
      name: 'eduway.prefs',
      storage: asyncJSONStorage,
      partialize: ({ themeMode, onboardingSeen }) => ({ themeMode, onboardingSeen }),
      onRehydrateStorage: () => () => usePrefsStore.setState({ hydrated: true }),
    },
  ),
);
