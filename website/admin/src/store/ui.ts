import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { subDays, startOfYear } from 'date-fns';


export type Theme = 'light' | 'dark';
export type RangePreset = 'today' | '7d' | '30d' | '90d' | '12m' | 'ytd' | 'custom';

export interface DateRange {
  preset: RangePreset;
  from: string; // ISO date
  to: string;
}

export const THEME_KEY = 'eduway.admin.theme';

export function rangeFromPreset(preset: Exclude<RangePreset, 'custom'>): DateRange {
  const to = new Date();
  const from =
    preset === 'today' ? to
    : preset === '7d' ? subDays(to, 6)
    : preset === '30d' ? subDays(to, 29)
    : preset === '90d' ? subDays(to, 89)
    : preset === 'ytd' ? startOfYear(to)
    : subDays(to, 364);
  return { preset, from: from.toISOString(), to: to.toISOString() };
}

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* storage unavailable */
  }
}

interface UiState {
  theme: Theme;
  sidebarCollapsed: boolean;
  mobileNavOpen: boolean;
  paletteOpen: boolean;
  /** Global date range used by the dashboard and analytics pages. */
  range: DateRange;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  toggleSidebar: () => void;
  setMobileNav: (open: boolean) => void;
  setPalette: (open: boolean) => void;
  setRange: (r: DateRange) => void;
}

export const useUi = create<UiState>()(
  persist(
    (set, get) => ({
      theme: (() => {
        try {
          return (localStorage.getItem(THEME_KEY) as Theme) || 'light';
        } catch {
          return 'light';
        }
      })(),
      sidebarCollapsed: false,
      mobileNavOpen: false,
      paletteOpen: false,
      range: rangeFromPreset('30d'),
      setTheme: (theme) => {
        applyTheme(theme);
        set({ theme });
      },
      toggleTheme: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setMobileNav: (mobileNavOpen) => set({ mobileNavOpen }),
      setPalette: (paletteOpen) => set({ paletteOpen }),
      setRange: (range) => set({ range }),
    }),
    {
      name: 'eduway.admin.ui',
      partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed }) as UiState,
    },
  ),
);
