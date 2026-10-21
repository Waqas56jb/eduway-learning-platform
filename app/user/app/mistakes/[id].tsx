import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import { Icon, SubjectIcon } from '@/components/icons';
import { Header, Screen } from '@/components/layout';
import { Badge, Button, Card, Confetti, EmptyState, SuccessCheck, Text } from '@/components/ui';
import { QuestionView } from '@/components/student';
import { RetryHistory } from '@/components/mistakes/RetryHistory';
import { nextUnresolvedId, statusTone } from '@/components/mistakes/grouping';
import { getQuestion, getSubject } from '@/data';
import { useI18n } from '@/hooks/useI18n';
import { useMistakesStore } from '@/store';
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
  const entry = useMistakesStore((s) => s.mistakes.find((m) => m.id === id));
  const mistakes = useMistakesStore((s) => s.mistakes);
  const recordRetry = useMistakesStore((s) => s.recordRetry);
  const question = entry ? getQuestion(entry.questionId) : undefined;

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

  const nextId = useMemo(() => nextUnresolvedId(mistakes, id), [mistakes, id]);

  const onSelect = useCallback(
    (i: number) => {
      if (result) return;
      haptic.selection();
      setSelected(i);
    },
    [result],
  );

  const check = useCallback(() => {
    if (!entry || !question || selected === null) return;
    const correct = selected === question.correctIndex;
    recordRetry(entry.id, selected, correct);
    setResult(correct ? 'correct' : 'wrong');
    if (correct) haptic.success();
    else haptic.error();
  }, [entry, question, selected, recordRetry]);

  const tryAgain = useCallback(() => {
    haptic.light();
    setSelected(null);
    setResult(null);
    setRound((r) => r + 1);
  }, []);

  const goNext = useCallback(() => {
    if (nextId) router.replace({ pathname: '/mistakes/[id]', params: { id: nextId } });
  }, [nextId]);

  const lessonId = question?.lessonId;
  const goLesson = useCallback(() => {
    if (lessonId) router.push({ pathname: '/lesson/[id]', params: { id: lessonId } });
  }, [lessonId]);

  if (!entry || !question) {
    return (
      <Screen padded={false}>
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

  const subject = getSubject(question.subjectId);
  const subjectColor = subjectColors[question.subjectId];
  const revealed = result !== null;

  return (
    <View style={styles.flex}>
      <Screen scroll padded={false}>
        <Header title={t('retry.title')} subtitle={t('retry.subtitle')} />
        <View style={styles.body}>

        <Animated.View entering={FadeInDown.duration(250)} style={styles.meta}>
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

        <Animated.View entering={FadeInDown.duration(250).delay(60)}>
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

        {!revealed ? (
          <Animated.View entering={FadeIn.duration(200)} style={styles.actions}>
            <Button
              title={t('retry.check')}
              icon="check"
              size="lg"
              fullWidth
              disabled={selected === null}
              onPress={check}
              accessibilityLabel={selected === null ? t('retry.pickFirst') : t('retry.check')}
            />
          </Animated.View>
        ) : result === 'correct' ? (
          <Animated.View entering={ZoomIn.duration(300)}>
            <Card style={styles.resultCard}>
              <SuccessCheck size={96} />
              <Text variant="h1" display align="center" color="accent">
                {t('retry.mastered')}
              </Text>
              <Text variant="body" color="muted" align="center">
                {t('retry.masteredMessage')}
              </Text>
            </Card>
          </Animated.View>
        ) : (
          <Animated.View entering={FadeInDown.duration(250)}>
            <Card style={[styles.resultCard, { borderColor: colors.danger }]}>
              <View style={[styles.wrongIcon, { backgroundColor: colors.dangerSoft }]}>
                <Icon name="x-circle" size={36} color={colors.danger} />
              </View>
              <Text variant="h2" align="center">
                {t('retry.wrong')}
              </Text>
              <Text variant="body" color="muted" align="center">
                {t('retry.wrongMessage')}
              </Text>
              <Button title={t('retry.tryAgain')} icon="refresh" variant="primary" fullWidth onPress={tryAgain} />
            </Card>
          </Animated.View>
        )}

        {revealed ? (
          <Animated.View entering={FadeInDown.duration(250).delay(80)} style={styles.actions}>
            {nextId ? (
              <Button
                title={t('retry.nextMistake')}
                icon="arrow"
                iconPosition="end"
                variant={result === 'correct' ? 'primary' : 'secondary'}
                fullWidth
                onPress={goNext}
              />
            ) : (
              <Text variant="caption" color="muted" align="center">
                {t('retry.allDone')}
              </Text>
            )}
            {lessonId ? (
              <Button title={t('retry.goToLesson')} icon="lesson" variant="outline" fullWidth onPress={goLesson} />
            ) : null}
            <Button title={t('retry.backToList')} icon="mistakes" variant="ghost" fullWidth onPress={backToList} />
          </Animated.View>
        ) : null}

        <View style={styles.history}>
          <RetryHistory entry={entry} />
        </View>
        </View>
      </Screen>
      <Confetti fire={result === 'correct'} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { paddingHorizontal: SCREEN_PADDING },
  notFound: { flex: 1, justifyContent: 'center' },
  meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm },
  subjectPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
  },
  missedOn: { marginTop: space.sm, marginBottom: space.lg },
  actions: { gap: space.sm, marginTop: space.xl },
  resultCard: { alignItems: 'center', gap: space.md, marginTop: space.xl },
  wrongIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  history: { marginTop: space.xxl, marginBottom: space.huge },
});
