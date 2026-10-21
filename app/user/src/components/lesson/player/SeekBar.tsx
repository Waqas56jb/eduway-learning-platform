import { memo, useCallback, useEffect, useState } from 'react';
import { I18nManager, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Text } from '@/components/ui';
import { palette } from '@/theme';
import { formatDuration } from '@/utils/format';
import { haptic } from '@/utils/haptics';

const BUBBLE_W = 64;
const TRACK_H = 4;
const THUMB = 14;

export interface SeekBarProps {
  position: number;
  duration: number;
  buffered: number;
  onScrubStart: () => void;
  onScrubEnd: (sec: number) => void;
  accessibilityLabel: string;
}

/**
 * Draggable timeline (Gesture Handler 3 pan, runs on the UI thread).
 * Fills from the start edge (mirrors under RTL) and shows a floating time bubble while dragging.
 */
export const SeekBar = memo(function SeekBar({
  position,
  duration,
  buffered,
  onScrubStart,
  onScrubEnd,
  accessibilityLabel,
}: SeekBarProps) {
  const isRTL = I18nManager.isRTL;
  const width = useSharedValue(0);
  const progress = useSharedValue(0);
  const scrubbing = useSharedValue(false);
  const [scrubSec, setScrubSec] = useState<number | null>(null);

  const safeDuration = duration > 0 ? duration : 0;

  useEffect(() => {
    if (scrubbing.value || safeDuration <= 0) return;
    progress.value = withTiming(Math.min(1, position / safeDuration), { duration: 250 });
  }, [position, safeDuration, progress, scrubbing]);

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      width.value = e.nativeEvent.layout.width;
    },
    [width],
  );

  const begin = useCallback(() => {
    haptic.selection();
    onScrubStart();
  }, [onScrubStart]);

  const updateBubble = useCallback((ratio: number) => setScrubSec(ratio * safeDuration), [safeDuration]);

  const finish = useCallback(
    (ratio: number) => {
      setScrubSec(null);
      onScrubEnd(ratio * safeDuration);
    },
    [onScrubEnd, safeDuration],
  );

  const pan = usePanGesture({
    minDistance: 0,
    hitSlop: { top: 14, bottom: 14 },
    onBegin: (e) => {
      'worklet';
      if (width.value <= 0) return;
      const raw = Math.min(1, Math.max(0, e.x / width.value));
      const ratio = isRTL ? 1 - raw : raw;
      scrubbing.value = true;
      progress.value = ratio;
      scheduleOnRN(begin);
      scheduleOnRN(updateBubble, ratio);
    },
    onUpdate: (e) => {
      'worklet';
      if (width.value <= 0) return;
      const raw = Math.min(1, Math.max(0, e.x / width.value));
      const ratio = isRTL ? 1 - raw : raw;
      progress.value = ratio;
      scheduleOnRN(updateBubble, ratio);
    },
    onFinalize: () => {
      'worklet';
      if (!scrubbing.value) return;
      scrubbing.value = false;
      scheduleOnRN(finish, progress.value);
    },
  });

  const fillStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));
  const trackStyle = useAnimatedStyle(() => ({
    height: withTiming(scrubbing.value ? TRACK_H + 2 : TRACK_H, { duration: 150 }),
  }));
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ scale: withTiming(scrubbing.value ? 1.35 : 1, { duration: 150 }) }],
  }));
  const bubbleStyle = useAnimatedStyle(() => {
    const w = width.value;
    const offset = Math.min(Math.max(progress.value * w - BUBBLE_W / 2, 0), Math.max(0, w - BUBBLE_W));
    return {
      opacity: withTiming(scrubbing.value ? 1 : 0, { duration: 120 }),
      transform: [{ translateX: isRTL ? -offset : offset }, { translateY: withTiming(scrubbing.value ? 0 : 6, { duration: 120 }) }],
    };
  });

  const bufferedPct = safeDuration > 0 ? Math.min(100, (buffered / safeDuration) * 100) : 0;

  return (
    <GestureDetector gesture={pan}>
      <View
        style={styles.hit}
        onLayout={onLayout}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={{ min: 0, max: Math.round(safeDuration), now: Math.round(position), text: formatDuration(position) }}
      >
        <Animated.View style={[styles.bubble, bubbleStyle]} pointerEvents="none">
          <Text variant="label" color={palette.navy} tabular style={styles.bubbleText}>
            {formatDuration(scrubSec ?? position)}
          </Text>
        </Animated.View>
        <Animated.View style={[styles.track, trackStyle]}>
          <View style={[styles.buffered, { width: `${bufferedPct}%` }]} />
          <Animated.View style={[styles.fill, fillStyle]}>
            <Animated.View style={[styles.thumb, thumbStyle]} />
          </Animated.View>
        </Animated.View>
      </View>
    </GestureDetector>
  );
});

const styles = StyleSheet.create({
  hit: { height: 28, justifyContent: 'center' },
  track: {
    width: '100%',
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.22)',
    justifyContent: 'center',
  },
  buffered: {
    position: 'absolute',
    start: 0,
    top: 0,
    bottom: 0,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.38)',
  },
  fill: {
    position: 'absolute',
    start: 0,
    top: 0,
    bottom: 0,
    borderRadius: 3,
    backgroundColor: palette.gold,
    justifyContent: 'center',
  },
  thumb: {
    position: 'absolute',
    end: -THUMB / 2,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: palette.goldLight,
    borderWidth: 2,
    borderColor: palette.white,
  },
  bubble: {
    position: 'absolute',
    start: 0,
    bottom: 30,
    width: BUBBLE_W,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: palette.gold,
    alignItems: 'center',
  },
  bubbleText: { writingDirection: 'ltr', textAlign: 'center' },
});
