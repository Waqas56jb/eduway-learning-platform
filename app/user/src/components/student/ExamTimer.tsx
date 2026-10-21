import { memo, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Icon } from '@/components/icons';
import { Text } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { radius, space, useTheme } from '@/theme';
import { formatDuration } from '@/utils/format';
import { haptic } from '@/utils/haptics';

export interface ExamTimerProps {
  /** Absolute deadline (epoch ms), e.g. from the server/draft. */
  endsAt: number;
  /** Called exactly once when the countdown reaches 0. */
  onExpire(): void;
  compact?: boolean;
}

const WARN_SEC = 5 * 60;
const CRITICAL_SEC = 60;

const remainingSec = (endsAt: number) => Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));

/**
 * Server-style countdown: always derived from the absolute `endsAt`, so it survives
 * backgrounding, remounts and resume. Warning tint under 5 min, pulse under 1 min,
 * haptic warnings when crossing 5:00 and 1:00.
 */
export const ExamTimer = memo(function ExamTimer({ endsAt, onExpire, compact }: ExamTimerProps) {
  const { colors } = useTheme();
  const { t } = useI18n('exams');
  const [left, setLeft] = useState(() => remainingSec(endsAt));

  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);
  const expiredRef = useRef(false);
  // Thresholds already below on mount (resume) must not fire.
  const firedRef = useRef({ warn: remainingSec(endsAt) <= WARN_SEC, critical: remainingSec(endsAt) <= CRITICAL_SEC });

  useEffect(() => {
    expiredRef.current = false;
    const tick = () => {
      const s = remainingSec(endsAt);
      setLeft(s);
      if (!firedRef.current.warn && s <= WARN_SEC && s > 0) {
        firedRef.current.warn = true;
        haptic.warning();
      }
      if (!firedRef.current.critical && s <= CRITICAL_SEC && s > 0) {
        firedRef.current.critical = true;
        haptic.warning();
      }
      if (s <= 0 && !expiredRef.current) {
        expiredRef.current = true;
        onExpireRef.current();
      }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [endsAt]);

  const warn = left <= WARN_SEC;
  const critical = left <= CRITICAL_SEC && left > 0;
  const tint = critical ? colors.danger : warn ? colors.warning : colors.ink;
  const bg = critical ? colors.dangerSoft : warn ? colors.warningSoft : colors.surfaceMuted;

  const pulse = useSharedValue(1);
  useEffect(() => {
    if (critical) {
      pulse.value = withRepeat(
        withSequence(
          withTiming(1.08, { duration: 450, easing: Easing.out(Easing.quad) }),
          withTiming(1, { duration: 450, easing: Easing.in(Easing.quad) }),
        ),
        -1,
        false,
      );
    } else {
      cancelAnimation(pulse);
      pulse.value = withTiming(1, { duration: 150 });
    }
    return () => cancelAnimation(pulse);
  }, [critical, pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  const time = formatDuration(left);

  return (
    <Animated.View
      accessible
      accessibilityRole="timer"
      accessibilityLabel={t('timer.a11y', { time })}
      accessibilityLiveRegion={critical ? 'assertive' : 'none'}
      style={[
        styles.pill,
        compact ? styles.compact : styles.regular,
        { backgroundColor: bg, borderColor: warn ? tint : colors.border },
        pulseStyle,
      ]}
    >
      <Icon name="clock" size={compact ? 14 : 16} color={tint} />
      {/* Digits always LTR so "12:34" never mirrors in Arabic. */}
      <View style={styles.ltr}>
        <Text variant={compact ? 'label' : 'bodyBold'} color={tint} tabular style={styles.digits}>
          {time}
        </Text>
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + 2,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  regular: { paddingHorizontal: space.md, height: 36 },
  compact: { paddingHorizontal: space.sm + 2, height: 30 },
  ltr: { direction: 'ltr' },
  digits: { writingDirection: 'ltr', minWidth: 44, textAlign: 'center' },
});
