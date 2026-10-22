import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Icon } from '@/components/icons';
import { Screen } from '@/components/layout';
import { Button, Chip, EmptyState, IconButton, Input, PressableScale, SectionHeader, Skeleton, Text } from '@/components/ui';
import { EntryCard, FiltersSheet, QuickStartCard, RecentAttemptRow } from '@/components/practice';
import { useBankFacets, useBookmarkIds, usePracticeSessions } from '@/api/bank';
import { useMistakeSummary } from '@/api/mistakes';
import { useScoreTrend } from '@/api/progress';
import { useAppConfig } from '@/api/public';
import type { RecentAttempt } from '@/components/practice/RecentAttemptRow';
import { useI18n } from '@/hooks/useI18n';
import { HIT_SLOP, SCREEN_PADDING, gradients, palette, radius, shadows, space, subjectColors, useTheme } from '@/theme';
import type { SubjectId } from '@/types';
import { haptic } from '@/utils/haptics';
import {
  DEFAULT_COUNT,
  SESSION_COUNTS,
  activeFilterCount,
  toBankQuery,
  toParams,
  type PracticeFilters,
} from '@/utils/practice';

const INITIAL: PracticeFilters = { difficulty: 'all', tags: [] };
const GRID_GAP = space.md;
const SEARCH_HEIGHT = 52;

const enter = (i: number) => FadeInDown.duration(350).delay(Math.min(i * 60, 300));

