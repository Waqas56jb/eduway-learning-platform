import { Image } from 'expo-image';
import { memo, useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { EASE_IN_OUT, EASE_OUT, ink, type CinematicImage } from './tokens';

const KB_DURATION = 9000;
const KB_SCALE = 0.12;

/** Slow drift directions (fraction of width/height at full zoom), varied per slide. */
const DRIFTS = [
  { x: -0.035, y: -0.02 },
  { x: 0.03, y: -0.015 },
  { x: -0.025, y: 0.018 },
] as const;

export interface KenBurnsImageProps {
  image: CinematicImage;
  /** Only the active image animates; inactive ones ease back to rest. */
  active: boolean;
  width: number;
  height: number;
  /** Drift preset (0–2). */
  drift?: number;
  /** Optional pager parallax: the image travels at 0.5× the swipe. */
  scrollX?: SharedValue<number>;
  slot?: number;
  priority?: 'low' | 'normal' | 'high';
}

/**
 * Full-bleed photograph with a Ken Burns move (scale 1 → 1.12 + slight drift over ~9s, then
 * breathes back) and optional 0.5× parallax. Everything runs on the UI thread.
 */
export const KenBurnsImage = memo(function KenBurnsImage({
  image,
  active,
  width,
  height,
  drift = 0,
  scrollX,
  slot = 0,
  priority = 'normal',
}: KenBurnsImageProps) {
  const kb = useSharedValue(0);
  const d = DRIFTS[Math.abs(drift) % DRIFTS.length];

  useEffect(() => {
    if (active) {
      kb.value = withSequence(
        withTiming(1, { duration: KB_DURATION, easing: EASE_IN_OUT }),
        withRepeat(withTiming(0, { duration: KB_DURATION, easing: EASE_IN_OUT }), -1, true),
      );
    } else {
      kb.value = withTiming(0, { duration: 1200, easing: EASE_OUT });
    }
    return () => cancelAnimation(kb);
  }, [active, kb]);

  const style = useAnimatedStyle(() => {
    const k = kb.value;
    // Visual (LTR) coordinates: the page moves by -rel, the image compensates by +rel/2 → net 0.5×.
    const parallax = scrollX ? (scrollX.value - slot * width) * 0.5 : 0;
    return {
      transform: [
        { translateX: parallax + d.x * width * k },
        { translateY: d.y * height * k },
        { scale: 1 + KB_SCALE * k },
      ],
    };
  });

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.host, style]} pointerEvents="none">
      <Image
        source={{ uri: image.uri }}
        placeholder={{ blurhash: image.blurhash }}
        placeholderContentFit="cover"
        contentFit="cover"
        transition={500}
        cachePolicy="memory-disk"
        priority={priority}
        style={StyleSheet.absoluteFill}
        accessible={false}
        accessibilityIgnoresInvertColors
      />
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  host: { backgroundColor: ink.navy900 },
});
