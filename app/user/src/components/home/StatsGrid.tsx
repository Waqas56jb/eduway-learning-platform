import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { StatTile } from '@/components/student/StatTile';
import { lessons } from '@/data';
import { useI18n } from '@/hooks/useI18n';
import { useAuthStore, useMistakesStore, useProgressStore } from '@/store';
import { space, useTheme } from '@/theme';

/** 2×2 KPI grid: lessons completed, quiz average, mistakes to review, AI questions left. */
export const StatsGrid = memo(function StatsGrid() {
  const { colors } = useTheme();
  const { t } = useI18n('home');
  const completed = useProgressStore((s) => s.completedCount());
  const quizAvg = useProgressStore((s) => s.quizAverage());
  const unresolved = useMistakesStore((s) => s.unresolvedCount());
  const aiUsed = useAuthStore((s) => s.user?.aiUsed ?? 0);
  const aiQuota = useAuthStore((s) => s.user?.aiQuota ?? 0);
  const aiLeft = Math.max(0, aiQuota - aiUsed);

  return (
    <View style={styles.grid}>
      <View style={styles.row}>
        <StatTile
          icon="check-circle"
          label={t('stats.lessonsDone')}
          value={String(completed)}
          sublabel={t('stats.lessonsSub', { total: lessons.length })}
          color={colors.success}
          onPress={() => router.push('/progress')}
        />
        <StatTile
          icon="target"
          label={t('stats.quizAvg')}
          value={`${quizAvg}%`}
          sublabel={t('stats.quizSub')}
          color={colors.info}
          onPress={() => router.push('/progress')}
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
        />
        <StatTile
          icon="sparkles"
          label={t('stats.ai')}
          value={`${aiLeft}/${aiQuota}`}
          sublabel={t('stats.aiSub')}
          color={colors.accent}
          onPress={() => router.navigate('/(tabs)/tutor')}
        />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  grid: { gap: space.md },
  row: { flexDirection: 'row', gap: space.md },
});
