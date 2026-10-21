/** 4-pt grid. */
export const space = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
} as const;

export const SCREEN_PADDING = 20;

export const radius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

export const BUTTON_HEIGHT = 52;
export const HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 } as const;
/** Bottom padding for tab screens so content clears the floating tab bar. */
export const TAB_BAR_SPACE = 110;
