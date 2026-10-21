import { memo } from 'react';
import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { useLangStore } from '@/store/langStore';
import { tabular as tabularStyle, textStyle, useTheme, type ThemeColors, type TypeVariant } from '@/theme';

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
  const base = textStyle(display ? (variant === 'display' ? 'display' : 'h1') : variant, isAr);
  const sized: TextStyle = display ? { ...base, fontSize: textStyle(variant, isAr).fontSize, lineHeight: textStyle(variant, isAr).lineHeight } : base;
  const resolvedColor = (colors as unknown as Record<string, string>)[color] ?? color;
  // RN mirrors 'left'/'right' under native RTL, so 'right' == end; 'auto' follows the reading direction.
  const textAlign: TextStyle['textAlign'] = align === 'start' ? 'auto' : align === 'end' ? 'right' : align;
  return (
    <RNText
      maxFontSizeMultiplier={1.4}
      {...rest}
      style={[sized, { color: resolvedColor, textAlign, writingDirection: isAr ? 'rtl' : 'ltr' }, tabular && tabularStyle, style]}
    />
  );
});
