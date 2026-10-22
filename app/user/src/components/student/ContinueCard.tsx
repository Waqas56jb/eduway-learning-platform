import { memo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Icon } from '@/components/icons';
import { Badge, PressableScale, ProgressBar, Text } from '@/components/ui';
import { BLURHASH } from '@/constants/images';
import type { LessonSummary, SubjectRef } from '@/api/types';
import { useI18n } from '@/hooks/useI18n';
import { gradients, palette, radius, SCREEN_PADDING, shadows, space, subjectColors, useTheme } from '@/theme';
import { formatDuration, formatMinutes } from '@/utils/format';

export interface ContinueCardProps {
  /** `continueLesson` from GET /progress/dashboard. */
  lesson: LessonSummary & { subject: SubjectRef };
}

const PLAY_SIZE = 52;
const INSET = space.lg;

/** Upgrade Unsplash thumbnails to an HD width for the hero image. */
function hd(uri: string): string {
  return uri.includes('images.unsplash.com') ? uri.replace(/([?&])w=\d+/, '$1w=1200') : uri;
}

/**
 * "Continue learning" hero — the visual anchor of Home: a large HD lesson image with a legibility scrim,
 * subject + duration chips, title, gold play button and a resume/progress strip.
 */
export const ContinueCard = memo(function ContinueCard({ lesson }: ContinueCardProps) {
  const { colors, isDark } = useTheme();
  const { t, L, lang } = useI18n('home');
  const { width } = useWindowDimensions();
  const subject = lesson?.subject;
  const progress = lesson?.progress ?? 0;
  const positionSec = lesson?.positionSec ?? 0;

  if (!lesson) return null;

  const contentWidth = width - SCREEN_PADDING * 2;
  const imageHeight = Math.round(Math.min(260, Math.max(196, contentWidth * 0.66)));
  const color = subjectColors[lesson.subjectSlug as keyof typeof subjectColors] ?? subject?.color ?? palette.gold;
  const title = L(lesson.title);
  const resumeLabel =
    positionSec > 0 ? t('continue.resumeAt', { time: formatDuration(positionSec) }) : t('continue.startLesson');
  const open = () => router.push({ pathname: '/lesson/[id]', params: { id: lesson.id } });

  return (
    <PressableScale
      onPress={open}
      scaleTo={0.98}
      accessibilityRole="button"
      accessibilityLabel={t('continue.a11y', { title, value: progress })}
      style={[styles.shadow, isDark ? shadows.sm : shadows.lg]}
    >
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={{ height: imageHeight }}>
          <Image
            source={{ uri: hd(lesson.thumbnail) }}
            placeholder={{ blurhash: BLURHASH }}
            transition={300}
            contentFit="cover"
            cachePolicy="memory-disk"
            style={StyleSheet.absoluteFill}
            accessibilityIgnoresInvertColors
          />
          <LinearGradient
            colors={gradients.imageOverlay}
            locations={[0.15, 0.55, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />

          <View style={styles.topRow} pointerEvents="none">
            <Badge label={L(subject?.name)} tone="subject" color={color} size="sm" />
            <View style={styles.durationPill}>
              <Icon name="clock" size={12} color={palette.white} />
              <Text variant="caption" color={palette.white} tabular numberOfLines={1}>
                {formatMinutes(lesson.duration, lang)}
              </Text>
            </View>
          </View>

          <View style={styles.bottomRow} pointerEvents="none">
            <View style={styles.flex}>
              <Text variant="overline" color={palette.goldLight} numberOfLines={1}>
                {t('continue.title')}
              </Text>
              <Text variant="h2" color={palette.white} numberOfLines={2} style={styles.title}>
                {title}
              </Text>
              <Text variant="caption" color="rgba(255,255,255,0.78)" numberOfLines={1}>
                {L(lesson.teacher)}
              </Text>
            </View>
            <LinearGradient colors={gradients.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.play}>
              <Icon name="play" size={22} color={palette.navy} filled mirrorInRTL={false} />
            </LinearGradient>
          </View>
        </View>

        <View style={styles.body}>
          <View style={styles.resumeRow}>
            <Icon name="history" size={16} color={colors.accent} mirrorInRTL={false} />
            <Text variant="label" color={isDark ? colors.accentLight : '#8A6A22'} numberOfLines={1} style={styles.flex}>
              {resumeLabel}
            </Text>
            <Text variant="label" color="muted" tabular numberOfLines={1}>
              {t('continue.percentDone', { value: progress })}
            </Text>
          </View>
          <ProgressBar progress={progress} height={6} gradient />
        </View>
      </View>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  shadow: { borderRadius: radius.lg },
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  topRow: {
    position: 'absolute',
    top: INSET,
    start: INSET,
    end: INSET,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  durationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    height: 24,
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(7,20,38,0.55)',
  },
  bottomRow: {
    position: 'absolute',
    bottom: INSET,
    start: INSET,
    end: INSET,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.md,
  },
  title: { marginTop: space.xs, marginBottom: 2 },
  play: {
    width: PLAY_SIZE,
    height: PLAY_SIZE,
    borderRadius: PLAY_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.7)',
  },
  body: {
    paddingHorizontal: INSET,
    paddingTop: space.md + 2,
    paddingBottom: INSET,
    gap: space.sm + 2,
  },
  resumeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  flex: { flex: 1 },
});
