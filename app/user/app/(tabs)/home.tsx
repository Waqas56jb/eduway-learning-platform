import { useCallback, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Screen } from '@/components/layout';
import {
  ExamReminder,
  HomeHeader,
  HomeSkeleton,
  QuickActions,
  StatsGrid,
  StreakPlanCard,
  SubjectCarousel,
  TodayPlan,
  WeeklyChart,
} from '@/components/home';
import { ContinueCard } from '@/components/student/ContinueCard';
import { EmptyState, SectionHeader } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { qk, useDashboard } from '@/api';
import { queryClient } from '@/api/queryClient';
import { space } from '@/theme';

/** Vertical rhythm between Home sections (DESIGN.md: 28–32). */
const SECTION_GAP = 28;

/** Short staggered entrance: 350ms, delay capped at 300ms. */
function Section({ index, children, first }: { index: number; children: ReactNode; first?: boolean }) {
  return (
    <Animated.View
      entering={FadeInDown.duration(350).delay(Math.min(index * 60, 300))}
      style={first ? styles.firstSection : styles.section}
    >
      {children}
    </Animated.View>
  );
}

export default function HomeScreen() {
  const { t } = useI18n('home');
  const dashboard = useDashboard();
  const continueLesson = dashboard.data?.continueLesson ?? null;
  const overall = dashboard.data?.lessons.pct ?? 0;
  const loading = dashboard.isLoading;
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        queryClient.refetchQueries({ queryKey: qk.progress.dashboard }),
        queryClient.refetchQueries({ queryKey: qk.catalog.subjects }),
        queryClient.refetchQueries({ queryKey: qk.progress.todayPlan }),
        queryClient.refetchQueries({ queryKey: qk.notifications.unread }),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, []);

  return (
    <Screen scroll tabBarSpace refreshing={refreshing} onRefresh={onRefresh}>
      <View style={styles.header}>
        <HomeHeader />
      </View>

      {loading ? (
        <HomeSkeleton />
      ) : dashboard.isError && !dashboard.data ? (
        <EmptyState
          icon="wifi-off"
          title={t('common:states.error')}
          message={dashboard.error.isNetwork ? t('common:states.offline') : dashboard.error.message}
          actionLabel={t('common:actions.retry')}
          onAction={() => void onRefresh()}
        />
      ) : (
        <View>
          {continueLesson ? (
            <Section index={0} first>
              <ContinueCard lesson={continueLesson} />
            </Section>
          ) : null}

          <Section index={1} first={!continueLesson}>
            <StreakPlanCard />
          </Section>

          <Section index={2}>
            <SectionHeader
              title={t('subjects.title')}
              subtitle={t('subjects.subtitle', { value: overall })}
              actionLabel={t('common:actions.seeAll')}
              onAction={() => router.navigate('/(tabs)/subjects')}
            />
            <SubjectCarousel />
          </Section>

          <Section index={3}>
            <SectionHeader title={t('stats.title')} />
            <StatsGrid />
          </Section>

          <Section index={4}>
            <SectionHeader title={t('plan.title')} />
            <TodayPlan />
          </Section>

          <Section index={5}>
            <ExamReminder />
          </Section>

          <Section index={6}>
            <SectionHeader
              title={t('weekly.title')}
              actionLabel={t('weekly.seeProgress')}
              onAction={() => router.push('/progress')}
            />
            <WeeklyChart />
          </Section>

          <Section index={7}>
            <SectionHeader title={t('quick.title')} />
            <QuickActions />
          </Section>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: space.sm },
  firstSection: { marginTop: space.xxl },
  section: { marginTop: SECTION_GAP },
});
