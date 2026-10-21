import { useCallback, useMemo, useState } from 'react';
import { SectionList, StyleSheet, View, type SectionListRenderItem } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Header, Screen } from '@/components/layout';
import { Confetti, EmptyState, SegmentedControl } from '@/components/ui';
import { MistakeCard } from '@/components/student';
import { MistakesHero } from '@/components/mistakes/MistakesHero';
import { MistakeSectionHeader } from '@/components/mistakes/MistakeSectionHeader';
import { groupMistakes, type MistakeSection } from '@/components/mistakes/grouping';
import type { IconName } from '@/components/icons';
import { useI18n } from '@/hooks/useI18n';
import { useMistakesStore, type MistakeEntry, type MistakeFilter } from '@/store';
import { SCREEN_PADDING, space } from '@/theme';

const FILTERS: MistakeFilter[] = ['unresolved', 'reviewed', 'mastered', 'repeated'];

const EMPTY_ICON: Record<MistakeFilter | 'none', IconName> = {
  none: 'sparkles',
  unresolved: 'trophy',
  reviewed: 'eye',
  mastered: 'medal',
  repeated: 'target',
};

const matches = (m: MistakeEntry, f: MistakeFilter) => (f === 'repeated' ? m.repeatCount >= 2 : m.status === f);

export default function MistakesScreen() {
  const { t } = useI18n('mistakes');
  const mistakes = useMistakesStore((s) => s.mistakes);
  const [filter, setFilter] = useState<MistakeFilter>('unresolved');

  const counts = useMemo(() => {
    const c: Record<MistakeFilter, number> = { unresolved: 0, reviewed: 0, mastered: 0, repeated: 0 };
    for (const m of mistakes) for (const f of FILTERS) if (matches(m, f)) c[f] += 1;
    return c;
  }, [mistakes]);

  // Same predicate as mistakesStore.filtered(), derived from the raw array so it stays reactive.
  const sections = useMemo(() => groupMistakes(mistakes.filter((m) => matches(m, filter))), [mistakes, filter]);

  const options = useMemo(
    () => FILTERS.map((key) => ({ key, label: t(`filters.${key}`), count: counts[key] })),
    [t, counts],
  );

  const onChange = useCallback((key: string) => setFilter(key as MistakeFilter), []);

  const renderItem = useCallback<SectionListRenderItem<MistakeEntry, MistakeSection>>(
    ({ item, index }) => (
      <Animated.View entering={FadeInDown.duration(250).delay(Math.min(index, 6) * 40)} style={styles.item}>
        <MistakeCard entry={item} />
      </Animated.View>
    ),
    [],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: MistakeSection }) => <MistakeSectionHeader section={section} />,
    [],
  );

  const emptyKey: MistakeFilter | 'none' = mistakes.length === 0 ? 'none' : filter;
  const celebrate = emptyKey === 'unresolved' && counts.mastered > 0;

  const header = (
    <View style={styles.listHeader}>
      <MistakesHero unresolved={counts.unresolved} reviewed={counts.reviewed} mastered={counts.mastered} />
      <SegmentedControl options={options} value={filter} onChange={onChange} />
    </View>
  );

  const empty = (
    <Animated.View entering={FadeIn.duration(300)} style={styles.empty}>
      <EmptyState
        icon={EMPTY_ICON[emptyKey]}
        title={t(`empty.${emptyKey}.title`)}
        message={t(`empty.${emptyKey}.message`)}
        actionLabel={emptyKey === 'none' || emptyKey === 'unresolved' ? t('empty.practiceCta') : undefined}
        onAction={emptyKey === 'none' || emptyKey === 'unresolved' ? () => router.push('/question-bank') : undefined}
      />
    </Animated.View>
  );

  return (
    <Screen padded={false}>
      <Header title={t('title')} subtitle={t('subtitle')} />
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        initialNumToRender={6}
        windowSize={7}
        removeClippedSubviews
      />
      <Confetti fire={celebrate} count={60} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: SCREEN_PADDING, paddingBottom: space.huge },
  listHeader: { gap: space.lg, paddingTop: space.sm, paddingBottom: space.xs },
  item: { marginBottom: space.md },
  empty: { paddingTop: space.xxxl },
});
