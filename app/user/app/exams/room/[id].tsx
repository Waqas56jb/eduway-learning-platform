import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, ScrollView, StyleSheet, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import Animated, { FadeInLeft, FadeInRight } from 'react-native-reanimated';
import { attemptsRemaining, examQuestions, scoreExam } from '@/components/exams/examUtils';
import { OfflineBanner, SavedIndicator, SubmitSummary } from '@/components/exams/RoomParts';
import { useMockConnection } from '@/components/exams/useMockConnection';
import { Icon } from '@/components/icons';
import { Header, Screen } from '@/components/layout';
import { ExamTimer, QuestionNavigator, QuestionView } from '@/components/student';
import { BottomSheet, Button, Dialog, EmptyState, IconButton, PressableScale, ProgressBar, Text, toast } from '@/components/ui';
import { getExam } from '@/data';
import { useI18n } from '@/hooks/useI18n';
import { useMistakesStore, useProgressStore, type ExamDraft } from '@/store';
import { HIT_SLOP, palette, radius, SCREEN_PADDING, space, useTheme } from '@/theme';
import type { ExamBlueprint, Question } from '@/types';
import { haptic } from '@/utils/haptics';

const goToExams = () => {
  if (router.canGoBack()) router.back();
  else router.replace('/exams');
};

export default function ExamRoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useI18n('exams');
  const exam = getExam(id);
  const questions = useMemo(() => (exam ? examQuestions(exam) : []), [exam]);

  // Resume an existing draft (remaining time continues from its absolute endsAt) or create a new one.
  const [draft] = useState<ExamDraft | null>(() => {
    if (!exam) return null;
    const st = useProgressStore.getState();
    const existing = st.examDrafts[exam.id];
    if (existing) return existing;
    if (attemptsRemaining(exam, st.examAttemptsUsed[exam.id]) <= 0) return null;
    const now = Date.now();
    return { examId: exam.id, answers: {}, flagged: [], startedAt: now, endsAt: now + exam.durationMin * 60_000, currentIndex: 0 };
  });

  if (!exam || !questions.length) {
    return (
      <Screen edges={['top', 'bottom']}>
        <Header title={t('title')} />
        <View style={styles.center}>
          <EmptyState icon="exam" title={t('notFound.title')} message={t('notFound.message')} actionLabel={t('notFound.action')} onAction={goToExams} />
        </View>
      </Screen>
    );
  }
  if (!draft) {
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
  return <ExamRoom exam={exam} questions={questions} initial={draft} />;
}

interface ExamRoomProps {
  exam: ExamBlueprint;
  questions: Question[];
  initial: ExamDraft;
}

