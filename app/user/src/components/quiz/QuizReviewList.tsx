import { memo, useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, LinearTransition, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Icon } from '@/components/icons';
import { MathText, PressableScale, Text } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import type { AnswerRecord } from '@/utils/quiz';
import { radius, space, useTheme } from '@/theme';
import type { Question } from '@/types';

export interface QuizReviewListProps {
  questions: Question[];
  answers: AnswerRecord[];
}

/** Expandable per-question review rows for the quiz results screen. */
export const QuizReviewList = memo(function QuizReviewList({ questions, answers }: QuizReviewListProps) {
  const [open, setOpen] = useState<string | null>(null);
  const toggle = useCallback((id: string) => setOpen((cur) => (cur === id ? null : id)), []);

  return (
    <View style={styles.list}>
      {questions.map((q, i) => {
        const a = answers.find((x) => x.questionId === q.id);
        return (
          <ReviewRow
            key={q.id}
            index={i}
            question={q}
            answer={a}
            expanded={open === q.id}
            onToggle={toggle}
          />
        );
      })}
    </View>
  );
});

interface ReviewRowProps {
  index: number;
  question: Question;
  answer?: AnswerRecord;
  expanded: boolean;
  onToggle(id: string): void;
}

const ReviewRow = memo(function ReviewRow({ index, question, answer, expanded, onToggle }: ReviewRowProps) {
  const { colors } = useTheme();
  const { t, L } = useI18n('quiz');
  const correct = !!answer?.correct;
  const chosen = answer && answer.chosenIndex >= 0 ? question.options[answer.chosenIndex] : undefined;
  const tint = correct ? colors.success : colors.danger;

  const rotation = useSharedValue(0);
  useEffect(() => {
    rotation.value = withTiming(expanded ? 180 : 0, { duration: 200 });
  }, [expanded, rotation]);
  const chevronStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }));

  return (
    <Animated.View
      layout={LinearTransition.duration(220)}
      entering={FadeInDown.duration(260).delay(80 + index * 50)}
      style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <PressableScale
        onPress={() => onToggle(question.id)}
        scaleTo={0.99}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${index + 1}. ${L(question.text)}, ${correct ? t('result.correct') : t('result.incorrect')}`}
        style={styles.head}
      >
        <View style={[styles.status, { backgroundColor: correct ? colors.successSoft : colors.dangerSoft }]}>
          <Icon name={correct ? 'check' : 'close'} size={16} color={tint} strokeWidth={2.4} />
        </View>
        <View style={styles.headText}>
          <Text variant="caption" color="muted" tabular>
            {`${index + 1} · ${L(question.topic)}`}
          </Text>
          <Text variant="bodyMedium" numberOfLines={expanded ? undefined : 2}>
            {L(question.text)}
          </Text>
        </View>
        <Animated.View style={chevronStyle}>
          <Icon name="chevron-down" size={18} color={colors.muted} />
        </Animated.View>
      </PressableScale>

      {expanded ? (
        <Animated.View entering={FadeIn.duration(220)} style={styles.body}>
          <View style={[styles.answerLine, { backgroundColor: correct ? colors.successSoft : colors.dangerSoft }]}>
            <Text variant="caption" color="muted">
              {t('result.yourAnswer')}
            </Text>
            <Text variant="bodyMedium" color={tint}>
              {chosen ? L(chosen) : t('result.unanswered')}
            </Text>
          </View>
          {!correct ? (
            <View style={[styles.answerLine, { backgroundColor: colors.successSoft }]}>
              <Text variant="caption" color="muted">
                {t('result.correctAnswer')}
              </Text>
              <Text variant="bodyMedium" color={colors.success}>
                {L(question.options[question.correctIndex])}
              </Text>
            </View>
          ) : null}
          <View style={[styles.explanation, { backgroundColor: colors.accentSoft }]}>
            <View style={styles.explanationHead}>
              <Icon name="sparkles" size={14} color={colors.accent} />
              <Text variant="label" color="accent">
                {t('question.explanation')}
              </Text>
            </View>
            <MathText text={L(question.explanation)} color={colors.ink} size={14} />
          </View>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  list: { gap: space.sm },
  row: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, minHeight: 56 },
  status: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  headText: { flex: 1, gap: 2 },
  body: { paddingHorizontal: space.md, paddingBottom: space.md, gap: space.sm },
  answerLine: { borderRadius: radius.sm, paddingVertical: space.sm, paddingHorizontal: space.md, gap: 2 },
  explanation: { borderRadius: radius.sm, padding: space.md, gap: space.xs },
  explanationHead: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
});
