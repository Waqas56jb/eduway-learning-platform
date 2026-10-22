import { memo } from 'react';
import { StyleSheet, Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { useLangStore } from '@/store/langStore';
import { lineHeightFor, tabular as tabularStyle, textStyle, useTheme, type ThemeColors, type TypeVariant } from '@/theme';

export interface TextProps extends RNTextProps {
  variant?: TypeVariant;
  /** Theme color key or any color string. Defaults to `ink`. */
  color?: keyof ThemeColors | (string & {});
  align?: 'auto' | 'start' | 'center' | 'end';
  /** Use tabular figures (timers, scores). */
  tabular?: boolean;
  /** Force Playfair/Tajawal-heavy display face regardless of variant. */
  display?: boolean;
}

/**
 * Themed, language-aware text. Picks Inter/Playfair for English and Tajawal for Arabic,
 * and aligns to the reading direction ("start") by default.
 *
 * Alignment under native RTL: 'auto' (natural) + writingDirection follows the reading direction, and
 * React Native swaps 'left'/'right' when the layout is RTL, so 'right' always means the END edge.
 * If a caller overrides `fontSize` without a `lineHeight`, a matching line height is derived so
 * glyphs (Arabic diacritics, descenders) never clip.
 */
export const Text = memo(function Text({
  variant = 'body',
  color = 'ink',
  align = 'start',
  tabular,
  display,
  style,
  ...rest
}: TextProps) {
  const { colors } = useTheme();
  const isAr = useLangStore((s) => s.isAr);
  const own = textStyle(variant, isAr);
  const base: TextStyle = display
    ? { ...textStyle(variant === 'display' ? 'display' : 'h1', isAr), fontSize: own.fontSize, lineHeight: own.lineHeight }
    : own;
  const resolvedColor = (colors as unknown as Record<string, string>)[color] ?? color;
  const textAlign: TextStyle['textAlign'] = align === 'start' ? 'auto' : align === 'end' ? 'right' : align;

  let fix: TextStyle | null = null;
  if (style) {
    const flat = StyleSheet.flatten(style);
    if (flat && typeof flat.fontSize === 'number' && flat.lineHeight == null && flat.fontSize !== base.fontSize) {
      fix = { lineHeight: lineHeightFor(flat.fontSize, isAr) };
    }
  }

  return (
    <RNText
      maxFontSizeMultiplier={1.4}
      {...rest}
      style={[base, { color: resolvedColor, textAlign, writingDirection: isAr ? 'rtl' : 'ltr' }, tabular && tabularStyle, style, fix]}
    />
  );
});
