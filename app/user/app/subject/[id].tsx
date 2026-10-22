import { useCallback, useMemo, useState } from 'react';
import { Share, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Animated, {
  Extrapolation,
  FadeIn,
  FadeInDown,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, SubjectIcon, type IconName } from '@/components/icons';
import { Header, Screen } from '@/components/layout';
import { ExamsTab } from '@/components/subjects/ExamsTab';
import { GlassButton } from '@/components/subjects/GlassButton';
import { LessonsTab } from '@/components/subjects/LessonsTab';
import { QuestionBankTab } from '@/components/subjects/QuestionBankTab';
import { Button, EmptyState, SegmentedControl, SkeletonCard, Text, toast } from '@/components/ui';
import { BLURHASH } from '@/constants/images';
import { isLockedError, toLesson, toSubject, useSubject } from '@/api';
import { openSubscription } from '@/api/locked';
import type { SubjectDetail as SubjectDetailDto } from '@/api/types';
import { useI18n } from '@/hooks/useI18n';
import { useAuthStore } from '@/store';
import { gradients, palette, radius, SCREEN_PADDING, space, subjectColors, useTheme } from '@/theme';
import type { Lesson, Subject } from '@/types';
import { formatNumber } from '@/utils/format';

type TabKey = 'lessons' | 'bank' | 'exams';

const HERO_MIN = 250;
const HERO_MAX = 330;
const BAR_H = 56;
const SHEET_OVERLAP = 28;
const SHEET_PAD = space.lg;

export default function SubjectDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useSubject(id);
  const { t } = useI18n('subjects');

  if (query.isLoading) {
    return (
      <Screen>
        <Header />
        <View style={styles.loading}>
          <SkeletonCard media lines={2} />
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </View>
      </Screen>
    );
  }

  if (!query.data) {
    if (query.isError && isLockedError(query.error)) {
      return (
        <Screen>
          <Header />
          <EmptyState
            icon="lock"
            title={t('common:premium.locked')}
            message={query.error.message || t('common:errors.locked')}
            actionLabel={t('common:premium.viewPlans')}
            onAction={() => openSubscription(query.error.locked ?? { reason: 'NO_SUBSCRIPTION', subjectSlug: id })}
          />
        </Screen>
      );
    }
    // Anything but a definitive 404 (offline, timeout, 5xx) is retryable.
    const retryable = query.isError && query.error?.status !== 404;
    return (
      <Screen>
        <Header />
        <EmptyState
          icon={retryable ? 'wifi-off' : 'subjects'}
          title={retryable ? t('common:states.error') : t('detail.notFoundTitle')}
          message={retryable ? query.error?.message : t('detail.notFoundMessage')}
          actionLabel={retryable ? t('common:actions.retry') : t('common:actions.goHome')}
          onAction={() => (retryable ? void query.refetch() : router.replace('/(tabs)/subjects'))}
        />
      </Screen>
    );
  }
  return <SubjectDetail detail={query.data} />;
}

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
}