export default function PracticeTab() {
  const { t, L, lang } = useI18n('practice');
  const { colors } = useTheme();
  const { width } = useWindowDimensions();

  const [filters, setFilters] = useState<PracticeFilters>(INITIAL);
  const [count, setCount] = useState<number>(DEFAULT_COUNT);
  const [sheetOpen, setSheetOpen] = useState(false);

  // BNK-02: live match count for the current filters + the unfiltered catalogue for the quick-start grid.
  const bankQuery = useMemo(() => toBankQuery(filters), [filters]);
  const facets = useBankFacets(bankQuery);
  const allFacets = useBankFacets({});
  const { data: recent } = usePracticeSessions(5);
  const { data: bookmarkIds } = useBookmarkIds();
  const { data: mistakeSummary } = useMistakeSummary();
  const { data: trend } = useScoreTrend(8);
  const { data: config } = useAppConfig();
  const sizes = config?.learning.practiceSessionSizes?.length ? config.learning.practiceSessionSizes : [...SESSION_COUNTS];

  const bookmarkCount = bookmarkIds?.length ?? allFacets.data?.bookmarkedCount ?? 0;
  const unresolved = mistakeSummary?.unresolved ?? 0;

  const matchesLoaded = facets.data !== undefined;
  const matches = facets.data?.matchCount ?? 0;
  const activeCount = activeFilterCount(filters);
  const sessionSize = Math.min(count, matches);
  const practiceAttempts = useMemo<RecentAttempt[]>(
    () =>
      (recent ?? []).map((a) => ({
        id: a.id,
        subjectId: (a.subjectSlug ?? undefined) as SubjectId | undefined,
        attemptNo: a.attemptNo,
        score: a.score,
        correct: a.correct,
        total: a.total,
        date: a.date,
      })),
    [recent],
  );

  // Mastery: practice accuracy from facets, falling back to the latest weekly quiz average (PRG-07).
  const lastWeek = trend?.weeks[trend.weeks.length - 1];
  const subjectStats = useMemo(
    () =>
      (allFacets.data?.subjects ?? []).map((s) => ({
        subject: { id: s.slug as SubjectId },
        name: s.name,
        count: s.count,
        locked: s.locked,
        mastery: Math.round(s.mastery ?? lastWeek?.scores[s.slug] ?? 0),
      })),
    [allFacets.data, lastWeek],
  );
  const lockedSlugs = useMemo(
    () => new Set((allFacets.data?.subjects ?? []).filter((s) => s.locked).map((s) => s.slug)),
    [allFacets.data],
  );

  // Even grid: column width derived from the window width (2 columns on phones, 3 on large screens).
  const columns = width >= 600 ? 3 : 2;
  const contentWidth = width - SCREEN_PADDING * 2;
  const colWidth = Math.floor((contentWidth - GRID_GAP * (columns - 1)) / columns);
  const remainder = subjectStats.length % columns;

  const subjectFacet = allFacets.data?.subjects.find((s) => s.slug === filters.subjectId);
  const subject = filters.subjectId ? { id: filters.subjectId as SubjectId } : undefined;
  const subjectLabel = subject
    ? t(`common:subjects.${subject.id}`, { defaultValue: subjectFacet ? L(subjectFacet.name) : subject.id })
    : undefined;
  const unitFacet = facets.data?.units.find((u) => u.unitId === filters.unitId);
  const unit = unitFacet ? { title: unitFacet.title } : undefined;
  const topicFacet = facets.data?.topics.find((tp) => tp.topicId === filters.topic);
  const topicLabel = filters.topic ? (topicFacet ? L(topicFacet.label) : undefined) : undefined;

  const summary = useMemo(() => {
    const parts: string[] = [subjectLabel ?? t('hero.allSubjects')];
    if (unit) parts.push(L(unit.title));
    if (topicLabel) parts.push(topicLabel);
    parts.push(filters.difficulty && filters.difficulty !== 'all' ? t(`common:difficulty.${filters.difficulty}`) : t('hero.anyLevel'));
    if (filters.tags?.length) parts.push(t('hero.tags', { count: filters.tags.length }));
    if (filters.search?.trim()) parts.push(t('hero.search', { q: filters.search.trim() }));
    return parts.join('  ·  ');
  }, [L, filters.difficulty, filters.search, filters.tags, subjectLabel, t, topicLabel, unit]);

  const start = useCallback(() => {
    if (!matches) return;
    if (filters.subjectId && lockedSlugs.has(filters.subjectId)) {
      router.push({ pathname: '/subscription', params: { subject: filters.subjectId } });
      return;
    }
    haptic.medium();
    router.push({ pathname: '/question-bank/practice-session', params: toParams(filters, count) });
  }, [count, filters, lockedSlugs, matches]);

  const quickStart = useCallback(
    (s: { id: SubjectId }) => {
      if (lockedSlugs.has(s.id)) {
        router.push({ pathname: '/subscription', params: { subject: s.id } });
        return;
      }
      haptic.medium();
      router.push({
        pathname: '/question-bank/practice-session',
        params: toParams({ subjectId: s.id }, sizes[0] ?? DEFAULT_COUNT),
      });
    },
    [lockedSlugs, sizes],
  );

  const openAttempt = useCallback((a: RecentAttempt) => {
    router.push({ pathname: '/question-bank/result', params: { attemptId: a.id } });
  }, []);

  const openSheet = useCallback(() => setSheetOpen(true), []);

  const clearFilter = (patch: Partial<PracticeFilters>) => {
    haptic.selection();
    setFilters((f) => ({ ...f, ...patch }));
  };

  return (
    <Screen scroll tabBarSpace contentContainerStyle={styles.content}>
      {/* Large title */}
      <Animated.View entering={enter(0)} style={styles.titleBlock}>
        <Text variant="display" accessibilityRole="header">
          {t('title')}
        </Text>
        <Text variant="body" color="muted">
          {t('subtitle')}
        </Text>
      </Animated.View>

      {/* Search + filters, both 52pt so they align on one baseline */}
      <Animated.View entering={enter(1)} style={styles.searchBlock}>
        <View style={styles.searchRow}>
          <Input
            value={filters.search ?? ''}
            onChangeText={(v) => setFilters((f) => ({ ...f, search: v }))}
            placeholder={t('searchPlaceholder')}
            accessibilityLabel={t('searchA11y')}
            icon="search"
            returnKeyType="search"
            autoCorrect={false}
            containerStyle={styles.flex}
            rightElement={
              filters.search ? (
                <Pressable
                  onPress={() => setFilters((f) => ({ ...f, search: '' }))}
                  hitSlop={HIT_SLOP}
                  accessibilityRole="button"
                  accessibilityLabel={t('clearSearch')}
                  style={styles.clearBtn}
                >
                  <Icon name="x-circle" size={18} color={colors.muted} />
                </Pressable>
              ) : undefined
            }
          />
          <IconButton
            icon="filter"
            size={SEARCH_HEIGHT}
            variant={activeCount ? 'accent' : 'surface'}
            badge={activeCount || undefined}
            onPress={openSheet}
            accessibilityLabel={t('filters.buttonA11y', { count: activeCount })}
          />
        </View>

        {activeCount ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.activeRow}
            style={styles.bleed}
          >
            {subject ? (
              <Chip
                label={subjectLabel ?? subject.id}
                color={subjectColors[subject.id]}
                icon="close"
                selected
                onPress={() => clearFilter({ subjectId: undefined, unitId: undefined, topic: undefined, tags: [] })}
              />
            ) : null}
            {unit ? <Chip label={L(unit.title)} icon="close" selected onPress={() => clearFilter({ unitId: undefined, topic: undefined })} /> : null}
            {topicLabel ? <Chip label={topicLabel} icon="close" selected onPress={() => clearFilter({ topic: undefined })} /> : null}
            {filters.difficulty && filters.difficulty !== 'all' ? (
              <Chip
                label={t(`common:difficulty.${filters.difficulty}`)}
                icon="close"
                selected
                onPress={() => clearFilter({ difficulty: 'all' })}
              />
            ) : null}
            {(filters.tags ?? []).map((tag) => (
              <Chip
                key={tag}
                label={t(`tags.${tag}`, { defaultValue: tag })}
                icon="close"
                selected
                onPress={() => clearFilter({ tags: (filters.tags ?? []).filter((x) => x !== tag) })}
              />
            ))}
          </ScrollView>
        ) : null}
      </Animated.View>

      {/* Hero: start practice */}
      <Animated.View entering={enter(2)} style={[styles.heroShadow, shadows.lg]}>
        <View style={styles.hero}>
          <LinearGradient
            colors={gradients.navy}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <View style={styles.heroGlow} pointerEvents="none" />
          <View style={styles.heroGlowSmall} pointerEvents="none" />

          <View style={styles.heroHead}>
            <View style={styles.heroIcon}>
              <Icon name="question-bank" size={22} color={palette.gold} />
            </View>
            <View style={styles.flex}>
              <Text variant="overline" color={palette.goldLight} numberOfLines={1}>
                {t('hero.overline')}
              </Text>
              <Text variant="h2" display color={palette.white} numberOfLines={2}>
                {t('hero.title')}
              </Text>
            </View>
          </View>

          <PressableScale
            onPress={openSheet}
            accessibilityRole="button"
            accessibilityLabel={`${t('hero.editFilters')}: ${summary}`}
            style={styles.summary}
          >
            <Icon name="filter" size={16} color={palette.goldLight} />
            <Text variant="label" color="rgba(255,255,255,0.88)" numberOfLines={2} style={styles.flex}>
              {summary}
            </Text>
            <Icon name="chevron" size={16} color="rgba(255,255,255,0.6)" />
          </PressableScale>

          <View style={styles.stats}>
            <View style={styles.stat}>
              <Text variant="h1" color={palette.white} tabular numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                {matches}
              </Text>
              <Text variant="caption" color="rgba(255,255,255,0.7)" numberOfLines={1}>
                {t('hero.matches')}
              </Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text variant="h1" color={palette.goldLight} tabular numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                {sessionSize || count}
              </Text>
              <Text variant="caption" color="rgba(255,255,255,0.7)" numberOfLines={1}>
                {t('hero.perSession')}
              </Text>
            </View>
          </View>

          {matchesLoaded && !matches ? (
            <Text variant="caption" color={palette.goldLight}>
              {t('noMatch')}
            </Text>
          ) : null}

          <Button
            title={t('start')}
            icon="play"
            size="lg"
            variant="primary"
            fullWidth
            disabled={!matches}
            onPress={start}
            accessibilityLabel={t('startA11y', { questions: t('common:units.questions', { count: sessionSize }) })}
          />
        </View>
      </Animated.View>

      {/* Quick start grid */}
      <View style={styles.section}>
        <SectionHeader title={t('quickStart.title')} subtitle={t('quickStart.subtitle')} />
        {allFacets.isError && !allFacets.data ? (
          <EmptyState
            icon="wifi-off"
            title={t('common:states.error')}
            message={allFacets.error.isNetwork ? t('common:states.offline') : allFacets.error.message}
            actionLabel={t('common:actions.retry')}
            onAction={() => {
              void allFacets.refetch();
              void facets.refetch();
            }}
          />
        ) : null}
        <View style={styles.grid}>
          {allFacets.isLoading
            ? [0, 1, 2, 3].map((i) => <Skeleton key={i} width={colWidth} height={150} radius={radius.lg} />)
            : null}
          {subjectStats.map((s, i) => {
            const wide = remainder === 1 && i === subjectStats.length - 1;
            return (
              <QuickStartCard
                key={s.subject.id}
                subject={s.subject}
                count={s.count}
                mastery={s.mastery}
                locked={s.locked}
                index={i}
                width={wide ? contentWidth : colWidth}
                wide={wide}
                onPress={quickStart}
              />
            );
          })}
        </View>
      </View>

      {/* Bookmarks / Mistakes / Exams */}
      <View style={styles.section}>
        <SectionHeader title={t('links.title')} subtitle={t('links.subtitle')} />
        <View style={styles.list}>
          <EntryCard
            icon="star"
            iconFilled
            iconColor={colors.accent}
            iconBg={colors.accentSoft}
            title={t('bookmarks.title')}
            subtitle={t('bookmarks.subtitle')}
            value={String(bookmarkCount)}
            valueTone="accent"
            onPress={() => router.push({ pathname: '/question-bank', params: { tab: 'bookmarks' } })}
            accessibilityLabel={t('bookmarks.a11y', { questions: t('common:units.questions', { count: bookmarkCount }) })}
          />
          <EntryCard
            icon="mistakes"
            iconColor={colors.danger}
            iconBg={colors.dangerSoft}
            title={t('links.mistakes')}
            subtitle={unresolved ? t('links.mistakesCount', { count: unresolved }) : t('links.mistakesClear')}
            subtitleColor={unresolved ? colors.danger : colors.success}
            value={unresolved ? String(unresolved) : undefined}
            valueTone="danger"
            onPress={() => router.push('/mistakes')}
            accessibilityLabel={`${t('links.mistakes')}, ${unresolved ? t('links.mistakesCount', { count: unresolved }) : t('links.mistakesClear')}`}
          />
          <EntryCard
            icon="exam"
            iconColor={colors.info}
            iconBg={colors.infoSoft}
            title={t('links.exams')}
            subtitle={t('links.examsSub')}
            onPress={() => router.push('/exams')}
            accessibilityLabel={`${t('links.exams')}, ${t('links.examsSub')}`}
          />
        </View>
      </View>

      {/* Recent practice */}
      <View style={styles.section}>
        <SectionHeader title={t('recent.title')} subtitle={t('recent.subtitle')} />
        {practiceAttempts.length ? (
          <View style={styles.list}>
            {practiceAttempts.map((a, i) => (
              <Animated.View key={a.id} entering={enter(i)}>
                <RecentAttemptRow attempt={a} onPress={openAttempt} />
              </Animated.View>
            ))}
          </View>
        ) : (
          <View style={[styles.emptyRecent, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.surfaceMuted }]}>
              <Icon name="history" size={22} color={colors.muted} />
            </View>
            <View style={styles.flex}>
              <Text variant="bodyBold">{t('recent.emptyTitle')}</Text>
              <Text variant="caption" color="muted">
                {t('recent.emptyMessage')}
              </Text>
            </View>
          </View>
        )}
      </View>

      <FiltersSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        value={filters}
        count={count}
        sizes={sizes}
        onApply={(f, c) => {
          setFilters(f);
          setCount(c);
          setSheetOpen(false);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: space.lg, gap: space.xxl },
  flex: { flex: 1 },
  titleBlock: { gap: space.xs },
  searchBlock: { gap: space.md },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  clearBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  bleed: { marginHorizontal: -SCREEN_PADDING },
  activeRow: { paddingHorizontal: SCREEN_PADDING, gap: space.sm },
  heroShadow: { borderRadius: radius.lg, backgroundColor: palette.navy },
  hero: { borderRadius: radius.lg, overflow: 'hidden', padding: space.xl, gap: space.lg },
  heroGlow: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    top: -120,
    end: -70,
    backgroundColor: 'rgba(201,162,74,0.18)',
  },
  heroGlowSmall: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    bottom: -80,
    start: -40,
    backgroundColor: 'rgba(201,162,74,0.08)',
  },
  heroHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(201,162,74,0.16)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(201,162,74,0.5)',
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 44,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  stats: { flexDirection: 'row', alignItems: 'center' },
  stat: { flex: 1, gap: space.xxs },
  statDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.18)', marginHorizontal: space.lg },
  section: {},
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
  list: { gap: space.md },
  emptyRecent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  emptyIcon: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
});
