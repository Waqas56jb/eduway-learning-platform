import { memo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, LinearTransition, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { Icon } from '@/components/icons';
import { MathText, PressableScale, Text } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import type { AnswerRecord } from '@/store';
import { radius, space, subjectColors, useTheme } from '@/theme';
import type { Question } from '@/types';
import { DifficultyBadge } from './DifficultyBadge';

interface Props {
  index: number;
  question: Question;
  answer: AnswerRecord;
}

/** Result review row: your answer vs the correct one; expands to show the explanation. */
export const AnswerReviewItem = memo(function AnswerReviewItem({ index, question, answer }: Props) {
  const { colors } = useTheme();
  const { t, L } = useI18n('practice');
  const [open, setOpen] = useState(false);
  const ok = answer.correct;
  const tone = ok ? colors.success : colors.danger;
  const chosen = answer.chosenIndex >= 0 ? question.options[answer.chosenIndex] : undefined;
  const correct = question.options[question.correctIndex];

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: withTiming(open ? '180deg' : '0deg', { duration: 200 }) }],
  }));

  return (
    <Animated.View layout={LinearTransition.duration(220)}>
      <PressableScale
        onPress={() => setOpen((v) => !v)}
        haptics
        scaleTo={0.99}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${index + 1}. ${L(question.text)} — ${open ? t('result.collapseA11y') : t('result.expandA11y')}`}
        style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <View style={styles.head}>
          <View style={[styles.num, { backgroundColor: ok ? colors.successSoft : colors.dangerSoft }]}>
            <Icon name={ok ? 'check' : 'close'} size={16} color={tone} strokeWidth={2.4} />
          </View>
          <View style={styles.flex}>
            <View style={styles.metaRow}>
              <Text variant="caption" color={subjectColors[question.subjectId]} numberOfLines={1} style={styles.flex}>
                {index + 1} · {L(question.topic)}
              </Text>
              <DifficultyBadge difficulty={question.difficulty} />
            </View>
            <Text variant="bodyMedium" numberOfLines={open ? undefined : 2}>
              {L(question.text)}
            </Text>
          </View>
          <Animated.View style={chevronStyle}>
            <Icon name="chevron-down" size={18} color={colors.muted} />
          </Animated.View>
        </View>

        <View style={styles.answers}>
          <View style={[styles.answer, { backgroundColor: ok ? colors.successSoft : colors.dangerSoft }]}>
            <Text variant="caption" color="muted">
              {t('result.yourAnswer')}
            </Text>
            <Text variant="label" color={tone} numberOfLines={open ? undefined : 1}>
              {chosen ? L(chosen) : t('result.noAnswer')}
            </Text>
          </View>
          {!ok ? (
            <View style={[styles.answer, { backgroundColor: colors.successSoft }]}>
              <Text variant="caption" color="muted">
                {t('result.correctAnswer')}
              </Text>
              <Text variant="label" color={colors.success} numberOfLines={open ? undefined : 1}>
                {L(correct)}
              </Text>
            </View>
          ) : null}
        </View>

        {open ? (
          <Animated.View entering={FadeIn.duration(220)} style={[styles.explain, { backgroundColor: colors.accentSoft }]}>
            <View style={styles.explainHead}>
              <Icon name="sparkles" size={16} color={colors.accent} />
              <Text variant="label" color="accent">
                {t('result.explanation')}
              </Text>
            </View>
            <MathText text={L(question.explanation)} color={colors.ink} size={14} />
          </Animated.View>
        ) : null}
      </PressableScale>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: space.lg, gap: space.md },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  num: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.xs },
  answers: { flexDirection: 'row', gap: space.sm },
  answer: { flex: 1, borderRadius: radius.md, paddingVertical: space.sm, paddingHorizontal: space.md, gap: space.xxs },
  explain: { borderRadius: radius.md, padding: space.md, gap: space.sm },
  explainHead: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
});
