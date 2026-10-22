import { useCallback, useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/icons';
import { Header, Screen } from '@/components/layout';
import { BarList, Button, Card, EmptyState, PressableScale, SkeletonCard, Text } from '@/components/ui';
import { QuizResultSummary } from '@/components/student';
import { AnswerReviewItem } from '@/components/practice';
import { usePracticeResult } from '@/api/bank';
import { useI18n } from '@/hooks/useI18n';
import { SCREEN_PADDING, radius, space, useTheme } from '@/theme';
import type { Difficulty } from '@/types';
import { DEFAULT_COUNT, toParams } from '@/utils/practice';
import { reviewFromAnswers } from '@/utils/quiz';

const PARAM_KEYS = ['subjectId', 'unitId', 'topic', 'difficulty', 'tags', 'search', 'count', 'mode', 'include', 'ids'] as const;

const enter = (i: number) => FadeInDown.duration(350).delay(Math.min(i * 60, 300));

export default function PracticeResultScreen() {
  const raw = useLocalSearchParams<Record<string, string>>();
  const { t, L } = useI18n('practice');
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  // PRA-04 (attemptId = practice session id).
  const { data: attempt, isPending } = usePracticeResult(typeof raw.attemptId === 'string' ? raw.attemptId : undefined);

  const rows = useMemo(() => {
    if (!attempt) return [];
    const { questions, answers } = reviewFromAnswers(attempt.answers);
    return questions.map((question, i) => ({ question, answer: answers[i]! }));
  }, [attempt]);

  const accColor = useCallback(
    (v: number) => (v >= 80 ? colors.success : v >= 50 ? colors.warning : colors.danger),
    [colors],
  );

  const topicItems = useMemo(
    () =>
      [...(attempt?.breakdownByTopic ?? [])].sort((a, b) => a.accuracy - b.accuracy).map((b) => ({
        label: L(b.label),
        value: b.accuracy,
        color: accColor(b.accuracy),
      })),
    [L, accColor, attempt],
  );
  const difficultyItems = useMemo(
    () =>
      (attempt?.breakdownByDifficulty ?? []).map((b) => ({
        label: t(`common:difficulty.${b.key as Difficulty}`),
        value: b.accuracy,
        color: accColor(b.accuracy),
      })),
    [accColor, attempt, t],
  );

  const practiceAgain = useCallback(() => {
    const params: Record<string, string> = {};
    PARAM_KEYS.forEach((k) => {
      const v = raw[k];
      if (typeof v === 'string' && v) params[k] = v;
    });
    const finalParams = params.count
      ? params
      : toParams({ subjectId: attempt?.subjectSlug ?? undefined }, attempt?.total || DEFAULT_COUNT);
    router.replace({ pathname: '/question-bank/practice-session', params: finalParams });
  }, [attempt, raw]);

  const done = useCallback(() => {
    router.dismissTo('/(tabs)/practice');
  }, []);

  if (isPending && raw.attemptId) {
    return (
      <Screen padded={false} edges={['top', 'bottom']}>
        <Header title={t('result.title')} onBack={done} />
        <View style={styles.content}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      </Screen>
    );
  }

  if (!attempt) {
    return (
      <Screen padded={false} edges={['top', 'bottom']}>
        <Header title={t('result.title')} onBack={done} />
        <View style={styles.center}>
          <EmptyState
            icon="alert"
            title={t('result.notFoundTitle')}
            message={t('result.notFoundMessage')}
            actionLabel={t('result.done')}
            onAction={done}
          />
        </View>
      </Screen>
    );
  }

  const wrong = attempt.mistakesAdded || attempt.incorrect;

  return (
    <Screen padded={false} edges={['top']}>
      <Header title={t('result.title')} onBack={done} />

      <ScrollView style={styles.flex} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <QuizResultSummary
          score={attempt.score}
          correct={attempt.correct}
          total={attempt.total}
          timeSpentSec={attempt.timeSpentSec}
          passed={attempt.passed}
        />

        {wrong > 0 ? (
          <Animated.View entering={enter(2)}>
            <PressableScale
              onPress={() => router.push('/mistakes')}
              accessibilityRole="button"
              accessibilityLabel={`${t('result.addedToMistakes')}. ${t('result.reviewMistakes')}`}
              style={[styles.notice, { backgroundColor: colors.dangerSoft }]}
            >
              <View style={[styles.noticeIcon, { backgroundColor: colors.surface }]}>
                <Icon name="mistakes" size={18} color={colors.danger} />
              </View>
              <View style={styles.flex}>
                <Text variant="label" color={colors.danger}>
                  {t('result.addedToMistakes')}
                </Text>
                <Text variant="caption" color="muted">
                  {t('result.reviewMistakes')}
                </Text>
              </View>
              <Icon name="chevron" size={18} color={colors.danger} />
            </PressableScale>
          </Animated.View>
        ) : null}

        {topicItems.length ? (
          <Animated.View entering={enter(3)}>
            <Card style={styles.card}>
              <Text variant="h3">{t('result.byTopic')}</Text>
              <BarList items={topicItems} />
            </Card>
          </Animated.View>
        ) : null}

        {difficultyItems.length ? (
          <Animated.View entering={enter(4)}>
            <Card style={styles.card}>
              <Text variant="h3">{t('result.byDifficulty')}</Text>
              <BarList items={difficultyItems} />
            </Card>
          </Animated.View>
        ) : null}

        <View style={styles.review}>
          <View style={styles.reviewHead}>
            <Text variant="h3">{t('result.review')}</Text>
            <Text variant="caption" color="muted">
              {t('result.reviewSubtitle')}
            </Text>
          </View>
          {rows.map((r, i) => (
            <AnswerReviewItem key={`${r.question.id}-${i}`} index={i} question={r.question} answer={r.answer} />
          ))}
        </View>
      </ScrollView>

      {/* Sticky actions */}
      <View
        style={[
          styles.footer,
          { paddingBottom: Math.max(insets.bottom, space.lg), backgroundColor: colors.background, borderTopColor: colors.border },
        ]}
      >
        <Button title={t('result.done')} variant="outline" size="lg" style={styles.flex} onPress={done} />
        <Button title={t('result.again')} variant="primary" size="lg" style={styles.flex} onPress={practiceAgain} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', paddingHorizontal: SCREEN_PADDING },
  content: { paddingHorizontal: SCREEN_PADDING, paddingTop: space.sm, paddingBottom: space.xxxl, gap: space.xl },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 64,
    borderRadius: radius.lg,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
  },
  noticeIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  card: { gap: space.lg },
  review: { gap: space.md },
  reviewHead: { gap: space.xxs },
  footer: {
    flexDirection: 'row',
    gap: space.md,
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
