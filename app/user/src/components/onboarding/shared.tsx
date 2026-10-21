import { memo, useId, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Extrapolation, interpolate, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { Icon, type IconName } from '@/components/icons';
import { Text } from '@/components/ui';
import { palette, radius, space } from '@/theme';

/** Design canvas every onboarding illustration is drawn on, then scaled to fit the device. */
export const DESIGN_W = 320;
export const DESIGN_H = 360;

/** Gold/white tints used on the dark navy onboarding surfaces (brand palette, not theme dependent). */
export const ink = {
  white: palette.white,
  soft: 'rgba(255,255,255,0.74)',
  faint: 'rgba(255,255,255,0.5)',
  glass: 'rgba(255,255,255,0.08)',
  glassStrong: 'rgba(255,255,255,0.14)',
  hairline: 'rgba(255,255,255,0.18)',
  navy: palette.navy,
  navyMuted: '#5B6B82',
} as const;

export interface SlideProps {
  /** Raw horizontal content offset of the pager (visual, LTR coordinates). */
  scrollX: SharedValue<number>;
  /** Visual slot of this page inside the pager (0 = leftmost). */
  slot: number;
  width: number;
  /** Illustration scale factor computed by the pager for the current screen size. */
  scale: number;
  /** Whether this slide is the one currently on screen (restarts its looping demo). */
  active: boolean;
}

/**
 * Moves its children relative to the page while the pager scrolls.
 *   factor > 0  → moves faster than the page (foreground / text layers)
 *   factor < 0  → moves slower than the page (background parallax)
 * `fade` cross-fades the layer as it leaves the center.
 */
export const ParallaxLayer = memo(function ParallaxLayer({
  scrollX,
  slot,
  width,
  factor = 0,
  fade = false,
  style,
  children,
}: {
  scrollX: SharedValue<number>;
  slot: number;
  width: number;
  factor?: number;
  fade?: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const animated = useAnimatedStyle(() => {
    const rel = scrollX.value - slot * width;
    return {
      opacity: fade ? interpolate(rel, [-width * 0.7, 0, width * 0.7], [0, 1, 0], Extrapolation.CLAMP) : 1,
      transform: [{ translateX: -rel * factor }],
    };
  });
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
});

/** Fixed-size design canvas scaled uniformly to the available space. */
export function IllustrationCanvas({ scale, children }: { scale: number; children: ReactNode }) {
  return (
    <View style={styles.canvasHost} pointerEvents="none">
      <View style={[styles.canvas, { transform: [{ scale }] }]}>{children}</View>
    </View>
  );
}

/** Soft radial gold glow drawn with SVG (no blur filters needed). */
export const GoldGlow = memo(function GoldGlow({
  size,
  color = palette.gold,
  opacity = 0.35,
  style,
}: {
  size: number;
  color?: string;
  opacity?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const id = `glow${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <View pointerEvents="none" style={[{ width: size, height: size }, style]}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={color} stopOpacity={opacity} />
            <Stop offset="0.55" stopColor={color} stopOpacity={opacity * 0.35} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${id})`} />
      </Svg>
    </View>
  );
});

/** Translucent pill with an icon, used for feature chips on the dark slides. */
export const GlassPill = memo(function GlassPill({
  icon,
  label,
  iconColor = palette.gold,
  style,
}: {
  icon: IconName;
  label: string;
  iconColor?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.pill, style]}>
      <Icon name={icon} size={16} color={iconColor} />
      <Text variant="label" color={ink.white} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  canvasHost: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  canvas: {
    width: DESIGN_W,
    height: DESIGN_H,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + 2,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    backgroundColor: ink.glass,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ink.hairline,
  },
});
