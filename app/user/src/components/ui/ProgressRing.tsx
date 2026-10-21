import { memo, useEffect, useId, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { palette, useTheme } from '@/theme';
import { Text } from './Text';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface ProgressRingProps {
  /** 0–100 */
  progress: number;
  size?: number;
  strokeWidth?: number;
  /** Solid stroke color. When omitted the ring uses the gold gradient. */
  color?: string;
  trackColor?: string;
  /** Center text; defaults to `${progress}%`. Pass an empty string to hide. */
  label?: string;
  sublabel?: string;
  animated?: boolean;
  /** Force the gold gradient stroke even when `color` is set. */
  gradient?: boolean;
  /** Custom center content (replaces label/sublabel). */
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

const clamp = (n: number) => Math.max(0, Math.min(100, Number.isFinite(n) ? n : 0));

export const ProgressRing = memo(function ProgressRing({
  progress,
  size = 64,
  strokeWidth = 6,
  color,
  trackColor,
  label,
  sublabel,
  animated = true,
  gradient,
  children,
  style,
  accessibilityLabel,
}: ProgressRingProps) {
  const { colors, isDark } = useTheme();
  const gradId = `ring${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const value = clamp(progress);
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const p = useSharedValue(animated ? 0 : value);

  useEffect(() => {
    if (animated) p.value = withTiming(value, { duration: 900, easing: Easing.out(Easing.cubic) });
    else p.value = value;
  }, [animated, value, p]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - p.value / 100),
  }));

  const useGradient = gradient || !color;
  const stroke = useGradient ? `url(#${gradId})` : color;
  const text = label ?? `${Math.round(value)}%`;
  const labelSize = Math.max(12, Math.round(size * (sublabel ? 0.24 : 0.27)));

  return (
    <View
      style={[{ width: size, height: size }, style]}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel ?? text}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value) }}
    >
      <Svg width={size} height={size} style={styles.rotate}>
        <Defs>
          <LinearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={palette.goldLight} />
            <Stop offset="0.55" stopColor={palette.gold} />
            <Stop offset="1" stopColor="#A9832F" />
          </LinearGradient>
        </Defs>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={trackColor ?? (isDark ? 'rgba(255,255,255,0.10)' : colors.surfaceMuted)}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          fill="none"
          animatedProps={animatedProps}
        />
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
        {children ?? (
          <>
            {text ? (
              <Text
                variant="h3"
                display
                tabular
                align="center"
                numberOfLines={1}
                style={{ fontSize: labelSize, lineHeight: Math.round(labelSize * 1.2) }}
              >
                {text}
              </Text>
            ) : null}
            {sublabel ? (
              <Text variant="caption" color="muted" align="center" numberOfLines={1} style={{ fontSize: Math.max(10, Math.round(size * 0.11)) }}>
                {sublabel}
              </Text>
            ) : null}
          </>
        )}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  rotate: { transform: [{ rotate: '-90deg' }] },
  center: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
});
