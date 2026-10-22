import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Screen } from '@/components/layout';
import { SubjectCard } from '@/components/student';
import { SubjectsSummary } from '@/components/subjects/SubjectsSummary';
import { EmptyState, SkeletonCard, Text } from '@/components/ui';
import { qk, toSubject, useSubjects } from '@/api';
import { queryClient } from '@/api/queryClient';
import { useI18n } from '@/hooks/useI18n';
import { space } from '@/theme';

export default function SubjectsScreen() {
  const { t } = useI18n('subjects');
  const query = useSubjects();
  const subjects = useMemo(() => (query.data ?? []).map(toSubject), [query.data]);
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        queryClient.refetchQueries({ queryKey: qk.catalog.subjects }),
        queryClient.refetchQueries({ queryKey: qk.progress.summary }),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, []);

  return (
    <Screen scroll tabBarSpace refreshing={refreshing} onRefresh={onRefresh}>
      <Animated.View entering={FadeInDown.duration(350)} style={styles.header}>
        <Text variant="overline" color="accent">
          {t('overline')}
        </Text>
        <Text variant="display" accessibilityRole="header">
          {t('title')}
        </Text>
        <Text variant="body" color="muted">
          {t('subtitle')}
        </Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(350).delay(60)}>
        <SubjectsSummary />
      </Animated.View>

      <View style={styles.list}>
        {query.isLoading
          ? [0, 1, 2].map((i) => <SkeletonCard key={i} media lines={2} />)
          : subjects.map((subject, i) => (
              <SubjectCard key={subject.id} subject={subject} index={i + 2} variant="large" />
            ))}
        {!query.isLoading && subjects.length === 0 ? (
          <EmptyState
            icon={query.isError ? 'wifi-off' : 'subjects'}
            title={t(query.isError ? 'common:states.error' : 'common:states.empty')}
            actionLabel={t('common:actions.retry')}
            onAction={() => void query.refetch()}
          />
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: space.xs, paddingTop: space.md, paddingBottom: space.xxl },
  list: { gap: space.xl, marginTop: space.xxxl },
});
