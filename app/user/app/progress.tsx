import { useMemo, type ReactNode } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Header, Screen } from '@/components/layout';
import { ActivityTimeline } from '@/components/progress/ActivityTimeline';
import { BadgesGrid } from '@/components/progress/BadgesGrid';
import { HeroSummary } from '@/components/progress/HeroSummary';
import { ScoreTrend } from '@/components/progress/ScoreTrend';
import { SubjectRings } from '@/components/progress/SubjectRings';
import { WeakTopics } from '@/components/progress/WeakTopics';
import { StreakCalendar } from '@/components/student';
import { Card, SectionHeader } from '@/components/ui';
import { activityHeatmap, demoUser, lessonsBySubject, subjects } from '@/data';
import { achievements, minutesPerLevel } from '@/data/progress';
import { useI18n } from '@/hooks/useI18n';
import { useAuthStore, useProgressStore } from '@/store';
import { SCREEN_PADDING, space } from '@/theme';

function Section({ index, children }: { index: number; children: ReactNode }) {
  return (
    <Animated.View entering={FadeInDown.duration(420).delay(60 + index * 70)} style={styles.section}>
      {children}
    </Animated.View>
  );
}

export default function ProgressScreen() {
  const { t } = useI18n('progress');
  const insets = useSafeAreaInsets();

  const streak = useAuthStore((s) => s.user?.streak ?? demoUser.streak);
  const lessonProgress = useProgressStore((s) => s.lessonProgress);
  const completion = useProgressStore((s) => s.subjectCompletion());
  const lessonsDone = useProgressStore((s) => s.completedCount());

  const subjectItems = useMemo(() => {
    // Same formula as progressStore.subjectCompletion, recomputed whenever lesson progress changes.
    return subjects.map((subject) => {
      const list = lessonsBySubject(subject.id);
      const sum = list.reduce((acc, l) => {
        const p = lessonProgress[l.id];
        return acc + (p?.status === 'completed' ? 100 : (p?.progress ?? 0));
      }, 0);
      return { subject, completion: list.length ? Math.round(sum / list.length) : 0 };
    });
  }, [lessonProgress]);

  const { activeDays, hours } = useMemo(() => {
    let days = 0;
    let minutes = 0;
    for (const d of activityHeatmap) {
      if (d.level > 0) days += 1;
      minutes += minutesPerLevel[Math.max(0, Math.min(4, d.level))] ?? 0;
    }
    return { activeDays: days, hours: Math.round(minutes / 60) };
  }, []);

  const earnedCount = useMemo(() => achievements.filter((a) => a.earned).length, []);

  return (
    <Screen padded={false}>
      <Header title={t('title')} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.huge }]}
      >
        <Section index={0}>
          <HeroSummary
            completion={completion}
            streak={streak}
            activeDays={activeDays}
            hours={hours}
            lessonsDone={lessonsDone}
          />
        </Section>

        <Section index={1}>
          <SectionHeader title={t('subjects.title')} subtitle={t('subjects.subtitle')} />
          <SubjectRings items={subjectItems} />
        </Section>

        <Section index={2}>
          <SectionHeader title={t('trend.title')} subtitle={t('trend.subtitle')} />
          <ScoreTrend />
        </Section>

        <Section index={3}>
          <SectionHeader title={t('weak.title')} subtitle={t('weak.subtitle')} />
          <WeakTopics />
        </Section>

        <Section index={4}>
          <SectionHeader title={t('calendar.title')} subtitle={t('calendar.subtitle')} />
          <Card>
            <StreakCalendar data={activityHeatmap} weeks={16} />
          </Card>
        </Section>

        <Section index={5}>
          <SectionHeader
            title={t('badges.title')}
            subtitle={t('badges.earnedCount', { earned: earnedCount, total: achievements.length })}
          />
          <BadgesGrid items={achievements} />
        </Section>

        <Section index={6}>
          <SectionHeader title={t('activity.title')} />
          <ActivityTimeline />
        </Section>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: SCREEN_PADDING, paddingTop: space.sm, gap: space.xxl },
  section: { gap: space.md },
});
