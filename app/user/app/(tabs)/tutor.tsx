import { tabBarTopOffset } from '@/components/layout/TabBar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Keyboard, type ListRenderItem, Platform, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { toSubject } from '@/api/adapters';
import { useSubjects } from '@/api/catalog';
import { isLockedError, normalizeError, toastError } from '@/api/errors';
import { qk } from '@/api/keys';
import { openSubscription } from '@/api/locked';
import { uploadFile } from '@/api/storage';
import {
  createConversation,
  sendTutorMessage,
  updateConversation,
  useAiAllowance,
  useConversation,
  useConversations,
} from '@/api/tutor';
import type { AiAllowance, ConversationDto, ConversationSummary } from '@/api/types';
import { TutorBubble, TypingIndicator } from '@/components/student';
import { AllowancePill } from '@/components/tutor/AllowancePill';
import { Composer } from '@/components/tutor/Composer';
import { HistorySheet } from '@/components/tutor/HistorySheet';
import { LimitReached } from '@/components/tutor/LimitReached';
import { fromDto, type TutorMessage } from '@/components/tutor/messages';
import { SuggestedPrompts } from '@/components/tutor/SuggestedPrompts';
import { TutorAvatar } from '@/components/tutor/TutorAvatar';
import { Chip, EmptyState, IconButton, Skeleton, Text } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { useAuthStore } from '@/store';
import type { SubjectId } from '@/types';
import { SCREEN_PADDING, space, subjectColors, useTheme } from '@/theme';
import { haptic } from '@/utils/haptics';

/** Gap between the composer and the top of the floating tab bar. */
const COMPOSER_GAP = space.sm;

const keyExtractor = (m: TutorMessage) => m.id;
const renderItem: ListRenderItem<TutorMessage> = ({ item }) => <TutorBubble message={item} />;
const Separator = () => <View style={styles.separator} />;

let tmpSeq = 0;
const tmpId = () => `tmp-${Date.now()}-${++tmpSeq}`;

