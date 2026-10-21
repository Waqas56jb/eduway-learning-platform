import { memo, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Icon } from '@/components/icons';
import { PressableScale, ProgressRing, Text } from '@/components/ui';
import { BLURHASH } from '@/constants/images';
import { useI18n } from '@/hooks/useI18n';
import { useProgressStore } from '@/store';
import { radius, space, subjectColors, useTheme } from '@/theme';
import type { Lesson } from '@/types';
import { formatDuration, formatMinutes } from '@/utils/format';

export interface LessonRowProps {
  lesson: Lesson;
  locked?: boolean;
  onPress?: () => void;
  showTeacher?: boolean;
}

const THUMB_W = 92;
const THUMB_H = 60;
const STATUS_SIZE = 34;

/** A single lesson line: thumbnail with duration, title, meta and a live status indicator. */
export const LessonRow = memo(function LessonRow({ lesson, locked = false, onPress, showTeacher = true }: LessonRowProps) {
  const { colors, isDark } = useTheme();
  const { t, L, lang } = useI18n(['subjects', 'common']);
  const lp = useProgressStore((s) => s.lessonProgress[lesson.id]);
  const status = lp?.status ?? 'not-started';
  const progress = lp?.progress ?? 0;
  const accent = subjectColors[lesson.subjectId];

  const handlePress = useCallback(() => {
    if (onPress) return onPress();
    if (locked) router.push('/subscription');
    else router.push({ pathname: '/lesson/[id]', params: { id: lesson.id } });
  }, [onPress, locked, lesson.id]);

  const statusLabel = locked
    ? t('common:status.locked')
    : status === 'completed'
      ? t('common:status.completed')
      : status === 'in-progress'
        ? t('common:status.inProgress')
        : t('common:status.notStarted');

  const title = L(lesson.title);
  const duration = formatMinutes(lesson.duration, lang);

  return (
    <PressableScale
      onPress={handlePress}
      scaleTo={0.98}
      style={styles.row}
      accessibilityRole="button"
      accessibilityLabel={t('subjects:lessons.rowA11y', { title, duration, status: statusLabel })}
    >
      <View style={[styles.thumbWrap, { backgroundColor: colors.surfaceMuted }]}>
        <Image
          source={{ uri: lesson.thumbnail }}
          placeholder={{ blurhash: BLURHASH }}
          transition={300}
          contentFit="cover"
          cachePolicy="memory-disk"
          style={[StyleSheet.absoluteFill, locked && styles.dim]}
        />
        {locked ? <View style={[StyleSheet.absoluteFill, styles.lockShade]} /> : null}
        <View style={styles.durationBadge}>
          <Text variant="caption" color="#FFFFFF" tabular style={styles.durationText}>
            {formatDuration(lesson.duration)}
          </Text>
        </View>
        {status === 'in-progress' && !locked ? (
          <View style={styles.thumbTrack}>
            <View style={[styles.thumbFill, { width: `${progress}%`, backgroundColor: accent }]} />
          </View>
        ) : null}
      </View>

      <View style={styles.body}>
        <Text variant="bodyMedium" numberOfLines={2} color={locked ? 'muted' : 'ink'}>
          {title}
        </Text>
        <View style={styles.meta}>
          <Icon name="clock" size={13} color={colors.muted} />
          <Text variant="caption" color="muted" numberOfLines={1} style={styles.metaText}>
            {duration}
            {showTeacher ? `  ·  ${L(lesson.teacher)}` : ''}
          </Text>
        </View>
      </View>

      <View style={styles.status}>
        {locked ? (
          <View style={[styles.statusCircle, { backgroundColor: colors.surfaceMuted }]}>
            <Icon name="lock" size={16} color={colors.muted} />
          </View>
        ) : status === 'completed' ? (
          <Icon name="check-circle" size={STATUS_SIZE - 4} color={colors.accent} filled />
        ) : status === 'in-progress' ? (
          <ProgressRing
            progress={progress}
            size={STATUS_SIZE}
            strokeWidth={3}
            color={accent}
            trackColor={isDark ? 'rgba(255,255,255,0.12)' : colors.border}
            label=""
            animated={false}
          >
            <Icon name="play" size={12} color={accent} filled />
          </ProgressRing>
        ) : (
          <View style={[styles.statusCircle, { borderWidth: 1.5, borderColor: colors.border }]}>
            <Icon name="play" size={13} color={colors.muted} filled />
          </View>
        )}
      </View>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.sm,
    gap: space.md,
    minHeight: 72,
  },
  thumbWrap: {
    width: THUMB_W,
    height: THUMB_H,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  dim: { opacity: 0.55 },
  lockShade: { backgroundColor: 'rgba(7,20,38,0.35)' },
  durationBadge: {
    position: 'absolute',
    bottom: 4,
    end: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.xs,
    backgroundColor: 'rgba(7,20,38,0.78)',
  },
  durationText: { fontSize: 10, lineHeight: 14, writingDirection: 'ltr' },
  thumbTrack: {
    position: 'absolute',
    start: 0,
    end: 0,
    bottom: 0,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.35)',
    flexDirection: 'row',
  },
  thumbFill: { height: 3 },
  body: { flex: 1, gap: space.xs },
  meta: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  metaText: { flexShrink: 1 },
  status: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  statusCircle: {
    width: STATUS_SIZE,
    height: STATUS_SIZE,
    borderRadius: STATUS_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
