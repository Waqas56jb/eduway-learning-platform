import { memo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  FadeInUp,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { TutorAvatar } from '@/components/tutor/TutorAvatar';
import { useI18n } from '@/hooks/useI18n';
import { radius, space, useTheme } from '@/theme';

const DOT = 8;

const Dot = memo(function Dot({ delay, color }: { delay: number; color: string }) {
  const y = useSharedValue(0);
  useEffect(() => {
    y.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(-5, { duration: 280, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 280, easing: Easing.in(Easing.quad) }),
          withTiming(0, { duration: 260 }),
        ),
        -1,
        false,
      ),
    );
    return () => cancelAnimation(y);
  }, [delay, y]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value }],
    opacity: 0.55 + (-y.value / 5) * 0.45,
  }));
  return <Animated.View style={[styles.dot, { backgroundColor: color }, style]} />;
});

/** Three bouncing gold dots in a tutor bubble, shown while the AI Tutor is "typing". */
export const TypingIndicator = memo(function TypingIndicator() {
  const { colors } = useTheme();
  const { t } = useI18n('tutor');
  return (
    <Animated.View
      entering={FadeInUp.duration(220)}
      exiting={FadeOut.duration(150)}
      style={styles.row}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t('typing.label')}
      accessibilityLiveRegion="polite"
    >
      <TutorAvatar size={28} />
      <View style={[styles.bubble, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {[0, 140, 280].map((d) => (
          <Dot key={d} delay={d} color={colors.accent} />
        ))}
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, alignSelf: 'flex-start' },
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 42,
    paddingHorizontal: space.lg,
    borderRadius: radius.lg,
    borderTopStartRadius: radius.xs,
    borderWidth: StyleSheet.hairlineWidth,
  },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2 },
});
