import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, SubjectIcon } from '@/components/icons';
import { Header, Screen } from '@/components/layout';
import { Badge, Button, Card, Confetti, EmptyState, SkeletonCard, SuccessCheck, Text } from '@/components/ui';
import { QuestionView } from '@/components/student';
import { RetryHistory } from '@/components/mistakes/RetryHistory';
import { statusTone } from '@/components/mistakes/grouping';
import { optionIdAt, toQuestion } from '@/api/adapters';
import { handleActionError } from '@/api/locked';
import { useMistake, useRetryMistake } from '@/api/mistakes';
import { useI18n } from '@/hooks/useI18n';
import { revealQuestion } from '@/utils/quiz';
import { SCREEN_PADDING, radius, space, subjectColors, useTheme } from '@/theme';
import { haptic } from '@/utils/haptics';
import { formatDate, shuffle } from '@/utils/format';

type Result = 'correct' | 'wrong' | null;

function backToList() {
  if (router.canGoBack()) router.back();
  else router.replace('/mistakes');
}

export default function MistakeRetryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const mistakeId = Array.isArray(id) ? id[0] : id;
  // Keyed so navigating to the next mistake fully resets the mini-quiz state.
  return <RetryContent key={mistakeId ?? 'none'} id={mistakeId ?? ''} />;
}

