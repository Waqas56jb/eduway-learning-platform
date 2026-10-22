import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, AppState, ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/icons';
import { Header, Screen } from '@/components/layout';
import { goBackOrHome } from '@/components/layout/Header';
import {
  DeviceGuardBanner,
  LessonNavigation,
  LessonNotes,
  QuizPromptSheet,
  ResourceList,
  TeacherCard,
} from '@/components/lesson';
import { VideoPlayer } from '@/components/student';
import { Badge, Button, Card, Confetti, EmptyState, IconButton, SectionHeader, SkeletonCard, Text, toast } from '@/components/ui';
import { BLURHASH } from '@/constants/images';
import { completeLesson, putWatch } from '@/api/progress';
import { useAppConfig } from '@/api/public';
import { useLesson, useQuizRule, useStreamUrl, useSubject } from '@/api/catalog';
import { toLesson } from '@/api/adapters';
import { isLockedError } from '@/api/errors';
import { handleActionError, openSubscription } from '@/api/locked';
import { qk } from '@/api/keys';
import { queryClient } from '@/api/queryClient';
import type { LessonDetail, LessonProgressDto, WatchEvent } from '@/api/types';
import { useI18n } from '@/hooks/useI18n';
import { palette, radius, SCREEN_PADDING, space, subjectColors, useTheme } from '@/theme';
import type { Lesson } from '@/types';
import { formatNumber } from '@/utils/format';
import { haptic } from '@/utils/haptics';

const DEFAULT_HEARTBEAT_SEC = 10;
const enter = (i: number) => FadeInDown.duration(350).delay(Math.min(i * 60, 300));

export default function LessonRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const lessonId = typeof id === 'string' ? id : undefined;
  const query = useLesson(lessonId);
  const { t } = useI18n('lesson');

  if (query.isLoading) {
    return (
      <Screen>
        <Header />
        <View style={styles.loading}>
          <SkeletonCard media lines={2} />
          <SkeletonCard lines={3} />
        </View>
      </Screen>
    );
  }

  if (!query.data) {
    if (query.isError && isLockedError(query.error)) {
      return (
        <Screen>
          <Header />
          <View style={styles.emptyWrap}>
            <EmptyState
              icon="lock"
              title={t('common:premium.locked')}
              message={query.error.message || t('common:errors.locked')}
              actionLabel={t('common:premium.viewPlans')}
              onAction={() => openSubscription(query.error.locked)}
            />
          </View>
        </Screen>
      );
    }
    // Anything but a definitive 404 (offline, timeout, 5xx) is retryable.
    const offline = query.isError && query.error?.status !== 404;
    return (
      <Screen>
        <Header />
        <View style={styles.emptyWrap}>
          <EmptyState
            icon={offline ? 'wifi-off' : 'lesson'}
            title={offline ? t('common:states.error') : t('notFound.title')}
            message={offline ? query.error?.message : t('notFound.message')}
            actionLabel={offline ? t('common:actions.retry') : t('notFound.action')}
            onAction={() => (offline ? void query.refetch() : router.replace('/(tabs)/subjects'))}
          />
        </View>
      </Screen>
    );
  }

  // Key by id so prev/next navigation fully resets player + local state.
  return <LessonScreen key={query.data.id} detail={query.data} />;
}

/** Invalidate everything that shows lesson progress after a completion. */
function invalidateProgress(lessonId: string, subjectSlug: string) {
  void queryClient.invalidateQueries({ queryKey: qk.catalog.lesson(lessonId) });
  void queryClient.invalidateQueries({ queryKey: qk.catalog.subject(subjectSlug) });
  void queryClient.invalidateQueries({ queryKey: qk.catalog.subjects });
  void queryClient.invalidateQueries({ queryKey: qk.progress.all });
}

