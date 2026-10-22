import { memo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Icon } from '@/components/icons';
import { MathText, PressableScale, Text } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { radius, space, useTheme } from '@/theme';
import { optionLetter } from '@/utils/quiz';

export type QuizOptionState = 'idle' | 'selected' | 'correct' | 'incorrect' | 'disabled';

export interface QuizOptionProps {
  /** Display position (0 → A / أ). */
  index: number;
  label: string;
  state: QuizOptionState;
  onPress?(): void;
}

/** A single multiple-choice answer card with letter badge and animated feedback states. */
export const QuizOption = memo(function QuizOption({ index, label, state, onPress }: QuizOptionProps) {
  const { colors } = useTheme();
  const { t, isAr } = useI18n('quiz');
  const letter = optionLetter(index, isAr);

  const shakeX = useSharedValue(0);
  const pop = useSharedValue(1);

  useEffect(() => {
    if (state === 'incorrect') {
      shakeX.value = withSequence(
        withTiming(-8, { duration: 50 }),
        withTiming(8, { duration: 70 }),
        withTiming(-6, { duration: 60 }),
        withTiming(6, { duration: 60 }),
        withTiming(0, { duration: 50 }),
      );
    } else if (state === 'correct') {
      pop.value = withSequence(withTiming(1.025, { duration: 120 }), withSpring(1, { damping: 12, stiffness: 220 }));
    }
  }, [state, shakeX, pop]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }, { scale: pop.value }],
  }));

  const tone = (() => {
    switch (state) {
      case 'correct':
        return { border: colors.success, bg: colors.successSoft, badgeBg: colors.success, badgeFg: '#FFFFFF', text: colors.ink };
      case 'incorrect':
        return { border: colors.danger, bg: colors.dangerSoft, badgeBg: colors.danger, badgeFg: '#FFFFFF', text: colors.ink };
      case 'selected':
        return { border: colors.accent, bg: colors.accentSoft, badgeBg: colors.accent, badgeFg: colors.onAccent, text: colors.ink };
      case 'disabled':
        return { border: colors.border, bg: colors.surface, badgeBg: colors.surfaceMuted, badgeFg: colors.muted, text: colors.muted };
      default:
        return { border: colors.border, bg: colors.surface, badgeBg: colors.surfaceMuted, badgeFg: colors.ink, text: colors.ink };
    }
  })();

  const interactive = !!onPress && state !== 'disabled' && state !== 'correct' && state !== 'incorrect';
  const hasMath = label.includes('$');
  const stateLabel =
    state === 'correct'
      ? t('option.correct')
      : state === 'incorrect'
        ? t('option.incorrect')
        : state === 'selected'
          ? t('option.selected')
          : undefined;

  return (
    <Animated.View style={animatedStyle}>
      <PressableScale
        onPress={interactive ? onPress : undefined}
        disabled={!interactive}
        disabledOpacity={state === 'disabled' ? 0.6 : 1}
        accessibilityRole="radio"
        accessibilityLabel={[t('option.a11y', { letter, label }), stateLabel].filter(Boolean).join(', ')}
        accessibilityState={{
          selected: state === 'selected' || state === 'incorrect' || state === 'correct',
          disabled: !interactive,
          checked: state === 'selected',
        }}
        style={[
          styles.card,
          {
            borderColor: tone.border,
            backgroundColor: tone.bg,
            borderWidth: state === 'idle' || state === 'disabled' ? StyleSheet.hairlineWidth * 2 : 1.5,
          },
        ]}
      >
        <View style={[styles.badge, { backgroundColor: tone.badgeBg }]}>
          <Text variant="label" color={tone.badgeFg} align="center">
            {letter}
          </Text>
        </View>
        <View style={styles.label}>
          {hasMath ? (
            <MathText text={label} color={tone.text} size={15} />
          ) : (
            <Text variant="bodyMedium" color={tone.text}>
              {label}
            </Text>
          )}
        </View>
        {state === 'correct' ? (
          <Icon name="check-circle" size={22} color={colors.success} filled />
        ) : state === 'incorrect' ? (
          <Icon name="x-circle" size={22} color={colors.danger} filled />
        ) : (
          <View style={[styles.radio, { borderColor: state === 'selected' ? colors.accent : colors.border }]}>
            {state === 'selected' ? <View style={[styles.radioDot, { backgroundColor: colors.accent }]} /> : null}
          </View>
        )}
      </PressableScale>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 56,
    paddingVertical: space.md,
    paddingStart: space.md,
    paddingEnd: space.lg,
    borderRadius: 16,
  },
  badge: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { flex: 1 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
});
