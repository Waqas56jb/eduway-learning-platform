import { memo, useEffect, type ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { EASE_OUT } from './tokens';

export const REVEAL_STAGGER = 80;

/**
 * Fade + rise entrance that replays every time `active` turns true (and resets when it turns
 * false). `order` staggers siblings by 80ms. `scaleFrom` adds a soft spring scale-in (logos).
 */
export const Reveal = memo(function Reveal({
  active,
  order = 0,
  delay = 120,
  rise = 16,
  duration = 620,
  scaleFrom,
  style,
  children,
}: {
  active: boolean;
  order?: number;
  delay?: number;
  rise?: number;
  duration?: number;
  scaleFrom?: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const v = useSharedValue(0);
  const s = useSharedValue(0);

  useEffect(() => {
    if (active) {
      const wait = delay + order * REVEAL_STAGGER;
      v.value = 0;
      s.value = 0;
      v.value = withDelay(wait, withTiming(1, { duration, easing: EASE_OUT }));
      if (scaleFrom !== undefined) s.value = withDelay(wait, withSpring(1, { damping: 14, stiffness: 140 }));
    } else {
      cancelAnimation(v);
      cancelAnimation(s);
      v.value = 0;
      s.value = 0;
    }
  }, [active, delay, duration, order, s, scaleFrom, v]);

  const animated = useAnimatedStyle(() => {
    const transform: ({ translateY: number } | { scale: number })[] = [{ translateY: (1 - v.value) * rise }];
    if (scaleFrom !== undefined) transform.push({ scale: scaleFrom + (1 - scaleFrom) * s.value });
    return { opacity: v.value, transform };
  });

  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
});
