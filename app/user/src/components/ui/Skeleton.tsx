import { memo, useCallback, useEffect, useState } from 'react';
import { isRTL } from '@/utils/rtl';
import { StyleSheet, View, type DimensionValue, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { radius as radii, space, useTheme } from '@/theme';

export interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

/** Shimmering placeholder block. */
export const Skeleton = memo(function Skeleton({ width = '100%', height = 16, radius = radii.sm, style }: SkeletonProps) {
  const { colors } = useTheme();
  const [w, setW] = useState(0);
  const progress = useSharedValue(0);
  const dir = isRTL() ? -1 : 1;

  useEffect(() => {
    progress.value = 0;
    progress.value = withRepeat(withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.quad) }), -1, false);
    return () => cancelAnimation(progress);
  }, [progress]);

  const onLayout = useCallback((e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width), []);

  const sweepW = Math.max(w * 0.6, 80);
  const sweepStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (-sweepW + progress.value * (w + sweepW * 2)) * dir }],
  }));

  return (
    <View
      onLayout={onLayout}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.base, { width, height, borderRadius: radius, backgroundColor: colors.skeleton }, style]}
    >
      {w > 0 ? (
        <Animated.View style={[styles.sweep, { width: sweepW }, sweepStyle]}>
          <LinearGradient
            colors={[colors.skeleton, colors.skeletonHighlight, colors.skeleton]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      ) : null}
    </View>
  );
});

export interface SkeletonCardProps {
  /** Show a media block on top (lesson/subject cards). */
  media?: boolean;
  lines?: number;
  style?: StyleProp<ViewStyle>;
}

/** Card-shaped loading placeholder. */
export const SkeletonCard = memo(function SkeletonCard({ media = false, lines = 2, style }: SkeletonCardProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, style]}>
      {media ? <Skeleton height={140} radius={radii.md} style={styles.media} /> : null}
      <View style={styles.row}>
        <Skeleton width={44} height={44} radius={12} />
        <View style={styles.texts}>
          <Skeleton width="70%" height={14} />
          <Skeleton width="45%" height={12} />
        </View>
      </View>
      {Array.from({ length: Math.max(0, lines) }, (_, i) => (
        <Skeleton key={i} width={i === lines - 1 ? '60%' : '100%'} height={12} style={styles.line} />
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  base: { overflow: 'hidden' },
  sweep: { position: 'absolute', top: 0, bottom: 0, start: 0 },
  card: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.lg,
    gap: space.sm,
  },
  media: { marginBottom: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.xs },
  texts: { flex: 1, gap: space.sm },
  line: { marginTop: 2 },
});
