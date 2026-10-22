import { useMemo, useRef } from 'react';
import { toQuestion } from '@/api/adapters';
import { useBankQuestion } from '@/api/bank';
import { StyleSheet, View } from 'react-native';
import { BottomSheet, Button, Text } from '@/components/ui';
import { QuestionView } from '@/components/student';
import { useI18n } from '@/hooks/useI18n';
import { space, subjectColors } from '@/theme';
import type { Question } from '@/types';
import { BookmarkStar } from './BookmarkStar';
import { DifficultyBadge } from './DifficultyBadge';

interface Props {
  question: Question | null;
  onClose(): void;
  onPractice(question: Question): void;
}

const noop = () => {};

/** Full question preview (answer revealed + explanation) with a "Practice this" CTA. */
export function QuestionDetailSheet({ question: current, onClose, onPractice }: Props) {
  const { t, L } = useI18n('practice');
  // Keep rendering the last question while the sheet animates out.
  const last = useRef<Question | null>(current);
  if (current) last.current = current;
  const shown = current ?? last.current;
  // BNK-03: the full question with answer + explanation (entitled subjects only).
  const { data: review } = useBankQuestion(current && !current.locked ? current.id : undefined);
  const question = useMemo(
    () => (shown && review && review.id === shown.id ? toQuestion(review) : shown),
    [shown, review],
  );

  return (
    <BottomSheet
      visible={!!current}
      onClose={onClose}
      title={t('bank.sheetTitle')}
      snap="full"
      footer={
        question ? (
          <Button
            title={t('bank.practiceThis')}
            icon="practice"
            variant="primary"
            fullWidth
            onPress={() => onPractice(question)}
          />
        ) : null
      }
    >
      {question ? (
        <View style={styles.content}>
          <View style={styles.meta}>
            <View style={[styles.dot, { backgroundColor: subjectColors[question.subjectId] }]} />
            <Text variant="label" color={subjectColors[question.subjectId]} style={styles.flex} numberOfLines={1}>
              {t(`common:subjects.${question.subjectId}`)} · {L(question.topic)}
            </Text>
            <DifficultyBadge difficulty={question.difficulty} />
          </View>
          <QuestionView
            question={question}
            selectedIndex={question.correctIndex}
            revealed
            showExplanation
            onSelect={noop}
            headerRight={<BookmarkStar initial={question.bookmarked} questionId={question.id} surface />}
          />
        </View>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: space.lg },
  meta: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.lg },
  dot: { width: 8, height: 8, borderRadius: 4 },
  flex: { flex: 1 },
});
