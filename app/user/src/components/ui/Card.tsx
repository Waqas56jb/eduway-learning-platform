import { memo } from 'react';
import { StyleSheet, View, type ViewProps, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { gradients, radius, shadows, space, useTheme } from '@/theme';
import { PressableScale } from './PressableScale';

export type CardVariant = 'surface' | 'muted' | 'navy' | 'gold';

export interface CardProps extends ViewProps {
  padded?: boolean;
  elevated?: boolean;
  onPress?: () => void;
  variant?: CardVariant;
  /** Disable the press interaction while keeping the layout. */
  disabled?: boolean;
}

/** Rounded content container with a hairline border and soft elevation. */
export const Card = memo(function Card({
  padded = true,
  elevated = true,
  onPress,
  variant = 'surface',
  disabled,
  style,
  children,
  accessibilityRole,
  ...rest
}: CardProps) {
  const { colors, isDark } = useTheme();

  const isGradient = variant === 'gold' || variant === 'navy';
  const bg =
    variant === 'muted' ? colors.surfaceMuted : variant === 'surface' ? colors.surface : 'transparent';
  const borderColor =
    variant === 'gold'
      ? 'rgba(255,255,255,0.28)'
      : variant === 'navy'
        ? 'rgba(201,162,74,0.28)'
        : colors.border;
  const shadow: ViewStyle = !elevated
    ? shadows.none
    : variant === 'gold'
      ? shadows.gold
      : isDark
        ? shadows.sm
        : variant === 'muted'
          ? shadows.none
          : shadows.md;

  const containerStyle = [
    styles.base,
    { backgroundColor: bg, borderColor },
    shadow,
    padded && styles.padded,
    style,
  ];

  const background = isGradient ? (
    <View style={[StyleSheet.absoluteFill, styles.clip]} pointerEvents="none">
      <LinearGradient
        colors={variant === 'gold' ? gradients.gold : gradients.navy}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  ) : null;

  if (onPress) {
    return (
      <PressableScale
        onPress={onPress}
        disabled={disabled}
        scaleTo={0.98}
        accessibilityRole={accessibilityRole ?? 'button'}
        style={containerStyle}
        {...rest}
      >
        {background}
        {children}
      </PressableScale>
    );
  }

  return (
    <View style={containerStyle} accessibilityRole={accessibilityRole} {...rest}>
      {background}
      {children}
    </View>
  );
});

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  padded: { padding: space.lg },
  clip: { borderRadius: radius.lg, overflow: 'hidden' },
});
