import { memo, useEffect, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { Icon } from '@/components/icons';
import { palette, space, useTheme } from '@/theme';
import { haptic } from '@/utils/haptics';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

export interface CheckboxProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: ReactNode;
  disabled?: boolean;
  /** Error state (e.g. terms not accepted). */
  error?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

const SIZE = 24;

/** Gold checkbox with a springy check. */
export const Checkbox = memo(function Checkbox({ checked, onChange, label, disabled, error, accessibilityLabel, style }: CheckboxProps) {
  const { colors } = useTheme();
  const progress = useSharedValue(checked ? 1 : 0);

  useEffect(() => {
    progress.value = checked ? withSpring(1, { damping: 14, stiffness: 280 }) : withTiming(0, { duration: 140 });
  }, [checked, progress]);

  const restBorder = error ? colors.danger : colors.border;
  const boxStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(Math.min(progress.value, 1), [0, 1], [restBorder, palette.gold]),
  }));
  const fillStyle = useAnimatedStyle(() => ({
    opacity: Math.min(progress.value, 1),
    transform: [{ scale: 0.5 + progress.value * 0.5 }],
  }));
  const checkStyle = useAnimatedStyle(() => ({
    opacity: progress.value > 0.3 ? 1 : 0,
    transform: [{ scale: progress.value }, { rotate: `${(1 - Math.min(progress.value, 1)) * -20}deg` }],
  }));

  const a11yLabel = accessibilityLabel ?? (typeof label === 'string' ? label : undefined);

  return (
    <PressableScale
      onPress={() => {
        haptic.selection();
        onChange(!checked);
      }}
      haptics={false}
      disabled={disabled}
      scaleTo={0.98}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled: !!disabled }}
      accessibilityLabel={a11yLabel}
      hitSlop={8}
      style={[styles.row, style]}
    >
      <Animated.View style={[styles.box, { backgroundColor: colors.surface }, boxStyle]}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.fill, { backgroundColor: colors.accent }, fillStyle]} />
        <Animated.View style={checkStyle}>
          <Icon name="check" size={16} color={palette.navy} strokeWidth={3} />
        </Animated.View>
      </Animated.View>
      {label != null ? (
        <View style={styles.label}>
          {typeof label === 'string' ? (
            <Text variant="body" color={error ? colors.danger : colors.ink}>
              {label}
            </Text>
          ) : (
            label
          )}
        </View>
      ) : null}
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 44 },
  box: {
    width: SIZE,
    height: SIZE,
    borderRadius: 7,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  fill: { borderRadius: 5 },
  label: { flex: 1 },
});
