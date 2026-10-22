import { memo, useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Text } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { palette, radius, space, useTheme } from '@/theme';
import { formatDate } from '@/utils/format';
import { haptic } from '@/utils/haptics';

export interface StreakCalendarProps {
  data: { date: string; level: number }[];
  /** Number of week columns to render (latest week last). */
  weeks?: number;
  /**
   * Exact width available to the calendar (e.g. window width minus gutters/card padding).
   * When omitted it is measured with onLayout.
   */
  width?: number;
}

const DAY_KEYS = ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'] as const;
/** Rows that get a weekday label (GitHub-style alternate labels). */
const LABEL_ROWS = new Set([1, 3, 5]);
const GAP = 3;
const DAY_MS = 86_400_000;

/** Gold intensity for levels 1–4 (level 0 uses surfaceMuted). */
const GOLD_LEVELS = [
  'rgba(201,162,74,0.22)',
  'rgba(201,162,74,0.45)',
  'rgba(201,162,74,0.72)',
  palette.gold,
] as const;

interface Cell {
  date: string;
  level: number;
}

const parseDay = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
};
const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
/** Saturday-first weekday index (Iraqi school week). */
const weekdayIndex = (ms: number) => (new Date(ms).getUTCDay() + 1) % 7;

interface DayCellProps {
  cell: Cell;
  size: number;
  color: string;
  selected: boolean;
  ringColor: string;
  label: string;
  onPress: (cell: Cell) => void;
}

const DayCell = memo(function DayCell({ cell, size, color, selected, ringColor, label, onPress }: DayCellProps) {
  return (
    <Pressable
      onPress={() => onPress(cell)}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={1}
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          backgroundColor: color,
          borderRadius: Math.max(2, Math.round(size * 0.26)),
          opacity: pressed ? 0.6 : 1,
          transform: [{ scale: pressed ? 0.88 : 1 }],
        },
        selected && { borderWidth: 1.5, borderColor: ringColor },
      ]}
    />
  );
});

/**
 * GitHub-style study heatmap: week columns × 7 weekday rows, gold intensity 0–4.
 * The cell size is derived from the available width so the grid fills it exactly.
 * Columns flow along the reading direction, so native RTL mirrors it (latest week at the end side).
 */
