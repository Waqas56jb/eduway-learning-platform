import type { SubjectId } from '@/types';

/** Brand palette — fixed values that never change with the color scheme. */
export const palette = {
  navy: '#0B1F3A',
  navyLight: '#15325C',
  navy900: '#071426',
  gold: '#C9A24A',
  goldLight: '#E6C77A',
  goldSoft: 'rgba(201,162,74,0.12)',
  cream: '#FAF7F2',
  white: '#FFFFFF',
  black: '#000000',
  success: '#16A34A',
  warning: '#F59E0B',
  danger: '#DC2626',
  info: '#2563EB',
} as const;

export const subjectColors: Record<SubjectId, string> = {
  math: '#2563EB',
  physics: '#7C3AED',
  chemistry: '#059669',
  biology: '#DB2777',
  english: '#EA580C',
};

export interface ThemeColors {
  primary: string;
  primaryLight: string;
  navy900: string;
  accent: string;
  accentLight: string;
  accentSoft: string;
  background: string;
  surface: string;
  surfaceMuted: string;
  surfaceElevated: string;
  ink: string;
  muted: string;
  border: string;
  /** Text/icons drawn on top of `primary` (navy) */
  onPrimary: string;
  /** Text/icons drawn on top of `accent` (gold) */
  onAccent: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  info: string;
  infoSoft: string;
  overlay: string;
  skeleton: string;
  skeletonHighlight: string;
  tabBar: string;
}

export const lightColors: ThemeColors = {
  primary: palette.navy,
  primaryLight: palette.navyLight,
  navy900: palette.navy900,
  accent: palette.gold,
  accentLight: palette.goldLight,
  accentSoft: palette.goldSoft,
  background: palette.cream,
  surface: '#FFFFFF',
  surfaceMuted: '#F3EFE7',
  surfaceElevated: '#FFFFFF',
  ink: '#111827',
  muted: '#6B7280',
  border: '#E8E2D6',
  onPrimary: '#FFFFFF',
  onAccent: palette.navy,
  success: palette.success,
  successSoft: 'rgba(22,163,74,0.12)',
  warning: palette.warning,
  warningSoft: 'rgba(245,158,11,0.14)',
  danger: palette.danger,
  dangerSoft: 'rgba(220,38,38,0.10)',
  info: palette.info,
  infoSoft: 'rgba(37,99,235,0.10)',
  overlay: 'rgba(7,20,38,0.55)',
  skeleton: '#EDE7DB',
  skeletonHighlight: '#F8F4EC',
  tabBar: 'rgba(255,255,255,0.82)',
};

export const darkColors: ThemeColors = {
  primary: palette.navy,
  primaryLight: palette.navyLight,
  navy900: palette.navy900,
  accent: palette.gold,
  accentLight: palette.goldLight,
  accentSoft: 'rgba(201,162,74,0.16)',
  background: '#071426',
  surface: '#0E2342',
  surfaceMuted: '#132B4F',
  surfaceElevated: '#15325C',
  ink: '#F5F1E8',
  muted: '#9AA6B8',
  border: '#1E3A63',
  onPrimary: '#FFFFFF',
  onAccent: palette.navy,
  success: '#22C55E',
  successSoft: 'rgba(34,197,94,0.16)',
  warning: '#FBBF24',
  warningSoft: 'rgba(251,191,36,0.16)',
  danger: '#F87171',
  dangerSoft: 'rgba(248,113,113,0.16)',
  info: '#60A5FA',
  infoSoft: 'rgba(96,165,250,0.16)',
  overlay: 'rgba(0,0,0,0.6)',
  skeleton: '#132B4F',
  skeletonHighlight: '#1B3A66',
  tabBar: 'rgba(14,35,66,0.85)',
};

export const gradients = {
  gold: ['#E6C77A', '#C9A24A', '#A9832F'] as const,
  navy: ['#15325C', '#0B1F3A', '#071426'] as const,
  imageOverlay: ['rgba(7,20,38,0)', 'rgba(7,20,38,0.55)', 'rgba(7,20,38,0.92)'] as const,
};
