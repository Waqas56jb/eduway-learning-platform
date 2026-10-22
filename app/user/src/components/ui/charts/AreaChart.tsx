import { memo, useCallback, useEffect, useId, useMemo, useState } from 'react';
import { isRTL } from '@/utils/rtl';
import { Pressable, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedProps, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import { radius, shadows, useTheme } from '@/theme';
import { haptic } from '@/utils/haptics';
import { Text } from '../Text';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedG = Animated.createAnimatedComponent(G);

/* ---------------- shared chart helpers (used by LineChart too) ---------------- */

export interface Pt {
  x: number;
  y: number;
}

/** Smooth monotone-X cubic path (no overshoot). Points are sorted by x internally. */
export function monotonePath(input: Pt[]): string {
  const pts = [...input].sort((a, b) => a.x - b.x);
  const n = pts.length;
  if (n === 0) return '';
  if (n === 1) return `M${pts[0].x} ${pts[0].y}`;
  if (n === 2) return `M${pts[0].x} ${pts[0].y}L${pts[1].x} ${pts[1].y}`;
  const h: number[] = [];
  const s: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    h[i] = pts[i + 1].x - pts[i].x || 1e-6;
    s[i] = (pts[i + 1].y - pts[i].y) / h[i];
  }
  const t: number[] = new Array(n).fill(0);
  for (let i = 1; i < n - 1; i++) {
    const p = (s[i - 1] * h[i] + s[i] * h[i - 1]) / (h[i - 1] + h[i]);
    t[i] = (Math.sign(s[i - 1]) + Math.sign(s[i])) * Math.min(Math.abs(s[i - 1]), Math.abs(s[i]), 0.5 * Math.abs(p)) || 0;
  }
  t[0] = h[0] ? (3 * s[0] - t[1]) / 2 : 0;
  t[n - 1] = (3 * s[n - 2] - t[n - 2]) / 2;
  // keep end tangents monotone
  if (Math.sign(t[0]) !== Math.sign(s[0])) t[0] = 0;
  if (Math.sign(t[n - 1]) !== Math.sign(s[n - 2])) t[n - 1] = 0;
  let d = `M${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = h[i] / 3;
    d += `C${a.x + dx} ${a.y + t[i] * dx} ${b.x - dx} ${b.y - t[i + 1] * dx} ${b.x} ${b.y}`;
  }
  return d;
}

/** Slight over-estimate of a smooth path's length (for dash draw-in). */
export function approxLength(pts: Pt[]): number {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return Math.max(1, l * 1.2 + 4);
}

/** Dark-mode aware chart ink. */
export function useChartColors() {
  const { colors, isDark } = useTheme();
  return {
    grid: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(11,31,58,0.08)',
    label: colors.muted,
    surface: isDark ? colors.surfaceElevated : colors.surface,
    colors,
    isDark,
  };
}

/**
 * Whether the x axis runs right-to-left. Uses the NATIVE layout direction only (never the language
 * flag), so SVG geometry and the RN `start` insets computed by `toStart` always agree.
 */
export function useChartRTL() {
  return isRTL();
}

/** Convert an SVG x (from the physical left edge) to an RN `start` inset. */
export function toStart(x: number, width: number) {
  return isRTL() ? width - x : x;
}

const sanitizeId = (s: string) => s.replace(/[^a-zA-Z0-9]/g, '');

/* ---------------- AreaChart ---------------- */

export interface AreaChartProps {
  data: { label: string; value: number }[];
  /** Total height including the x labels (default 160). */
  height?: number;
  color?: string;
  showDots?: boolean;
  formatValue?: (n: number) => string;
  /** Index highlighted initially (defaults to the max point). Pass -1 to hide the tooltip. */
  initialSelected?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

const LABEL_H = 22;
const TOP_PAD = 34;
const BOTTOM_PAD = 6;
const PAD_X = 22;
const TIP_W = 84;

export const AreaChart = memo(function AreaChart({
  data,
  height = 160,
  color,
  showDots,
  formatValue = (n) => String(n),
  initialSelected,
  style,
  accessibilityLabel,
}: AreaChartProps) {
  const { grid, label: labelColor, surface, colors } = useChartColors();
  const rtl = useChartRTL();
  const stroke = color ?? colors.accent;
  const id = `area${sanitizeId(useId())}`;
  const [width, setWidth] = useState(0);
  const onLayout = useCallback((e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width)), []);

  const maxIndex = useMemo(
    () => data.reduce((best, d, i) => (d.value > (data[best]?.value ?? -Infinity) ? i : best), 0),
    [data],
  );
  const [selected, setSelected] = useState<number>(initialSelected ?? maxIndex);
  useEffect(() => setSelected(initialSelected ?? maxIndex), [initialSelected, maxIndex]);

  const plotH = Math.max(40, height - LABEL_H);
  const geo = useMemo(() => {
    const n = data.length;
    if (!width || n === 0) return null;
    const values = data.map((d) => d.value);
    const max = Math.max(...values);
    const min = Math.min(0, ...values);
    const top = max === min ? max + 1 : max + (max - min) * 0.12;
    const innerW = width - PAD_X * 2;
    const step = n > 1 ? innerW / (n - 1) : 0;
    const pts: Pt[] = data.map((d, i) => {
      const offset = n > 1 ? i * step : innerW / 2;
      const x = rtl ? width - PAD_X - offset : PAD_X + offset;
      const y = TOP_PAD + (1 - (d.value - min) / (top - min)) * (plotH - TOP_PAD - BOTTOM_PAD);
      return { x, y };
    });
    const line = monotonePath(pts);
    const sorted = [...pts].sort((a, b) => a.x - b.x);
    const baseY = plotH - BOTTOM_PAD;
    const area = `${line}L${sorted[sorted.length - 1].x} ${baseY}L${sorted[0].x} ${baseY}Z`;
    return { pts, line, area, len: approxLength(sorted), step: n > 1 ? step : innerW, baseY };
  }, [data, width, rtl, plotH]);

  const draw = useSharedValue(0);
  const fill = useSharedValue(0);
  const dataKey = data.map((d) => d.value).join(',');
  useEffect(() => {
    if (!width) return;
    draw.value = 0;
    fill.value = 0;
    draw.value = withTiming(1, { duration: 1000, easing: Easing.out(Easing.cubic) });
    fill.value = withDelay(350, withTiming(1, { duration: 650 }));
  }, [dataKey, width, draw, fill]);

  const len = geo?.len ?? 1;
  const lineProps = useAnimatedProps(() => ({ strokeDashoffset: len * (1 - draw.value) }));
  const fillProps = useAnimatedProps(() => ({ opacity: fill.value }));
  const dotsProps = useAnimatedProps(() => ({ opacity: fill.value }));

  // Thin labels when crowded.
  const labelEvery = data.length > 8 ? Math.ceil(data.length / 7) : 1;
  const sel = selected >= 0 && selected < data.length ? selected : -1;
  const selPt = geo && sel >= 0 ? geo.pts[sel] : null;

  const select = (i: number) => {
    if (i === selected) return;
    haptic.selection();
    setSelected(i);
  };

  return (
    <View
      style={[{ height }, style]}
      onLayout={onLayout}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel ?? data.map((d) => `${d.label}: ${formatValue(d.value)}`).join(', ')}
    >
      {geo ? (
        <>
          <Svg width={width} height={plotH}>
            <Defs>
              <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={stroke} stopOpacity={0.32} />
                <Stop offset="0.7" stopColor={stroke} stopOpacity={0.06} />
                <Stop offset="1" stopColor={stroke} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            {[0, 0.5, 1].map((f) => {
              const y = TOP_PAD + f * (plotH - TOP_PAD - BOTTOM_PAD);
              return <Line key={f} x1={PAD_X} x2={width - PAD_X} y1={y} y2={y} stroke={grid} strokeWidth={1} strokeDasharray="3 5" />;
            })}
            <AnimatedPath d={geo.area} fill={`url(#${id})`} animatedProps={fillProps} />
            {selPt ? (
              <Line x1={selPt.x} x2={selPt.x} y1={selPt.y} y2={geo.baseY} stroke={stroke} strokeOpacity={0.35} strokeWidth={1} strokeDasharray="3 4" />
            ) : null}
            <AnimatedPath
              d={geo.line}
              fill="none"
              stroke={stroke}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={`${geo.len} ${geo.len}`}
              animatedProps={lineProps}
            />
            <AnimatedG animatedProps={dotsProps}>
              {showDots
                ? geo.pts.map((p, i) =>
                    i === sel ? null : <Circle key={i} cx={p.x} cy={p.y} r={3.2} fill={surface} stroke={stroke} strokeWidth={2} />,
                  )
                : null}
              {selPt ? (
                <>
                  <Circle cx={selPt.x} cy={selPt.y} r={9} fill={stroke} opacity={0.18} />
                  <Circle cx={selPt.x} cy={selPt.y} r={5} fill={surface} stroke={stroke} strokeWidth={2.5} />
                </>
              ) : null}
            </AnimatedG>
          </Svg>

          {/* Tap targets */}
          {geo.pts.map((p, i) => (
            <Pressable
              key={`hit${i}`}
              onPress={() => select(i)}
              accessibilityRole="button"
              accessibilityLabel={`${data[i].label}: ${formatValue(data[i].value)}`}
              style={[styles.hit, { start: toStart(p.x, width) - geo.step / 2, width: geo.step, height: plotH }]}
            />
          ))}

          {selPt && sel >= 0 ? (
            <View
              pointerEvents="none"
              style={[
                styles.tipWrap,
                {
                  start: Math.min(Math.max(0, toStart(selPt.x, width) - TIP_W / 2), width - TIP_W),
                  top: Math.max(0, selPt.y - 32),
                },
              ]}
            >
              <View style={[styles.tip, shadows.sm, { backgroundColor: colors.primary }]}>
                <Text variant="caption" color="#FFFFFF" tabular numberOfLines={1} style={styles.tipText}>
                  {formatValue(data[sel].value)}
                </Text>
              </View>
            </View>
          ) : null}

          <View style={[styles.labels, { height: LABEL_H }]} pointerEvents="none">
            {geo.pts.map((p, i) =>
              i % labelEvery === 0 || i === data.length - 1 ? (
                <View key={`l${i}`} style={[styles.labelBox, { start: toStart(p.x, width) - 28 }]}>
                  <Text
                    variant="caption"
                    color={i === sel ? colors.ink : labelColor}
                    align="center"
                    numberOfLines={1}
                  >
                    {data[i].label}
                  </Text>
                </View>
              ) : null,
            )}
          </View>
        </>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  hit: { position: 'absolute', top: 0 },
  tipWrap: { position: 'absolute', width: TIP_W, alignItems: 'center' },
  tip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  tipText: { fontSize: 12, lineHeight: 16 },
  labels: { width: '100%' },
  labelBox: { position: 'absolute', top: 4, width: 56, alignItems: 'center' },
});