function LessonScreen({ detail }: { detail: LessonDetail }) {
  const { t, L, lang } = useI18n('lesson');
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const id = detail.id;
  const lesson: Lesson = useMemo(() => toLesson(detail), [detail]);
  const subjectSlug = detail.subjectSlug;
  const subjectColor = subjectColors[lesson.subjectId] ?? colors.accent;

  const config = useAppConfig().data;
  const stream = useStreamUrl(id, !detail.locked);
  const quizRule = useQuizRule(id, !detail.locked);
  const subjectQuery = useSubject(subjectSlug);

  const [completed, setCompleted] = useState(detail.status === 'completed');
  const [guardVisible, setGuardVisible] = useState(true);
  const [endSheet, setEndSheet] = useState(false);
  const [confetti, setConfetti] = useState(false);

  const { prev, next } = useMemo(() => {
    const list = subjectQuery.data?.lessons ?? [];
    const find = (lid: string | null) => {
      const l = lid ? list.find((x) => x.id === lid) : undefined;
      return l ? toLesson(l) : undefined;
    };
    return { prev: find(detail.prevLessonId), next: find(detail.nextLessonId) };
  }, [subjectQuery.data, detail.prevLessonId, detail.nextLessonId]);

  // ── Watch-progress sync (PRG-01): heartbeat while playing + pause/seek/end/leave/background ──
  const heartbeatSec = stream.data?.heartbeatSeconds ?? config?.learning.watchHeartbeatSeconds ?? DEFAULT_HEARTBEAT_SEC;
  const posRef = useRef<{ sec: number; dur: number }>({ sec: 0, dur: detail.duration });
  const playingRef = useRef(false);
  /** Nothing is reported until playback actually started (opening a lesson is not watching it). */
  const startedRef = useRef(false);
  const watchedRef = useRef(0);
  const lastTickRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const completedRef = useRef(completed);
  completedRef.current = completed;

  const onSynced = useCallback(
    (res: LessonProgressDto) => {
      if (res.status === 'completed' && !completedRef.current) {
        completedRef.current = true;
        if (mountedRef.current) setCompleted(true);
        invalidateProgress(id, subjectSlug);
      }
    },
    [id, subjectSlug],
  );

  const sync = useCallback(
    (event: WatchEvent) => {
      const { sec, dur } = posRef.current;
      if (dur <= 0 || detail.locked || !startedRef.current) return;
      const delta = Math.min(Math.round(watchedRef.current), heartbeatSec * 2);
      watchedRef.current = 0;
      putWatch({
        lessonId: id,
        positionSec: Math.max(0, Math.floor(sec)),
        durationSec: Math.floor(dur),
        event,
        watchedSecDelta: delta > 0 ? delta : undefined,
      })
        .then(onSynced)
        .catch(() => undefined); // heartbeats are fire-and-forget
    },
    [detail.locked, heartbeatSec, id, onSynced],
  );
  const syncRef = useRef(sync);
  syncRef.current = sync;

  useEffect(() => {
    const iv = setInterval(() => {
      if (playingRef.current) syncRef.current('heartbeat');
    }, heartbeatSec * 1000);
    return () => clearInterval(iv);
  }, [heartbeatSec]);

  // Background / leave are background-safe: refs only, no state updates.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') syncRef.current('leave');
    });
    return () => {
      sub.remove();
      mountedRef.current = false;
      syncRef.current('leave');
    };
  }, []);

  const onProgress = useCallback((sec: number, dur: number) => {
    const now = Date.now();
    if (playingRef.current && lastTickRef.current !== null) {
      const dt = (now - lastTickRef.current) / 1000;
      if (dt > 0 && dt <= 3) watchedRef.current += dt;
    }
    lastTickRef.current = now;
    posRef.current = { sec, dur: dur > 0 ? dur : posRef.current.dur };
  }, []);

  const onPlayingChange = useCallback((playing: boolean, sec: number, dur: number) => {
    const was = playingRef.current;
    playingRef.current = playing;
    if (playing) startedRef.current = true;
    lastTickRef.current = playing ? Date.now() : null;
    if (sec > 0) posRef.current = { sec, dur: dur > 0 ? dur : posRef.current.dur };
    if (was && !playing) syncRef.current('pause');
  }, []);

  const onSeek = useCallback((sec: number, dur: number) => {
    posRef.current = { sec, dur: dur > 0 ? dur : posRef.current.dur };
    lastTickRef.current = playingRef.current ? Date.now() : null;
    syncRef.current('seek');
  }, []);

  const complete = useCallback(
    async (withToast: boolean) => {
      if (completedRef.current) {
        if (withToast) toast.info(t('toast.alreadyCompleted'));
        return;
      }
      completedRef.current = true;
      setCompleted(true);
      haptic.success();
      if (withToast) toast.success(t('toast.completed'));
      try {
        await completeLesson(id);
        invalidateProgress(id, subjectSlug);
      } catch (err) {
        completedRef.current = false;
        if (mountedRef.current) setCompleted(false);
        handleActionError(err);
      }
    },
    [id, subjectSlug, t],
  );

  const onEnd = useCallback(() => {
    const dur = posRef.current.dur || detail.duration;
    posRef.current = { sec: dur, dur };
    playingRef.current = false;
    syncRef.current('ended');
    if (!completedRef.current) {
      completedRef.current = true;
      setCompleted(true);
      haptic.success();
      invalidateProgress(id, subjectSlug);
    }
    setConfetti(true);
    setEndSheet(true);
  }, [detail.duration, id, subjectSlug]);

  const goQuiz = useCallback(() => {
    setEndSheet(false);
    if (detail.locked) {
      if (detail.lockReason === 'SEQUENTIAL' || detail.lockReason === 'PREREQUISITE') return toast.info(t('player.orderLocked'));
      return openSubscription({ reason: 'NO_SUBSCRIPTION', subjectSlug });
    }
    router.push({ pathname: '/quiz/[lessonId]', params: { lessonId: id } });
  }, [detail.locked, detail.lockReason, id, subjectSlug, t]);

  const goLesson = useCallback((lessonId: string) => {
    haptic.selection();
    router.replace({ pathname: '/lesson/[id]', params: { id: lessonId } });
  }, []);

  const minutes = Math.max(1, Math.round(detail.duration / 60));
  const initialPosition = stream.data?.resumePositionSec ?? detail.positionSec;
  // Sequential/prerequisite locks are about lesson order, not the package: never send those to the paywall.
  const orderLocked = !!detail.locked && (detail.lockReason === 'SEQUENTIAL' || detail.lockReason === 'PREREQUISITE');
  const streamLocked = (!!detail.locked && !orderLocked) || (stream.isError && isLockedError(stream.error));
  const quizCount = quizRule.data?.questionCount ?? detail.quiz.questionCount;
  const quizMinutes = quizRule.data?.estimatedMinutes ?? detail.quiz.estimatedMinutes;

  let player: ReactNode;
  if (orderLocked) {
    player = (
      <PlayerPlaceholder
        poster={detail.thumbnail}
        icon="lock"
        title={t('player.orderLocked')}
        actionLabel={detail.prevLessonId ? t('actions.prevLesson') : undefined}
        onAction={detail.prevLessonId ? () => goLesson(detail.prevLessonId as string) : undefined}
      />
    );
  } else if (streamLocked) {
    player = (
      <PlayerPlaceholder
        poster={detail.thumbnail}
        icon="lock"
        title={t('common:premium.locked')}
        actionLabel={t('common:premium.viewPlans')}
        onAction={() => openSubscription(stream.error?.locked ?? { reason: 'NO_SUBSCRIPTION', subjectSlug })}
      />
    );
  } else if (stream.data) {
    player = (
      <VideoPlayer
        uri={stream.data.url}
        poster={stream.data.poster || detail.thumbnail}
        title={L(detail.title)}
        initialPositionSec={initialPosition}
        captionTracks={stream.data.captions}
        renditions={stream.data.renditions}
        onProgress={onProgress}
        onPlayingChange={onPlayingChange}
        onSeek={onSeek}
        onEnd={onEnd}
        onBack={goBackOrHome}
      />
    );
  } else if (stream.isError) {
    player = (
      <PlayerPlaceholder
        poster={detail.thumbnail}
        icon="wifi-off"
        title={stream.error?.message ?? t('player.error')}
        actionLabel={t('player.retry')}
        onAction={() => void stream.refetch()}
      />
    );
  } else {
    player = <PlayerPlaceholder poster={detail.thumbnail} loading />;
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />
      <View style={[styles.playerWrap, { paddingTop: insets.top }]}>{player}</View>

      {guardVisible && !streamLocked && !orderLocked ? <DeviceGuardBanner onDismiss={() => setGuardVisible(false)} /> : null}

      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xxxl }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
      >
        {/* Title block */}
        <Animated.View entering={enter(0)} style={styles.block}>
          <View style={styles.badges}>
            <Badge tone="subject" color={subjectColor} label={t(`common:subjects.${lesson.subjectId}`)} />
            {L(detail.unitTitle) ? <Badge tone="neutral" label={L(detail.unitTitle)} /> : null}
            {completed ? <Badge tone="success" icon="check-circle" label={t('actions.completed')} /> : null}
          </View>
          <Text variant="h2" accessibilityRole="header" style={styles.title}>
            {L(detail.title)}
          </Text>
          <View style={styles.meta}>
            <MetaItem icon="lesson" label={t('meta.lessonNumber', { n: formatNumber(detail.order, lang) })} />
            <View style={[styles.metaDot, { backgroundColor: colors.muted }]} />
            <MetaItem icon="clock" label={t('meta.duration', { count: minutes })} />
            <View style={[styles.metaDot, { backgroundColor: colors.muted }]} />
            <MetaItem icon="user" label={L(detail.teacher)} shrink />
          </View>
        </Animated.View>

        {/* Primary actions */}
        <Animated.View entering={enter(1)} style={styles.actions}>
          {completed ? (
            <View style={[styles.completedBox, { backgroundColor: colors.successSoft, borderColor: isDark ? colors.border : 'transparent' }]}>
              <Icon name="check-circle" size={20} color={colors.success} filled />
              <Text variant="bodyBold" color="success">
                {t('actions.completed')}
              </Text>
            </View>
          ) : (
            <Button
              title={t('actions.markComplete')}
              icon="check-circle"
              onPress={() =>
                orderLocked
                  ? toast.info(t('player.orderLocked'))
                  : streamLocked
                    ? openSubscription({ reason: 'NO_SUBSCRIPTION', subjectSlug })
                    : void complete(true)
              }
              fullWidth
            />
          )}
          {detail.quiz.available ? (
            <Button title={t('actions.takeQuiz')} icon="quiz" variant="secondary" onPress={goQuiz} fullWidth />
          ) : null}
        </Animated.View>

        {/* Description */}
        <Animated.View entering={enter(2)} style={styles.block}>
          <SectionHeader title={t('sections.about')} />
          <Card>
            <Text variant="body" color="muted">
              {L(detail.description)}
            </Text>
          </Card>
        </Animated.View>

        {/* Teacher */}
        <Animated.View entering={enter(3)} style={styles.block}>
          <SectionHeader title={t('sections.teacher')} />
          <TeacherCard
            name={detail.teacher}
            subjectId={lesson.subjectId}
            teacherId={detail.teacherRef?.id}
            avatarUrl={detail.teacherRef?.avatarUrl}
          />
        </Animated.View>

        {/* Resources */}
        <Animated.View entering={enter(4)} style={styles.block}>
          <SectionHeader title={t('sections.resources')} />
          <ResourceList resources={lesson.resources} lessonId={id} />
        </Animated.View>

        {/* Notes */}
        <Animated.View entering={enter(5)} style={styles.block}>
          <SectionHeader title={t('sections.notes')} />
          <LessonNotes lessonId={id} initialText={detail.note} />
        </Animated.View>

        {/* Prev / next */}
        <Animated.View entering={enter(5)} style={styles.block}>
          <SectionHeader title={t('sections.continue')} />
          <LessonNavigation prev={prev} next={next} onNavigate={goLesson} />
        </Animated.View>
      </ScrollView>

      <QuizPromptSheet
        visible={endSheet}
        lessonTitle={L(detail.title)}
        onTakeQuiz={goQuiz}
        onLater={() => setEndSheet(false)}
        questionCount={quizCount || undefined}
        minutes={quizMinutes || undefined}
      />
      <Confetti fire={confetti} onDone={() => setConfetti(false)} />
    </View>
  );
}

