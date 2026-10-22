import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View, type ListRenderItem } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Header, Screen } from '@/components/layout';
import { Button, EmptyState, SegmentedControl, SkeletonCard } from '@/components/ui';
import { QuestionDetailSheet, QuestionPreviewCard } from '@/components/practice';
import { toQuestion } from '@/api/adapters';
import { useBankQuestions, useBookmarkIds, useBookmarks } from '@/api/bank';
import { openSubscription } from '@/api/locked';
import { useI18n } from '@/hooks/useI18n';
import { SCREEN_PADDING, space } from '@/theme';
import type { Question } from '@/types';
import { toParams } from '@/utils/practice';

type Tab = 'all' | 'bookmarks';

const keyExtractor = (q: Question) => q.id;

export default function QuestionBankScreen() {
  const { t } = useI18n('practice');
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(params.tab === 'bookmarks' ? 'bookmarks' : 'all');
  const [open, setOpen] = useState<Question | null>(null);
  // BNK-01 (all) and BMK-01 (bookmarks), paged with "load more" on scroll.
  const all = useBankQuestions({ pageSize: 20 });
  const marked = useBookmarks();
  const { data: bookmarkIds } = useBookmarkIds();

  useEffect(() => {
    if (params.tab === 'bookmarks' || params.tab === 'all') setTab(params.tab);
  }, [params.tab]);

  const questions = useMemo(() => (all.data?.pages ?? []).flatMap((p) => p.items.map(toQuestion)), [all.data]);
  const bookmarked = useMemo(() => {
    const list = (marked.data?.pages ?? []).flatMap((p) => p.items.map(toQuestion));
    // Unbookmarked rows disappear immediately (optimistic id list).
    return bookmarkIds ? list.filter((q) => bookmarkIds.includes(q.id)) : list;
  }, [marked.data, bookmarkIds]);
  const allTotal = all.data?.pages[0]?.meta.total ?? 0;
  const bookmarkTotal = bookmarkIds?.length ?? marked.data?.pages[0]?.meta.total ?? bookmarked.length;
  const active = tab === 'bookmarks' ? marked : all;
  const data = tab === 'bookmarks' ? bookmarked : questions;
  const loading = active.isPending;

  const loadMore = useCallback(() => {
    if (active.hasNextPage && !active.isFetchingNextPage) void active.fetchNextPage();
  }, [active]);

  const onOpen = useCallback((q: Question) => setOpen(q), []);
  const renderItem = useCallback<ListRenderItem<Question>>(
    ({ item, index }) => (
      <Animated.View entering={index < 8 ? FadeInDown.duration(350).delay(Math.min(index * 60, 300)) : undefined}>
        <QuestionPreviewCard question={item} onPress={onOpen} />
      </Animated.View>
    ),
    [onOpen],
  );

  const practiceThis = useCallback(
    (q: Question) => {
      setOpen(null);
      if (q.locked) {
        openSubscription({ reason: 'SUBJECT_NOT_IN_PACKAGE', subjectSlug: q.subjectId });
        return;
      }
      router.push({
        pathname: '/question-bank/practice-session',
        params: toParams({ subjectId: q.subjectId, unitId: q.unitId, topic: q.topicId }, 10, undefined, q.id),
      });
    },
    [],
  );

  const practiceBookmarks = useCallback(() => {
    router.push({ pathname: '/question-bank/practice-session', params: toParams({}, 50, 'bookmarks') });
  }, []);

  return (
    <Screen padded={false}>
      <Header title={t('bank.title')} subtitle={t('bank.subtitle')} />
      <View style={styles.tabs}>
        <SegmentedControl
          options={[
            { key: 'all', label: t('bank.all'), count: allTotal },
            { key: 'bookmarks', label: t('bank.bookmarked'), count: bookmarkTotal },
          ]}
          value={tab}
          onChange={(k) => setTab(k as Tab)}
        />
      </View>

      {loading ? (
        <View style={styles.list}>
          {[0, 1, 2, 3].map((i) => (
            <SkeletonCard key={i} style={styles.skeleton} />
          ))}
        </View>
      ) : active.isError && !active.data ? (
        <Animated.View entering={FadeIn.duration(250)} style={styles.empty}>
          <EmptyState
            icon="wifi-off"
            title={t('common:states.error')}
            message={active.error.isNetwork ? t('common:states.offline') : active.error.message}
            actionLabel={t('common:actions.retry')}
            onAction={() => void active.refetch()}
          />
        </Animated.View>
      ) : tab === 'all' && !questions.length ? (
        <Animated.View entering={FadeIn.duration(250)} style={styles.empty}>
          <EmptyState icon="question-bank" title={t('common:states.empty')} />
        </Animated.View>
      ) : tab === 'bookmarks' && !bookmarked.length ? (
        <Animated.View entering={FadeIn.duration(250)} style={styles.empty}>
          <EmptyState
            icon="star"
            title={t('bank.emptyTitle')}
            message={t('bank.emptyMessage')}
            actionLabel={t('bank.emptyAction')}
            onAction={() => setTab('all')}
          />
        </Animated.View>
      ) : (
        <FlatList
          key={tab}
          data={data}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={Separator}
          showsVerticalScrollIndicator={false}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={7}
          removeClippedSubviews
          keyboardShouldPersistTaps="handled"
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListHeaderComponent={
            tab === 'bookmarks' ? (
              <Button
                title={t('bank.practiceBookmarks')}
                icon="practice"
                variant="primary"
                fullWidth
                onPress={practiceBookmarks}
                style={styles.headerBtn}
              />
            ) : undefined
          }
        />
      )}

      <QuestionDetailSheet question={open} onClose={() => setOpen(null)} onPractice={practiceThis} />
    </Screen>
  );
}

function Separator() {
  return <View style={styles.sep} />;
}

const styles = StyleSheet.create({
  tabs: { paddingHorizontal: SCREEN_PADDING, paddingBottom: space.md },
  list: { paddingHorizontal: SCREEN_PADDING, paddingTop: space.xs, paddingBottom: space.huge },
  sep: { height: space.md },
  empty: { flex: 1, justifyContent: 'center', paddingHorizontal: SCREEN_PADDING },
  headerBtn: { marginBottom: space.lg },
  skeleton: { marginBottom: space.md },
});
