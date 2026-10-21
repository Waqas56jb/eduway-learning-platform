import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { Icon, SubjectIcon } from '@/components/icons';
import { BottomSheet, Button, EmptyState, Text, toast } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { useTutorStore, type Conversation } from '@/store';
import { HIT_SLOP, radius, space, subjectColors, useTheme } from '@/theme';
import { haptic } from '@/utils/haptics';
import { timeAgo } from '@/utils/format';
import { conversationTitle } from './seed';

interface HistorySheetProps {
  visible: boolean;
  onClose: () => void;
  activeId: string | null;
  onNewChat: () => void;
  onOpen: (id: string) => void;
}

const Row = memo(function Row({
  conversation,
  active,
  index,
  onOpen,
  onDelete,
}: {
  conversation: Conversation;
  active: boolean;
  index: number;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const { colors } = useTheme();
  const { t, lang } = useI18n('tutor');
  const color = subjectColors[conversation.subjectId];
  const title = conversationTitle(conversation, t);
  const subject = t(`common:subjects.${conversation.subjectId}`);
  return (
    <Animated.View entering={FadeInDown.duration(220).delay(Math.min(index, 8) * 35)} layout={LinearTransition}>
      <Pressable
        onPress={() => onOpen(conversation.id)}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        accessibilityLabel={`${title}, ${subject}`}
        style={({ pressed }) => [
          styles.row,
          {
            backgroundColor: active ? colors.accentSoft : pressed ? colors.surfaceMuted : 'transparent',
            borderColor: active ? colors.accent : colors.border,
          },
        ]}
      >
        <View style={[styles.subjectIcon, { backgroundColor: `${color}1F` }]}>
          <SubjectIcon subjectId={conversation.subjectId} size={18} color={color} />
        </View>
        <View style={styles.body}>
          <Text variant="bodyMedium" numberOfLines={1}>
            {title}
          </Text>
          <View style={styles.meta}>
            <View style={[styles.dot, { backgroundColor: color }]} />
            <Text variant="caption" color="muted" numberOfLines={1}>
              {`${subject} · ${timeAgo(conversation.updatedAt, lang)}`}
            </Text>
            {active ? (
              <Text variant="caption" color="accent">
                {` · ${t('history.active')}`}
              </Text>
            ) : null}
          </View>
        </View>
        <Pressable
          onPress={() => onDelete(conversation.id)}
          hitSlop={HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel={t('history.delete')}
          style={({ pressed }) => [styles.delete, pressed && { backgroundColor: colors.dangerSoft }]}
        >
          <Icon name="trash" size={18} color={colors.muted} />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
});

/** Conversation history: list of past chats (subject color, title, time) + "New chat". */
export const HistorySheet = memo(function HistorySheet({ visible, onClose, activeId, onNewChat, onOpen }: HistorySheetProps) {
  const { t } = useI18n('tutor');
  const conversations = useTutorStore((s) => s.conversations);
  const deleteConversation = useTutorStore((s) => s.deleteConversation);

  const sorted = useMemo(
    () =>
      conversations
        .filter((c) => c.messages.length > 0 || c.id === activeId)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [conversations, activeId],
  );

  const onDelete = (id: string) => {
    haptic.warning();
    deleteConversation(id);
    toast.show({ message: t('history.deleted'), icon: 'trash' });
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={t('history.title')}
      snap="half"
      footer={<Button title={t('history.newChat')} icon="plus" variant="primary" fullWidth onPress={onNewChat} />}
    >
      {sorted.length === 0 ? (
        <EmptyState icon="history" title={t('history.empty')} message={t('history.emptyMessage')} />
      ) : (
        <View style={styles.list}>
          {sorted.map((c, i) => (
            <Row key={c.id} conversation={c} active={c.id === activeId} index={i} onOpen={onOpen} onDelete={onDelete} />
          ))}
        </View>
      )}
    </BottomSheet>
  );
});

const styles = StyleSheet.create({
  list: { gap: space.sm, paddingBottom: space.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 64,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  subjectIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 2 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  delete: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
