import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { memo, useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { Icon } from '@/components/icons';
import { ThumbIcon } from '@/components/tutor/ThumbIcon';
import { TutorAvatar } from '@/components/tutor/TutorAvatar';
import { RichText } from '@/components/tutor/RichText';
import { isServerMessage, messageTime, type TutorMessage } from '@/components/tutor/messages';
import { rateTutorMessage } from '@/api/tutor';
import { MathText, Text, toast } from '@/components/ui';
import { BLURHASH } from '@/constants/images';
import { useI18n } from '@/hooks/useI18n';
import { HIT_SLOP, palette, radius, space, useTheme } from '@/theme';
import { haptic } from '@/utils/haptics';

export interface TutorBubbleProps {
  message: TutorMessage;
}

type Feedback = 'up' | 'down' | null;

/** One chat message. Student → navy bubble on the end side; tutor → surface bubble on the start side. */
export const TutorBubble = memo(function TutorBubble({ message }: TutorBubbleProps) {
  const { colors, isDark } = useTheme();
  const { t, lang } = useI18n('tutor');
  const time = messageTime(message.date, lang);
  const [feedback, setFeedback] = useState<Feedback>(message.rating ?? null);
  /** Only LaTeX needs the KaTeX WebView; everything else renders as native text. */
  const hasMath = message.text.includes('$');

  const onCopy = useCallback(async () => {
    haptic.light();
    await Clipboard.setStringAsync(message.text);
    toast.success(t('bubble.copied'));
  }, [message.text, t]);

  const onFeedback = useCallback(
    (value: Exclude<Feedback, null>) => {
      haptic.selection();
      const prev = feedback;
      const next = feedback === value ? null : value;
      setFeedback(next);
      if (next) toast.show({ message: t('bubble.thanks'), tone: 'success', icon: 'heart' });
      // AIT-10 (optimistic; rolled back on failure).
      if (isServerMessage(message)) void rateTutorMessage(message.id, next).catch(() => setFeedback(prev));
    },
    [feedback, message, t],
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
          <Text variant="body" color={palette.white} selectable>
            {message.text}
          </Text>
          <Text variant="caption" color="rgba(255,255,255,0.62)" align="end" tabular style={styles.time}>
            {time}
          </Text>
        </View>
      </Animated.View>
    );
  }

  const actionColor = colors.muted;
  return (
    <Animated.View entering={FadeInUp.duration(300)} style={[styles.tutorRow, hasMath && styles.tutorRowWide]}>
      <View style={styles.avatarWrap}>
        <TutorAvatar size={AVATAR} />
      </View>
      <View style={[styles.tutorColumn, hasMath && styles.tutorColumnWide]}>
        <View
          style={[
            styles.tutorBubble,
            hasMath && styles.tutorBubbleWide,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
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
          {hasMath ? (
            <MathText text={message.text} color={colors.ink} size={15} />
          ) : (
            <RichText text={message.text} color={colors.ink} accent={colors.accent} />
          )}
        </View>
        <View style={styles.actions}>
          <Text variant="caption" color="muted" style={styles.actionsTime}>
            {time}
          </Text>
          <Pressable
            onPress={onCopy}
            hitSlop={HIT_SLOP}
            style={({ pressed }) => [styles.action, pressed && { backgroundColor: colors.surfaceMuted }]}
            accessibilityRole="button"
            accessibilityLabel={t('bubble.copy')}
          >
            <Icon name="note" size={16} color={actionColor} />
          </Pressable>
          <Pressable
            onPress={() => onFeedback('up')}
            hitSlop={HIT_SLOP}
            style={({ pressed }) => [
              styles.action,
              feedback === 'up' ? { backgroundColor: colors.accentSoft } : pressed && { backgroundColor: colors.surfaceMuted },
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: feedback === 'up' }}
            accessibilityLabel={t('bubble.helpful')}
          >
            <ThumbIcon direction="up" size={16} color={feedback === 'up' ? colors.accent : actionColor} filled={feedback === 'up'} />
          </Pressable>
          <Pressable
            onPress={() => onFeedback('down')}
            hitSlop={HIT_SLOP}
            style={({ pressed }) => [
              styles.action,
              feedback === 'down' ? { backgroundColor: colors.dangerSoft } : pressed && { backgroundColor: colors.surfaceMuted },
            ]}
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

const AVATAR = 28;

const styles = StyleSheet.create({
  // Column child: `flex-end` is the trailing edge under native RTL too (student → end).
  studentRow: { alignSelf: 'flex-end', maxWidth: '80%' },
  studentBubble: {
    paddingHorizontal: space.lg,
    paddingTop: space.md - 2,
    paddingBottom: space.sm,
    borderRadius: radius.lg,
    borderBottomEndRadius: radius.xs,
    gap: 2,
  },
  time: { marginTop: 2 },
  attachment: { width: '100%', minWidth: 180, aspectRatio: 10 / 7, borderRadius: radius.md, marginBottom: space.xs },
  // Tutor → start edge with avatar; the bubble itself stays ≤ ~80% of the row.
  tutorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, maxWidth: '90%', alignSelf: 'flex-start' },
  tutorRowWide: { width: '90%' },
  avatarWrap: { paddingTop: 2 },
  tutorColumn: { flexShrink: 1, gap: space.xs, alignItems: 'flex-start' },
  tutorColumnWide: { flex: 1 },
  tutorBubble: {
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.lg,
    borderTopStartRadius: radius.xs,
    borderWidth: StyleSheet.hairlineWidth,
    gap: space.sm,
  },
  /** WebView content needs a definite width. */
  tutorBubbleWide: { alignSelf: 'stretch' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingStart: space.xs },
  actionsTime: { marginEnd: space.xs },
  action: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