function ExamRoom({ exam, questions, initial }: ExamRoomProps) {
  const { colors, isDark } = useTheme();
  const { t, L, isAr } = useI18n('exams');
  const saveExamDraft = useProgressStore((s) => s.saveExamDraft);
  const clearExamDraft = useProgressStore((s) => s.clearExamDraft);
  const addAttempt = useProgressStore((s) => s.addAttempt);
  const addMistake = useMistakesStore((s) => s.addMistake);

  const total = questions.length;
  const [answers, setAnswers] = useState<Record<string, number>>(initial.answers);
  const [flagged, setFlagged] = useState<string[]>(initial.flagged);
  const [index, setIndex] = useState(() => Math.min(Math.max(0, initial.currentIndex), total - 1));
  const [dir, setDir] = useState<1 | -1>(1);
  const [savedKey, setSavedKey] = useState(0);
  const [gridOpen, setGridOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [timeUpAttemptId, setTimeUpAttemptId] = useState<string | null>(null);

  const submittedRef = useRef(false);
  const answersRef = useRef(answers);
  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  // Autosave every change (answers, flags, position) to the persisted draft.
  useEffect(() => {
    if (submittedRef.current) return;
    saveExamDraft({ ...initial, answers, flagged, currentIndex: index });
  }, [answers, flagged, index, initial, saveExamDraft]);

  const { online } = useMockConnection({
    enabled: !timeUpAttemptId,
    onReconnect: () => toast.show({ message: t('network.back'), tone: 'success', icon: 'check-circle' }),
  });

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
    setFlagged((prev) => (prev.includes(question.id) ? prev.filter((x) => x !== question.id) : [...prev, question.id]));
  };

  const submit = useCallback(
    (reason: 'manual' | 'timeout') => {
      if (submittedRef.current) return;
      submittedRef.current = true;
      const scored = scoreExam(questions, answersRef.current);
      const timeSpentSec = Math.max(1, Math.min(exam.durationMin * 60, Math.round((Date.now() - initial.startedAt) / 1000)));
      const attempt = addAttempt({
        kind: 'exam',
        refId: exam.id,
        subjectId: exam.subjectId,
        answers: scored.answers,
        score: scored.score,
        correct: scored.correct,
        total: scored.total,
        timeSpentSec,
      });
      for (const a of scored.answers) {
        if (a.chosenIndex >= 0 && !a.correct) addMistake(a.questionId, a.chosenIndex, 'exam');
      }
      clearExamDraft(exam.id);
      setGridOpen(false);
      setSubmitOpen(false);
      setExitOpen(false);
      if (reason === 'timeout') {
        haptic.warning();
        setTimeUpAttemptId(attempt.id);
      } else {
        haptic.success();
        router.replace({ pathname: '/exams/result/[id]', params: { id: attempt.id } });
      }
    },
    [questions, exam, initial.startedAt, addAttempt, addMistake, clearExamDraft],
  );

  const onExpire = useCallback(() => submit('timeout'), [submit]);

  const openResult = useCallback(() => {
    if (!timeUpAttemptId) return;
    const attemptId = timeUpAttemptId;
    setTimeUpAttemptId(null);
    router.replace({ pathname: '/exams/result/[id]', params: { id: attemptId } });
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
  const forwardFromEnd = (dir > 0) !== isAr;
  const entering = (forwardFromEnd ? FadeInRight : FadeInLeft).duration(240);

  return (
    <Screen padded={false} edges={['top', 'bottom']} animated={false}>
      <Stack.Screen options={{ gestureEnabled: false, animation: 'fade' }} />

      {/* Top bar */}
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <IconButton icon="close" variant="surface" onPress={() => setExitOpen(true)} accessibilityLabel={t('room.exit')} />
        <View style={styles.titleWrap}>
          <Text variant="label" numberOfLines={1} align="center">
            {L(exam.title)}
          </Text>
          <View style={styles.syncRow}>
            <View style={[styles.syncDot, { backgroundColor: online ? colors.success : colors.warning }]} />
            <Text variant="caption" color="muted" numberOfLines={1}>
              {t('room.sync')}
            </Text>
          </View>
        </View>
        <ExamTimer endsAt={initial.endsAt} onExpire={onExpire} compact />
      </View>

      {!online ? <OfflineBanner /> : null}

      {/* Status row */}
      <View style={styles.statusRow}>
        <View style={styles.counterWrap}>
          <Text variant="h3" tabular accessibilityLabel={t('room.questionOf', { current: index + 1, total })}>
            {t('room.counter', { current: index + 1, total })}
          </Text>
          <SavedIndicator pulseKey={savedKey} />
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

      {/* Bottom controls */}
      <View style={[styles.bottomBar, { borderTopColor: colors.border, backgroundColor: isDark ? colors.surface : colors.background }]}>
        <Button
          title={t('room.prev')}
          icon="back"
          variant="outline"
          size="md"
          disabled={index === 0}
          onPress={() => goTo(index - 1)}
          style={styles.navBtn}
        />
        <IconButton icon="grid" variant="surface" onPress={() => setGridOpen(true)} accessibilityLabel={t('room.grid')} badge={flagged.length || undefined} />
        {isLast ? (
          <Button title={t('room.submit')} icon="check" variant="primary" size="md" onPress={() => setSubmitOpen(true)} style={styles.navBtn} />
        ) : (
          <Button
            title={t('room.next')}
            icon="chevron"
            iconPosition="end"
            variant="secondary"
            size="md"
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
            <Button title={t('submitSheet.confirm')} icon="check" fullWidth onPress={() => submit('manual')} />
            <Button title={t('submitSheet.keep')} variant="ghost" fullWidth onPress={() => setSubmitOpen(false)} />
          </View>
        }
      >
        <View style={styles.timeLeftRow}>
          <Text variant="bodyMedium" color="muted">
            {t('submitSheet.timeLeft')}
          </Text>
          <ExamTimer endsAt={initial.endsAt} onExpire={onExpire} compact />
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
    gap: space.sm,
    paddingHorizontal: SCREEN_PADDING - 4,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  titleWrap: { flex: 1, alignItems: 'center' },
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
    paddingBottom: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  navBtn: { flex: 1 },
  sheetFooter: { gap: space.sm },
  timeLeftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.md,
  },
});