export const StreakCalendar = memo(function StreakCalendar({ data, weeks = 16, width: widthProp }: StreakCalendarProps) {
  const { colors } = useTheme();
  const { t, lang, isAr } = useI18n('progress');
  const [measured, setMeasured] = useState(0);
  const [selected, setSelected] = useState<Cell | null>(null);
  const width = widthProp ?? measured;

  const levelColor = useCallback(
    (level: number) => (level <= 0 ? colors.surfaceMuted : GOLD_LEVELS[Math.min(4, level) - 1]!),
    [colors.surfaceMuted],
  );

  const { columns, months } = useMemo(() => {
    const map = new Map<string, number>();
    let lastMs = 0;
    for (const d of data) {
      map.set(d.date.slice(0, 10), d.level);
      lastMs = Math.max(lastMs, parseDay(d.date));
    }
    if (!lastMs) lastMs = parseDay(new Date().toISOString());
    const endIdx = weekdayIndex(lastMs);
    const startMs = lastMs - ((weeks - 1) * 7 + endIdx) * DAY_MS;

    const cols: (Cell | null)[][] = [];
    for (let w = 0; w < weeks; w++) {
      const col: (Cell | null)[] = [];
      for (let r = 0; r < 7; r++) {
        const ms = startMs + (w * 7 + r) * DAY_MS;
        if (ms > lastMs) {
          col.push(null);
          continue;
        }
        const iso = toIso(ms);
        col.push({ date: iso, level: map.get(iso) ?? 0 });
      }
      cols.push(col);
    }

    // Month segments: a new segment starts at the column whose first day begins a new month.
    const segs: { month: number; span: number }[] = [];
    cols.forEach((col) => {
      const first = col.find((c): c is Cell => c !== null);
      const month = first ? new Date(parseDay(first.date)).getUTCMonth() + 1 : 0;
      const prev = segs[segs.length - 1];
      if (prev && prev.month === month) prev.span += 1;
      else segs.push({ month, span: 1 });
    });
    return { columns: cols, months: segs };
  }, [data, weeks]);

  const labelWidth = isAr ? 34 : 30;
  // Exact fill: labelWidth + weeks * cell + (weeks - 1) * GAP === width.
  // Kept fractional on purpose: Yoga snaps absolute edges to the pixel grid, so the row sums to `width` exactly.
  const cellSize = width > 0 ? Math.max(0, (width - labelWidth - GAP * (weeks - 1)) / weeks) : 0;
  const pitch = cellSize + GAP;

  const onLayout = (e: LayoutChangeEvent) => {
    if (widthProp === undefined) setMeasured(e.nativeEvent.layout.width);
  };

  const levelLabel = (level: number) => t(`calendar.levels.l${Math.max(0, Math.min(4, level))}`);
  const dateLabel = (iso: string) =>
    formatDate(`${iso}T12:00:00Z`, lang, { weekday: 'long', day: 'numeric', month: 'long' });

  const onCellPress = useCallback((cell: Cell) => {
    haptic.selection();
    setSelected((cur) => (cur?.date === cell.date ? null : cell));
  }, []);

  return (
    <View onLayout={onLayout} style={[styles.root, widthProp !== undefined && { width: widthProp }]}>
      {cellSize > 0 && (
        <>
          {/* Month labels */}
          <View style={[styles.row, { marginStart: labelWidth, marginBottom: space.xs }]}>
            {months.map((m, i) => (
              <View key={`${m.month}-${i}`} style={{ width: m.span * pitch - (i === months.length - 1 ? GAP : 0) }}>
                {m.span * pitch >= 34 && m.month > 0 ? (
                  <Text
                    variant="caption"
                    color="muted"
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                    style={styles.monthLabel}
                  >
                    {t(`calendar.months.m${m.month}`)}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>

          <Animated.View entering={FadeIn.duration(300)} style={styles.row}>
            {/* Weekday labels */}
            <View style={{ width: labelWidth, gap: GAP }}>
              {DAY_KEYS.map((k, r) => (
                <View key={k} style={{ height: cellSize, justifyContent: 'center' }}>
                  {LABEL_ROWS.has(r) ? (
                    <Text variant="caption" color="muted" numberOfLines={1} style={styles.dayLabel}>
                      {t(`calendar.days.${k}`)}
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>

            {/* Grid */}
            <View style={[styles.row, { gap: GAP }]}>
              {columns.map((col, w) => (
                <View key={`w${w}`} style={{ gap: GAP }}>
                  {col.map((cell, r) =>
                    cell ? (
                      <DayCell
                        key={cell.date}
                        cell={cell}
                        size={cellSize}
                        color={levelColor(cell.level)}
                        selected={selected?.date === cell.date}
                        ringColor={colors.ink}
                        label={t('calendar.cellA11y', { date: dateLabel(cell.date), level: levelLabel(cell.level) })}
                        onPress={onCellPress}
                      />
                    ) : (
                      <View key={`e${r}`} style={{ width: cellSize, height: cellSize }} />
                    ),
                  )}
                </View>
              ))}
            </View>
          </Animated.View>

          {/* Selected day detail */}
          {selected ? (
            <Animated.View
              key={selected.date}
              entering={FadeInDown.duration(220)}
              style={[styles.tooltip, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}
            >
              <View style={[styles.swatch, { backgroundColor: levelColor(selected.level), borderColor: colors.border }]} />
              <View style={styles.flex}>
                <Text variant="label" numberOfLines={1}>
                  {dateLabel(selected.date)}
                </Text>
                <Text variant="caption" color="muted" numberOfLines={1}>
                  {levelLabel(selected.level)}
                </Text>
              </View>
            </Animated.View>
          ) : null}

          {/* Hint + legend on one row */}
          <View style={styles.footer}>
            <Text variant="caption" color="muted" numberOfLines={2} style={styles.flex}>
              {selected ? ' ' : t('calendar.hint')}
            </Text>
            <View style={styles.legend}>
              <Text variant="caption" color="muted">
                {t('calendar.less')}
              </Text>
              {[0, 1, 2, 3, 4].map((l) => (
                <View
                  key={l}
                  style={[styles.legendCell, { backgroundColor: levelColor(l) }]}
                  accessibilityLabel={levelLabel(l)}
                />
              ))}
              <Text variant="caption" color="muted">
                {t('calendar.more')}
              </Text>
            </View>
          </View>
        </>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  root: { minHeight: 140 },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  flex: { flex: 1 },
  monthLabel: { fontSize: 11, lineHeight: 14 },
  dayLabel: { fontSize: 10, lineHeight: 12 },
  tooltip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.md,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  swatch: { width: 18, height: 18, borderRadius: 5, borderWidth: StyleSheet.hairlineWidth },
  footer: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.md },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendCell: { width: 11, height: 11, borderRadius: 3 },
});
