import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Icon } from '@/components/icons';
import { Card, Text } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { radius, space, useTheme } from '@/theme';
import { plainMath } from '@/utils/practice';
import type { ReviewAnswer } from './examUtils';

/** Expanded per-question review: question, the student's answer and the correct answer. */
export const AnswerReviewList = memo(function AnswerReviewList({ answers }: { answers: ReviewAnswer[] }) {
  const { colors } = useTheme();
  const { t, L } = useI18n('exams');

  return (
    <View style={styles.list}>
      {answers.map((a, i) => {
        const q = a.question;
        const skipped = a.chosenIndex < 0;
        const tone = a.correct ? colors.success : skipped ? colors.muted : colors.danger;
        const soft = a.correct ? colors.successSoft : skipped ? colors.surfaceMuted : colors.dangerSoft;
        return (
          <Animated.View key={a.questionId} entering={FadeInDown.duration(350).delay(Math.min(i * 60, 300))}>
            <Card>
              <View style={styles.head}>
                <View style={[styles.num, { backgroundColor: soft }]}>
                  <Icon name={a.correct ? 'check' : skipped ? 'minus' : 'close'} size={14} color={tone} strokeWidth={2.4} />
                </View>
                <Text variant="label" color="muted" style={styles.flex}>
                  {t('result.questionN', { n: i + 1 })} · {L(q.topic)}
                </Text>
              </View>
              <Text variant="bodyMedium">{plainMath(L(q.text))}</Text>
              {q.formula ? (
                <View style={[styles.formula, { backgroundColor: colors.surfaceMuted }]}>
                  <Text variant="label" numberOfLines={2} style={styles.ltr}>
                    {plainMath(q.formula)}
                  </Text>
                </View>
              ) : null}

              <View style={[styles.answer, { backgroundColor: soft }]}>
                <Text variant="caption" color="muted">
                  {t('result.yourAnswer')}
                </Text>
                <Text variant="bodyMedium" color={tone}>
                  {skipped ? t('result.notAnswered') : plainMath(L(q.options[a.chosenIndex]))}
                </Text>
              </View>
              {!a.correct && q.correctIndex >= 0 ? (
                <View style={[styles.answer, { backgroundColor: colors.successSoft }]}>
                  <Text variant="caption" color="muted">
                    {t('result.correctAnswer')}
                  </Text>
                  <Text variant="bodyMedium" color={colors.success}>
                    {plainMath(L(q.options[q.correctIndex]))}
                  </Text>
                </View>
              ) : null}
            </Card>
          </Animated.View>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  list: { gap: space.md },
  flex: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.sm },
  num: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  formula: { alignSelf: 'flex-start', maxWidth: '100%', marginTop: space.sm, paddingHorizontal: space.md, paddingVertical: space.xs + 2, borderRadius: radius.sm },
  ltr: { writingDirection: 'ltr' },
  answer: { marginTop: space.sm, paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.sm, gap: 2 },
});
