import { memo, useCallback, useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { Icon, SubjectIcon, type IconName } from '@/components/icons';
import { Badge, Button, Card, PressableScale, Text, toast } from '@/components/ui';
import { optionIndex, toQuestion } from '@/api/adapters';
import { useSetMistakeStatus } from '@/api/mistakes';
import { useI18n } from '@/hooks/useI18n';
import { HIT_SLOP, radius, space, subjectColors, useTheme } from '@/theme';
import type { Mistake } from '@/types';
import { haptic } from '@/utils/haptics';
import { timeAgo } from '@/utils/format';
import { plainMath } from '@/utils/practice';
import { statusTone, type MistakeEntry } from '@/components/mistakes/grouping';

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
  return (
    <View style={styles.answerRow}>
      <Icon name={kind === 'wrong' ? 'x-circle' : 'check-circle'} size={20} color={tint} />
      <View style={styles.answerText}>
        <Text variant="caption" color="muted" numberOfLines={1}>
          {label}
        </Text>
        <Text variant="bodyMedium" color={tint} numberOfLines={2}>
          {value}
        </Text>
      </View>
    </View>
  );
}

/** Mistake journal card: topic + status, plain-text question, your answer vs correct, and equal-width actions. */
export const MistakeCard = memo(function MistakeCard({ entry, onRetry, onPress }: MistakeCardProps) {
  const { colors } = useTheme();
  const { t, L, lang } = useI18n('mistakes');
  const { width } = useWindowDimensions();
  const { mutate: setStatus } = useSetMistakeStatus();
  const question = useMemo(() => toQuestion(entry.question), [entry.question]);
  const narrow = width < 375;

  const retry = useCallback(() => {
    if (onRetry) onRetry();
    else router.push({ pathname: '/mistakes/[id]', params: { id: entry.id } });
  }, [onRetry, entry.id]);

  const markReviewed = useCallback(() => {
    setStatus({ id: entry.id, status: 'reviewed' });
    haptic.success();
    toast.success(t('toast.reviewed'));
  }, [setStatus, entry.id, t]);

  const lessonId = entry.lessonId ?? question.lessonId;
  const goToLesson = useCallback(() => {
    if (lessonId) router.push({ pathname: '/lesson/[id]', params: { id: lessonId } });
  }, [lessonId]);

  if (!question) return null;

  const color = subjectColors[question.subjectId];
  const text = plainMath(L(question.text));
  const formula = question.formula ? plainMath(question.formula) : '';
  const repeated = entry.repeatCount >= 2;
  const statusLabel = t(`status.${entry.status}`);
  const chosenIdx = entry.chosenOptionId ? optionIndex(question, entry.chosenOptionId) : entry.chosenIndex;
  const chosen = question.options[chosenIdx];
  const btnStyle = narrow ? [styles.btn, styles.btnNarrow] : styles.btn;

  return (
    <Card
      padded={false}
      onPress={onPress ?? retry}
      style={styles.card}
      accessibilityRole="button"
      accessibilityLabel={t('card.a11y', { topic: L(question.topic), status: statusLabel })}
    >
      <View style={styles.topRow}>
        <View style={[styles.subjectIcon, { backgroundColor: `${color}1F` }]}>
          <SubjectIcon subjectId={question.subjectId} size={18} color={color} />
        </View>
        <View style={styles.topicWrap}>
          <Text variant="label" color={color} numberOfLines={1}>
            {L(question.topic)}
          </Text>
          <Text variant="caption" color="muted" numberOfLines={1}>
            {`${t(`common:difficulty.${question.difficulty}`)} · ${timeAgo(entry.date, lang)}`}
          </Text>
        </View>
        <Badge label={statusLabel} tone={statusTone(entry.status)} size="sm" />
      </View>

      <View style={styles.question}>
        <Text variant="bodyMedium" numberOfLines={3}>
          {text}
        </Text>
        {formula ? (
          <View style={[styles.formula, { backgroundColor: colors.surfaceMuted }]}>
            <Text variant="label" numberOfLines={1} style={styles.ltr}>
              {formula}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={[styles.answers, { borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}>
        <AnswerRow kind="wrong" label={t('card.yourAnswer')} value={chosen ? plainMath(L(chosen)) : '—'} />
        <View style={[styles.answerDivider, { backgroundColor: colors.border }]} />
        <AnswerRow kind="right" label={t('card.correct')} value={plainMath(L(question.options[question.correctIndex]))} />
      </View>

      <View style={styles.metaRow}>
        <Badge label={t(`source.${entry.source}`)} icon={SOURCE_ICON[entry.source]} tone="neutral" size="sm" />
        <View accessible accessibilityLabel={t('card.repeatedA11y', { count: entry.repeatCount })}>
          <Badge
            label={t('card.repeated', { count: entry.repeatCount })}
            icon="refresh"
            tone={repeated ? 'warning' : 'neutral'}
            size="sm"
          />
        </View>
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
          </PressableScale>
        ) : null}
      </View>

      <View style={[styles.actions, { borderTopColor: colors.border }]}>
        <Button
          title={t('card.retry')}
          icon={narrow ? undefined : 'refresh'}
          size="sm"
          variant="primary"
          onPress={retry}
          style={btnStyle}
        />
        {entry.status === 'unresolved' ? (
          <Button
            title={t('card.markReviewed')}
            icon={narrow ? undefined : 'check'}
            size="sm"
            variant="outline"
            onPress={markReviewed}
            style={btnStyle}
          />
        ) : null}
      </View>
    </Card>
  );
});

const styles = StyleSheet.create({
  card: { overflow: 'hidden', padding: space.lg, gap: space.md },
  flex: { flexGrow: 1 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  subjectIcon: { width: 36, height: 36, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  topicWrap: { flex: 1, gap: space.xxs },
  question: { gap: space.sm },
  formula: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    borderRadius: radius.sm,
    paddingVertical: space.xs + 2,
    paddingHorizontal: space.md,
  },
  ltr: { writingDirection: 'ltr' },
  answers: { borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  answerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm + 2,
    paddingHorizontal: space.md,
  },
  answerText: { flex: 1, gap: 1 },
  answerDivider: { height: StyleSheet.hairlineWidth, marginStart: space.md + 20 + space.md },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.sm },
  link: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 32 },
  actions: {
    flexDirection: 'row',
    gap: space.md,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  btn: { flex: 1, height: 44 },
  btnNarrow: { paddingHorizontal: space.sm },
});
