import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, ScrollView, StyleSheet, View, type ScrollViewInstance } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import Animated, {
  FadeInDown,
  SlideInLeft,
  SlideInRight,
  SlideOutLeft,
  SlideOutRight,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/icons';
import { goBackOrHome } from '@/components/layout/Header';
import { Screen } from '@/components/layout';
import { Badge, Button, Dialog, EmptyState, IconButton, Text } from '@/components/ui';
import { QuestionView, QuizResultSummary } from '@/components/student';
import { QuizHeader } from '@/components/quiz/QuizHeader';
import { QuizReviewList } from '@/components/quiz/QuizReviewList';
import { getLesson } from '@/data';
import { useI18n } from '@/hooks/useI18n';
import { useMistakesStore, useProgressStore, type Attempt } from '@/store';
import { SCREEN_PADDING, radius, space, useTheme } from '@/theme';
import type { Question } from '@/types';
import { haptic } from '@/utils/haptics';
import { makeOptionOrder, nextLessonOf, pickQuizQuestions, scoreAnswers, type QuizScore } from '@/utils/quiz';

interface QuizResult extends QuizScore {
  attempt: Attempt;
  timeSpentSec: number;
}

export default function QuizScreen() {
  const { lessonId: rawId } = useLocalSearchParams<{ lessonId: string }>();
  const lessonId = String(rawId ?? '');
  const lesson = getLesson(lessonId);
  const { t, L, isAr } = useI18n('quiz');
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const addAttempt = useProgressStore((s) => s.addAttempt);
  const addMistake = useMistakesStore((s) => s.addMistake);

  // A new run (first open or retake) re-picks questions and option orders.
  const [runKey, setRunKey] = useState(0);
  const quiz = useMemo(() => {
    const qs = pickQuizQuestions(lessonId, 5);
    const orders: Record<string, number[]> = {};
    for (const q of qs) orders[q.id] = makeOptionOrder(q);
    return { questions: qs, orders };
    // runKey intentionally triggers a reshuffle
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId, runKey]);

  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<Record<string, number>>({});
  const [result, setResult] = useState<QuizResult | null>(null);
  const [showTimer, setShowTimer] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const startedAt = useRef(Date.now());
  const loggedAttempts = useRef(new Set<string>());
  const scrollRef = useRef<ScrollViewInstance>(null);

  const total = quiz.questions.length;
  const question: Question | undefined = quiz.questions[index];
  const selected = question ? (chosen[question.id] ?? null) : null;
  const revealed = selected !== null;
  const answeredCount = Object.keys(chosen).length;
  const inProgress = !result && answeredCount > 0;
  const isLast = index >= total - 1;

  // Elapsed-time ticker (runs until results).
  useEffect(() => {
    if (result) return;
    const id = setInterval(() => setElapsed(Math.round((Date.now() - startedAt.current) / 1000)), 1000);
    return () => clearInterval(id);
  }, [result, runKey]);

  // Android hardware back → confirm while a quiz is in progress.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!inProgress) return false;
      setLeaveOpen(true);
      return true;
    });
    return () => sub.remove();
  }, [inProgress]);

  const onSelect = useCallback(
    (optIdx: number) => {
      if (!question || chosen[question.id] !== undefined) return;
      setChosen((c) => ({ ...c, [question.id]: optIdx }));
      if (optIdx === question.correctIndex) haptic.success();
      else haptic.error();
    },
    [question, chosen],
  );

  /** Logs every wrong answer of an attempt to the mistakes notebook exactly once. */
  const logMistakes = useCallback(
    (r: QuizResult) => {
      if (loggedAttempts.current.has(r.attempt.id)) return;
      loggedAttempts.current.add(r.attempt.id);
      for (const a of r.answers) {
        if (!a.correct && a.chosenIndex >= 0) addMistake(a.questionId, a.chosenIndex, 'quiz');
      }
    },
    [addMistake],
  );

  const finish = useCallback(() => {
    const scored = scoreAnswers(quiz.questions, chosen);
    const timeSpentSec = Math.max(1, Math.round((Date.now() - startedAt.current) / 1000));
    const attempt = addAttempt({
      kind: 'quiz',
      refId: lessonId,
      subjectId: lesson?.subjectId,
      answers: scored.answers,
      score: scored.score,
      correct: scored.correct,
      total: scored.total,
      timeSpentSec,
    });
    const r: QuizResult = { ...scored, attempt, timeSpentSec };
    logMistakes(r);
    setElapsed(timeSpentSec);
    setResult(r);
    if (r.passed) haptic.success();
    else haptic.warning();
  }, [quiz.questions, chosen, addAttempt, lessonId, lesson?.subjectId, logMistakes]);

  const goNext = useCallback(() => {
    if (!revealed) return;
    if (isLast) {
      finish();
      return;
    }
    haptic.light();
    setIndex((i) => i + 1);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [revealed, isLast, finish]);

  const retake = useCallback(() => {
    startedAt.current = Date.now();
    setElapsed(0);
    setChosen({});
    setIndex(0);
    setResult(null);
    setRunKey((k) => k + 1);
  }, []);

  const requestClose = useCallback(() => {
    if (inProgress) setLeaveOpen(true);
    else goBackOrHome();
  }, [inProgress]);

  const reviewMistakes = useCallback(() => {
    if (result) logMistakes(result);
    router.push('/mistakes');
  }, [result, logMistakes]);

  const nextLesson = useMemo(() => nextLessonOf(lessonId), [lessonId]);
  const goNextLesson = useCallback(() => {
    if (!nextLesson) return;
    router.replace({ pathname: '/lesson/[id]', params: { id: nextLesson.id } });
  }, [nextLesson]);

  // Forward motion: new card comes from the reading-forward edge.
  const entering = (isAr ? SlideInLeft : SlideInRight).duration(320);
  const exiting = (isAr ? SlideOutRight : SlideOutLeft).duration(260);

  const lessonTitle = lesson ? L(lesson.title) : t('title');

  // ─── Empty state ────────────────────────────────────────────────────────────
  if (!total || !question) {
    return (
      <Screen edges={['top', 'bottom']}>
        <QuizHeader
          title={lessonTitle}
          current={0}
          total={0}
          answered={0}
          elapsedSec={0}
          showTimer={false}
          onToggleTimer={() => setShowTimer((v) => !v)}
          onClose={goBackOrHome}
        />
        <View style={styles.flex}>
          <EmptyState
            icon="quiz"
            title={t('empty.title')}
            message={t('empty.message')}
            actionLabel={t('actions.backToLesson')}
            onAction={goBackOrHome}
          />
        </View>
      </Screen>
    );
  }

  // ─── Results ───────────────────────────────────────────────────────────────
  if (result) {
    const wrong = result.total - result.correct;
    return (
      <Screen scroll edges={['top', 'bottom']} contentContainerStyle={styles.resultContent}>
        <Stack.Screen options={{ gestureEnabled: true }} />
        <View style={styles.resultBar}>
          <IconButton icon="close" variant="surface" onPress={goBackOrHome} accessibilityLabel={t('common:actions.close')} />
          <Text variant="h3" align="center" style={styles.flex}>
            {t('result.title')}
          </Text>
          <View style={styles.barSpacer} />
        </View>
        <View style={styles.resultTop}>
          <Badge label={t('result.attempt', { n: result.attempt.attemptNo })} tone="navy" icon="history" size="sm" />
          <Text variant="label" color="muted" numberOfLines={1} style={styles.resultLesson}>
            {lessonTitle}
          </Text>
        </View>

        <QuizResultSummary
          score={result.score}
          correct={result.correct}
          total={result.total}
          timeSpentSec={result.timeSpentSec}
          passed={result.passed}
        />

        <Animated.View
          entering={FadeInDown.duration(300).delay(420)}
          style={[
            styles.notice,
            { backgroundColor: wrong ? colors.dangerSoft : colors.successSoft },
          ]}
        >
          <Icon name={wrong ? 'mistakes' : 'medal'} size={18} color={wrong ? colors.danger : colors.success} />
          <Text variant="label" color={wrong ? colors.danger : colors.success} style={styles.flex}>
            {wrong ? t('result.mistakesAdded', { count: wrong }) : t('result.allCorrect')}
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(300).delay(480)} style={styles.actions}>
          {nextLesson ? (
            <Button title={t('actions.nextLesson')} icon="arrow" iconPosition="end" fullWidth onPress={goNextLesson} />
          ) : (
            <Button title={t('actions.backToLesson')} icon="lesson" fullWidth onPress={goBackOrHome} />
          )}
          <View style={styles.actionRow}>
            {wrong ? (
              <Button
                title={t('actions.reviewMistakes')}
                icon="mistakes"
                variant="outline"
                style={styles.flex}
                onPress={reviewMistakes}
              />
            ) : null}
            <Button title={t('actions.retake')} icon="refresh" variant="secondary" style={styles.flex} onPress={retake} />
          </View>
          {!nextLesson ? (
            <Text variant="caption" color="muted" align="center">
              {t('result.lastLesson')}
            </Text>
          ) : null}
        </Animated.View>

        <View style={styles.reviewSection}>
          <Text variant="h3">{t('result.review')}</Text>
          <QuizReviewList questions={quiz.questions} answers={result.answers} />
        </View>
      </Screen>
    );
  }

  // ─── Question flow ─────────────────────────────────────────────────────────
  return (
    <Screen edges={['top']} padded={false}>
      <Stack.Screen options={{ gestureEnabled: !inProgress }} />
      <QuizHeader
        title={lessonTitle}
        current={index}
        total={total}
        answered={answeredCount}
        elapsedSec={elapsed}
        showTimer={showTimer}
        onToggleTimer={() => setShowTimer((v) => !v)}
        onClose={requestClose}
      />

      <ScrollView
        ref={scrollRef}
        style={styles.flex}
        contentContainerStyle={styles.questionContent}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View key={`${runKey}-${question.id}`} entering={index === 0 ? undefined : entering} exiting={exiting}>
          <QuestionView
            question={question}
            selectedIndex={selected}
            revealed={revealed}
            onSelect={onSelect}
            showExplanation
            optionOrder={quiz.orders[question.id]}
          />
        </Animated.View>
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            paddingBottom: Math.max(insets.bottom, space.lg),
            backgroundColor: colors.background,
            borderTopColor: colors.border,
          },
        ]}
      >
        <Button
          title={isLast ? t('actions.finish') : t('actions.next')}
          icon={isLast ? 'trophy' : 'arrow'}
          iconPosition="end"
          variant="primary"
          size="lg"
          fullWidth
          disabled={!revealed}
          onPress={goNext}
        />
      </View>

      <Dialog
        visible={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        title={t('leave.title')}
        message={t('leave.message')}
        icon="alert"
        tone="danger"
        primaryLabel={t('leave.confirm')}
        onPrimary={() => {
          setLeaveOpen(false);
          goBackOrHome();
        }}
        secondaryLabel={t('leave.stay')}
        onSecondary={() => setLeaveOpen(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  questionContent: { paddingHorizontal: SCREEN_PADDING, paddingTop: space.sm, paddingBottom: space.xxxl },
  footer: {
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  resultBar: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  barSpacer: { width: 44 },
  resultContent: { paddingTop: space.sm, paddingBottom: space.huge, gap: space.xl },
  resultTop: { alignItems: 'center', gap: space.xs },
  resultLesson: { maxWidth: '90%' },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderRadius: radius.md,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
  },
  actions: { gap: space.md },
  actionRow: { flexDirection: 'row', gap: space.md },
  reviewSection: { gap: space.md },
});
