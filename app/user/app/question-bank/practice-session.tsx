import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isRTL } from '@/utils/rtl';
import { BackHandler, ScrollView, StyleSheet, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import Animated, { FadeIn, FadeInDown, SlideInLeft, SlideInRight, SlideOutLeft, SlideOutRight } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/icons';
import { goBackOrHome } from '@/components/layout/Header';
import { Screen } from '@/components/layout';
import { Button, Dialog, EmptyState, IconButton, Skeleton, Text } from '@/components/ui';
import { QuestionView } from '@/components/student';
import { BookmarkStar, SessionHeader } from '@/components/practice';
import { useQueryClient } from '@tanstack/react-query';
import { optionIdAt, toQuestion } from '@/api/adapters';
import { answerPractice, finishPractice, startPractice } from '@/api/bank';
import { hasReason } from '@/api/errors';
import { qk } from '@/api/keys';
import { handleActionError } from '@/api/locked';
import { useI18n } from '@/hooks/useI18n';
import { SCREEN_PADDING, radius, space, useTheme } from '@/theme';
import type { Localized, Question } from '@/types';
import { haptic } from '@/utils/haptics';
import { fromParams, toParams, toPracticeFilters } from '@/utils/practice';
import { revealQuestion } from '@/utils/quiz';

export default function PracticeSessionScreen() {
  const raw = useLocalSearchParams<Record<string, string>>();
  const { t, L } = useI18n('practice');
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();

  // Session config is read once per mount; PRA-01 assembles the questions server-side.
  const [cfg] = useState(() => fromParams(raw));
  const [questions, setQuestions] = useState<Question[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [serverSubtitle, setServerSubtitle] = useState<Localized | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const mode = cfg.mode ?? 'filters';
    startPractice({
      mode,
      filters: mode === 'filters' ? toPracticeFilters(cfg.filters) : cfg.filters.subjectId ? { subjectId: cfg.filters.subjectId } : undefined,
      count: cfg.count,
      includeQuestionId: cfg.include,
      questionIds: cfg.ids,
    })
      .then((res) => {
        if (cancelled) return;
        setSessionId(res.sessionId);
        setQuestions(res.questions.map(toQuestion));
        setServerSubtitle(res.subtitle);
        startedAt.current = Date.now();
        shownAt.current = Date.now();
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // "No matching questions" is shown by the empty state; everything else is explained by a toast.
        if (!hasReason(err, 'NO_QUESTIONS')) handleActionError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cfg]);

  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<Record<string, number>>({});
  const [feedback, setFeedback] = useState<Record<string, boolean>>({});
  const [streak, setStreak] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const startedAt = useRef(Date.now());
  const shownAt = useRef(Date.now());
  const finished = useRef(false);
  const scrollRef = useRef<ScrollView>(null);

  const total = questions.length;
  const question: Question | undefined = questions[index];
  const selected = question ? (chosen[question.id] ?? null) : null;
  const revealed = !!question && feedback[question.id] !== undefined;
  const answered = Object.keys(feedback).length;
  const inProgress = answered > 0;
  const isLast = index >= total - 1;
  const isCorrect = !!question && feedback[question.id] === true;

  const title = cfg.mode === 'bookmarks' ? t('session.bookmarksTitle') : t('session.title');
  const subtitle = useMemo(() => {
    if (cfg.mode === 'bookmarks') return t('bank.bookmarked');
    if (serverSubtitle && L(serverSubtitle)) return L(serverSubtitle);
    if (cfg.filters.subjectId) return t(`common:subjects.${cfg.filters.subjectId}`, { defaultValue: cfg.filters.subjectId });
    return t('recent.mixed');
  }, [L, cfg, serverSubtitle, t]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!inProgress) return false;
      setLeaveOpen(true);
      return true;
    });
    return () => sub.remove();
  }, [inProgress]);

  // PRA-02: instant feedback (+ server streak); wrong answers are logged as mistakes server-side.
  const onSelect = useCallback(
    (i: number) => {
      if (!sessionId || !question || chosen[question.id] !== undefined) return;
      const optionId = optionIdAt(question, i);
      if (!optionId) return;
      const qid = question.id;
      setChosen((c) => ({ ...c, [qid]: i }));
      const timeSec = Math.max(1, Math.round((Date.now() - shownAt.current) / 1000));
      answerPractice(sessionId, { questionId: qid, optionId, timeSec })
        .then((fb) => {
          setQuestions((qs) => qs.map((x) => (x.id === qid ? revealQuestion(x, fb) : x)));
          setFeedback((f) => ({ ...f, [qid]: fb.correct }));
          setStreak(fb.streak);
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
    [chosen, question, sessionId],
  );

  // PRA-03 → result screen (attemptId = sessionId).
  const finish = useCallback(async () => {
    if (finished.current || !sessionId) return;
    finished.current = true;
    setFinishing(true);
    try {
      const res = await finishPractice(sessionId, Math.max(1, Math.round((Date.now() - startedAt.current) / 1000)));
      qc.setQueryData(qk.practice.result(sessionId), res);
      void qc.invalidateQueries({ queryKey: qk.practice.all });
      void qc.invalidateQueries({ queryKey: qk.mistakes.all });
      void qc.invalidateQueries({ queryKey: qk.progress.all });
      void qc.invalidateQueries({ queryKey: ['bank', 'facets'] });
      if (res.score >= 50) haptic.success();
      else haptic.warning();
      router.replace({
        pathname: '/question-bank/result',
        params: { attemptId: sessionId, ...toParams(cfg.filters, cfg.count, cfg.mode) },
      });
    } catch (err) {
      finished.current = false;
      handleActionError(err);
    } finally {
      setFinishing(false);
    }
  }, [cfg, qc, sessionId]);

  const goNext = useCallback(() => {
    if (!revealed) return;
    if (isLast) {
      void finish();
      return;
    }
    haptic.light();
    setIndex((i) => i + 1);
    shownAt.current = Date.now();
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [finish, isLast, revealed]);

  const requestClose = useCallback(() => {
    if (inProgress) setLeaveOpen(true);
    else goBackOrHome();
  }, [inProgress]);

  // Forward motion: the next card arrives from the reading-forward edge (native layout direction).
  const rtl = isRTL();
  const entering = (rtl ? SlideInLeft : SlideInRight).duration(320);
  const exiting = (rtl ? SlideOutRight : SlideOutLeft).duration(240);

  if (loading) {
    return (
      <Screen edges={['top', 'bottom']}>
        <View style={styles.emptyBar}>
          <IconButton icon="close" variant="surface" onPress={goBackOrHome} accessibilityLabel={t('session.exit')} />
        </View>
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

  if (!total || !question) {
    const bookmarksMode = cfg.mode === 'bookmarks';
    return (
      <Screen edges={['top', 'bottom']}>
        <View style={styles.emptyBar}>
          <IconButton icon="close" variant="surface" onPress={goBackOrHome} accessibilityLabel={t('session.exit')} />
        </View>
        <Animated.View entering={FadeIn.duration(260)} style={styles.flex}>
          <EmptyState
            icon={bookmarksMode ? 'star' : 'question-bank'}
            title={t('session.emptyTitle')}
            message={bookmarksMode ? t('session.emptyBookmarksMessage') : t('session.emptyMessage')}
            actionLabel={t('session.emptyAction')}
            onAction={goBackOrHome}
          />
        </Animated.View>
      </Screen>
    );
  }

  return (
    <Screen edges={['top']} padded={false}>
      <Stack.Screen options={{ gestureEnabled: !inProgress }} />
      <SessionHeader
        title={title}
        subtitle={subtitle}
        current={index}
        total={total}
        answered={answered}
        streak={streak}
        onClose={requestClose}
      />

      <ScrollView
        ref={scrollRef}
        style={styles.flex}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View key={question.id} entering={index === 0 ? undefined : entering} exiting={exiting}>
          <QuestionView
            question={question}
            selectedIndex={selected}
            revealed={revealed}
            onSelect={onSelect}
            showExplanation
            headerRight={<BookmarkStar initial={question.bookmarked} questionId={question.id} surface />}
          />
        </Animated.View>
      </ScrollView>

      <View
        style={[
          styles.footer,
          { paddingBottom: Math.max(insets.bottom, space.lg), backgroundColor: colors.background, borderTopColor: colors.border },
        ]}
      >
        <View style={styles.feedbackSlot}>
          {revealed ? (
            <Animated.View
              key={`fb-${question.id}`}
              entering={FadeInDown.duration(220)}
              style={[styles.feedback, { backgroundColor: isCorrect ? colors.successSoft : colors.dangerSoft }]}
              accessibilityLiveRegion="polite"
            >
              <Icon name={isCorrect ? 'check-circle' : 'x-circle'} size={18} color={isCorrect ? colors.success : colors.danger} />
              <Text variant="label" color={isCorrect ? colors.success : colors.danger} numberOfLines={2} style={styles.flex}>
                {isCorrect ? t('session.correct') : t('session.incorrect')}
              </Text>
            </Animated.View>
          ) : (
            <Text variant="caption" color="muted" align="center" numberOfLines={2}>
              {t('session.choose')}
            </Text>
          )}
        </View>
        <Button
          title={isLast ? t('session.finish') : t('session.next')}
          icon={isLast ? 'trophy' : 'arrow'}
          iconPosition="end"
          variant="primary"
          size="lg"
          fullWidth
          disabled={!revealed || finishing}
          loading={finishing}
          onPress={goNext}
        />
      </View>

      <Dialog
        visible={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        title={t('session.exitTitle')}
        message={t('session.exitMessage')}
        icon="alert"
        tone="danger"
        primaryLabel={t('session.exitConfirm')}
        onPrimary={() => {
          setLeaveOpen(false);
          goBackOrHome();
        }}
        secondaryLabel={t('session.exitCancel')}
        onSecondary={() => setLeaveOpen(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: SCREEN_PADDING, paddingTop: space.sm, paddingBottom: space.xxxl },
  footer: { paddingHorizontal: SCREEN_PADDING, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth, gap: space.md },
  feedbackSlot: { minHeight: 40, justifyContent: 'center' },
  feedback: {
    flexDirection: 'row',
    minHeight: 40,
    alignItems: 'center',
    gap: space.sm,
    borderRadius: radius.md,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
  },
  emptyBar: { flexDirection: 'row', paddingTop: space.sm },
  loading: { gap: space.md, paddingTop: space.xl },
});
