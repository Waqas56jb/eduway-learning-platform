import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isRTL } from '@/utils/rtl';
import { BackHandler, ScrollView, StyleSheet, View } from 'react-native';
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
import { Badge, Button, Dialog, EmptyState, IconButton, Skeleton, Text } from '@/components/ui';
import { QuestionView, QuizResultSummary } from '@/components/student';
import { QuizHeader } from '@/components/quiz/QuizHeader';
import { QuizReviewList } from '@/components/quiz/QuizReviewList';
import { useI18n } from '@/hooks/useI18n';
import { useQueryClient } from '@tanstack/react-query';
import { optionIdAt, toQuestion } from '@/api/adapters';
import { useLesson } from '@/api/catalog';
import { qk } from '@/api/keys';
import { handleActionError } from '@/api/locked';
import { answerQuiz, startQuiz, submitQuiz } from '@/api/quizzes';
import { SCREEN_PADDING, radius, space, useTheme } from '@/theme';
import type { Question } from '@/types';
import { haptic } from '@/utils/haptics';
import { reviewFromAnswers, revealQuestion, type AnswerRecord } from '@/utils/quiz';

interface QuizRun {
  attemptId: string;
  attemptNo: number;
  questions: Question[];
}

interface QuizResult {
  attemptNo: number;
  score: number;
  correct: number;
  total: number;
  passed: boolean;
  passMark: number;
  timeSpentSec: number;
  mistakesAdded: number;
  nextLessonId: string | null;
  review: { questions: Question[]; answers: AnswerRecord[] };
}

