import { memo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { Icon } from '@/components/icons';
import { Text } from '@/components/ui';

export interface SeekRippleProps {
  /** 'start' = rewind zone, 'end' = forward zone (logical, mirrors in RTL). */
  side: 'start' | 'end';
  label: string;
}

/** Half-moon ripple + chevrons shown when double-tapping a side of the video to seek ±10s. */
export const SeekRipple = memo(function SeekRipple({ side, label }: SeekRippleProps) {
  const ripple = useSharedValue(0);
  const fade = useSharedValue(0);

  useEffect(() => {
    ripple.value = 0;
    ripple.value = withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) });
    fade.value = withSequence(withTiming(1, { duration: 90 }), withTiming(1, { duration: 360 }), withTiming(0, { duration: 260 }));
  }, [fade, ripple]);

  const zoneStyle = useAnimatedStyle(() => ({ opacity: fade.value }));
  const circleStyle = useAnimatedStyle(() => ({
    opacity: 0.35 * (1 - ripple.value),
    transform: [{ scale: 0.4 + ripple.value * 1.2 }],
  }));

  const isStart = side === 'start';
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.zone,
        isStart ? styles.start : styles.end,
        isStart ? styles.roundEnd : styles.roundStart,
        zoneStyle,
      ]}
    >
      <Animated.View style={[styles.circle, circleStyle]} />
      <View style={styles.content}>
        <View style={[styles.chevrons, isStart && styles.flip]}>
          <Icon name="chevron" size={16} color="#FFFFFF" />
          <Icon name="chevron" size={16} color="rgba(255,255,255,0.75)" />
          <Icon name="chevron" size={16} color="rgba(255,255,255,0.5)" />
        </View>
        <Text variant="label" color="#FFFFFF" tabular>
          {label}
        </Text>
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  zone: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '38%',
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  start: { start: 0 },
  end: { end: 0 },
  roundEnd: { borderTopEndRadius: 999, borderBottomEndRadius: 999 },
  roundStart: { borderTopStartRadius: 999, borderBottomStartRadius: 999 },
  circle: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: '#FFFFFF',
  },
  content: { alignItems: 'center', gap: 4 },
  chevrons: { flexDirection: 'row' },
  flip: { transform: [{ scaleX: -1 }] },
});
