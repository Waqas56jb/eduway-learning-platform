import { memo, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Badge, Card, LineChart, PressableScale, Text, toast } from '@/components/ui';
import { useScoreTrend } from '@/api/progress';
import { useI18n } from '@/hooks/useI18n';
import { radius, space, subjectColors, useTheme } from '@/theme';
import type { SubjectId } from '@/types';
import { haptic } from '@/utils/haptics';

/** Carry the last known weekly score forward over weeks without quizzes (the chart needs numbers). */
function fillGaps(values: (number | null | undefined)[]): number[] {
  const firstKnown = values.find((v) => typeof v === 'number') ?? 0;
  let last = firstKnown;
  return values.map((v) => {
    if (typeof v === 'number') last = v;
    return last;
  });
}

/** Legend chip that keeps the subject color visible in both states (filled dot = shown). */
const LegendChip = memo(function LegendChip({
  label,
  color,
  on,
  a11y,
  onPress,
}: {
  label: string;
  color: string;
  on: boolean;
  a11y: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      haptics={false}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      accessibilityLabel={a11y}
      hitSlop={6}
      style={[
        styles.chip,
        on
          ? { backgroundColor: `${color}1F`, borderColor: `${color}66` }
          : { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <View style={[styles.dot, on ? { backgroundColor: color } : { borderWidth: 1.5, borderColor: colors.muted }]} />
      <Text variant="label" color={on ? 'ink' : 'muted'} numberOfLines={1}>
        {label}
      </Text>
    </PressableScale>
  );
});

/** 8-week quiz score trend per subject with toggleable legend chips. */
export const ScoreTrend = memo(function ScoreTrend() {
  const { t } = useI18n('progress');
  const [hidden, setHidden] = useState<Set<SubjectId>>(() => new Set());
  const { data } = useScoreTrend(8);
  const weeks = useMemo(() => data?.weeks ?? [], [data]);
  const SUBJECT_IDS = useMemo(() => (data?.subjects ?? []).map((s) => s.slug as SubjectId), [data]);
  const colorOf = useMemo(() => {
    const m = new Map((data?.subjects ?? []).map((s) => [s.slug, s.color]));
    return (id: SubjectId) => subjectColors[id] ?? m.get(id) ?? '#C9A24A';
  }, [data]);

  const labels = useMemo(() => weeks.map((w) => t('trend.week', { n: w.week })), [t, weeks]);

  const filled = useMemo(() => {
    const out: Record<string, number[]> = {};
    for (const id of SUBJECT_IDS) out[id] = fillGaps(weeks.map((w) => w.scores[id]));
    return out;
  }, [SUBJECT_IDS, weeks]);

  const series = useMemo(
    () =>
      SUBJECT_IDS.filter((id) => !hidden.has(id)).map((id) => ({
        key: id,
        color: colorOf(id),
        values: filled[id] ?? [],
      })),
    [hidden, SUBJECT_IDS, filled, colorOf],
  );

  const { average, delta } = useMemo(() => {
    const visible = SUBJECT_IDS.filter((id) => !hidden.has(id));
    const n = weeks.length;
    if (n === 0 || !visible.length) return { average: 0, delta: 0 };
    const avg = (i: number) => visible.reduce((acc, id) => acc + (filled[id]?.[i] ?? 0), 0) / visible.length;
    return { average: Math.round(avg(n - 1)), delta: Math.round(avg(n - 1) - avg(0)) };
  }, [hidden, SUBJECT_IDS, weeks, filled]);

  const toggle = (id: SubjectId) => {
    if (!hidden.has(id) && hidden.size >= SUBJECT_IDS.length - 1) {
      haptic.warning();
      toast.info(t('trend.keepOne'));
      return;
    }
    haptic.selection();
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Card>
      <View style={styles.header}>
        <View style={styles.flex}>
          <Text variant="caption" color="muted">
            {t('trend.average')}
          </Text>
          <Text variant="display" display tabular>
            {`${average}%`}
          </Text>
        </View>
        {delta > 0 ? <Badge label={t('trend.delta', { value: delta })} tone="success" icon="chart" size="sm" /> : null}
      </View>

      <View style={styles.chart}>
        <LineChart series={series} labels={labels} height={180} yMax={100} />
      </View>

      <View style={styles.legend}>
        {SUBJECT_IDS.map((id) => {
          const label = t(`common:subjects.${id}`);
          return (
            <LegendChip
              key={id}
              label={label}
              color={colorOf(id)}
              on={!hidden.has(id)}
              a11y={t('trend.toggleA11y', { subject: label })}
              onPress={() => toggle(id)}
            />
          );
        })}
      </View>
    </Card>
  );
});

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: space.sm },
  flex: { flex: 1 },
  chart: { marginTop: space.lg, marginHorizontal: -space.xs },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + 2,
    minHeight: 34,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.lg },
});