export default function QuizScreen() {
  const { lessonId: rawId } = useLocalSearchParams<{ lessonId: string }>();
  const lessonId = String(rawId ?? '');
  const { data: lesson } = useLesson(lessonId || undefined);
  const { t, L } = useI18n('quiz');
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();

  // A new run (first open or retake) starts a fresh server attempt (QUZ-01).
  const [runKey, setRunKey] = useState(0);
  const [run, setRun] = useState<QuizRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [startError, setStartError] = useState<string | null>(null);
  const [showExplanation, setShowExplanation] = useState(true);

  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<Record<string, number>>({});
  const [answered, setAnswered] = useState<Record<string, true>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [showTimer, setShowTimer] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const startedAt = useRef(Date.now());
  const questionShownAt = useRef(Date.now());
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!lessonId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setStartError(null);
    startQuiz(lessonId)
      .then((res) => {
        if (cancelled) return;
        setRun({ attemptId: res.attemptId, attemptNo: res.attemptNo, questions: res.questions.map(toQuestion) });
        setShowExplanation(res.rule.showExplanation);
        startedAt.current = Date.now();
        questionShownAt.current = Date.now();
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const e = handleActionError(err);
        setStartError(e.message);
        setRun(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lessonId, runKey]);

  const questions = run?.questions ?? [];
  const total = questions.length;
  const question: Question | undefined = questions[index];
  const selected = question ? (chosen[question.id] ?? null) : null;
  const revealed = question ? !!answered[question.id] : false;
  const answeredCount = Object.keys(answered).length;
  const inProgress = !result && answeredCount > 0;
  const isLast = index >= total - 1;

  // Elapsed-time ticker (runs until results).
  useEffect(() => {
    if (result || !run) return;
    const id = setInterval(() => setElapsed(Math.round((Date.now() - startedAt.current) / 1000)), 1000);
    return () => clearInterval(id);
  }, [result, run]);

  // Android hardware back → confirm while a quiz is in progress.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!inProgress) return false;
      setLeaveOpen(true);
      return true;
    });
    return () => sub.remove();
  }, [inProgress]);

  // QUZ-02: the answer is final; the server reveals the correct option + explanation.
  const onSelect = useCallback(
    (optIdx: number) => {
      if (!run || !question || chosen[question.id] !== undefined) return;
      const optionId = optionIdAt(question, optIdx);
      if (!optionId) return;
      const qid = question.id;
      setChosen((c) => ({ ...c, [qid]: optIdx }));
      const timeSec = Math.max(1, Math.round((Date.now() - questionShownAt.current) / 1000));
      answerQuiz(run.attemptId, { questionId: qid, optionId, timeSec })
        .then((fb) => {
          setRun((r) => (r ? { ...r, questions: r.questions.map((x) => (x.id === qid ? revealQuestion(x, fb) : x)) } : r));
          setAnswered((a) => ({ ...a, [qid]: true }));
          if (fb.correct) haptic.success();
          else haptic.error();
        })
        .catch((err: unknown) => {
          handleActionError(err);
          setChosen((c) => {
            const { [qid]: _drop, ...rest } = c;
            return rest;
          });
        });
    },
    [run, question, chosen],
  );

  // QUZ-03
  const finish = useCallback(async () => {
    if (!run || submitting) return;
    setSubmitting(true);
    const timeSpentSec = Math.max(1, Math.round((Date.now() - startedAt.current) / 1000));
    try {
      const res = await submitQuiz(run.attemptId, timeSpentSec);
      const r: QuizResult = {
        attemptNo: res.attemptNo,
        score: res.score,
        correct: res.correct,
        total: res.total,
        passed: res.passed,
        passMark: res.passThreshold,
        timeSpentSec: res.timeSpentSec || timeSpentSec,
        mistakesAdded: res.mistakesAdded,
        nextLessonId: res.nextLessonId,
        review: reviewFromAnswers(res.answers),
      };
      setElapsed(r.timeSpentSec);
      setResult(r);
      if (r.passed) haptic.success();
      else haptic.warning();
      void qc.invalidateQueries({ queryKey: qk.catalog.all });
      void qc.invalidateQueries({ queryKey: qk.progress.all });
      void qc.invalidateQueries({ queryKey: qk.mistakes.all });
      void qc.invalidateQueries({ queryKey: qk.quizzes.all });
    } catch (err) {
      handleActionError(err);
    } finally {
      setSubmitting(false);
    }
  }, [run, submitting, qc]);

  const goNext = useCallback(() => {
    if (!revealed) return;
    if (isLast) {
      void finish();
      return;
    }
    haptic.light();
    setIndex((i) => i + 1);
    questionShownAt.current = Date.now();
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [revealed, isLast, finish]);

  const retake = useCallback(() => {
    setElapsed(0);
    setChosen({});
    setAnswered({});
    setIndex(0);
    setResult(null);
    setRun(null);
    setRunKey((k) => k + 1);
  }, []);

  const requestClose = useCallback(() => {
    if (inProgress) setLeaveOpen(true);
    else goBackOrHome();
  }, [inProgress]);

  const reviewMistakes = useCallback(() => {
    router.push('/mistakes');
  }, []);

  const nextLessonId = result?.nextLessonId ?? null;
  const goNextLesson = useCallback(() => {
    if (!nextLessonId) return;
    router.replace({ pathname: '/lesson/[id]', params: { id: nextLessonId } });
  }, [nextLessonId]);

  // Forward motion: new card comes from the reading-forward edge (native layout direction).
  const rtl = isRTL();
  const entering = (rtl ? SlideInLeft : SlideInRight).duration(300);
  const exiting = (rtl ? SlideOutRight : SlideOutLeft).duration(220);

  const lessonTitle = lesson ? L(lesson.title) : t('title');

  // ─── Loading (starting the attempt) ──────────────────────────────────────────
  if (loading && !result) {
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
        <View style={styles.loading}>
          <Skeleton width="40%" height={14} />
          <Skeleton height={56} />
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={60} radius={16} />
          ))}
        </View>
      </Screen>
    );
  }

  // ─── Empty state ────────────────────────────────────────────────────────────
  if (!result && (!total || !question)) {
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
            message={startError ?? t('empty.message')}
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
    const added = result.mistakesAdded || wrong;
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
          <Badge label={t('result.attempt', { n: result.attemptNo })} tone="navy" icon="history" size="sm" />
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
          passMark={result.passMark}
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
            {wrong ? t('result.mistakesAdded', { count: added }) : t('result.allCorrect')}
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(300).delay(480)} style={styles.actions}>
          {nextLessonId ? (
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
          {!nextLessonId ? (
            <Text variant="caption" color="muted" align="center">
              {t('result.lastLesson')}
            </Text>
          ) : null}
        </Animated.View>

        <View style={styles.reviewSection}>
          <Text variant="h3">{t('result.review')}</Text>
          <QuizReviewList questions={result.review.questions} answers={result.review.answers} />
        </View>
      </Screen>
    );
  }

  // ─── Question flow ─────────────────────────────────────────────────────────
  if (!question) return null;
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
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View key={`${runKey}-${question.id}`} entering={index === 0 ? undefined : entering} exiting={exiting}>
          <QuestionView
            question={question}
            selectedIndex={selected}
            revealed={revealed}
            onSelect={onSelect}
            showExplanation={showExplanation}
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
          disabled={!revealed || submitting}
          loading={submitting}
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
  loading: { gap: space.md, paddingTop: space.xl },
  questionContent: { paddingHorizontal: SCREEN_PADDING, paddingTop: space.md, paddingBottom: space.xxxl },
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