/** 16:9 stand-in for the player while the signed URL loads, when it fails, or when the lesson is locked. */
function PlayerPlaceholder({
  poster,
  loading,
  icon,
  title,
  actionLabel,
  onAction,
}: {
  poster: string;
  loading?: boolean;
  icon?: 'lock' | 'wifi-off';
  title?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { t } = useI18n('lesson');
  return (
    <View style={styles.placeholder}>
      {poster ? (
        <Image
          source={{ uri: poster }}
          placeholder={{ blurhash: BLURHASH }}
          transition={300}
          contentFit="cover"
          cachePolicy="memory-disk"
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <View style={[StyleSheet.absoluteFill, styles.placeholderDim]} />
      <View style={styles.placeholderBack}>
        <IconButton icon="back" variant="glass" size={40} onPress={goBackOrHome} accessibilityLabel={t('common:a11y.back')} />
      </View>
      <View style={styles.placeholderCenter}>
        {loading ? (
          <View style={styles.spinnerRing}>
            <ActivityIndicator size="large" color={palette.gold} />
          </View>
        ) : (
          <>
            {icon ? (
              <View style={styles.lockCircle}>
                <Icon name={icon} size={22} color={palette.navy} />
              </View>
            ) : null}
            {title ? (
              <Text variant="label" color="#FFFFFF" align="center" style={styles.placeholderText}>
                {title}
              </Text>
            ) : null}
            {actionLabel && onAction ? (
              <Button title={actionLabel} size="sm" variant="primary" icon={icon === 'lock' ? 'crown' : 'refresh'} onPress={onAction} />
            ) : null}
          </>
        )}
      </View>
    </View>
  );
}

function MetaItem({ icon, label, shrink }: { icon: 'lesson' | 'clock' | 'user'; label: string; shrink?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.metaItem, shrink && styles.shrink]}>
      <Icon name={icon} size={14} color={colors.muted} />
      <Text variant="caption" color="muted" numberOfLines={1} style={shrink ? styles.shrink : undefined}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  loading: { gap: space.lg, paddingTop: space.lg },
  playerWrap: { backgroundColor: palette.black },
  content: { paddingHorizontal: SCREEN_PADDING, paddingTop: space.xl, gap: space.xxxl - space.xs },
  block: { gap: space.md },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  meta: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.xxs },
  title: { marginTop: space.xxs },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaDot: { width: 3, height: 3, borderRadius: 1.5, opacity: 0.6 },
  shrink: { flexShrink: 1 },
  actions: { gap: space.md },
  completedBox: {
    height: 52,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  emptyWrap: { flex: 1, justifyContent: 'center' },
  placeholder: { width: '100%', aspectRatio: 16 / 9, backgroundColor: palette.black, overflow: 'hidden' },
  placeholderDim: { backgroundColor: 'rgba(7,20,38,0.55)' },
  placeholderBack: { position: 'absolute', top: space.sm, start: space.md, zIndex: 2 },
  placeholderCenter: { position: 'absolute', top: 0, bottom: 0, start: 0, end: 0, alignItems: 'center', justifyContent: 'center', gap: space.sm, paddingHorizontal: space.xl },
  placeholderText: { maxWidth: 300 },
  spinnerRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(7,20,38,0.45)',
  },
  lockCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.gold,
  },
});
