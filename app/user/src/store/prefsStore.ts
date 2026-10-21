import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { asyncJSONStorage } from './storage';

export type ThemeMode = 'system' | 'light' | 'dark';

export interface NotificationPrefs {
  lessons: boolean;
  exams: boolean;
  payments: boolean;
  progress: boolean;
}

interface PrefsState {
  themeMode: ThemeMode;
  onboardingSeen: boolean;
  notificationPrefs: NotificationPrefs;
  hydrated: boolean;
  setThemeMode: (mode: ThemeMode) => void;
  setOnboardingSeen: (seen: boolean) => void;
  setNotificationPref: (key: keyof NotificationPrefs, value: boolean) => void;
}

export const usePrefsStore = create<PrefsState>()(
  persist(
    (set) => ({
      themeMode: 'system',
      onboardingSeen: false,
      notificationPrefs: { lessons: true, exams: true, payments: true, progress: false },
      hydrated: false,
      setThemeMode: (themeMode) => set({ themeMode }),
      setOnboardingSeen: (onboardingSeen) => set({ onboardingSeen }),
      setNotificationPref: (key, value) =>
        set((s) => ({ notificationPrefs: { ...s.notificationPrefs, [key]: value } })),
    }),
    {
      name: 'eduway.prefs',
      storage: asyncJSONStorage,
      partialize: ({ hydrated: _h, ...rest }) => rest,
      onRehydrateStorage: () => () => usePrefsStore.setState({ hydrated: true }),
    },
  ),
);
