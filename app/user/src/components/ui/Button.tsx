import { memo } from 'react';
import { ActivityIndicator, StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon, type IconName } from '@/components/icons';
import { useLangStore } from '@/store/langStore';
import { fontFor, gradients, lineHeightFor, palette, radius, shadows, useTheme } from '@/theme';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'lg' | 'md' | 'sm';

export interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconPosition?: 'start' | 'end';
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  /** Optional test id. */
  testID?: string;
}

const SIZES: Record<ButtonSize, { height: number; paddingH: number; icon: number; font: number; gap: number }> = {
  lg: { height: 52, paddingH: 24, icon: 20, font: 16, gap: 8 },
  md: { height: 44, paddingH: 18, icon: 18, font: 15, gap: 8 },
  sm: { height: 36, paddingH: 14, icon: 16, font: 13, gap: 6 },
};

/** Primary call to action. `primary` is the signature gold gradient with navy text. */
export const Button = memo(function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'lg',
  icon,
  iconPosition = 'start',
  loading = false,
  disabled = false,
  fullWidth = false,
  style,
  accessibilityLabel,
  testID,
}: ButtonProps) {
  const { colors, isDark } = useTheme();
  const isAr = useLangStore((s) => s.isAr);
  const s = SIZES[size];

  let background: string = 'transparent';
  let textColor: string = colors.ink;
  let borderColor: string | undefined;
  let shadow: ViewStyle = shadows.none;
  let gradient = false;

  if (disabled && !loading && variant !== 'ghost') {
    // Readable disabled state: a calm muted surface instead of a washed-out brand color.
    background = variant === 'outline' ? 'transparent' : isDark ? 'rgba(255,255,255,0.06)' : colors.surfaceMuted;
    textColor = colors.muted;
    borderColor = colors.border;
  } else {
    switch (variant) {
      case 'primary':
        gradient = true;
        textColor = palette.navy;
        shadow = shadows.gold;
        break;
      case 'secondary':
        background = isDark ? colors.primaryLight : colors.primary;
        textColor = colors.onPrimary;
        borderColor = isDark ? 'rgba(201,162,74,0.25)' : undefined;
        shadow = isDark ? shadows.none : shadows.md;
        break;
      case 'outline':
        textColor = colors.ink;
        borderColor = isDark ? 'rgba(255,255,255,0.18)' : '#D9D0BF';
        break;
      case 'ghost':
        textColor = disabled ? colors.muted : isDark ? colors.accentLight : colors.primary;
        break;
      case 'danger':
        background = colors.danger;
        textColor = '#FFFFFF';
        shadow = shadows.sm;
        break;
    }
  }

  const inactive = disabled || loading;
  const labelStyle: TextStyle = {
    fontFamily: fontFor('semibold', isAr),
    fontSize: s.font,
    lineHeight: lineHeightFor(s.font, isAr, s.font + 6),
  };
  const iconEl = icon ? <Icon name={icon} size={s.icon} color={textColor} strokeWidth={2} /> : null;

  return (
    <PressableScale
      onPress={onPress}
      disabled={inactive}
      // Disabled is expressed by colors (readable); loading keeps full opacity behind the spinner.
      disabledOpacity={1}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: inactive, busy: loading }}
      testID={testID}
      style={[
        styles.base,
        { height: s.height, paddingHorizontal: s.paddingH, backgroundColor: background },
        borderColor ? { borderWidth: StyleSheet.hairlineWidth * 2, borderColor } : null,
        shadow,
        fullWidth && styles.fullWidth,
        style,
      ]}
    >
      {gradient ? (
        <View style={[StyleSheet.absoluteFill, styles.clip]} pointerEvents="none">
          <LinearGradient colors={gradients.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          {/* Soft top highlight + 1px inner rim for a polished, metallic finish. */}
          <LinearGradient
            colors={['rgba(255,255,255,0.30)', 'rgba(255,255,255,0)']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.sheen}
          />
          <View style={styles.rim} />
        </View>
      ) : null}

      <View style={[styles.row, { gap: s.gap, opacity: loading ? 0 : 1 }]} pointerEvents="none">
        {iconPosition === 'start' ? iconEl : null}
        <Text color={textColor} numberOfLines={1} align="center" style={[styles.label, labelStyle]} maxFontSizeMultiplier={1.25}>
          {title}
        </Text>
        {iconPosition === 'end' ? iconEl : null}
      </View>

      {loading ? (
        <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
          <ActivityIndicator size="small" color={textColor} />
        </View>
      ) : null}
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    borderRadius: radius.md,
  },
  fullWidth: { alignSelf: 'stretch', width: '100%' },
  clip: { borderRadius: radius.md, overflow: 'hidden' },
  sheen: { position: 'absolute', top: 0, start: 0, end: 0, height: '55%' },
  rim: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    start: 0,
    end: 0,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', maxWidth: '100%' },
  label: { flexShrink: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
});