function SubjectDetail({ detail }: { detail: SubjectDetailDto }) {
  const { colors } = useTheme();
  const { t, L, lang } = useI18n(['subjects', 'common']);
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const subject: Subject = useMemo(() => toSubject(detail), [detail]);
  const entitled = useAuthStore((s) => s.hasSubject(subject.id));
  // Server lock flag wins; null (unknown) falls back to the cached entitlements.
  const locked = detail.locked === null ? !entitled : detail.locked;
  const completion = Math.round(detail.progress?.avgPct ?? 0);
  const color = subjectColors[subject.id] ?? subject.color;

  const [tab, setTab] = useState<TabKey>('lessons');
  const [saved, setSaved] = useState(false);

  const subjectLessons = useMemo(() => detail.lessons.map(toLesson), [detail.lessons]);
  const examCount = detail.examsCount;

  /** First in-progress lesson, else first not-started, else the first lesson (review). */
  const next = useMemo((): { lesson: Lesson; kind: 'continue' | 'start' | 'review' } | null => {
    const inProgress = subjectLessons.find((l) => l.status === 'in-progress');
    if (inProgress) return { lesson: inProgress, kind: 'continue' };
    const notStarted = subjectLessons.find((l) => l.status === 'not-started');
    if (notStarted) return { lesson: notStarted, kind: 'start' };
    const first = subjectLessons.find((l) => l.id === detail.nextLessonId) ?? subjectLessons[0];
    return first ? { lesson: first, kind: 'review' } : null;
  }, [subjectLessons, detail.nextLessonId]);

  const heroH = Math.round(Math.min(HERO_MAX, Math.max(HERO_MIN, winH * 0.34))) + insets.top;
  const barH = insets.top + BAR_H;
  const tabsTop = heroH - SHEET_OVERLAP + SHEET_PAD;
  const footerH = space.md + 52 + Math.max(insets.bottom, space.md) + space.md;

  // ---- scroll-driven animation ----
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    },
  });

  const imageStyle = useAnimatedStyle(() => {
    const y = scrollY.value;
    return {
      transform: [
        { translateY: interpolate(y, [-heroH, 0, heroH], [-heroH / 2, 0, heroH * 0.45], Extrapolation.CLAMP) },
        { scale: interpolate(y, [-heroH, 0], [2, 1], Extrapolation.CLAMP) },
      ],
    };
  });

  const heroContentStyle = useAnimatedStyle(() => {
    const y = scrollY.value;
    return {
      opacity: interpolate(y, [0, heroH * 0.45], [1, 0], Extrapolation.CLAMP),
      transform: [
        { translateY: interpolate(y, [-100, 0, heroH], [20, 0, heroH * 0.25], Extrapolation.CLAMP) },
        { scale: interpolate(y, [0, heroH * 0.5], [1, 0.94], Extrapolation.CLAMP) },
      ],
    };
  });

  const barBgStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [heroH - barH - 80, heroH - barH - 10], [0, 1], Extrapolation.CLAMP),
  }));

  const barTitleStyle = useAnimatedStyle(() => {
    const p = interpolate(scrollY.value, [heroH - barH - 40, heroH - barH + 10], [0, 1], Extrapolation.CLAMP);
    return { opacity: p, transform: [{ translateY: (1 - p) * 8 }] };
  });

  const tabsStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: Math.max(0, scrollY.value - (tabsTop - barH)) }],
  }));

  const tabsEdgeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [tabsTop - barH - 8, tabsTop - barH], [0, 1], Extrapolation.CLAMP),
  }));

  // ---- actions ----
  const toggleSave = useCallback(() => {
    const nv = !saved;
    setSaved(nv);
    if (nv) toast.success(t('subjects:detail.bookmarked'));
    else toast.info(t('subjects:detail.unbookmarked'));
  }, [saved, t]);

  const onShare = useCallback(() => {
    void Share.share({
      message: t('subjects:detail.shareMessage', { name: L(subject.name), teacher: L(subject.teacher) }),
    }).catch(() => undefined);
  }, [t, L, subject]);

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/subjects');
  }, []);

  const onCta = useCallback(() => {
    if (locked) return openSubscription({ reason: 'NO_SUBSCRIPTION', subjectSlug: subject.id });
    if (next) router.push({ pathname: '/lesson/[id]', params: { id: next.lesson.id } });
  }, [locked, next]);

  const onTab = useCallback((k: string) => setTab(k as TabKey), []);

  const tabOptions = useMemo(
    () => [
      { key: 'lessons', label: t('subjects:detail.tabs.lessons'), count: subjectLessons.length },
      { key: 'bank', label: t('subjects:detail.tabs.bank') },
      { key: 'exams', label: t('subjects:detail.tabs.exams'), count: examCount },
    ],
    [t, subjectLessons.length, examCount],
  );

  const ctaTitle = locked
    ? t('common:premium.unlock')
    : next
      ? t(`subjects:detail.${next.kind}`, { title: truncate(L(next.lesson.title), 28) })
      : t('common:actions.continue');

  const name = L(subject.name);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />

      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: footerH + space.xxl }}
      >
        {/* ---- Hero ---- */}
        <View style={[styles.hero, { height: heroH }]}>
          <Animated.View style={[StyleSheet.absoluteFill, imageStyle]}>
            <Image
              source={{ uri: subject.image }}
              placeholder={{ blurhash: BLURHASH }}
              transition={300}
              contentFit="cover"
              cachePolicy="memory-disk"
              style={StyleSheet.absoluteFill}
            />
            <LinearGradient colors={gradients.imageOverlay} style={StyleSheet.absoluteFill} />
            <LinearGradient
              colors={['rgba(7,20,38,0.55)', 'rgba(7,20,38,0)']}
              style={[styles.topShade, { height: barH + 30 }]}
            />
          </Animated.View>

          <Animated.View style={[styles.heroContent, { paddingBottom: SHEET_OVERLAP + space.lg }, heroContentStyle]}>
            <Animated.View entering={FadeInDown.duration(320)} style={styles.heroChipRow}>
              <View style={[styles.heroIcon, { backgroundColor: color }]}>
                <SubjectIcon subjectId={subject.id} size={20} color="#FFFFFF" />
              </View>
              <Text variant="overline" color={palette.goldLight} numberOfLines={1} style={styles.flex}>
                {L(subject.tagline)}
              </Text>
              {locked ? (
                <View style={styles.lockPill}>
                  <Icon name="lock" size={12} color="#FFFFFF" />
                  <Text variant="caption" color="#FFFFFF" style={styles.lockText}>
                    {t('common:premium.locked')}
                  </Text>
                </View>
              ) : null}
            </Animated.View>
            <Animated.View entering={FadeInDown.duration(320).delay(60)}>
              <Text variant="display" color="#FFFFFF" numberOfLines={2} accessibilityRole="header">
                {name}
              </Text>
              <View style={styles.teacherRow}>
                <Icon name="user" size={14} color="rgba(255,255,255,0.8)" />
                <Text variant="label" color="rgba(255,255,255,0.85)" numberOfLines={1}>
                  {L(subject.teacher)}
                </Text>
              </View>
            </Animated.View>
            <Animated.View entering={FadeInDown.duration(320).delay(120)} style={styles.statsRow}>
              <HeroStat icon="lesson" value={formatNumber(subject.lessonsCount, lang)} label={t('subjects:detail.stats.lessons')} />
              <HeroStat icon="clock" value={formatNumber(subject.hours, lang)} label={t('subjects:detail.stats.hours')} />
              <HeroStat
                icon="question-bank"
                value={formatNumber(subject.questionsCount, lang)}
                label={t('subjects:detail.stats.questions')}
              />
              <HeroStat icon="check-circle" value={`${locked ? 0 : completion}%`} label={t('subjects:detail.stats.done')} gold />
            </Animated.View>
          </Animated.View>
        </View>

        {/* ---- Sheet ---- */}
        <View
          style={[
            styles.sheet,
            { backgroundColor: colors.background, marginTop: -SHEET_OVERLAP, paddingTop: SHEET_PAD },
          ]}
        >
          <Animated.View style={[styles.tabs, { backgroundColor: colors.background }, tabsStyle]}>
            <SegmentedControl options={tabOptions} value={tab} onChange={onTab} />
            <Animated.View
              pointerEvents="none"
              style={[styles.tabsEdge, { backgroundColor: colors.border }, tabsEdgeStyle]}
            />
          </Animated.View>

          <Animated.View key={tab} entering={FadeIn.duration(250)} style={styles.tabBody}>
            {tab === 'lessons' ? (
              <LessonsTab
                subject={subject}
                lessons={subjectLessons}
                locked={locked}
                activeUnitId={next?.kind === 'review' ? undefined : next?.lesson.unitId}
              />
            ) : tab === 'bank' ? (
              <QuestionBankTab subject={subject} locked={locked} />
            ) : (
              <ExamsTab subject={subject} locked={locked} />
            )}
          </Animated.View>
        </View>
      </Animated.ScrollView>

      {/* ---- Compact top bar ---- */}
      <View style={[styles.bar, { height: barH, paddingTop: insets.top }]} pointerEvents="box-none">
        <Animated.View style={[StyleSheet.absoluteFill, styles.barBg, barBgStyle]} pointerEvents="none">
          <LinearGradient colors={gradients.navy} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
          <View style={[styles.barStripe, { backgroundColor: color }]} />
        </Animated.View>
        <GlassButton icon="back" onPress={goBack} accessibilityLabel={t('common:a11y.back')} />
        <Animated.View style={[styles.barTitle, barTitleStyle]} pointerEvents="none">
          <Text variant="h3" color="#FFFFFF" numberOfLines={1} align="center">
            {name}
          </Text>
        </Animated.View>
        <View style={styles.barActions}>
          <GlassButton
            icon="bookmark"
            filled={saved}
            color={saved ? palette.gold : '#FFFFFF'}
            onPress={toggleSave}
            accessibilityLabel={t('subjects:detail.bookmark')}
          />
          <GlassButton icon="share" onPress={onShare} accessibilityLabel={t('subjects:detail.share')} />
        </View>
      </View>

      {/* ---- Sticky CTA ---- */}
      <View
        style={[
          styles.footer,
          {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            paddingBottom: Math.max(insets.bottom, 12),
          },
        ]}
      >
        <Button
          title={ctaTitle}
          variant="primary"
          size="lg"
          icon={locked ? 'lock' : 'play'}
          fullWidth
          onPress={onCta}
          accessibilityLabel={locked ? t('common:premium.unlock') : next ? L(next.lesson.title) : undefined}
        />
      </View>
    </View>
  );
}

