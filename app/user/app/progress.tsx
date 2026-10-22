import { useMemo, type ReactNode } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
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
import type { Achievement } from '@/components/progress/BadgesGrid';
import { glyphs, type IconName } from '@/components/icons/paths';
import { Card, EmptyState, SectionHeader, Skeleton, SkeletonCard } from '@/components/ui';
import { qk, toSubject, useSubjects } from '@/api';
import { queryClient } from '@/api/queryClient';
import {
  useAchievements,
  useProgressSubjects,
  useProgressSummary,
  useStreakCalendar,
} from '@/api/progress';
import type { AchievementDto } from '@/api/types';
import { useI18n } from '@/hooks/useI18n';
import { useAuthStore } from '@/store';
import { SCREEN_PADDING, space } from '@/theme';

/** Vertical rhythm between sections (DESIGN.md: 28–32). */
const SECTION_GAP = 28;
/** Inner padding of the heatmap card. */
const CALENDAR_PAD = space.lg;

/** Server icon names map onto our glyph set; unknown names fall back to a medal. */
const toAchievement = (a: AchievementDto): Achievement => ({
  ...a,
  icon: (a.icon in glyphs ? a.icon : 'medal') as IconName,
  earnedAt: a.earnedAt ?? undefined,
});

function Section({ index, children }: { index: number; children: ReactNode }) {
  return (
    <Animated.View entering={FadeInDown.duration(350).delay(Math.min(index * 60, 300))}>{children}</Animated.View>
  );
}

export default function ProgressScreen() {
  const { t } = useI18n('progress');
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  // Heatmap fills the card's inner width exactly; fewer weeks on narrow phones keep cells tappable.
  const calendarWidth = width - SCREEN_PADDING * 2 - CALENDAR_PAD * 2 - StyleSheet.hairlineWidth * 2;
  const weeks = width < 375 ? 12 : 16;

  const userStreak = useAuthStore((s) => s.user?.streak ?? 0);
  const summaryQuery = useProgressSummary();
  const summary = summaryQuery.data;
  const subjectsQuery = useSubjects();
  const progressSubjects = useProgressSubjects().data;
  const calendar = useStreakCalendar(16).data;
  const achievementsData = useAchievements().data;

  const streak = summary?.streak ?? userStreak;
  const completion = Math.round(summary?.overallAvgPct ?? 0);
  const lessonsDone = summary?.completedLessons ?? 0;
  const activeDays = summary?.activeDays ?? calendar?.activeDays ?? 0;
  const hours = Math.round(summary?.studyHours ?? 0);

  const subjectItems = useMemo(() => {
    const bySlug = new Map((progressSubjects ?? []).map((p) => [p.slug, p]));
    return (subjectsQuery.data ?? []).map((s) => ({
      subject: toSubject(s),
      completion: Math.round(bySlug.get(s.slug)?.avgPct ?? s.progress?.avgPct ?? 0),
    }));
  }, [subjectsQuery.data, progressSubjects]);

  const heatmap = useMemo(() => (calendar?.days ?? []).map((d) => ({ date: d.date, level: d.level })), [calendar]);
  const achievements = useMemo(() => (achievementsData ?? []).map(toAchievement), [achievementsData]);
  const earnedCount = useMemo(() => achievements.filter((a) => a.earned).length, [achievements]);

  return (
    <Screen padded={false}>
      <Header title={t('title')} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.huge }]}
      >
        {summaryQuery.isLoading ? (
          <>
            <Skeleton height={220} radius={20} />
            <SkeletonCard lines={3} />
            <SkeletonCard lines={2} />
          </>
        ) : summaryQuery.isError && !summary ? (
          <EmptyState
            icon="wifi-off"
            title={t('common:states.error')}
            message={summaryQuery.error.isNetwork ? t('common:states.offline') : summaryQuery.error.message}
            actionLabel={t('common:actions.retry')}
            onAction={() => {
              void queryClient.refetchQueries({ queryKey: qk.progress.all });
              void subjectsQuery.refetch();
            }}
          />
        ) : (
        <>
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
          <SectionHeader title={t('calendar.title')} subtitle={t('calendar.subtitle', { count: weeks })} />
          <Card style={styles.calendarCard}>
            <StreakCalendar data={heatmap} weeks={weeks} width={calendarWidth} />
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
        </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: SCREEN_PADDING, paddingTop: space.sm, gap: SECTION_GAP },
  calendarCard: { padding: CALENDAR_PAD },
});
