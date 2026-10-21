import { memo, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Icon, type IconName } from '@/components/icons';
import { Badge, Button, Card, Formula, MathText, PressableScale, Text, toast } from '@/components/ui';
import { getQuestion } from '@/data';
import { useI18n } from '@/hooks/useI18n';
import { useMistakesStore, type MistakeEntry } from '@/store';
import { HIT_SLOP, radius, space, subjectColors, useTheme } from '@/theme';
import type { Mistake } from '@/types';
import { haptic } from '@/utils/haptics';
import { timeAgo } from '@/utils/format';
import { statusTone } from '@/components/mistakes/grouping';

export interface MistakeCardProps {
  entry: MistakeEntry;
  onRetry?: () => void;
  onPress?: () => void;
}

const SOURCE_ICON: Record<Mistake['source'], IconName> = {
  quiz: 'quiz',
  bank: 'question-bank',
  exam: 'exam',
};

function AnswerRow({ kind, label, value }: { kind: 'wrong' | 'right'; label: string; value: string }) {
  const { colors } = useTheme();
  const tint = kind === 'wrong' ? colors.danger : colors.success;
  const soft = kind === 'wrong' ? colors.dangerSoft : colors.successSoft;
  return (
    <View style={[styles.answerRow, { backgroundColor: soft }]}>
      <Icon name={kind === 'wrong' ? 'x-circle' : 'check-circle'} size={18} color={tint} />
      <Text variant="caption" color="muted" style={styles.answerLabel}>
        {label}
      </Text>
      <Text variant="label" color={tint} style={styles.answerValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

export const MistakeCard = memo(function MistakeCard({ entry, onRetry, onPress }: MistakeCardProps) {
  const { colors } = useTheme();
  const { t, L, lang } = useI18n('mistakes');
  const setStatus = useMistakesStore((s) => s.setStatus);
  const question = getQuestion(entry.questionId);

  const retry = useCallback(() => {
    if (onRetry) onRetry();
    else router.push({ pathname: '/mistakes/[id]', params: { id: entry.id } });
  }, [onRetry, entry.id]);

  const markReviewed = useCallback(() => {
    setStatus(entry.id, 'reviewed');
    haptic.success();
    toast.success(t('toast.reviewed'));
  }, [setStatus, entry.id, t]);

  const lessonId = question?.lessonId;
  const goToLesson = useCallback(() => {
    if (lessonId) router.push({ pathname: '/lesson/[id]', params: { id: lessonId } });
  }, [lessonId]);

  if (!question) return null;

  const stripe = subjectColors[question.subjectId];
  const text = L(question.text);
  const repeated = entry.repeatCount >= 2;
  const statusLabel = t(`status.${entry.status}`);

  return (
    <Card
      padded={false}
      onPress={onPress ?? retry}
      style={styles.card}
      accessibilityRole="button"
      accessibilityLabel={t('card.a11y', { topic: L(question.topic), status: statusLabel })}
    >
      <View style={[styles.stripe, { backgroundColor: stripe }]} />
      <View style={styles.body}>
        <View style={styles.topRow}>
          <View style={styles.topicWrap}>
            <Text variant="overline" color={stripe} numberOfLines={1}>
              {L(question.topic)}
            </Text>
            <Text variant="caption" color="muted">
              {t(`common:difficulty.${question.difficulty}`)} · {timeAgo(entry.date, lang)}
            </Text>
          </View>
          <Badge label={statusLabel} tone={statusTone(entry.status)} size="sm" />
        </View>

        <View style={styles.question}>
          {text.includes('$') ? (
            <MathText text={text} color={colors.ink} size={15} />
          ) : (
            <Text variant="bodyMedium" numberOfLines={3}>
              {text}
            </Text>
          )}
          {question.formula ? (
            <View style={[styles.formula, { backgroundColor: colors.surfaceMuted }]}>
              <Formula latex={question.formula} color={colors.ink} size={15} />
            </View>
          ) : null}
        </View>

        <View style={styles.answers}>
          <AnswerRow kind="wrong" label={t('card.yourAnswer')} value={L(question.options[entry.chosenIndex])} />
          <AnswerRow kind="right" label={t('card.correct')} value={L(question.options[question.correctIndex])} />
        </View>

        <View style={styles.badges}>
          <Badge label={t(`source.${entry.source}`)} icon={SOURCE_ICON[entry.source]} tone="neutral" size="sm" />
          <View accessible accessibilityLabel={t('card.repeatedA11y', { count: entry.repeatCount })}>
            <Badge
              label={t('card.repeated', { count: entry.repeatCount })}
              icon="refresh"
              tone={repeated ? 'warning' : 'neutral'}
              size="sm"
            />
          </View>
        </View>

        <View style={[styles.actions, { borderTopColor: colors.border }]}>
          <Button title={t('card.retry')} icon="refresh" size="sm" variant="primary" onPress={retry} />
          {entry.status === 'unresolved' ? (
            <Button title={t('card.markReviewed')} icon="check" size="sm" variant="ghost" onPress={markReviewed} />
          ) : null}
          <View style={styles.flex} />
          {lessonId ? (
            <PressableScale
              onPress={goToLesson}
              hitSlop={HIT_SLOP}
              accessibilityRole="link"
              accessibilityLabel={t('card.goToLesson')}
              style={styles.link}
            >
              <Icon name="lesson" size={16} color={colors.accent} />
              <Text variant="label" color="accent" numberOfLines={1}>
                {t('card.goToLesson')}
              </Text>
              <Icon name="chevron" size={14} color={colors.accent} />
            </PressableScale>
          ) : null}
        </View>
      </View>
    </Card>
  );
});

const styles = StyleSheet.create({
  card: { overflow: 'hidden', flexDirection: 'row' },
  stripe: { width: 4, alignSelf: 'stretch' },
  body: { flex: 1, padding: space.lg, gap: space.md },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  topicWrap: { flex: 1, gap: space.xxs },
  question: { gap: space.sm },
  formula: { borderRadius: radius.sm, paddingVertical: space.sm, paddingHorizontal: space.md, alignItems: 'center' },
  answers: { gap: space.xs },
  answerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderRadius: radius.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
  },
  answerLabel: { minWidth: 72 },
  answerValue: { flex: 1 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: space.sm,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  flex: { flexGrow: 1 },
  link: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 36 },
});
