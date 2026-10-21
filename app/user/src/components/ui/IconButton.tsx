import { memo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Icon, type IconName } from '@/components/icons';
import { HIT_SLOP, fonts, shadows, useTheme } from '@/theme';
import { formatNumber } from '@/utils/format';
import { useLangStore } from '@/store/langStore';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

export interface IconButtonProps {
  icon: IconName;
  onPress?: () => void;
  /** Diameter of the button (min touch target is always 44). */
  size?: number;
  variant?: 'surface' | 'ghost' | 'glass' | 'accent';
  color?: string;
  /** Number shows a counter bubble, `true` shows a dot. */
  badge?: number | boolean;
  accessibilityLabel: string;
  disabled?: boolean;
  /** Fill the icon (e.g. active bookmark). */
  filled?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Circular icon button. */
export const IconButton = memo(function IconButton({
  icon,
  onPress,
  size = 44,
  variant = 'surface',
  color,
  badge,
  accessibilityLabel,
  disabled,
  filled,
  style,
}: IconButtonProps) {
  const { colors, isDark } = useTheme();
  const lang = useLangStore((s) => s.lang);

  let bg = 'transparent';
  let border: string | undefined;
  let iconColor = color ?? colors.ink;
  let shadow: ViewStyle = shadows.none;

  switch (variant) {
    case 'surface':
      bg = colors.surface;
      border = colors.border;
      shadow = isDark ? shadows.none : shadows.sm;
      break;
    case 'glass':
      bg = 'rgba(255,255,255,0.16)';
      border = 'rgba(255,255,255,0.28)';
      iconColor = color ?? '#FFFFFF';
      break;
    case 'accent':
      bg = colors.accentSoft;
      iconColor = color ?? colors.accent;
      break;
    case 'ghost':
      break;
  }

  const iconSize = Math.round(size * 0.47);
  const showCount = typeof badge === 'number' && badge > 0;
  const showDot = badge === true;
  const extraSlop = Math.max(0, (44 - size) / 2);

  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      scaleTo={0.92}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={extraSlop > 0 ? { top: extraSlop, bottom: extraSlop, left: extraSlop, right: extraSlop } : HIT_SLOP}
      style={[
        styles.base,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: bg },
        border ? { borderWidth: StyleSheet.hairlineWidth * 2, borderColor: border } : null,
        shadow,
        style,
      ]}
    >
      <Icon name={icon} size={iconSize} color={iconColor} filled={filled} />
      {showCount ? (
        <View style={[styles.count, { backgroundColor: colors.danger, borderColor: variant === 'glass' ? 'transparent' : colors.background }]}>
          <Text variant="caption" color="#FFFFFF" style={styles.countText} tabular>
            {badge > 99 ? '99+' : formatNumber(badge, lang)}
          </Text>
        </View>
      ) : null}
      {showDot ? (
        <View style={[styles.dot, { backgroundColor: colors.accent, borderColor: variant === 'glass' ? 'transparent' : colors.surface }]} />
      ) : null}
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  count: {
    position: 'absolute',
    top: -3,
    end: -3,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: { fontSize: 10, lineHeight: 12, fontFamily: fonts.bold },
  dot: {
    position: 'absolute',
    top: 8,
    end: 9,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
  },
});
