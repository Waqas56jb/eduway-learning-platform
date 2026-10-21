import { useNavigation } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  type ListRenderItem,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TutorBubble, TypingIndicator } from '@/components/student';
import { AllowancePill } from '@/components/tutor/AllowancePill';
import { Composer } from '@/components/tutor/Composer';
import { HistorySheet } from '@/components/tutor/HistorySheet';
import { LimitReached } from '@/components/tutor/LimitReached';
import { SuggestedPrompts } from '@/components/tutor/SuggestedPrompts';
import { TutorAvatar } from '@/components/tutor/TutorAvatar';
import { Chip, IconButton, Text } from '@/components/ui';
import { subjects } from '@/data';
import { useI18n } from '@/hooks/useI18n';
import { useAuthStore, useTutorStore, type TutorMessage } from '@/store';
import type { SubjectId } from '@/types';
import { SCREEN_PADDING, space, subjectColors, TAB_BAR_SPACE, useTheme } from '@/theme';
import { haptic } from '@/utils/haptics';

/** Extra room so the composer floats just above the floating tab bar. */
const COMPOSER_TAB_OFFSET = TAB_BAR_SPACE - 18;

const keyExtractor = (m: TutorMessage) => m.id;
const renderItem: ListRenderItem<TutorMessage> = ({ item }) => <TutorBubble message={item} />;
const Separator = () => <View style={{ height: space.lg }} />;

export default function TutorScreen() {
  const { colors } = useTheme();
  const { t, lang } = useI18n('tutor');
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<{ setOptions: (o: Record<string, unknown>) => void }>();

  const conversations = useTutorStore((s) => s.conversations);
  const activeId = useTutorStore((s) => s.activeId);
  const typing = useTutorStore((s) => s.typing);
  const send = useTutorStore((s) => s.send);
  const setActive = useTutorStore((s) => s.setActive);
  const setSubject = useTutorStore((s) => s.setSubject);
  const newConversation = useTutorStore((s) => s.newConversation);

  const aiUsed = useAuthStore((s) => s.user?.aiUsed ?? 0);
  const aiQuota = useAuthStore((s) => s.user?.aiQuota ?? 100);
  const renewsAt = useAuthStore((s) => s.user?.subscriptionEnd);
  const remaining = Math.max(0, aiQuota - aiUsed);

  const active = useMemo(() => conversations.find((c) => c.id === activeId) ?? null, [conversations, activeId]);
  const [draftSubject, setDraftSubject] = useState<SubjectId>(active?.subjectId ?? 'math');
  const subjectId = active?.subjectId ?? draftSubject;
  const messages = active?.messages ?? [];

  const [historyOpen, setHistoryOpen] = useState(false);
  const [limitHit, setLimitHit] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const listRef = useRef<FlatList<TutorMessage>>(null);

  const limited = remaining <= 0 || limitHit;

  // Hide the floating tab bar while typing (honored by the tab navigator / custom TabBar).
  useEffect(() => {
    const opts = { tabBarHideOnKeyboard: true };
    navigation.setOptions(opts);
  }, [navigation]);

  // Resume: drop a dangling activeId (e.g. a deleted conversation).
  useEffect(() => {
    if (activeId && !active) setActive(null);
  }, [active, activeId, setActive]);

  useEffect(() => {
    if (remaining > 0) setLimitHit(false);
  }, [remaining]);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const a = Keyboard.addListener(showEvt, () => {
      setKeyboardOpen(true);
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    });
    const b = Keyboard.addListener(hideEvt, () => setKeyboardOpen(false));
    return () => {
      a.remove();
      b.remove();
    };
  }, []);

  const scrollToEnd = useCallback(() => {
    listRef.current?.scrollToEnd({ animated: true });
  }, []);

  const onSend = useCallback(
    async (text: string, imageUri?: string) => {
      if (limited) {
        haptic.warning();
        return;
      }
      if (!active) newConversation(subjectId);
      const result = await send(text, lang, imageUri);
      if (result === 'limit') {
        haptic.warning();
        setLimitHit(true);
      } else {
        haptic.light();
      }
    },
    [active, lang, limited, newConversation, send, subjectId],
  );

  const onPickSubject = (id: SubjectId) => {
    if (id === subjectId) return;
    haptic.selection();
    setDraftSubject(id);
    if (active) {
      // A chat that already has messages keeps its topic: start a fresh chat for the new subject.
      if (active.messages.length > 0) setActive(null);
      else setSubject(id);
    }
  };

  const onNewChat = () => {
    haptic.light();
    setHistoryOpen(false);
    setActive(null);
  };

  const onOpenConversation = (id: string) => {
    haptic.selection();
    setActive(id);
    const conv = conversations.find((c) => c.id === id);
    if (conv) setDraftSubject(conv.subjectId);
    setHistoryOpen(false);
  };

  const subjectName = t(`common:subjects.${subjectId}`);
  const bottomSpace = keyboardOpen ? space.sm : COMPOSER_TAB_OFFSET;
  const isEmpty = messages.length === 0;

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TutorAvatar size={44} online />
        <View style={styles.headerText}>
          <Text variant="h3" numberOfLines={1} display>
            {t('header.title')}
          </Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: colors.success }]} />
            <Text variant="caption" color="muted" numberOfLines={1}>
              {t('header.status')}
            </Text>
          </View>
        </View>
        <AllowancePill remaining={remaining} quota={aiQuota} />
        <IconButton icon="history" variant="surface" size={40} onPress={() => setHistoryOpen(true)} accessibilityLabel={t('header.history')} />
      </View>

      {/* Subject selector */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
        style={styles.chipsScroll}
      >
        {subjects.map((s) => (
          <Chip
            key={s.id}
            label={t(`common:subjects.${s.id}`)}
            color={subjectColors[s.id]}
            selected={s.id === subjectId}
            onPress={() => onPickSubject(s.id)}
          />
        ))}
      </ScrollView>
      <View style={[styles.hairline, { backgroundColor: colors.border }]} />

      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        {isEmpty ? (
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.emptyContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
          >
            {limited ? (
              <View style={styles.limitTop}>
                <LimitReached quota={aiQuota} renewsAt={renewsAt} />
              </View>
            ) : (
              <SuggestedPrompts subjectId={subjectId} onSelect={(p) => void onSend(p)} disabled={typing} />
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

        <View style={[styles.composer, { paddingBottom: bottomSpace }]}>
          <Composer
            onSend={(text, uri) => void onSend(text, uri)}
            disabled={limited}
            busy={typing}
            accentColor={subjectColors[subjectId]}
            placeholder={limited ? t('composer.placeholderLimit') : t('composer.placeholder', { subject: subjectName })}
          />
        </View>
      </KeyboardAvoidingView>

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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: space.sm,
    paddingBottom: space.md,
  },
  headerText: { flex: 1, gap: 2 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  chipsScroll: { flexGrow: 0 },
  chips: { gap: space.sm, paddingHorizontal: SCREEN_PADDING, paddingBottom: space.md },
  hairline: { height: StyleSheet.hairlineWidth },
  emptyContent: { paddingHorizontal: SCREEN_PADDING, paddingBottom: space.xxl },
  limitTop: { paddingTop: space.xxl },
  listContent: { paddingHorizontal: SCREEN_PADDING, paddingTop: space.lg, paddingBottom: space.lg },
  footer: { gap: space.lg, paddingTop: space.lg },
  composer: { paddingHorizontal: SCREEN_PADDING - 8, paddingTop: space.sm },
});
