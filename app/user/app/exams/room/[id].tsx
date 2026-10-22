import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isRTL } from '@/utils/rtl';
import { AppState, BackHandler, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import Animated, { FadeInLeft, FadeInRight } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { toQuestion } from '@/api/adapters';
import { useConnectivity } from '@/api/connectivity';
import { isLockedError, normalizeError, toastError, type ApiError } from '@/api/errors';
import { flagExamQuestion, startExam } from '@/api/exams';
import {
  clearExamState,
  getLocalExamState,
  hasPendingSubmit,
  onExamSync,
  queueAutosave,
  queueSubmit,
} from '@/api/examQueue';
import { qk } from '@/api/keys';
import { openSubscription } from '@/api/locked';
import { useAppConfig } from '@/api/public';
import type { ExamAttemptState } from '@/api/types';
import { toIndexMap, toOptionIdMap } from '@/components/exams/examUtils';
import { OfflineBanner, SavedIndicator, SubmitSummary } from '@/components/exams/RoomParts';
import { Icon } from '@/components/icons';
import { Header, Screen } from '@/components/layout';
import { ExamTimer, QuestionNavigator, QuestionView } from '@/components/student';
import { BottomSheet, Button, Dialog, EmptyState, IconButton, PressableScale, ProgressBar, Text, toast } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { HIT_SLOP, palette, radius, SCREEN_PADDING, space, useTheme } from '@/theme';
import type { Localized, Question } from '@/types';
import { haptic } from '@/utils/haptics';

const goToExams = () => {
  if (router.canGoBack()) router.back();
  else router.replace('/exams');
};

const openResultRoute = (attemptId: string) =>
  router.replace({ pathname: '/exams/result/[id]', params: { id: attemptId } });

const FINAL_REASONS = new Set(['EXAM_ALREADY_SUBMITTED', 'EXAM_TIME_OVER']);

interface RoomInit {
  attempt: ExamAttemptState;
  questions: Question[];
  answers: Record<string, number>;
  flagged: string[];
  currentIndex: number;
  /** Local deadline (epoch ms) corrected for server clock skew. */
  endsAt: number;
}

type LoadState = { kind: 'loading' } | { kind: 'ready'; init: RoomInit } | { kind: 'error'; error: ApiError };

export default function ExamRoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useI18n('exams');
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);

  // EXM-03: start a new attempt or resume the active one (idempotent on the server).
  useEffect(() => {
    if (!id) return;
    let alive = true;
    setState({ kind: 'loading' });
    (async () => {
      try {
        const attempt = await startExam(id);
        if (!alive) return;
        if (attempt.status !== 'in_progress' || (await hasPendingSubmit(attempt.attemptId))) {
          openResultRoute(attempt.attemptId);
          return;
        }
        // Server-authoritative clock: skew = serverNow − device now.
        const skew = new Date(attempt.serverNow).getTime() - Date.now();
        const questions = attempt.questions.map(toQuestion);
        let answers = attempt.answers;
        let flagged = attempt.flagged;
        let currentIndex = attempt.currentIndex;
        // Prefer locally saved state that never reached the server (e.g. app killed while offline).
        const local = await getLocalExamState(attempt.attemptId);
        const serverSaved = attempt.lastSavedAt ? new Date(attempt.lastSavedAt).getTime() : 0;
        if (local && new Date(local.clientSavedAt).getTime() + skew > serverSaved) {
          answers = local.answers;
          flagged = local.flagged;
          currentIndex = local.currentIndex;
        }
        if (!alive) return;
        setState({
          kind: 'ready',
          init: {
            attempt,
            questions,
            answers: toIndexMap(questions, answers),
            flagged,
            currentIndex,
            endsAt: new Date(attempt.endsAt).getTime() - skew,
          },
        });
      } catch (err) {
        if (!alive) return;
        const e = normalizeError(err);
        if (isLockedError(e)) {
          toastError(e);
          openSubscription(e.locked);
        } else if (e.reason !== 'EXAM_ATTEMPTS_EXHAUSTED' && e.code !== 'NOT_FOUND') {
          toastError(e);
        }
        setState({ kind: 'error', error: e });
      }
    })();
    return () => {
      alive = false;
    };
  }, [id, reloadKey]);

  if (state.kind === 'loading') {
    return (
      <Screen edges={['top', 'bottom']}>
        <Header title={t('title')} />
        <View style={styles.center}>
          <EmptyState icon="exam" title={t('common:states.loading')} />
        </View>
      </Screen>
    );
  }
  if (state.kind === 'error') {
    const e = state.error;
    if (e.reason === 'EXAM_ATTEMPTS_EXHAUSTED') {
      return (
        <Screen edges={['top', 'bottom']}>
          <Header title={t('title')} />
          <View style={styles.center}>
            <EmptyState
              icon="lock"
              title={t('noAttemptsRoom.title')}
              message={t('noAttemptsRoom.message')}
              actionLabel={t('notFound.action')}
              onAction={goToExams}
            />
          </View>
        </Screen>
      );
    }
    const network = e.isNetwork;
    return (
      <Screen edges={['top', 'bottom']}>
        <Header title={t('title')} />
        <View style={styles.center}>
          <EmptyState
            icon={network ? 'wifi-off' : 'exam'}
            title={network ? t('common:states.error') : t('notFound.title')}
            message={network ? t('common:states.offline') : t('notFound.message')}
            actionLabel={network ? t('common:actions.retry') : t('notFound.action')}
            onAction={network ? () => setReloadKey((k) => k + 1) : goToExams}
          />
        </View>
      </Screen>
    );
  }
  if (!state.init.questions.length) {
    return (
      <Screen edges={['top', 'bottom']}>
        <Header title={t('title')} />
        <View style={styles.center}>
          <EmptyState icon="exam" title={t('notFound.title')} message={t('notFound.message')} actionLabel={t('notFound.action')} onAction={goToExams} />
        </View>
      </Screen>
    );
  }
  return <ExamRoom init={state.init} />;
}

