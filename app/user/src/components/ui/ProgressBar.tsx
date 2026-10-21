import { memo, useEffect } from 'react';
import { I18nManager, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { gradients, useTheme } from '@/theme';

export interface ProgressBarProps {
  /** 0–100 */
  progress: number;
  height?: number;
  color?: string;
  /** Gold gradient fill (ignored when `color` is set). */
  gradient?: boolean;
  trackColor?: string;
  animated?: boolean;
  /** Delay before the fill animates in (ms). */
  delay?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

const clamp = (n: number) => Math.max(0, Math.min(100, Number.isFinite(n) ? n : 0));

/** Horizontal progress that always fills from the reading-start edge (RTL aware). */
export const ProgressBar = memo(function ProgressBar({
  progress,
  height = 6,
  color,
  gradient,
  trackColor,
  animated = true,
  delay = 0,
  style,
  accessibilityLabel,
}: ProgressBarProps) {
  const { colors, isDark } = useTheme();
  const target = clamp(progress);
  const width = useSharedValue(animated ? 0 : target);

  useEffect(() => {
    if (!animated) {
      width.value = target;
      return;
    }
    width.value = withDelay(delay, withTiming(target, { duration: 750, easing: Easing.out(Easing.cubic) }));
  }, [animated, delay, target, width]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${width.value}%` }));
  const useGradient = gradient && !color;
  const rtl = I18nManager.isRTL;

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(target) }}
      style={[
        styles.track,
        { height, borderRadius: height / 2, backgroundColor: trackColor ?? (isDark ? 'rgba(255,255,255,0.08)' : colors.surfaceMuted) },
        style,
      ]}
    >
      <Animated.View
        style={[
          styles.fill,
          { borderRadius: height / 2, backgroundColor: useGradient ? undefined : color ?? colors.accent },
          fillStyle,
        ]}
      >
        {useGradient ? (
          <LinearGradient
            colors={gradients.gold}
            start={{ x: rtl ? 1 : 0, y: 0 }}
            end={{ x: rtl ? 0 : 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  track: { width: '100%', overflow: 'hidden', flexDirection: 'row' },
  fill: { height: '100%', overflow: 'hidden' },
});
