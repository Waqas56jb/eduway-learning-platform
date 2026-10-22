import { memo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  FadeInUp,
  FadeOutUp,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Icon } from '@/components/icons';
import { PressableScale, Text } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { palette, radius, space, useTheme } from '@/theme';

/** "Saved ✓" pill that flashes each time `pulseKey` changes ("Saving…" while an upload is in flight). */
export const SavedIndicator = memo(function SavedIndicator({ pulseKey, saving = false }: { pulseKey: number; saving?: boolean }) {
  const { colors } = useTheme();
  const { t } = useI18n('exams');
  const opacity = useSharedValue(0.55);
  const scale = useSharedValue(1);

  useEffect(() => {
    if (pulseKey === 0) return;
    opacity.value = withSequence(withTiming(1, { duration: 140 }), withDelay(1200, withTiming(0.55, { duration: 400 })));
    scale.value = withSequence(withTiming(1.08, { duration: 140 }), withTiming(1, { duration: 220 }));
  }, [pulseKey, opacity, scale]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));

  return (
    <Animated.View
      style={[styles.saved, { backgroundColor: colors.successSoft }, style]}
      accessibilityLiveRegion="polite"
      accessibilityLabel={saving ? t('room.saving') : t('room.saved')}
    >
      <Icon name={saving ? 'refresh' : 'check'} size={12} color={colors.success} strokeWidth={2.5} />
      <Text variant="caption" color={colors.success}>
        {saving ? t('room.saving') : t('room.saved')}
      </Text>
    </Animated.View>
  );
});

/** Slim top banner shown while the connection is down (answers keep queueing locally). */
export function OfflineBanner() {
  const { t } = useI18n('exams');
  return (
    <Animated.View
      entering={FadeInUp.duration(250)}
      exiting={FadeOutUp.duration(220)}
      style={styles.offline}
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
    >
      <Icon name="wifi-off" size={16} color={palette.white} />
      <Text variant="label" color={palette.white} style={styles.flex}>
        {t('network.lost')}
      </Text>
    </Animated.View>
  );
}

export interface SubmitSummaryProps {
  unanswered: number[];
  flaggedCount: number;
  onJump(i: number): void;
}

/** Body of the submit confirmation sheet: unanswered numbers (tap to jump) + flagged count. */
export function SubmitSummary({ unanswered, flaggedCount, onJump }: SubmitSummaryProps) {
  const { colors } = useTheme();
  const { t } = useI18n('exams');
  return (
    <View style={styles.summary}>
      {unanswered.length ? (
        <View style={[styles.block, { backgroundColor: colors.warningSoft }]}>
          <View style={styles.row}>
            <Icon name="alert" size={18} color={colors.warning} />
            <Text variant="bodyBold" style={styles.flex}>
              {t('submitSheet.unanswered', { count: unanswered.length })}
            </Text>
          </View>
          <Text variant="caption" color="muted">
            {t('submitSheet.tapToJump')}
          </Text>
          <View style={styles.nums}>
            {unanswered.map((i) => (
              <PressableScale
                key={i}
                onPress={() => onJump(i)}
                accessibilityRole="button"
                accessibilityLabel={t('navigator.cell', { n: i + 1 })}
                style={[styles.num, { borderColor: colors.warning, backgroundColor: colors.surface }]}
              >
                <Text variant="label" tabular>
                  {i + 1}
                </Text>
              </PressableScale>
            ))}
          </View>
        </View>
      ) : (
        <View style={[styles.block, styles.row, { backgroundColor: colors.successSoft }]}>
          <Icon name="check-circle" size={18} color={colors.success} />
          <Text variant="bodyMedium" style={styles.flex}>
            {t('submitSheet.allAnswered')}
          </Text>
        </View>
      )}

      {flaggedCount > 0 ? (
        <View style={[styles.block, styles.row, { backgroundColor: colors.accentSoft }]}>
          <Icon name="flag" size={18} color={colors.accent} filled />
          <Text variant="bodyMedium" style={styles.flex}>
            {t('submitSheet.flagged', { count: flaggedCount })}
          </Text>
        </View>
      ) : null}

      <View style={styles.row}>
        <Icon name="info" size={16} color={colors.muted} />
        <Text variant="caption" color="muted" style={styles.flex}>
          {t('submitSheet.warning')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  saved: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: space.sm,
    height: 24,
    borderRadius: radius.pill,
  },
  offline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm + 2,
    backgroundColor: palette.navyLight,
    borderBottomWidth: 2,
    borderBottomColor: palette.warning,
  },
  summary: { gap: space.md },
  block: { padding: space.md, borderRadius: radius.md, gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  nums: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.xs },
  num: {
    minWidth: 44,
    height: 44,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
