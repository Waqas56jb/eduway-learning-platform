import { memo, useEffect, useId } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { palette, shadows } from '@/theme';
import { haptic } from '@/utils/haptics';

const AnimatedPath = Animated.createAnimatedComponent(Path);

export interface SuccessCheckProps {
  size?: number;
  /** Fire a success haptic when the check finishes drawing (default true). */
  haptics?: boolean;
  /** Delay before the animation starts (ms). */
  delay?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

/** Gold medallion that springs in, then draws a check mark, with a soft pulsing ring. */
export const SuccessCheck = memo(function SuccessCheck({
  size = 120,
  haptics = true,
  delay = 0,
  style,
  accessibilityLabel,
}: SuccessCheckProps) {
  const id = `sc${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const scale = useSharedValue(0);
  const draw = useSharedValue(0);
  const pulse = useSharedValue(0);

  // Check geometry (in a 100×100 box).
  const pts: [number, number][] = [
    [29, 52],
    [44, 66],
    [72, 37],
  ];
  const len =
    Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]) + Math.hypot(pts[2][0] - pts[1][0], pts[2][1] - pts[1][1]);
  const d = `M${pts[0][0]} ${pts[0][1]} L${pts[1][0]} ${pts[1][1]} L${pts[2][0]} ${pts[2][1]}`;

  useEffect(() => {
    scale.value = withDelay(delay, withSpring(1, { damping: 11, stiffness: 180, mass: 0.8 }));
    draw.value = withDelay(delay + 280, withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) }));
    pulse.value = withDelay(
      delay + 500,
      withRepeat(withSequence(withTiming(1, { duration: 1400, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 0 })), 3, false),
    );
    let tm: ReturnType<typeof setTimeout> | undefined;
    if (haptics) tm = setTimeout(() => haptic.success(), delay + 600);
    return () => {
      if (tm) clearTimeout(tm);
    };
  }, [delay, draw, haptics, pulse, scale]);

  const circleStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: pulse.value === 0 ? 0 : 0.55 * (1 - pulse.value),
    transform: [{ scale: 1 + pulse.value * 0.45 }],
  }));
  const pathProps = useAnimatedProps(() => ({ strokeDashoffset: len * (1 - draw.value) }));

  return (
    <View
      style={[{ width: size, height: size }, styles.center, style]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { borderRadius: size / 2, borderWidth: Math.max(2, size * 0.025), borderColor: palette.gold },
          ringStyle,
        ]}
      />
      <Animated.View style={[{ width: size, height: size, borderRadius: size / 2 }, shadows.gold, circleStyle]}>
        <Svg width={size} height={size} viewBox="0 0 100 100">
          <Defs>
            <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={palette.goldLight} />
              <Stop offset="0.55" stopColor={palette.gold} />
              <Stop offset="1" stopColor="#A9832F" />
            </LinearGradient>
          </Defs>
          <Circle cx={50} cy={50} r={50} fill={`url(#${id})`} />
          <Circle cx={50} cy={50} r={44} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={1} />
          <AnimatedPath
            d={d}
            fill="none"
            stroke={palette.navy}
            strokeWidth={7}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={`${len} ${len}`}
            animatedProps={pathProps}
          />
        </Svg>
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
});
