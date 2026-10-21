import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { palette, subjectColors, useTheme } from '@/theme';

export interface ConfettiProps {
  /** Burst whenever this flips from false to true. */
  fire: boolean;
  count?: number;
  /** Burst length in ms (default 3000). */
  duration?: number;
  /** Called after the particles have cleaned up. */
  onDone?: () => void;
}

type Shape = 'rect' | 'circle' | 'strip';

interface Particle {
  key: number;
  shape: Shape;
  color: string;
  size: number;
  vx: number;
  vy: number;
  rot0: number;
  vr: number;
  wobble: number;
  wobbleSpeed: number;
  flip: number;
  /** terminal fall speed (px/s) */
  vt: number;
}

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function makeParticles(count: number, w: number, h: number, colors: string[]): Particle[] {
  const shapes: Shape[] = ['rect', 'rect', 'circle', 'strip'];
  return Array.from({ length: count }, (_, i) => {
    const angle = rand(-Math.PI * 0.92, -Math.PI * 0.08); // upward fan
    const speed = rand(h * 0.4, h * 0.9);
    return {
      key: i,
      shape: shapes[i % shapes.length],
      color: colors[i % colors.length],
      size: rand(6, 11),
      vx: Math.cos(angle) * speed * (w / h) * 1.15,
      vy: Math.sin(angle) * speed,
      rot0: rand(0, 360),
      vr: rand(-540, 540),
      wobble: rand(6, 22),
      wobbleSpeed: rand(4, 10),
      flip: rand(2, 6),
      vt: rand(h * 0.22, h * 0.42),
    };
  });
}

const ParticleView = memo(function ParticleView({
  p,
  t,
  seconds,
  originY,
}: {
  p: Particle;
  t: SharedValue<number>;
  seconds: number;
  originY: number;
}) {
  const style = useAnimatedStyle(() => {
    const s = t.value * seconds;
    // simple air drag on the horizontal component
    const x = p.vx * (1 - Math.exp(-1.4 * s)) / 1.4 + Math.sin(s * p.wobbleSpeed) * p.wobble;
    // launch upward, then air drag settles each piece to its terminal fall speed
    const y = originY + ((p.vy - p.vt) / 2.2) * (1 - Math.exp(-2.2 * s)) + p.vt * s;
    const opacity = t.value > 0.8 ? (1 - t.value) / 0.2 : 1;
    return {
      opacity,
      transform: [
        { translateX: x },
        { translateY: y },
        { rotate: `${p.rot0 + p.vr * s}deg` },
        { scaleY: p.shape === 'circle' ? 1 : Math.cos(s * p.flip) },
      ],
    };
  });
  const dims =
    p.shape === 'circle'
      ? { width: p.size, height: p.size, borderRadius: p.size / 2 }
      : p.shape === 'strip'
        ? { width: p.size * 0.4, height: p.size * 1.6, borderRadius: 1 }
        : { width: p.size, height: p.size * 1.35, borderRadius: 1.5 };
  return <Animated.View style={[styles.particle, dims, { backgroundColor: p.color }, style]} />;
});

/** Full-screen celebratory confetti burst from the top center. Non-interactive. */
export const Confetti = memo(function Confetti({ fire, count = 80, duration = 3000, onDone }: ConfettiProps) {
  const { width, height } = useWindowDimensions();
  const { isDark } = useTheme();
  const [burst, setBurst] = useState(0);
  const [active, setActive] = useState(false);
  const prev = useRef(false);
  const t = useSharedValue(0);

  useEffect(() => {
    if (fire && !prev.current) {
      setBurst((b) => b + 1);
      setActive(true);
    }
    prev.current = fire;
  }, [fire]);

  const palettes = useMemo(
    () => [
      palette.gold,
      palette.goldLight,
      isDark ? palette.cream : palette.navy,
      palette.gold,
      subjectColors.math,
      subjectColors.physics,
      subjectColors.chemistry,
      subjectColors.biology,
      subjectColors.english,
      palette.goldLight,
    ],
    [isDark],
  );

  const particles = useMemo(
    () => (burst > 0 ? makeParticles(count, width, height, palettes) : []),
    // regenerate per burst only (dimensions/colors read at burst time)
    [burst],
  );

  const finish = useCallback(() => {
    setActive(false);
    onDone?.();
  }, [onDone]);

  useEffect(() => {
    if (burst === 0) return;
    t.value = 0;
    t.value = withTiming(1, { duration, easing: Easing.linear }, (done) => {
      if (done) scheduleOnRN(finish);
    });
  }, [burst, duration, finish, t]);

  if (!active) return null;

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.layer]}>
      {particles.map((p) => (
        <ParticleView key={`${burst}-${p.key}`} p={p} t={t} seconds={duration / 1000} originY={height * 0.2} />
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  // Absolute children with no horizontal inset are centered by the parent's alignItems,
  // so translateX is relative to the horizontal center (direction-agnostic).
  layer: { alignItems: 'center', zIndex: 999, elevation: 999 },
  particle: { position: 'absolute', top: 0 },
});
