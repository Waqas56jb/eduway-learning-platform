import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
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
  SubjectCarousel,
  SubscriptionCard,
  TodayPlan,
  WeeklyChart,
} from '@/components/home';
import { ContinueCard } from '@/components/student/ContinueCard';
import { SectionHeader } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { useAuthStore, useProgressStore } from '@/store';
import { space } from '@/theme';

const INITIAL_LOAD_MS = 600;
const REFRESH_MS = 1200;

function Section({ index, children }: { index: number; children: ReactNode }) {
  return (
    <Animated.View entering={FadeInDown.duration(420).delay(80 + index * 70)} style={styles.section}>
      {children}
    </Animated.View>
  );
}

export default function HomeScreen() {
  const { t } = useI18n('home');
  const lastLessonId = useAuthStore((s) => s.user?.lastLessonId);
  const overall = useProgressStore((s) => s.subjectCompletion());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timer.current = setTimeout(() => setLoading(false), INITIAL_LOAD_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const onRefresh = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setRefreshing(true);
    setLoading(true);
    timer.current = setTimeout(() => {
      setLoading(false);
      setRefreshing(false);
    }, REFRESH_MS);
  }, []);

  return (
    <Screen scroll tabBarSpace refreshing={refreshing} onRefresh={onRefresh}>
      <Animated.View entering={FadeInDown.duration(380)} style={styles.header}>
        <HomeHeader />
      </Animated.View>

      {loading ? (
        <HomeSkeleton />
      ) : (
        <View>
          <Section index={0}>
            <SubscriptionCard />
          </Section>

          {lastLessonId ? (
            <Section index={1}>
              <SectionHeader title={t('continue.title')} />
              <ContinueCard lessonId={lastLessonId} />
            </Section>
          ) : null}

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
            <View style={styles.stack}>
              <TodayPlan />
              <ExamReminder />
            </View>
          </Section>

          <Section index={5}>
            <SectionHeader
              title={t('weekly.title')}
              actionLabel={t('weekly.seeProgress')}
              onAction={() => router.push('/progress')}
            />
            <WeeklyChart />
          </Section>

          <Section index={6}>
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
  section: { marginTop: space.xxl },
  stack: { gap: space.md },
});
