import { memo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Icon, SubjectIcon } from '@/components/icons';
import { Badge, PressableScale, ProgressBar, Text } from '@/components/ui';
import { BLURHASH } from '@/constants/images';
import { getLesson, getSubject } from '@/data';
import { useI18n } from '@/hooks/useI18n';
import { useProgressStore } from '@/store';
import { gradients, palette, radius, shadows, space, subjectColors, useTheme } from '@/theme';
import { formatDuration, formatMinutes } from '@/utils/format';

export interface ContinueCardProps {
  lessonId: string;
}

const THUMB_HEIGHT = 168;
const PLAY_SIZE = 56;

/** "Continue learning" hero card: thumbnail + play overlay, subject badge, title, progress and resume time. */
export const ContinueCard = memo(function ContinueCard({ lessonId }: ContinueCardProps) {
  const { colors, isDark } = useTheme();
  const { t, L, lang } = useI18n('home');
  const lesson = getLesson(lessonId);
  const subject = getSubject(lesson?.subjectId);
  const progress = useProgressStore((s) => s.lessonProgress[lessonId]?.progress ?? lesson?.progress ?? 0);
  const positionSec = useProgressStore((s) => s.lessonProgress[lessonId]?.positionSec ?? 0);

  // Soft pulsing halo around the play button.
  const reduceMotion = useReducedMotion();
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    pulse.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.out(Easing.quad) }), -1, false);
  }, [pulse, reduceMotion]);
  const haloStyle = useAnimatedStyle(() => ({
    opacity: 0.55 * (1 - pulse.value),
    transform: [{ scale: 1 + pulse.value * 0.55 }],
  }));

  if (!lesson) return null;

  const color = subjectColors[lesson.subjectId];
  const title = L(lesson.title);
  const resumeLabel = positionSec > 0 ? t('continue.resumeAt', { time: formatDuration(positionSec) }) : t('continue.startLesson');
  const open = () => router.push({ pathname: '/lesson/[id]', params: { id: lesson.id } });

  return (
    <PressableScale
      onPress={open}
      scaleTo={0.98}
      accessibilityRole="button"
      accessibilityLabel={t('continue.a11y', { title, value: progress })}
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, !isDark && shadows.md]}
    >
      <View style={styles.thumbWrap}>
        <Image
          source={{ uri: lesson.thumbnail }}
          placeholder={{ blurhash: BLURHASH }}
          transition={300}
          contentFit="cover"
          cachePolicy="memory-disk"
          style={StyleSheet.absoluteFill}
          accessibilityIgnoresInvertColors
        />
        <LinearGradient colors={gradients.imageOverlay} style={StyleSheet.absoluteFill} />

        <View style={styles.badgeRow}>
          <Badge label={L(subject?.name)} tone="subject" color={color} size="sm" />
          <View style={styles.durationPill}>
            <Icon name="clock" size={12} color={palette.white} />
            <Text variant="caption" color={palette.white} tabular style={styles.durationText}>
              {formatMinutes(lesson.duration, lang)}
            </Text>
          </View>
        </View>

        <View style={styles.playCenter} pointerEvents="none">
          <Animated.View style={[styles.halo, haloStyle]} />
          <LinearGradient colors={gradients.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.play}>
            <Icon name="play" size={24} color={palette.navy} filled mirrorInRTL={false} />
          </LinearGradient>
        </View>

        <View style={styles.thumbFooter}>
          <View style={[styles.subjectDot, { backgroundColor: color }]}>
            <SubjectIcon subjectId={lesson.subjectId} size={14} color={palette.white} />
          </View>
          <Text variant="caption" color="rgba(255,255,255,0.88)" numberOfLines={1} style={styles.flex}>
            {L(lesson.teacher)}
          </Text>
        </View>
      </View>

      <View style={styles.body}>
        <Text variant="h3" numberOfLines={2}>
          {title}
        </Text>
        <View style={styles.progressRow}>
          <View style={styles.flex}>
            <ProgressBar progress={progress} height={6} color={color} />
          </View>
          <Text variant="label" color="muted" tabular>
            {`${progress}%`}
          </Text>
        </View>
        <View style={styles.resumeRow}>
          <View style={[styles.resumeIcon, { backgroundColor: colors.accentSoft }]}>
            <Icon name="play" size={12} color={colors.accent} filled mirrorInRTL={false} />
          </View>
          <Text variant="label" color="accent" style={styles.flex} numberOfLines={1}>
            {resumeLabel}
          </Text>
          <Icon name="chevron" size={18} color={colors.muted} />
        </View>
      </View>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  thumbWrap: {
    height: THUMB_HEIGHT,
    justifyContent: 'space-between',
    padding: space.md,
    overflow: 'hidden',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  durationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(7,20,38,0.55)',
  },
  durationText: { lineHeight: 16 },
  playCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    width: PLAY_SIZE,
    height: PLAY_SIZE,
    borderRadius: PLAY_SIZE / 2,
    backgroundColor: palette.gold,
  },
  play: {
    width: PLAY_SIZE,
    height: PLAY_SIZE,
    borderRadius: PLAY_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.65)',
  },
  thumbFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  subjectDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    padding: space.lg,
    gap: space.md,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  resumeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  resumeIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1 },
});
