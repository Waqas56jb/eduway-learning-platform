import { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon } from '@/components/icons';
import { AreaChart, Text } from '@/components/ui';
import { weeklyStudy } from '@/data';
import { dayKey, lastWeekStudyMinutes } from '@/data/home';
import { useI18n } from '@/hooks/useI18n';
import { radius, shadows, space, useTheme } from '@/theme';

/** Weekly study-minutes area chart with total hours, daily average and week-over-week delta. */
export const WeeklyChart = memo(function WeeklyChart() {
  const { colors, isDark } = useTheme();
  const { t } = useI18n('home');

  const { data, totalMin, avgMin, delta } = useMemo(() => {
    const d = weeklyStudy.map((w) => ({ label: t(`days.${dayKey(w.day.en)}`), value: w.minutes }));
    const total = weeklyStudy.reduce((acc, w) => acc + w.minutes, 0);
    return {
      data: d,
      totalMin: total,
      avgMin: Math.round(total / weeklyStudy.length),
      delta: Math.round(((total - lastWeekStudyMinutes) / lastWeekStudyMinutes) * 100),
    };
  }, [t]);

  const up = delta >= 0;
  const hours = (totalMin / 60).toFixed(1);

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, !isDark && shadows.sm]}>
      <View style={styles.top}>
        <View style={styles.flex}>
          <Text variant="caption" color="muted">
            {t('weekly.totalLabel')}
          </Text>
          <Text variant="h1" display tabular>
            {t('weekly.hours', { value: hours })}
          </Text>
          <Text variant="caption" color="muted" tabular>
            {t('weekly.dailyAvg', { value: avgMin })}
          </Text>
        </View>
        <View style={[styles.delta, { backgroundColor: up ? colors.successSoft : colors.dangerSoft }]}>
          <Icon name="chart" size={14} color={up ? colors.success : colors.danger} />
          <Text variant="label" color={up ? 'success' : 'danger'} tabular numberOfLines={2} style={styles.deltaText}>
            {t('weekly.vsLastWeek', { value: `${up ? '+' : ''}${delta}` })}
          </Text>
        </View>
      </View>
      <AreaChart
        data={data}
        height={150}
        color={colors.accent}
        showDots
        formatValue={(n) => t('weekly.minutes', { value: Math.round(n) })}
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
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    maxWidth: '50%',
  },
  deltaText: { flexShrink: 1 },
  flex: { flex: 1 },
});
