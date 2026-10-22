import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Header, Screen } from '@/components/layout';
import { NotificationRow } from '@/components/notifications';
import { Icon } from '@/components/icons';
import {
  openNotificationLink,
  toNotification,
  useDeleteNotification,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationsList,
  useUnreadCount,
} from '@/api';
import { EmptyState, IconButton, SegmentedControl, SkeletonCard, Text, toast } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { SCREEN_PADDING, space, useTheme } from '@/theme';
import type { AppNotification } from '@/types';
import { formatNumber } from '@/utils/format';
import { haptic } from '@/utils/haptics';

type Filter = 'all' | 'unread';

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { t, lang } = useI18n('notifications');
  // NTF-01 (cursor pages) + NTF-02; read / read-all / delete are optimistic (NTF-03/04/05).
  const list = useNotificationsList('all');
  const unreadQuery = useUnreadCount();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const remove = useDeleteNotification();
  const [filter, setFilter] = useState<Filter>('all');
  const [refreshing, setRefreshing] = useState(false);

  const items = useMemo(
    () => (list.data?.pages ?? []).flatMap((p) => p.items).map(toNotification),
    [list.data],
  );
  const meta = list.data?.pages[0]?.meta;
  const loadedUnread = useMemo(() => items.filter((n) => !n.read).length, [items]);
  // All pages loaded → count locally (reflects optimistic updates); otherwise trust the server count.
  const unread = !list.data
    ? (unreadQuery.data ?? 0)
    : list.hasNextPage
      ? (unreadQuery.data ?? meta?.unreadCount ?? loadedUnread)
      : loadedUnread;
  const total = meta?.counts?.all ?? meta?.total ?? items.length;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([list.refetch(), unreadQuery.refetch()]);
    setRefreshing(false);
  }, [list, unreadQuery]);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
      if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 240 && list.hasNextPage && !list.isFetchingNextPage) {
        void list.fetchNextPage();
      }
    },
    [list],
  );

  const sections = useMemo(() => {
    const now = new Date();
    const list = [...items]
      .filter((n) => filter === 'all' || !n.read)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const yesterdayDate = new Date(now);
    yesterdayDate.setDate(now.getDate() - 1);
    const today: AppNotification[] = [];
    const yesterday: AppNotification[] = [];
    const earlier: AppNotification[] = [];
    for (const n of list) {
      const d = new Date(n.date);
      (isSameDay(d, now) ? today : isSameDay(d, yesterdayDate) ? yesterday : earlier).push(n);
    }
    return [
      { key: 'today', title: t('today'), data: today },
      { key: 'yesterday', title: t('yesterday'), data: yesterday },
      { key: 'earlier', title: t('earlier'), data: earlier },
    ].filter((s) => s.data.length > 0);
  }, [items, filter, t]);

  const options = useMemo(
    () => [
      { key: 'all', label: t('tabs.all'), count: total },
      { key: 'unread', label: t('tabs.unread'), count: unread },
    ],
    [t, total, unread],
  );

  const onPress = useCallback(
    (n: AppNotification) => {
      if (!n.read) markRead.mutate(n.id);
      openNotificationLink(n.link);
    },
    [markRead],
  );

  const onDelete = useCallback(
    (n: AppNotification) => {
      haptic.warning();
      remove.mutate(n.id);
      toast.show({ message: t('deleted'), icon: 'trash' });
    },
    [remove, t],
  );

  const onMarkAll = () => {
    if (unread === 0) return;
    haptic.success();
    markAll.mutate();
    toast.success(t('allMarked'));
  };

  let rowIndex = 0;

  return (
    <Screen padded={false}>
      <Header
        title={t('title')}
        subtitle={unread > 0 ? t('unreadCount', { count: unread }) : t('allCaughtUp')}
        right={
          <IconButton
            icon="check-circle"
            variant={unread > 0 ? 'accent' : 'surface'}
            onPress={onMarkAll}
            disabled={unread === 0}
            accessibilityLabel={t('markAll')}
          />
        }
      />

      <View style={styles.filterWrap}>
        <SegmentedControl options={options} value={filter} onChange={(k) => setFilter(k === 'unread' ? 'unread' : 'all')} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xxxl }]}
        onScroll={onScroll}
        scrollEventThrottle={200}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.accent} colors={[colors.accent]} />
        }
      >
        {list.isLoading ? (
          <View style={styles.loading}>
            {[0, 1, 2, 3].map((i) => (
              <SkeletonCard key={i} lines={2} />
            ))}
          </View>
        ) : sections.length === 0 ? (
          <Animated.View key={`empty-${filter}`} entering={FadeIn.duration(250)} style={styles.empty}>
            <EmptyState
              icon="bell"
              title={filter === 'unread' ? t('empty.unreadTitle') : t('empty.title')}
              message={filter === 'unread' ? t('empty.unreadMessage') : t('empty.message')}
              actionLabel={filter === 'unread' && items.length > 0 ? t('empty.showAll') : undefined}
              onAction={filter === 'unread' && items.length > 0 ? () => setFilter('all') : undefined}
            />
          </Animated.View>
        ) : (
          sections.map((section) => (
            <Animated.View key={`${filter}-${section.key}`} layout={LinearTransition.duration(220)}>
              <View style={styles.sectionHead}>
                <Text variant="overline" color="accent">
                  {section.title}
                </Text>
                <View style={[styles.sectionRule, { backgroundColor: colors.border }]} />
                <Text variant="caption" color="muted" tabular>
                  {formatNumber(section.data.length, lang)}
                </Text>
              </View>
              {section.data.map((n) => (
                <NotificationRow key={n.id} item={n} index={rowIndex++} onPress={onPress} onDelete={onDelete} />
              ))}
            </Animated.View>
          ))
        )}
        {sections.length > 0 ? (
          <View style={styles.tip}>
            <Icon name="info" size={14} color={colors.muted} />
            <Text variant="caption" color="muted" align="center">
              {t('swipeTip')}
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  filterWrap: { paddingHorizontal: SCREEN_PADDING, paddingTop: space.sm, paddingBottom: space.md },
  content: { paddingHorizontal: SCREEN_PADDING, flexGrow: 1 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.lg, marginBottom: space.md },
  sectionRule: { flex: 1, height: StyleSheet.hairlineWidth },
  tip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: space.md },
  empty: { flex: 1, justifyContent: 'center', paddingVertical: space.huge },
  loading: { gap: space.md, marginTop: space.lg },
});
