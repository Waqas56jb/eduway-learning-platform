import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { memo, useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { Icon } from '@/components/icons';
import { ThumbIcon } from '@/components/tutor/ThumbIcon';
import { TutorAvatar } from '@/components/tutor/TutorAvatar';
import { localizeMessage, messageTime } from '@/components/tutor/seed';
import { MathText, Text, toast } from '@/components/ui';
import { BLURHASH } from '@/constants/images';
import { useI18n } from '@/hooks/useI18n';
import type { TutorMessage } from '@/store';
import { HIT_SLOP, palette, radius, space, useTheme } from '@/theme';
import { haptic } from '@/utils/haptics';

export interface TutorBubbleProps {
  message: TutorMessage;
}

type Feedback = 'up' | 'down' | null;

/** One chat message. Student → navy bubble on the end side; tutor → surface bubble on the start side. */
export const TutorBubble = memo(function TutorBubble({ message: raw }: TutorBubbleProps) {
  const { colors, isDark } = useTheme();
  const { t, lang } = useI18n('tutor');
  const message = useMemo(() => localizeMessage(raw, lang, t), [raw, lang, t]);
  const time = messageTime(message.date, lang);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const onCopy = useCallback(async () => {
    haptic.light();
    await Clipboard.setStringAsync(message.text);
    toast.success(t('bubble.copied'));
  }, [message.text, t]);

  const onFeedback = useCallback(
    (value: Exclude<Feedback, null>) => {
      haptic.selection();
      const next = feedback === value ? null : value;
      setFeedback(next);
      if (next) toast.show({ message: t('bubble.thanks'), tone: 'success', icon: 'heart' });
    },
    [feedback, t],
  );

  if (message.role === 'student') {
    const bg = isDark ? palette.navyLight : palette.navy;
    return (
      <Animated.View entering={FadeInUp.duration(260)} style={styles.studentRow}>
        <View
          style={[styles.studentBubble, { backgroundColor: bg }]}
          accessible
          accessibilityLabel={`${t('bubble.you')}: ${message.text}`}
        >
          {message.imageUri ? (
            <Image
              source={{ uri: message.imageUri }}
              placeholder={{ blurhash: BLURHASH }}
              transition={300}
              contentFit="cover"
              cachePolicy="memory-disk"
              style={styles.attachment}
              accessibilityLabel={t('bubble.attachment')}
            />
          ) : null}
          <Text variant="body" color={palette.white}>
            {message.text}
          </Text>
          <Text variant="caption" color="rgba(255,255,255,0.62)" align="end" style={styles.time}>
            {time}
          </Text>
        </View>
      </Animated.View>
    );
  }

  const actionColor = colors.muted;
  return (
    <Animated.View entering={FadeInUp.duration(300)} style={styles.tutorRow}>
      <View style={styles.avatarWrap}>
        <TutorAvatar size={28} />
      </View>
      <View style={styles.tutorColumn}>
        <View
          style={[styles.tutorBubble, { backgroundColor: colors.surface, borderColor: colors.border }]}
          accessibilityLabel={t('bubble.tutor')}
        >
          {message.imageUri ? (
            <Image
              source={{ uri: message.imageUri }}
              placeholder={{ blurhash: BLURHASH }}
              transition={300}
              contentFit="cover"
              cachePolicy="memory-disk"
              style={styles.attachment}
              accessibilityLabel={t('bubble.attachment')}
            />
          ) : null}
          <MathText text={message.text} color={colors.ink} size={15} />
        </View>
        <View style={styles.actions}>
          <Text variant="caption" color="muted" style={styles.actionsTime}>
            {time}
          </Text>
          <Pressable
            onPress={onCopy}
            hitSlop={HIT_SLOP}
            style={styles.action}
            accessibilityRole="button"
            accessibilityLabel={t('bubble.copy')}
          >
            <Icon name="note" size={16} color={actionColor} />
          </Pressable>
          <Pressable
            onPress={() => onFeedback('up')}
            hitSlop={HIT_SLOP}
            style={[styles.action, feedback === 'up' && { backgroundColor: colors.accentSoft }]}
            accessibilityRole="button"
            accessibilityState={{ selected: feedback === 'up' }}
            accessibilityLabel={t('bubble.helpful')}
          >
            <ThumbIcon direction="up" size={16} color={feedback === 'up' ? colors.accent : actionColor} filled={feedback === 'up'} />
          </Pressable>
          <Pressable
            onPress={() => onFeedback('down')}
            hitSlop={HIT_SLOP}
            style={[styles.action, feedback === 'down' && { backgroundColor: colors.dangerSoft }]}
            accessibilityRole="button"
            accessibilityState={{ selected: feedback === 'down' }}
            accessibilityLabel={t('bubble.notHelpful')}
          >
            <ThumbIcon
              direction="down"
              size={16}
              color={feedback === 'down' ? colors.danger : actionColor}
              filled={feedback === 'down'}
            />
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  studentRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingStart: 48 },
  studentBubble: {
    maxWidth: '100%',
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.sm,
    borderRadius: radius.lg,
    borderBottomEndRadius: radius.xs,
    gap: space.xs,
  },
  time: { marginTop: 2 },
  attachment: { width: 200, height: 140, borderRadius: radius.md, marginBottom: space.xs },
  tutorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  avatarWrap: { paddingTop: 2 },
  tutorColumn: { flex: 1, gap: space.xs },
  tutorBubble: {
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.lg,
    borderTopStartRadius: radius.xs,
    borderWidth: StyleSheet.hairlineWidth,
    gap: space.sm,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: space.xs },
  actionsTime: { marginEnd: space.xs },
  action: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
});
