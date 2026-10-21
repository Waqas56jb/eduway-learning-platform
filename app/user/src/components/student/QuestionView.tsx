import { memo, useMemo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Icon } from '@/components/icons';
import { Badge, Formula, MathText, Text } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { radius, space, useTheme } from '@/theme';
import type { Difficulty, Question } from '@/types';
import { QuizOption, type QuizOptionState } from './QuizOption';

export interface QuestionViewProps {
  question: Question;
  /** Selected option, as an index into `question.options` (not the display position). */
  selectedIndex: number | null;
  /** When true, correct/incorrect states are shown and options are locked. */
  revealed: boolean;
  /** Called with the index into `question.options`. */
  onSelect(i: number): void;
  /** Show the explanation card once revealed. Defaults to true. */
  showExplanation?: boolean;
  /** Slot at the end of the meta row (e.g. a bookmark button). */
  headerRight?: ReactNode;
  /** Display order of options (indexes into `question.options`). Defaults to natural order. */
  optionOrder?: number[];
}

const difficultyTone: Record<Difficulty, 'success' | 'warning' | 'danger'> = {
  easy: 'success',
  medium: 'warning',
  hard: 'danger',
};

/** Question text + formula + answer options + explanation reveal. Shared by quiz, practice, mistakes and exams. */
export const QuestionView = memo(function QuestionView({
  question,
  selectedIndex,
  revealed,
  onSelect,
  showExplanation = true,
  headerRight,
  optionOrder,
}: QuestionViewProps) {
  const { colors } = useTheme();
  const { t, L } = useI18n('quiz');

  const order = useMemo(() => {
    const natural = question.options.map((_, i) => i);
    if (!optionOrder || optionOrder.length !== natural.length) return natural;
    return optionOrder.every((i) => i >= 0 && i < natural.length) ? optionOrder : natural;
  }, [optionOrder, question.options]);

  const stateFor = (optIdx: number): QuizOptionState => {
    if (revealed) {
      if (optIdx === question.correctIndex) return 'correct';
      if (optIdx === selectedIndex) return 'incorrect';
      return 'disabled';
    }
    return optIdx === selectedIndex ? 'selected' : 'idle';
  };

  const questionText = L(question.text);
  const isCorrect = selectedIndex === question.correctIndex;

  return (
    <View style={styles.container}>
      <View style={styles.meta}>
        <View style={styles.metaStart}>
          <Text variant="overline" color="accent" numberOfLines={1} style={styles.topic}>
            {L(question.topic).toUpperCase()}
          </Text>
          <Badge
            label={t(`common:difficulty.${question.difficulty}`)}
            tone={difficultyTone[question.difficulty]}
            size="sm"
          />
        </View>
        {headerRight}
      </View>

      {questionText.includes('$') ? (
        <MathText text={questionText} size={18} color={colors.ink} />
      ) : (
        <Text variant="h3" accessibilityRole="header">
          {questionText}
        </Text>
      )}

      {question.formula ? (
        <View style={[styles.formula, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
          <Formula latex={question.formula} color={colors.ink} size={18} displayMode />
        </View>
      ) : null}

      <View style={styles.options} accessibilityRole="radiogroup">
        {order.map((optIdx, pos) => {
          const opt = question.options[optIdx];
          if (!opt) return null;
          return (
            <QuizOption
              key={`${question.id}-${optIdx}`}
              index={pos}
              label={L(opt)}
              state={stateFor(optIdx)}
              onPress={revealed ? undefined : () => onSelect(optIdx)}
            />
          );
        })}
      </View>

      {revealed && showExplanation ? (
        <Animated.View
          entering={FadeInDown.duration(320).delay(120)}
          style={[styles.explanation, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}
        >
          {selectedIndex !== null ? (
            <View style={styles.feedbackRow}>
              <Icon
                name={isCorrect ? 'check-circle' : 'x-circle'}
                size={18}
                color={isCorrect ? colors.success : colors.danger}
                filled
              />
              <Text variant="label" color={isCorrect ? colors.success : colors.danger}>
                {isCorrect ? t('question.correctFeedback') : t('question.incorrectFeedback')}
              </Text>
            </View>
          ) : null}
          <View style={styles.explanationHead}>
            <View style={[styles.explanationIcon, { backgroundColor: colors.accent }]}>
              <Icon name="sparkles" size={16} color={colors.onAccent} />
            </View>
            <Text variant="bodyBold">{t('question.explanation')}</Text>
          </View>
          <MathText text={L(question.explanation)} color={colors.ink} size={15} />
        </Animated.View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { gap: space.lg },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, minHeight: 32 },
  metaStart: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexShrink: 1 },
  topic: { flexShrink: 1 },
  formula: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    alignItems: 'center',
  },
  options: { gap: space.md },
  explanation: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.lg,
    gap: space.sm,
  },
  feedbackRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  explanationHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  explanationIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