function HeroStat({ icon, value, label, gold }: { icon: IconName; value: string; label: string; gold?: boolean }) {
  return (
    <View style={[styles.stat, gold && styles.statGold]}>
      <Icon name={icon} size={14} color={gold ? palette.gold : 'rgba(255,255,255,0.85)'} />
      <Text variant="label" color="#FFFFFF" tabular>
        {value}
      </Text>
      <Text variant="caption" color="rgba(255,255,255,0.72)" numberOfLines={1} style={styles.statLabel}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  loading: { gap: space.lg, paddingTop: space.lg },
  hero: { overflow: 'visible', justifyContent: 'flex-end' },
  topShade: { position: 'absolute', top: 0, start: 0, end: 0 },
  heroContent: { paddingHorizontal: SCREEN_PADDING, gap: space.md },
  heroChipRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  heroIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  lockPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: space.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(7,20,38,0.7)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(201,162,74,0.7)',
  },
  lockText: { fontSize: 11 },
  teacherRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space.xs },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: space.sm + 2,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  statGold: { borderColor: 'rgba(201,162,74,0.6)', backgroundColor: 'rgba(201,162,74,0.18)' },
  statLabel: { maxWidth: 70 },
  sheet: {
    borderTopStartRadius: radius.xl,
    borderTopEndRadius: radius.xl,
    paddingHorizontal: SCREEN_PADDING,
  },
  tabs: { zIndex: 10, elevation: 4, paddingVertical: space.sm, marginHorizontal: -SCREEN_PADDING, paddingHorizontal: SCREEN_PADDING },
  tabsEdge: { position: 'absolute', start: 0, end: 0, bottom: 0, height: StyleSheet.hairlineWidth },
  tabBody: { paddingTop: space.lg },
  bar: {
    position: 'absolute',
    top: 0,
    start: 0,
    end: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    gap: space.sm,
    zIndex: 20,
  },
  barBg: { overflow: 'hidden' },
  barStripe: { position: 'absolute', start: 0, end: 0, bottom: 0, height: 2 },
  barTitle: { flex: 1, paddingHorizontal: space.xs },
  barActions: { flexDirection: 'row', gap: space.sm },
  footer: {
    position: 'absolute',
    start: 0,
    end: 0,
    bottom: 0,
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
