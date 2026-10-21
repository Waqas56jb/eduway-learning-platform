import type { TextStyle } from 'react-native';

/** Font family names as registered with expo-font in app/_layout.tsx. */
export const fonts = {
  display: 'PlayfairDisplay_700Bold',
  displayHeavy: 'PlayfairDisplay_800ExtraBold',
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  arRegular: 'Tajawal_400Regular',
  arMedium: 'Tajawal_500Medium',
  arBold: 'Tajawal_700Bold',
  arHeavy: 'Tajawal_800ExtraBold',
} as const;

export type TypeVariant =
  | 'display'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'body'
  | 'bodyMedium'
  | 'bodyBold'
  | 'label'
  | 'caption'
  | 'overline';
export type FontWeightKey = 'regular' | 'medium' | 'semibold' | 'bold' | 'display';

/** Size/line-height scale (font family is resolved per language by `fontFor`). */
export const typeScale: Record<
  TypeVariant,
  { size: number; lineHeight: number; weight: FontWeightKey; letterSpacing?: number }
> = {
  display: { size: 34, lineHeight: 40, weight: 'display', letterSpacing: -0.4 },
  h1: { size: 28, lineHeight: 34, weight: 'display', letterSpacing: -0.2 },
  h2: { size: 22, lineHeight: 28, weight: 'bold' },
  h3: { size: 18, lineHeight: 24, weight: 'semibold' },
  body: { size: 15, lineHeight: 22, weight: 'regular' },
  bodyMedium: { size: 15, lineHeight: 22, weight: 'medium' },
  bodyBold: { size: 15, lineHeight: 22, weight: 'bold' },
  label: { size: 13, lineHeight: 18, weight: 'semibold' },
  caption: { size: 12, lineHeight: 16, weight: 'regular' },
  overline: { size: 11, lineHeight: 14, weight: 'bold', letterSpacing: 1.2 },
};

/** Resolve a font family for a weight in the current language (Tajawal for Arabic). */
export function fontFor(weight: FontWeightKey, isAr: boolean): string {
  if (isAr) {
    switch (weight) {
      case 'regular':
        return fonts.arRegular;
      case 'medium':
        return fonts.arMedium;
      case 'semibold':
      case 'bold':
        return fonts.arBold;
      case 'display':
        return fonts.arHeavy;
    }
  }
  switch (weight) {
    case 'regular':
      return fonts.regular;
    case 'medium':
      return fonts.medium;
    case 'semibold':
      return fonts.semibold;
    case 'bold':
      return fonts.bold;
    case 'display':
      return fonts.display;
  }
}

export function textStyle(variant: TypeVariant, isAr: boolean): TextStyle {
  const s = typeScale[variant];
  return {
    fontFamily: fontFor(s.weight, isAr),
    fontSize: s.size,
    // Tajawal sits higher; give Arabic a touch more line height.
    lineHeight: isAr ? Math.round(s.lineHeight * 1.12) : s.lineHeight,
    letterSpacing: isAr ? 0 : s.letterSpacing,
  };
}

/** Tabular numbers for timers/scores. */
export const tabular: TextStyle = { fontVariant: ['tabular-nums'] };
