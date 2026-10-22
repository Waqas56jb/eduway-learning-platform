import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon } from '@/components/icons';
import { PressableScale, Text } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { radius, shadows, space, subjectColors, useTheme } from '@/theme';
import type { Question } from '@/types';
import { plainMath } from '@/utils/practice';
import { BookmarkStar } from './BookmarkStar';
import { DifficultyBadge } from './DifficultyBadge';

interface Props {
  question: Question;
  onPress(question: Question): void;
}

/**
 * Bank list row: subject color stripe, subject · topic, difficulty, 2-line plain-text question
 * (no KaTeX WebViews in lists) and a bookmark star with a full 44pt hit area.
 */
export const QuestionPreviewCard = memo(function QuestionPreviewCard({ question, onPress }: Props) {
  const { colors } = useTheme();
  const { t, L } = useI18n('practice');
  const color = subjectColors[question.subjectId];
  const text = plainMath(L(question.text));
  const formula = question.formula ? plainMath(question.formula) : '';
  const tags = question.tags.map((tag) => t(`tags.${tag}`, { defaultValue: tag })).join(' · ');

  return (
    <PressableScale
      onPress={() => onPress(question)}
      scaleTo={0.98}
      accessibilityRole="button"
      accessibilityLabel={t('bank.openA11y', { text })}
      style={[styles.card, shadows.sm, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <View style={[styles.stripe, { backgroundColor: color }]} />
      <View style={styles.body}>
        <View style={styles.metaRow}>
          <Text variant="label" color={color} numberOfLines={1} style={styles.flex}>
            {t(`common:subjects.${question.subjectId}`)}
            <Text variant="caption" color="muted">
              {`  ·  ${L(question.topic)}`}
            </Text>
          </Text>
          <DifficultyBadge difficulty={question.difficulty} />
          <BookmarkStar initial={question.bookmarked} questionId={question.id} size={20} />
        </View>
        <Text variant="bodyMedium" numberOfLines={2}>
          {text}
        </Text>
        {formula ? (
          <View style={[styles.formula, { backgroundColor: colors.surfaceMuted }]}>
            <Text variant="label" color="ink" numberOfLines={1} style={styles.ltr}>
              {formula}
            </Text>
          </View>
        ) : null}
        <View style={[styles.footer, { borderTopColor: colors.border }]}>
          <Icon name="target" size={14} color={colors.muted} />
          <Text variant="caption" color="muted" numberOfLines={1} style={styles.flex}>
            {tags}
          </Text>
          <Icon name="chevron" size={16} color={colors.muted} />
        </View>
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
  },
  stripe: { width: 4 },
  body: { flex: 1, paddingTop: space.sm, paddingBottom: space.md, paddingStart: space.lg, paddingEnd: space.sm, gap: space.sm },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44 },
  flex: { flex: 1 },
  formula: { alignSelf: 'flex-start', maxWidth: '100%', borderRadius: radius.sm, paddingHorizontal: space.md, paddingVertical: space.xs + 2, marginEnd: space.sm },
  ltr: { writingDirection: 'ltr' },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + 2,
    paddingTop: space.sm,
    marginEnd: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
