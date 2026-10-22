import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Icon } from '@/components/icons';
import { IconButton, ProgressBar, Text } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { SCREEN_PADDING, radius, space, useTheme } from '@/theme';
import { formatDuration } from '@/utils/format';

export interface QuizHeaderProps {
  title: string;
  /** 0-based current question */
  current: number;
  total: number;
  /** Number of questions answered (drives the bar). */
  answered: number;
  elapsedSec: number;
  showTimer: boolean;
  onToggleTimer(): void;
  onClose(): void;
}

/** Quiz top bar: close, lesson title, timer toggle, progress bar and "Question n of N". */
export const QuizHeader = memo(function QuizHeader({
  title,
  current,
  total,
  answered,
  elapsedSec,
  showTimer,
  onToggleTimer,
  onClose,
}: QuizHeaderProps) {
  const { colors } = useTheme();
  const { t } = useI18n('quiz');
  const progress = total ? Math.round((answered / total) * 100) : 0;
  const time = formatDuration(elapsedSec);

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <IconButton icon="close" variant="surface" onPress={onClose} accessibilityLabel={t('header.close')} />
        <View style={styles.titleWrap}>
          <Text variant="overline" color="accent" align="center" numberOfLines={1}>
            {t('title')}
          </Text>
          <Text variant="label" align="center" numberOfLines={1}>
            {title}
          </Text>
        </View>
        <IconButton
          icon="timer"
          variant={showTimer ? 'accent' : 'surface'}
          onPress={onToggleTimer}
          accessibilityLabel={showTimer ? t('header.hideTimer') : t('header.showTimer')}
        />
      </View>

      <View style={styles.progressRow}>
        <Text variant="caption" color="muted" tabular>
          {t('progress', { current: Math.min(current + 1, total), total })}
        </Text>
        {showTimer ? (
          <Animated.View
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(150)}
            style={[styles.timer, { backgroundColor: colors.accentSoft }]}
            accessible
            accessibilityLabel={t('header.elapsed', { time })}
          >
            <Icon name="clock" size={13} color={colors.accent} />
            <Text variant="label" color="accent" tabular>
              {time}
            </Text>
          </Animated.View>
        ) : null}
      </View>
      <ProgressBar progress={progress} height={6} gradient />
    </View>
  );
});

const styles = StyleSheet.create({
  container: { paddingHorizontal: SCREEN_PADDING, paddingTop: space.sm, paddingBottom: space.md, gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  titleWrap: { flex: 1, alignItems: 'center' },
  progressRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 24 },
  timer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
});
