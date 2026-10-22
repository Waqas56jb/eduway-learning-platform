import { memo, useEffect } from 'react';
import { isRTL } from '@/utils/rtl';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { palette, useTheme } from '@/theme';
import { haptic } from '@/utils/haptics';
import { PressableScale } from './PressableScale';

export interface SwitchProps {
  value: boolean;
  onValueChange: (v: boolean) => void;
  accessibilityLabel: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

const TRACK_W = 52;
const TRACK_H = 32;
const PAD = 3;
const KNOB = TRACK_H - PAD * 2;
const TRAVEL = TRACK_W - KNOB - PAD * 2;

/** Custom gold switch with a springy white knob (RTL aware). */
export const Switch = memo(function Switch({ value, onValueChange, accessibilityLabel, disabled, style }: SwitchProps) {
  const { isDark } = useTheme();
  const progress = useSharedValue(value ? 1 : 0);
  const dir = isRTL() ? -1 : 1;

  useEffect(() => {
    progress.value = withSpring(value ? 1 : 0, { damping: 16, stiffness: 240, mass: 0.7 });
  }, [value, progress]);

  const offColor = isDark ? '#2A4670' : '#DDD5C6';
  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [offColor, palette.gold]),
  }));
  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * TRAVEL * dir }],
  }));

  return (
    <PressableScale
      onPress={() => {
        haptic.selection();
        onValueChange(!value);
      }}
      haptics={false}
      disabled={disabled}
      scaleTo={0.94}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      hitSlop={8}
      style={style}
    >
      <Animated.View style={[styles.track, trackStyle]}>
        <Animated.View style={[styles.knob, { backgroundColor: isDark ? '#F5F1E8' : '#FFFFFF' }, knobStyle]} />
      </Animated.View>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  track: {
    width: TRACK_W,
    height: TRACK_H,
    borderRadius: TRACK_H / 2,
    padding: PAD,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  knob: {
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    shadowColor: '#0B1F3A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 3,
  },
});