export default function TutorScreen() {
  const { colors } = useTheme();
  const { t, lang } = useI18n('tutor');
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const keyboard = useAnimatedKeyboard();
  const qc = useQueryClient();

  const { data: subjectDtos } = useSubjects();
  const subjects = useMemo(() => (subjectDtos ?? []).map(toSubject), [subjectDtos]);
  const { data: conversations } = useConversations();
  const { data: allowance } = useAiAllowance();
  const meAllowance = useAuthStore((s) => s.me?.aiAllowance);
  const allow: AiAllowance | undefined = allowance ?? meAllowance;

  const [activeId, setActive] = useState<string | null>(null);
  const convQuery = useConversation(activeId);
  const activeConv = convQuery.data;
  const activeSummary = useMemo(() => conversations?.find((c) => c.id === activeId) ?? null, [conversations, activeId]);
  /** Optimistic student message + streaming tutor answer while a send is in flight. */
  const [pending, setPending] = useState<TutorMessage[]>([]);
  const [typing, setTyping] = useState(false);

  const aiQuota = allow?.quota ?? 0;
  const remaining = Math.max(0, allow?.remaining ?? 0);
  const renewsAt = allow?.resetsAt;

  const activeSubject = (activeConv?.subjectSlug ?? activeSummary?.subjectSlug) as SubjectId | undefined;
  const [draftSubject, setDraftSubject] = useState<SubjectId>('math');
  const subjectId: SubjectId = activeSubject ?? draftSubject;
  const serverMessages = useMemo(
    () => (activeConv?.messages ?? []).filter((m) => m.kind !== 'welcome').map(fromDto),
    [activeConv],
  );
  const messages = useMemo(() => [...serverMessages, ...pending], [serverMessages, pending]);

  // Default subject = first subject in the catalog once it loads.
  useEffect(() => {
    if (subjects.length && !subjects.some((s) => s.id === draftSubject)) setDraftSubject(subjects[0]!.id);
  }, [subjects, draftSubject]);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [limitHit, setLimitHit] = useState(false);
  const listRef = useRef<FlatList<TutorMessage>>(null);
  const abortRef = useRef<AbortController | null>(null);

  const limited = (!!allow && (!allow.enabled || remaining <= 0)) || limitHit;

  // Abort an in-flight answer when leaving the screen.
  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (remaining > 0) setLimitHit(false);
  }, [remaining]);

  // Keep the latest message in view when the keyboard opens.
  useEffect(() => {
    const evt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const sub = Keyboard.addListener(evt, () => {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);
    });
    return () => sub.remove();
  }, []);

  const scrollToEnd = useCallback(() => {
    listRef.current?.scrollToEnd({ animated: true });
  }, []);

  /** Resting composer offset: clears the floating tab bar exactly. */
  const restBottom = tabBarTopOffset(insets.bottom) + COMPOSER_GAP;

  // Follows the keyboard frame-by-frame (no KeyboardAvoidingView jumps).
  const composerStyle = useAnimatedStyle(() => ({
    paddingBottom: Math.max(restBottom, keyboard.height.value + COMPOSER_GAP),
  }));

  const onSend = useCallback(
    async (text: string, imageUri?: string) => {
      if (limited) {
        haptic.warning();
        return;
      }
      if (typing) return;
      const studentTmp: TutorMessage = { id: tmpId(), role: 'student', text, imageUri, date: new Date().toISOString() };
      const tutorTmp: TutorMessage = { id: tmpId(), role: 'tutor', text: '', date: new Date().toISOString(), streaming: true };
      setPending([studentTmp]);
      setTyping(true);
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        // AIT-04 on first send.
        let convId = activeId;
        if (!convId) {
          const conv = await createConversation(subjectId);
          qc.setQueryData(qk.tutor.conversation(conv.id), conv);
          convId = conv.id;
          setActive(conv.id);
        }
        // STO-01 attachment (best effort — the question is still sent without it).
        let attachmentFileKey: string | undefined;
        if (imageUri) {
          try {
            attachmentFileKey = await uploadFile({
              purpose: 'ai_attachment',
              uri: imageUri,
              fileName: `question-${Date.now()}.jpg`,
              contentType: 'image/jpeg',
            });
          } catch (err) {
            toastError(err);
          }
        }
        let streamed = '';
        const result = await sendTutorMessage(
          convId,
          { text, lang, attachmentFileKey, clientMessageId: studentTmp.id },
          {
            onMeta: ({ studentMessage }) => setPending((prev) => [fromDto(studentMessage), ...prev.slice(1)]),
            onDelta: (chunk) => {
              streamed += chunk;
              setTyping(false);
              setPending((prev) => {
                const student = prev[0] ?? studentTmp;
                return [student, { ...tutorTmp, text: streamed }];
              });
            },
          },
          ctrl.signal,
        );
        const finalId = convId;
        qc.setQueryData<ConversationDto>(qk.tutor.conversation(finalId), (old) =>
          old
            ? {
                ...old,
                messages: [
                  ...old.messages,
                  ...(result.studentMessage ? [result.studentMessage] : []),
                  result.message,
                ],
              }
            : old,
        );
        if (result.allowance) qc.setQueryData(qk.tutor.allowance, result.allowance);
        else void qc.invalidateQueries({ queryKey: qk.tutor.allowance });
        if (!result.studentMessage) void qc.invalidateQueries({ queryKey: qk.tutor.conversation(finalId) });
        void qc.invalidateQueries({ queryKey: ['tutor', 'conversations'] });
        setPending([]);
      } catch (err) {
        if (ctrl.signal.aborted) return;
        const e = normalizeError(err);
        setPending([]);
        if (e.reason === 'AI_ALLOWANCE_EXHAUSTED') {
          haptic.warning();
          setLimitHit(true);
          const a = e.details.allowance as AiAllowance | undefined;
          if (a) qc.setQueryData(qk.tutor.allowance, a);
        } else if (isLockedError(e)) {
          toastError(e);
          openSubscription(e.locked);
        } else {
          toastError(e);
        }
        if (activeId) void qc.invalidateQueries({ queryKey: qk.tutor.conversation(activeId) });
      } finally {
        if (abortRef.current === ctrl) abortRef.current = null;
        setTyping(false);
      }
    },
    [activeId, lang, limited, qc, subjectId, typing],
  );

  const onPickSubject = (id: SubjectId) => {
    if (id === subjectId) return;
    setDraftSubject(id);
    if (activeId) {
      // A chat with messages keeps its topic: start a fresh chat for the new subject.
      if (serverMessages.length > 0 || pending.length > 0) setActive(null);
      else {
        // AIT-06 — allowed while the thread has no student messages.
        void updateConversation(activeId, { subjectId: id })
          .then((summary) => {
            qc.setQueryData<ConversationDto>(qk.tutor.conversation(activeId), (old) => (old ? { ...old, ...summary } : old));
            void qc.invalidateQueries({ queryKey: ['tutor', 'conversations'] });
          })
          .catch(() => setActive(null));
      }
    }
  };

  const onNewChat = () => {
    haptic.light();
    setHistoryOpen(false);
    setActive(null);
    setPending([]);
  };

  const onOpenConversation = (id: string) => {
    haptic.selection();
    setActive(id);
    setPending([]);
    const conv: ConversationSummary | undefined = conversations?.find((c) => c.id === id);
    if (conv) setDraftSubject(conv.subjectSlug as SubjectId);
    setHistoryOpen(false);
  };

  const subjectName = t(`common:subjects.${subjectId}`);
  const isEmpty = messages.length === 0;

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {/* Header — one aligned row: avatar · name/status · allowance · history */}
      <View style={styles.header}>
        <TutorAvatar size={42} online />
        <View style={styles.headerText}>
          <Text variant="h3" numberOfLines={1} display>
            {t('header.title')}
          </Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: colors.success }]} />
            <Text variant="caption" color="muted" numberOfLines={1} style={styles.shrink}>
              {t('header.status')}
            </Text>
          </View>
        </View>
        <AllowancePill remaining={remaining} quota={aiQuota} compact={width < 375} />
        <IconButton
          icon="history"
          variant="surface"
          size={44}
          onPress={() => setHistoryOpen(true)}
          accessibilityLabel={t('header.history')}
        />
      </View>

      {/* Subject selector — native RTL makes the scroll start at the reading edge */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.chips}
        style={styles.chipsScroll}
      >
        {subjects.map((s) => (
          <Chip
            key={s.id}
            label={t(`common:subjects.${s.id}`)}
            color={s.color || subjectColors[s.id]}
            selected={s.id === subjectId}
            onPress={() => onPickSubject(s.id)}
          />
        ))}
      </ScrollView>
      <View style={[styles.hairline, { backgroundColor: colors.border }]} />

      <View style={styles.flex}>
        {isEmpty ? (
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.emptyContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={false}
          >
            {activeId && convQuery.isLoading ? (
              <View style={styles.convSkeleton}>
                <Skeleton width="70%" height={56} radius={18} />
                <Skeleton width="85%" height={96} radius={18} style={styles.convSkeletonEnd} />
                <Skeleton width="60%" height={56} radius={18} />
              </View>
            ) : activeId && convQuery.isError && !activeConv ? (
              <EmptyState
                icon="wifi-off"
                title={t('common:states.error')}
                message={convQuery.error.isNetwork ? t('common:states.offline') : convQuery.error.message}
                actionLabel={t('common:actions.retry')}
                onAction={() => void convQuery.refetch()}
              />
            ) : limited ? (
              <LimitReached quota={aiQuota} renewsAt={renewsAt} />
            ) : (
              <SuggestedPrompts subjectId={subjectId} onSelect={(p) => void onSend(p)} disabled={typing || pending.length > 0} />
            )}
          </ScrollView>
        ) : (
          <FlatList
            ref={listRef}
            style={styles.flex}
            data={messages}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            ItemSeparatorComponent={Separator}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            onContentSizeChange={scrollToEnd}
            removeClippedSubviews={false}
            initialNumToRender={12}
            windowSize={9}
            ListFooterComponent={
              typing || limited ? (
                <View style={styles.footer}>
                  {typing ? <TypingIndicator /> : null}
                  {limited ? <LimitReached quota={aiQuota} renewsAt={renewsAt} /> : null}
                </View>
              ) : null
            }
          />
        )}
      </View>

      <Animated.View style={[styles.composer, composerStyle]}>
        <Composer
          onSend={(text, uri) => void onSend(text, uri)}
          disabled={limited}
          busy={typing || pending.length > 0}
          accentColor={subjectColors[subjectId]}
          placeholder={limited ? t('composer.placeholderLimit') : t('composer.placeholder', { subject: subjectName })}
        />
      </Animated.View>

      <HistorySheet
        visible={historyOpen}
        onClose={() => setHistoryOpen(false)}
        activeId={activeId}
        onNewChat={onNewChat}
        onOpen={onOpenConversation}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  shrink: { flexShrink: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm + 2,
    minHeight: 60,
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: space.xs,
    paddingBottom: space.sm,
  },
  headerText: { flex: 1, minWidth: 0, gap: 2 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  chipsScroll: { flexGrow: 0 },
  chips: { gap: space.sm, paddingHorizontal: SCREEN_PADDING, paddingTop: space.xs, paddingBottom: space.md },
  hairline: { height: StyleSheet.hairlineWidth },
  convSkeleton: { gap: space.md, paddingVertical: space.lg },
  convSkeletonEnd: { alignSelf: 'flex-end' },
  emptyContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: space.lg,
    paddingBottom: space.xxl,
  },
  listContent: { paddingHorizontal: SCREEN_PADDING, paddingTop: space.xl, paddingBottom: space.lg },
  separator: { height: space.lg },
  footer: { gap: space.lg, paddingTop: space.lg },
  composer: { paddingHorizontal: SCREEN_PADDING - space.xs, paddingTop: space.sm },
});
