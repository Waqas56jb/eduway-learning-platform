import { memo } from 'react';
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon, type IconName } from '@/components/icons';
import { gradients, palette, radius, shadows, useTheme, type TypeVariant } from '@/theme';
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

const SIZES: Record<ButtonSize, { height: number; paddingH: number; icon: number; text: TypeVariant; gap: number }> = {
  lg: { height: 52, paddingH: 24, icon: 20, text: 'bodyBold', gap: 10 },
  md: { height: 44, paddingH: 18, icon: 18, text: 'bodyBold', gap: 8 },
  sm: { height: 36, paddingH: 14, icon: 16, text: 'label', gap: 6 },
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
  const s = SIZES[size];

  let background: string = 'transparent';
  let textColor: string = colors.ink;
  let borderColor: string | undefined;
  let shadow: ViewStyle = shadows.none;

  switch (variant) {
    case 'primary':
      textColor = palette.navy;
      shadow = disabled ? shadows.none : shadows.gold;
      break;
    case 'secondary':
      background = isDark ? colors.primaryLight : colors.primary;
      textColor = colors.onPrimary;
      borderColor = isDark ? colors.border : undefined;
      shadow = disabled ? shadows.none : shadows.md;
      break;
    case 'outline':
      background = 'transparent';
      textColor = colors.ink;
      borderColor = isDark ? colors.border : '#D9D0BF';
      break;
    case 'ghost':
      background = 'transparent';
      textColor = isDark ? colors.accentLight : colors.primary;
      break;
    case 'danger':
      background = colors.danger;
      textColor = '#FFFFFF';
      shadow = disabled ? shadows.none : shadows.sm;
      break;
  }

  const iconEl = icon ? <Icon name={icon} size={s.icon} color={textColor} strokeWidth={2} /> : null;
  const inactive = disabled || loading;

  return (
    <PressableScale
      onPress={onPress}
      disabled={inactive}
      disabledOpacity={loading ? 1 : 0.5}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: inactive, busy: loading }}
      testID={testID}
      style={[
        styles.base,
        {
          height: s.height,
          paddingHorizontal: s.paddingH,
          backgroundColor: background,
          borderRadius: radius.md,
        },
        borderColor ? { borderWidth: 1, borderColor } : null,
        shadow,
        fullWidth && styles.fullWidth,
        style,
      ]}
    >
      {variant === 'primary' ? (
        <View style={[StyleSheet.absoluteFill, styles.clip]} pointerEvents="none">
          <LinearGradient
            colors={gradients.gold}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          {/* Soft top sheen for a polished, metallic finish. */}
          <View style={styles.sheen} />
        </View>
      ) : null}

      <View style={[styles.row, { gap: s.gap, opacity: loading ? 0 : 1 }]}>
        {iconPosition === 'start' ? iconEl : null}
        <Text variant={s.text} color={textColor} numberOfLines={1} style={size === 'lg' ? styles.lgText : undefined}>
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
  },
  fullWidth: { alignSelf: 'stretch', width: '100%' },
  clip: { borderRadius: radius.md, overflow: 'hidden' },
  sheen: {
    position: 'absolute',
    top: 0,
    start: 0,
    end: 0,
    height: '50%',
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', justifyContent: 'center' },
  lgText: { fontSize: 16 },
});