function ExamRoom({ init }: { init: RoomInit }) {
  const { colors, isDark } = useTheme();
  const { t, L } = useI18n('exams');
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const narrow = width < 360;
  const qc = useQueryClient();
  const { data: config } = useAppConfig();
  const attemptId = init.attempt.attemptId;
  const exam: { title: Localized } = init.attempt.exam;
  const questions = init.questions;
  const autosaveSeconds = init.attempt.autosaveSeconds || config?.learning.examAutosaveSeconds || 15;

  const total = questions.length;
  const [answers, setAnswers] = useState<Record<string, number>>(init.answers);
  const [flagged, setFlagged] = useState<string[]>(init.flagged);
  const [index, setIndex] = useState(() => Math.min(Math.max(0, init.currentIndex), total - 1));
  const [dir, setDir] = useState<1 | -1>(1);
  const [savedKey, setSavedKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [gridOpen, setGridOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [timeUpAttemptId, setTimeUpAttemptId] = useState<string | null>(null);
  /** Manual submit accepted locally but waiting for the connection. */
  const [queuedManual, setQueuedManual] = useState(false);

  const submittedRef = useRef(false);
  const stateRef = useRef({ answers, flagged, index });
  useEffect(() => {
    stateRef.current = { answers, flagged, index };
  }, [answers, flagged, index]);

  const save = useCallback(() => {
    if (submittedRef.current) return;
    const s = stateRef.current;
    void queueAutosave(attemptId, {
      answers: toOptionIdMap(questions, s.answers),
      flagged: s.flagged,
      currentIndex: s.index,
    });
  }, [attemptId, questions]);

  // Sync indicator + navigation once a queued (offline) submit finally lands.
  useEffect(
    () =>
      onExamSync((aid, st) => {
        if (aid !== attemptId) return;
        setSaving(st === 'saving');
        if (st === 'saved') setSavedKey((k) => k + 1);
        if (st === 'saved' && queuedManual) {
          setQueuedManual(false);
          openResultRoute(attemptId);
        }
      }),
    [attemptId, queuedManual],
  );

  // Autosave every change (debounced) …
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const id = setTimeout(save, 800);
    return () => clearTimeout(id);
  }, [answers, flagged, index, save]);

  // … plus a periodic save, and one whenever the app leaves the foreground or the room unmounts.
  useEffect(() => {
    const timer = setInterval(save, autosaveSeconds * 1000);
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'active') save();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
      save();
    };
  }, [save, autosaveSeconds]);

  const online = useConnectivity((s) => s.online);
  const wasOnline = useRef(online);
  useEffect(() => {
    if (online && !wasOnline.current && !timeUpAttemptId) {
      toast.show({ message: t('network.back'), tone: 'success', icon: 'check-circle' });
    }
    wasOnline.current = online;
  }, [online, t, timeUpAttemptId]);

  const question = questions[index]!;
  const isFlagged = flagged.includes(question.id);
  const answeredSet = useMemo(
    () => new Set(questions.map((q, i) => (answers[q.id] !== undefined ? i : -1)).filter((i) => i >= 0)),
    [answers, questions],
  );
  const flaggedSet = useMemo(
    () => new Set(questions.map((q, i) => (flagged.includes(q.id) ? i : -1)).filter((i) => i >= 0)),
    [flagged, questions],
  );
  const unanswered = useMemo(() => questions.map((_, i) => i).filter((i) => !answeredSet.has(i)), [answeredSet, questions]);

  const goTo = useCallback(
    (i: number) => {
      if (i < 0 || i >= total || i === index) return;
      setDir(i > index ? 1 : -1);
      setIndex(i);
    },
    [index, total],
  );

  const onSelect = useCallback(
    (opt: number) => {
      setAnswers((prev) => ({ ...prev, [question.id]: opt }));
      setSavedKey((k) => k + 1);
    },
    [question.id],
  );

  const toggleFlag = () => {
    haptic.selection();
    const next = !flagged.includes(question.id);
    setFlagged((prev) => (next ? [...prev, question.id] : prev.filter((x) => x !== question.id)));
    // EXM-06 — flags are also part of every autosave, so a failure here is harmless.
    void flagExamQuestion(attemptId, question.id, next).catch(() => {});
  };

  const finish = useCallback(
    (reason: 'manual' | 'timeout') => {
      void qc.invalidateQueries({ queryKey: qk.exams.all });
      void qc.invalidateQueries({ queryKey: qk.mistakes.all });
      void qc.invalidateQueries({ queryKey: qk.progress.all });
      if (reason === 'timeout') {
        haptic.warning();
        setTimeUpAttemptId(attemptId);
      } else {
        haptic.success();
        openResultRoute(attemptId);
      }
    },
    [qc, attemptId],
  );

  const submit = useCallback(
    async (reason: 'manual' | 'timeout') => {
      if (submittedRef.current) return;
      submittedRef.current = true;
      setGridOpen(false);
      setSubmitOpen(false);
      setExitOpen(false);
      const s = stateRef.current;
      try {
        const accepted = await queueSubmit(attemptId, {
          reason,
          answers: toOptionIdMap(questions, s.answers),
          flagged: s.flagged,
        });
        if (accepted) {
          await clearExamState(attemptId);
          finish(reason);
        } else if (reason === 'timeout') {
          // Offline at time-up: the submit stays queued (the server also auto-submits at endsAt + grace).
          haptic.warning();
          setTimeUpAttemptId(attemptId);
        } else {
          setQueuedManual(true);
          toast.show({ message: t('network.lost'), tone: 'info', icon: 'wifi-off' });
        }
      } catch (err) {
        const e = normalizeError(err);
        if (e.reason && FINAL_REASONS.has(e.reason)) {
          await clearExamState(attemptId);
          finish(reason);
          return;
        }
        submittedRef.current = false;
        toastError(e);
      }
    },
    [attemptId, questions, finish, t],
  );

  const onExpire = useCallback(() => void submit('timeout'), [submit]);

  const openResult = useCallback(() => {
    if (!timeUpAttemptId) return;
    const aid = timeUpAttemptId;
    setTimeUpAttemptId(null);
    openResultRoute(aid);
  }, [timeUpAttemptId]);

  // Android hardware back → exit confirmation (or straight to results after time-up).
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (timeUpAttemptId) {
        openResult();
        return true;
      }
      if (submittedRef.current) return false;
      if (gridOpen || submitOpen) {
        setGridOpen(false);
        setSubmitOpen(false);
        return true;
      }
      setExitOpen(true);
      return true;
    });
    return () => sub.remove();
  }, [timeUpAttemptId, openResult, gridOpen, submitOpen]);

  const leave = () => {
    setExitOpen(false);
    goToExams();
  };

  const jumpFromSheet = (i: number) => {
    setGridOpen(false);
    setSubmitOpen(false);
    goTo(i);
  };

  const isLast = index === total - 1;
  // Forward = toward the reading end; under native RTL that is the left edge.
  const forwardFromEnd = (dir > 0) !== isRTL();
  const entering = (forwardFromEnd ? FadeInRight : FadeInLeft).duration(240);

  return (
    <Screen padded={false} edges={['top']} animated={false}>
      <Stack.Screen options={{ gestureEnabled: false, animation: 'fade' }} />

      {/* Top bar */}
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <IconButton icon="close" variant="surface" onPress={() => setExitOpen(true)} accessibilityLabel={t('room.exit')} />
        <View style={styles.titleWrap}>
          <Text variant="bodyBold" numberOfLines={1}>
            {L(exam.title)}
          </Text>
          <View style={styles.syncRow}>
            <View style={[styles.syncDot, { backgroundColor: online ? colors.success : colors.warning }]} />
            <Text variant="caption" color="muted" numberOfLines={1}>
              {t('room.sync')}
            </Text>
          </View>
        </View>
        <ExamTimer endsAt={init.endsAt} onExpire={onExpire} compact />
      </View>

      {!online ? <OfflineBanner /> : null}

      {/* Status row */}
      <View style={styles.statusRow}>
        <View style={styles.counterWrap}>
          <Text variant="h3" tabular accessibilityLabel={t('room.questionOf', { current: index + 1, total })}>
            {t('room.counter', { current: index + 1, total })}
          </Text>
          <SavedIndicator pulseKey={savedKey} saving={saving} />
        </View>
        <PressableScale
          onPress={toggleFlag}
          hitSlop={HIT_SLOP}
          accessibilityRole="button"
          accessibilityState={{ selected: isFlagged }}
          accessibilityLabel={isFlagged ? t('room.unflag') : t('room.flag')}
          style={[
            styles.flagBtn,
            isFlagged
              ? { backgroundColor: colors.accent, borderColor: colors.accent }
              : { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Icon name="flag" size={16} color={isFlagged ? palette.navy : colors.muted} filled={isFlagged} />
          <Text variant="label" color={isFlagged ? palette.navy : colors.muted}>
            {isFlagged ? t('room.flagged') : t('room.flag')}
          </Text>
        </PressableScale>
      </View>
      <View style={styles.progressWrap}>
        <ProgressBar progress={(answeredSet.size / total) * 100} height={4} gradient />
        <Text variant="caption" color="muted" style={styles.answered}>
          {t('room.answeredCount', { count: answeredSet.size, total })}
        </Text>
      </View>

      {/* Question */}
      <ScrollView style={styles.flex} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Animated.View key={question.id} entering={entering}>
          <QuestionView question={question} selectedIndex={answers[question.id] ?? null} revealed={false} onSelect={onSelect} showExplanation={false} />
        </Animated.View>
      </ScrollView>

      {/* Bottom controls: Prev · grid · Next/Submit — all 52pt, equal side widths, above the home indicator */}
      <View
        style={[
          styles.bottomBar,
          {
            borderTopColor: colors.border,
            backgroundColor: isDark ? colors.surface : colors.background,
            paddingBottom: Math.max(insets.bottom, space.md),
          },
        ]}
      >
        <Button
          title={t('room.prev')}
          icon={narrow ? undefined : 'back'}
          variant="outline"
          size="lg"
          disabled={index === 0}
          onPress={() => goTo(index - 1)}
          style={styles.navBtn}
        />
        <IconButton
          icon="grid"
          size={52}
          variant="surface"
          onPress={() => setGridOpen(true)}
          accessibilityLabel={t('room.grid')}
          badge={flagged.length || undefined}
        />
        {isLast ? (
          <Button
            title={t('room.submit')}
            icon={narrow ? undefined : 'check'}
            variant="primary"
            size="lg"
            onPress={() => setSubmitOpen(true)}
            style={styles.navBtn}
          />
        ) : (
          <Button
            title={t('room.next')}
            icon={narrow ? undefined : 'chevron'}
            iconPosition="end"
            variant="secondary"
            size="lg"
            onPress={() => goTo(index + 1)}
            style={styles.navBtn}
          />
        )}
      </View>

      {/* Navigator sheet */}
      <BottomSheet
        visible={gridOpen}
        onClose={() => setGridOpen(false)}
        title={t('navigator.title')}
        subtitle={t('room.answeredCount', { count: answeredSet.size, total })}
        footer={
          <Button
            title={t('room.submit')}
            icon="check"
            fullWidth
            onPress={() => {
              setGridOpen(false);
              setSubmitOpen(true);
            }}
          />
        }
      >
        <QuestionNavigator total={total} current={index} answered={answeredSet} flagged={flaggedSet} onJump={jumpFromSheet} />
      </BottomSheet>

      {/* Submit confirmation */}
      <BottomSheet
        visible={submitOpen}
        onClose={() => setSubmitOpen(false)}
        title={t('submitSheet.title')}
        footer={
          <View style={styles.sheetFooter}>
            <Button title={t('submitSheet.confirm')} icon="check" fullWidth onPress={() => void submit('manual')} />
            <Button title={t('submitSheet.keep')} variant="ghost" fullWidth onPress={() => setSubmitOpen(false)} />
          </View>
        }
      >
        <View style={styles.timeLeftRow}>
          <Text variant="bodyMedium" color="muted">
            {t('submitSheet.timeLeft')}
          </Text>
          <ExamTimer endsAt={init.endsAt} onExpire={onExpire} compact />
        </View>
        <SubmitSummary unanswered={unanswered} flaggedCount={flagged.length} onJump={jumpFromSheet} />
      </BottomSheet>

      {/* Exit confirmation */}
      <Dialog
        visible={exitOpen}
        onClose={() => setExitOpen(false)}
        icon="alert"
        title={t('exitDialog.title')}
        message={t('exitDialog.message')}
        primaryLabel={t('exitDialog.stay')}
        onPrimary={() => setExitOpen(false)}
        secondaryLabel={t('exitDialog.leave')}
        onSecondary={leave}
      />

      {/* Time's up */}
      <Dialog
        visible={!!timeUpAttemptId}
        onClose={openResult}
        icon="timer"
        tone="danger"
        title={t('timeUp.title')}
        message={t('timeUp.message')}
        primaryLabel={t('timeUp.cta')}
        onPrimary={openResult}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, justifyContent: 'center' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 60,
    paddingHorizontal: SCREEN_PADDING,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  titleWrap: { flex: 1, alignItems: 'flex-start' },
  syncRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  syncDot: { width: 6, height: 6, borderRadius: 3 },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: space.md,
  },
  counterWrap: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  flagBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + 2,
    minHeight: 36,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  progressWrap: { paddingHorizontal: SCREEN_PADDING, paddingTop: space.md },
  answered: { marginTop: space.xs + 2 },
  body: { paddingHorizontal: SCREEN_PADDING, paddingTop: space.lg, paddingBottom: space.xxxl },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  navBtn: { flex: 1, paddingHorizontal: space.md },
  sheetFooter: { gap: space.sm },
  timeLeftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.md,
  },
});
