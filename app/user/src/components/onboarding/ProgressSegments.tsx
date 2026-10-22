import { memo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { EASE_OUT, ink } from './tokens';

const SEG = 14;
const SEG_ACTIVE = 44;
const H = 4;

const Segment = memo(function Segment({
  i,
  index,
  progress,
}: {
  i: number;
  index: number;
  progress: SharedValue<number>;
}) {
  const fill = useSharedValue(i < index ? 1 : 0);

  useEffect(() => {
    const target = i <= index ? 1 : 0;
    fill.value = withTiming(target, { duration: i === index ? 900 : 320, easing: EASE_OUT });
  }, [fill, i, index]);

  // Width follows the finger: the segment nearest the current position widens.
  const track = useAnimatedStyle(() => {
    const dist = Math.min(1, Math.abs(progress.value - i));
    return { width: SEG + (SEG_ACTIVE - SEG) * (1 - dist) };
  });
  const bar = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));

  return (
    <Animated.View style={[styles.track, track]}>
      <Animated.View style={[styles.fill, bar]} />
    </Animated.View>
  );
});

/** Three-segment story-style progress: the active segment widens and fills with gold. */
export const ProgressSegments = memo(function ProgressSegments({
  count,
  index,
  progress,
  accessibilityLabel,
}: {
  count: number;
  index: number;
  /** Logical pager position (0…count-1, fractional while swiping). */
  progress: SharedValue<number>;
  accessibilityLabel: string;
}) {
  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 1, max: count, now: index + 1 }}
      pointerEvents="none"
    >
      {Array.from({ length: count }, (_, i) => (
        <Segment key={i} i={i} index={index} progress={progress} />
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, height: H + 8 },
  track: {
    height: H,
    borderRadius: H / 2,
    backgroundColor: 'rgba(255,255,255,0.26)',
    overflow: 'hidden',
  },
  fill: { position: 'absolute', top: 0, bottom: 0, start: 0, borderRadius: H / 2, backgroundColor: ink.gold },
});
