import { useColorScheme } from 'react-native';
import { usePrefsStore } from '@/store/prefsStore';
import { darkColors, lightColors, type ThemeColors } from './colors';

export * from './colors';
export * from './typography';
export * from './spacing';
export * from './shadows';

export interface Theme {
  colors: ThemeColors;
  isDark: boolean;
}

/** Current theme, honoring the manual override in prefsStore ('system' | 'light' | 'dark'). */
export function useTheme(): Theme {
  const system = useColorScheme();
  const mode = usePrefsStore((s) => s.themeMode);
  const isDark = mode === 'dark' || (mode === 'system' && system === 'dark');
  return { colors: isDark ? darkColors : lightColors, isDark };
}
