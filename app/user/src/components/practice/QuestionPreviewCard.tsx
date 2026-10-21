import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon } from '@/components/icons';
import { PressableScale, Text } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { radius, shadows, space, subjectColors, useTheme } from '@/theme';
import type { Question } from '@/types';
import { BookmarkStar } from './BookmarkStar';
import { DifficultyBadge } from './DifficultyBadge';

interface Props {
  question: Question;
  onPress(question: Question): void;
}

/** Bank list row: subject color stripe, topic, difficulty, 2-line question text and a bookmark star. */
export const QuestionPreviewCard = memo(function QuestionPreviewCard({ question, onPress }: Props) {
  const { colors } = useTheme();
  const { t, L } = useI18n('practice');
  const color = subjectColors[question.subjectId];
  const text = L(question.text);

  return (
    <PressableScale
      onPress={() => onPress(question)}
      accessibilityRole="button"
      accessibilityLabel={t('bank.openA11y', { text })}
      style={[styles.card, shadows.sm, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <View style={[styles.stripe, { backgroundColor: color }]} />
      <View style={styles.body}>
        <View style={styles.metaRow}>
          <View style={[styles.dot, { backgroundColor: color }]} />
          <Text variant="caption" color={color} numberOfLines={1} style={styles.topic}>
            {t(`common:subjects.${question.subjectId}`)} · {L(question.topic)}
          </Text>
          <DifficultyBadge difficulty={question.difficulty} />
        </View>
        <Text variant="bodyMedium" numberOfLines={2}>
          {text}
        </Text>
        <View style={styles.footer}>
          <Icon name="target" size={14} color={colors.muted} />
          <Text variant="caption" color="muted" numberOfLines={1} style={styles.flex}>
            {question.tags.map((tag) => t(`tags.${tag}`, { defaultValue: tag })).join(' · ')}
          </Text>
          <Icon name="chevron" size={16} color={colors.muted} />
        </View>
      </View>
      <View style={styles.star}>
        <BookmarkStar questionId={question.id} size={20} />
      </View>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    minHeight: 112,
  },
  stripe: { width: 5 },
  body: { flex: 1, paddingVertical: space.lg, paddingStart: space.lg, paddingEnd: space.xs, gap: space.sm },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  dot: { width: 6, height: 6, borderRadius: 3 },
  topic: { flex: 1 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  flex: { flex: 1 },
  star: { paddingTop: space.sm, paddingEnd: space.sm },
});
