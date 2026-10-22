import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { ProgressRing, Text } from '@/components/ui';
import { useProgressSummary, useSubjects } from '@/api';
import { useI18n } from '@/hooks/useI18n';
import { radius, shadows, space, useTheme } from '@/theme';
import { formatNumber } from '@/utils/format';

/** Slim overall-progress strip under the Subjects title: ring + headline + totals. */
export const SubjectsSummary = memo(function SubjectsSummary() {
  const { t, lang } = useI18n('subjects');
  const { colors } = useTheme();
  const { data } = useProgressSummary();
  const overall = Math.round(data?.overallAvgPct ?? 0);
  const completed = data?.completedLessons ?? 0;
  const totalLessons = data?.totalLessons ?? 0;
  const subjects = useSubjects().data;
  const hours = Math.round((subjects ?? []).reduce((acc, s) => acc + s.hours, 0) * 10) / 10;

  const stats = [
    `${formatNumber(completed, lang)}/${formatNumber(totalLessons, lang)} ${t('summary.lessons')}`,
    `${formatNumber(hours, lang)} ${t('summary.hours')}`,
  ].join('  ·  ');

  return (
    <View
      style={[styles.wrap, shadows.sm, { backgroundColor: colors.surface, borderColor: colors.border }]}
      accessible
      accessibilityLabel={`${t('summary.overall')} ${overall}%, ${stats}`}
    >
      <ProgressRing progress={overall} size={56} strokeWidth={5} label={`${overall}%`} />
      <View style={styles.text}>
        <Text variant="overline" color="accent" numberOfLines={1}>
          {t('summary.overall')}
        </Text>
        <Text variant="bodyBold" numberOfLines={1}>
          {t('summary.keepGoing')}
        </Text>
        <Text variant="caption" color="muted" numberOfLines={1} tabular>
          {stats}
        </Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  text: { flex: 1, gap: 2 },
});
