import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { ZoomIn, ZoomOut } from 'react-native-reanimated';
import { Icon } from '@/components/icons';
import { IconButton, ProgressBar, Text } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { SCREEN_PADDING, radius, space, useTheme } from '@/theme';

interface Props {
  title: string;
  subtitle?: string;
  /** 0-based */
  current: number;
  total: number;
  answered: number;
  streak: number;
  onClose(): void;
}

/** Practice top bar: close, title, streak pill, "Question n of N" and a gold progress bar. */
export const SessionHeader = memo(function SessionHeader({ title, subtitle, current, total, answered, streak, onClose }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n('practice');
  const progress = total ? Math.round((answered / total) * 100) : 0;

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <IconButton icon="close" variant="surface" onPress={onClose} accessibilityLabel={t('session.exit')} />
        <View style={styles.titleWrap}>
          <Text variant="overline" color="accent" align="center" numberOfLines={1}>
            {title.toUpperCase()}
          </Text>
          {subtitle ? (
            <Text variant="label" align="center" numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <View style={styles.side}>
          {streak >= 2 ? (
            <Animated.View
              key={streak}
              entering={ZoomIn.springify().damping(12)}
              exiting={ZoomOut.duration(120)}
              style={[styles.streak, { backgroundColor: colors.accentSoft }]}
              accessible
              accessibilityLabel={t('session.streak', { count: streak })}
            >
              <Icon name="flame" size={14} color={colors.accent} filled />
              <Text variant="label" color="accent" tabular>
                {streak}
              </Text>
            </Animated.View>
          ) : null}
        </View>
      </View>
      <View style={styles.progressRow}>
        <Text variant="caption" color="muted" tabular>
          {t('session.progress', { current: Math.min(current + 1, total), total })}
        </Text>
        <Text variant="caption" color="muted" tabular>
          {t('common:units.percent', { value: progress })}
        </Text>
      </View>
      <ProgressBar progress={progress} height={6} gradient />
    </View>
  );
});

const styles = StyleSheet.create({
  container: { paddingHorizontal: SCREEN_PADDING, paddingTop: space.sm, paddingBottom: space.md, gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  titleWrap: { flex: 1, alignItems: 'center' },
  side: { minWidth: 44, alignItems: 'flex-end' },
  progressRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  streak: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: space.sm,
    height: 30,
    borderRadius: radius.pill,
  },
});
