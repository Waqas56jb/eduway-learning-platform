import { memo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { StatTile } from '@/components/student/StatTile';
import { useDashboard } from '@/api';
import { useI18n } from '@/hooks/useI18n';
import { useAuthStore } from '@/store';
import { SCREEN_PADDING, space, useTheme } from '@/theme';

const GAP = space.md;

/** 2×2 KPI grid with equal tile widths computed from the window width. */
export const StatsGrid = memo(function StatsGrid() {
  const { colors } = useTheme();
  const { t } = useI18n('home');
  const { width } = useWindowDimensions();
  const { data } = useDashboard();
  const userAiUsed = useAuthStore((s) => s.user?.aiUsed ?? 0);
  const userAiQuota = useAuthStore((s) => s.user?.aiQuota ?? 0);
  const completed = data?.lessons.completed ?? 0;
  const totalLessons = data?.lessons.total ?? 0;
  const quizAvg = data?.quizAverage ?? null;
  const unresolved = data?.unresolvedMistakes ?? 0;
  const aiQuota = data?.aiAllowance.quota ?? userAiQuota;
  const aiLeft = data?.aiAllowance.remaining ?? Math.max(0, userAiQuota - userAiUsed);

  const tileWidth = Math.floor((width - SCREEN_PADDING * 2 - GAP) / 2);
  const tile = { width: tileWidth, flex: 0 } as const;

  return (
    <View style={styles.grid}>
      <View style={styles.row}>
        <StatTile
          icon="check-circle"
          label={t('stats.lessonsDone')}
          value={String(completed)}
          sublabel={t('stats.lessonsSub', { total: totalLessons })}
          color={colors.success}
          onPress={() => router.push('/progress')}
          style={tile}
        />
        <StatTile
          icon="target"
          label={t('stats.quizAvg')}
          value={quizAvg === null ? '—' : `${Math.round(quizAvg)}%`}
          sublabel={t('stats.quizSub')}
          color={colors.info}
          onPress={() => router.push('/progress')}
          style={tile}
        />
      </View>
      <View style={styles.row}>
        <StatTile
          icon="mistakes"
          label={t('stats.mistakes')}
          value={String(unresolved)}
          sublabel={unresolved > 0 ? t('stats.mistakesSub') : t('stats.mistakesClear')}
          color={colors.danger}
          onPress={() => router.push('/mistakes')}
          style={tile}
        />
        <StatTile
          icon="sparkles"
          label={t('stats.ai')}
          value={String(aiLeft)}
          sublabel={t('stats.aiSub', { total: aiQuota })}
          color={colors.accent}
          onPress={() => router.navigate('/(tabs)/tutor')}
          style={tile}
        />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  grid: { gap: GAP },
  row: { flexDirection: 'row', gap: GAP, alignItems: 'stretch' },
});
