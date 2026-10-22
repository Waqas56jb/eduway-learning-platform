import { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon } from '@/components/icons';
import { AreaChart, Text } from '@/components/ui';
import { useDashboard } from '@/api';
import { useI18n } from '@/hooks/useI18n';
import { radius, shadows, space, useTheme } from '@/theme';

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
/** `YYYY-MM-DD` → `home:days.*` key. */
const dayKey = (date: string) => DAY_KEYS[new Date(`${date.slice(0, 10)}T12:00:00Z`).getUTCDay()] ?? 'sat';

/** Weekly study-minutes area chart with total hours, daily average and week-over-week delta. */
export const WeeklyChart = memo(function WeeklyChart() {
  const { colors, isDark } = useTheme();
  const { t } = useI18n('home');
  const weekly = useDashboard().data?.weeklyStudy;

  const { data, totalMin, avgMin, delta } = useMemo(() => {
    const days = weekly?.days ?? [];
    const d = days.map((w) => ({ label: t(`days.${dayKey(w.date)}`), value: w.minutes }));
    const total = weekly?.totalMinutes ?? days.reduce((acc, w) => acc + w.minutes, 0);
    const last = weekly?.lastWeekTotalMinutes ?? 0;
    const change =
      weekly?.changePct ?? (last > 0 ? ((total - last) / last) * 100 : total > 0 ? 100 : 0);
    return {
      data: d,
      totalMin: total,
      avgMin: Math.round(weekly?.dailyAverageMinutes ?? (days.length ? total / days.length : 0)),
      delta: Math.round(change),
    };
  }, [t, weekly]);

  const up = delta >= 0;
  const hours = (totalMin / 60).toFixed(1);

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, !isDark && shadows.sm]}>
      <View style={styles.top}>
        <View style={styles.flex}>
          <Text variant="caption" color="muted">
            {t('weekly.totalLabel')}
          </Text>
          <Text variant="h1" display tabular numberOfLines={1} style={styles.total}>
            {t('weekly.hours', { value: hours })}
          </Text>
          <Text variant="caption" color="muted" tabular>
            {t('weekly.dailyAvg', { value: avgMin })}
          </Text>
        </View>
        <View style={[styles.delta, { backgroundColor: up ? colors.successSoft : colors.dangerSoft }]}>
          <Icon name="chart" size={14} color={up ? colors.success : colors.danger} />
          <Text variant="label" color={up ? 'success' : 'danger'} tabular numberOfLines={1} style={styles.deltaText}>
            {t('weekly.vsLastWeek', { value: `${up ? '+' : ''}${delta}` })}
          </Text>
        </View>
      </View>
      <AreaChart
        data={data}
        height={150}
        color={colors.accent}
        showDots
        formatValue={(n: number) => t('weekly.minutes', { value: Math.round(n) })}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.lg,
    gap: space.lg,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
  },
  delta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    height: 28,
    paddingHorizontal: space.sm + 2,
    borderRadius: radius.pill,
    maxWidth: '55%',
  },
  deltaText: { flexShrink: 1 },
  total: { marginVertical: 2 },
  flex: { flex: 1 },
});