function RetryContent({ id }: { id: string }) {
  const { colors } = useTheme();
  const { t, L, lang } = useI18n('mistakes');
  const insets = useSafeAreaInsets();
  // MST-03 (embedded question + history); MST-05 retry updates this cache entry.
  const { data: entry, isPending } = useMistake(id || undefined);
  const retryMutation = useRetryMistake();
  const [feedback, setFeedback] = useState<{ correctIndex: number; correctOptionId: string | null; explanation: { en: string; ar: string } | null } | null>(null);
  const question = useMemo(() => {
    if (!entry) return undefined;
    const q = toQuestion(entry.question);
    return feedback ? revealQuestion(q, feedback) : q;
  }, [entry, feedback]);
  const scrollRef = useRef<ScrollView>(null);

  const [round, setRound] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [result, setResult] = useState<Result>(null);

  const optionCount = question?.options.length ?? 0;
  const optionOrder = useMemo(
    () => shuffle(Array.from({ length: optionCount }, (_, i) => i)),
    // reshuffle on every new round
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [optionCount, round],
  );

  const nextId = entry?.nextUnresolvedId ?? undefined;

  const onSelect = useCallback(
    (i: number) => {
      if (result) return;
      haptic.selection();
      setSelected(i);
    },
    [result],
  );

  const check = useCallback(() => {
    if (!entry || !question || selected === null || retryMutation.isPending) return;
    const optionId = optionIdAt(question, selected);
    retryMutation.mutate(
      { id: entry.id, optionId, chosenIndex: optionId ? undefined : selected },
      {
        onSuccess: (res) => {
          setFeedback({ correctIndex: res.correctIndex, correctOptionId: res.correctOptionId, explanation: res.explanation });
          setResult(res.correct ? 'correct' : 'wrong');
          if (res.correct) haptic.success();
          else haptic.error();
        },
        onError: (err) => {
          handleActionError(err);
        },
      },
    );
  }, [entry, question, selected, retryMutation]);

  const tryAgain = useCallback(() => {
    haptic.light();
    setSelected(null);
    setResult(null);
    setRound((r) => r + 1);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, []);

  const goNext = useCallback(() => {
    if (nextId) router.replace({ pathname: '/mistakes/[id]', params: { id: nextId } });
  }, [nextId]);

  const lessonId = entry?.lessonId ?? question?.lessonId;
  const goLesson = useCallback(() => {
    if (lessonId) router.push({ pathname: '/lesson/[id]', params: { id: lessonId } });
  }, [lessonId]);

  if (isPending && id) {
    return (
      <Screen padded={false} edges={['top', 'bottom']}>
        <Header title={t('retry.title')} subtitle={t('retry.subtitle')} />
        <View style={styles.loading}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      </Screen>
    );
  }

  if (!entry || !question) {
    return (
      <Screen padded={false} edges={['top', 'bottom']}>
        <Header title={t('retry.title')} />
        <View style={styles.notFound}>
          <EmptyState
            icon="alert"
            title={t('retry.notFoundTitle')}
            message={t('retry.notFoundMessage')}
            actionLabel={t('retry.backToList')}
            onAction={() => router.replace('/mistakes')}
          />
        </View>
      </Screen>
    );
  }

  const subject = entry.subject;
  const subjectColor = subjectColors[question.subjectId];
  const revealed = result !== null;

  // Sticky footer: one primary action, optional secondary sharing the width equally.
  let footer: ReactNode;
  if (!revealed) {
    footer = (
      <Button
        title={t('retry.check')}
        icon="check"
        size="lg"
        fullWidth
        disabled={selected === null || retryMutation.isPending}
        loading={retryMutation.isPending}
        onPress={check}
        accessibilityLabel={selected === null ? t('retry.pickFirst') : t('retry.check')}
      />
    );
  } else if (result === 'correct') {
    footer = nextId ? (
      <>
        <Button title={t('retry.backToList')} variant="outline" size="lg" style={styles.footerBtn} onPress={backToList} />
        <Button title={t('retry.nextMistake')} variant="primary" size="lg" style={styles.footerBtn} onPress={goNext} />
      </>
    ) : (
      <Button title={t('retry.backToList')} icon="mistakes" variant="primary" size="lg" fullWidth onPress={backToList} />
    );
  } else {
    footer = (
      <>
        {nextId ? (
          <Button title={t('retry.nextMistake')} variant="outline" size="lg" style={styles.footerBtn} onPress={goNext} />
        ) : (
          <Button title={t('retry.backToList')} variant="outline" size="lg" style={styles.footerBtn} onPress={backToList} />
        )}
        <Button title={t('retry.tryAgain')} variant="primary" size="lg" style={styles.footerBtn} onPress={tryAgain} />
      </>
    );
  }

  return (
    <View style={styles.flex}>
      <Screen padded={false} edges={['top']}>
        <Header title={t('retry.title')} subtitle={t('retry.subtitle')} />
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={styles.body}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View entering={FadeInDown.duration(350)} style={styles.meta}>
            <View style={[styles.subjectPill, { backgroundColor: `${subjectColor}1A` }]}>
              <SubjectIcon subjectId={question.subjectId} size={16} color={subjectColor} />
              <Text variant="label" color={subjectColor} numberOfLines={1}>
                {L(subject?.name)}
              </Text>
            </View>
            <Badge label={t(`status.${entry.status}`)} tone={statusTone(entry.status)} size="sm" />
            <Badge
              label={t('card.repeated', { count: entry.repeatCount })}
              icon="refresh"
              tone={entry.repeatCount >= 2 ? 'warning' : 'neutral'}
              size="sm"
            />
          </Animated.View>
          <Text variant="caption" color="muted" style={styles.missedOn}>
            {L(question.topic)} · {t('retry.missedOn', { date: formatDate(entry.date, lang) })}
          </Text>

          <Animated.View entering={FadeInDown.duration(350).delay(60)}>
            <QuestionView
              question={question}
              selectedIndex={selected}
              revealed={revealed}
              onSelect={onSelect}
              showExplanation={revealed}
              optionOrder={optionOrder}
              headerRight={<Badge label={t(`common:difficulty.${question.difficulty}`)} tone="neutral" size="sm" />}
            />
          </Animated.View>

          {result === 'correct' ? (
            <Animated.View entering={ZoomIn.duration(300)}>
              <Card style={styles.resultCard}>
                <SuccessCheck size={88} />
                <Text variant="h1" display align="center" color="accent">
                  {t('retry.mastered')}
                </Text>
                <Text variant="body" color="muted" align="center">
                  {t('retry.masteredMessage')}
                </Text>
                {!nextId ? (
                  <Text variant="caption" color="muted" align="center">
                    {t('retry.allDone')}
                  </Text>
                ) : null}
              </Card>
            </Animated.View>
          ) : result === 'wrong' ? (
            <Animated.View entering={FadeInDown.duration(300)}>
              <Card style={[styles.resultCard, { borderColor: colors.danger }]}>
                <View style={[styles.wrongIcon, { backgroundColor: colors.dangerSoft }]}>
                  <Icon name="x-circle" size={32} color={colors.danger} />
                </View>
                <Text variant="h2" align="center">
                  {t('retry.wrong')}
                </Text>
                <Text variant="body" color="muted" align="center">
                  {t('retry.wrongMessage')}
                </Text>
              </Card>
            </Animated.View>
          ) : null}

          {revealed && lessonId ? (
            <Animated.View entering={FadeIn.duration(250)}>
              <Button title={t('retry.goToLesson')} icon="lesson" variant="ghost" fullWidth onPress={goLesson} style={styles.lessonBtn} />
            </Animated.View>
          ) : null}

          <View style={styles.history}>
            <RetryHistory entry={entry} />
          </View>
        </ScrollView>

        <View
          style={[
            styles.footer,
            { paddingBottom: Math.max(insets.bottom, space.lg), backgroundColor: colors.background, borderTopColor: colors.border },
          ]}
        >
          {footer}
        </View>
      </Screen>
      <Confetti fire={result === 'correct'} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { paddingHorizontal: SCREEN_PADDING, paddingBottom: space.xxxl },
  notFound: { flex: 1, justifyContent: 'center', paddingHorizontal: SCREEN_PADDING },
  loading: { gap: space.md, paddingHorizontal: SCREEN_PADDING, paddingTop: space.lg },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: space.sm,
    marginTop: space.sm,
  },
  subjectPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    height: 28,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
  },
  missedOn: { marginTop: space.sm, marginBottom: space.lg },
  resultCard: { alignItems: 'center', gap: space.md, marginTop: space.xl },
  wrongIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lessonBtn: { marginTop: space.md },
  history: { marginTop: space.xxl },
  footer: {
    flexDirection: 'row',
    gap: space.md,
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerBtn: { flex: 1, paddingHorizontal: space.md },
});
