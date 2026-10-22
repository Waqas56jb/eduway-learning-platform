import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { isRTL } from '@/utils/rtl';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedProps, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { radius, space } from '@/theme';
import { Text } from '../Text';
import { approxLength, monotonePath, toStart, useChartColors, useChartRTL, type Pt } from './AreaChart';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface LineSeries {
  key: string;
  color: string;
  values: number[];
  /** Legend label (defaults to `key`). */
  label?: string;
}

export interface LineChartProps {
  series: LineSeries[];
  labels: string[];
  /** Height of the plot including x labels (default 180). Legend renders below. */
  height?: number;
  /** Top of the y scale (default 100). */
  yMax?: number;
  /** Hide the legend chips. */
  hideLegend?: boolean;
  formatY?: (n: number) => string;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

const LABEL_H = 22;
const GUTTER = 32;
const PAD = 18;
const TOP = 10;

const SeriesLine = memo(function SeriesLine({
  d,
  len,
  color,
  last,
  surface,
  progress,
}: {
  d: string;
  len: number;
  color: string;
  last: Pt | null;
  surface: string;
  progress: SharedValue<number>;
}) {
  const lineProps = useAnimatedProps(() => ({ strokeDashoffset: len * (1 - progress.value) }));
  const dotProps = useAnimatedProps(() => ({ opacity: progress.value > 0.95 ? (progress.value - 0.95) * 20 : 0 }));
  return (
    <>
      <AnimatedPath
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={`${len} ${len}`}
        animatedProps={lineProps}
      />
      {last ? (
        <AnimatedCircle cx={last.x} cy={last.y} r={4.5} fill={surface} stroke={color} strokeWidth={2.5} animatedProps={dotProps} />
      ) : null}
    </>
  );
});

export const LineChart = memo(function LineChart({
  series,
  labels,
  height = 180,
  yMax = 100,
  hideLegend,
  formatY = (n) => String(Math.round(n)),
  style,
  accessibilityLabel,
}: LineChartProps) {
  const { grid, label: labelColor, surface, colors } = useChartColors();
  const rtl = useChartRTL();
  const [width, setWidth] = useState(0);
  const onLayout = useCallback((e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width)), []);
  const plotH = Math.max(60, height - LABEL_H);
  const max = yMax > 0 ? yMax : 100;

  // The y-label gutter sits on the start side of the native layout.
  const gutterOnRight = isRTL();
  const x0 = gutterOnRight ? PAD : GUTTER;
  const x1 = gutterOnRight ? width - GUTTER : width - PAD;
  const n = labels.length;

  const xAt = useCallback(
    (i: number) => {
      const w = x1 - x0;
      const off = n > 1 ? (i * w) / (n - 1) : w / 2;
      return rtl ? x1 - off : x0 + off;
    },
    [n, rtl, x0, x1],
  );
  const yAt = useCallback(
    (v: number) => TOP + (1 - Math.max(0, Math.min(max, v)) / max) * (plotH - TOP - 4),
    [max, plotH],
  );

  const lines = useMemo(() => {
    if (!width) return [];
    return series.map((s) => {
      const pts: Pt[] = s.values.slice(0, Math.max(n, 1)).map((v, i) => ({ x: xAt(i), y: yAt(v) }));
      const sorted = [...pts].sort((a, b) => a.x - b.x);
      return { s, d: monotonePath(pts), len: approxLength(sorted), last: pts.length ? pts[pts.length - 1] : null };
    });
  }, [series, width, n, xAt, yAt]);

  const progress = useSharedValue(0);
  const key = series.map((s) => s.values.join(',')).join('|');
  useEffect(() => {
    if (!width) return;
    progress.value = 0;
    progress.value = withTiming(1, { duration: 1100, easing: Easing.out(Easing.cubic) });
  }, [key, width, progress]);

  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const labelEvery = n > 8 ? Math.ceil(n / 7) : 1;

  return (
    <View style={style}>
      <View
        style={{ height }}
        onLayout={onLayout}
        accessible
        accessibilityRole="image"
        accessibilityLabel={
          accessibilityLabel ?? series.map((s) => `${s.label ?? s.key}: ${s.values.map(formatY).join(', ')}`).join('; ')
        }
      >
        {width ? (
          <>
            <Svg width={width} height={plotH}>
              {ticks.map((f) => {
                const y = yAt(f * max);
                return (
                  <Line
                    key={f}
                    x1={x0}
                    x2={x1}
                    y1={y}
                    y2={y}
                    stroke={grid}
                    strokeWidth={1}
                    strokeDasharray={f === 0 ? undefined : '3 5'}
                  />
                );
              })}
              {lines.map((l) => (
                <SeriesLine key={l.s.key} d={l.d} len={l.len} color={l.s.color} last={l.last} surface={surface} progress={progress} />
              ))}
            </Svg>

            {/* y labels (start side) */}
            {ticks.map((f) => (
              <View key={`y${f}`} pointerEvents="none" style={[styles.yLabel, { top: yAt(f * max) - 8 }]}>
                <Text variant="caption" color={labelColor} align="end" tabular numberOfLines={1} style={styles.small}>
                  {formatY(f * max)}
                </Text>
              </View>
            ))}

            {/* x labels */}
            <View style={{ height: LABEL_H }} pointerEvents="none">
              {labels.map((lab, i) =>
                i % labelEvery === 0 || i === n - 1 ? (
                  <View key={`x${i}`} style={[styles.xLabel, { start: toStart(xAt(i), width) - 28 }]}>
                    <Text variant="caption" color={labelColor} align="center" numberOfLines={1}>
                      {lab}
                    </Text>
                  </View>
                ) : null,
              )}
            </View>
          </>
        ) : null}
      </View>

      {!hideLegend && series.length > 0 ? (
        <View style={styles.legend}>
          {series.map((s) => (
            <View key={s.key} style={[styles.chip, { backgroundColor: colors.surfaceMuted }]}>
              <View style={[styles.dot, { backgroundColor: s.color }]} />
              <Text variant="caption" color="ink" numberOfLines={1}>
                {s.label ?? s.key}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  yLabel: { position: 'absolute', start: 0, width: GUTTER - 6 },
  small: { fontSize: 10, lineHeight: 14 },
  xLabel: { position: 'absolute', top: 4, width: 56, alignItems: 'center' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
