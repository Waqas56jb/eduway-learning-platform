import { memo, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Badge, Card, Chip, LineChart, Text, toast } from '@/components/ui';
import { quizTrend } from '@/data';
import { useI18n } from '@/hooks/useI18n';
import { space, subjectColors } from '@/theme';
import type { SubjectId } from '@/types';
import { haptic } from '@/utils/haptics';

const SUBJECT_IDS: SubjectId[] = ['math', 'physics', 'chemistry', 'biology', 'english'];

/** 8-week quiz score trend per subject with toggleable legend chips. */
export const ScoreTrend = memo(function ScoreTrend() {
  const { t } = useI18n('progress');
  const [hidden, setHidden] = useState<Set<SubjectId>>(() => new Set());

  const labels = useMemo(() => quizTrend.map((w) => t('trend.week', { n: w.week })), [t]);

  const series = useMemo(
    () =>
      SUBJECT_IDS.filter((id) => !hidden.has(id)).map((id) => ({
        key: id,
        color: subjectColors[id],
        values: quizTrend.map((w) => w[id]),
      })),
    [hidden],
  );

  const { average, delta } = useMemo(() => {
    const visible = SUBJECT_IDS.filter((id) => !hidden.has(id));
    const first = quizTrend[0];
    const last = quizTrend[quizTrend.length - 1];
    if (!first || !last || !visible.length) return { average: 0, delta: 0 };
    const avg = (row: typeof last) => visible.reduce((acc, id) => acc + row[id], 0) / visible.length;
    return { average: Math.round(avg(last)), delta: Math.round(avg(last) - avg(first)) };
  }, [hidden]);

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
          return (
            <Chip
              key={id}
              label={t(`common:subjects.${id}`)}
              color={subjectColors[id]}
              selected={!hidden.has(id)}
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
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.lg },
});
