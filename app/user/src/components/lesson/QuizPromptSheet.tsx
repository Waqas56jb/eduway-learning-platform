import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon } from '@/components/icons';
import { BottomSheet, Button, SuccessCheck, Text } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { radius, space, useTheme } from '@/theme';

export const LESSON_QUIZ_QUESTIONS = 5;
const LESSON_QUIZ_MIN = 4;

export interface QuizPromptSheetProps {
  visible: boolean;
  lessonTitle: string;
  onTakeQuiz: () => void;
  onLater: () => void;
  /** From GET /lessons/:id/quiz-rule (falls back to the defaults). */
  questionCount?: number;
  minutes?: number;
}

/** Shown when the video ends: celebrate + nudge into the lesson quiz. */
export const QuizPromptSheet = memo(function QuizPromptSheet({
  visible,
  lessonTitle,
  onTakeQuiz,
  onLater,
  questionCount = LESSON_QUIZ_QUESTIONS,
  minutes = LESSON_QUIZ_MIN,
}: QuizPromptSheetProps) {
  const { t } = useI18n('lesson');
  const { colors } = useTheme();

  return (
    <BottomSheet
      visible={visible}
      onClose={onLater}
      footer={
        <View style={styles.footer}>
          <Button title={t('end.takeQuiz')} icon="quiz" onPress={onTakeQuiz} fullWidth />
          <Button title={t('end.later')} variant="ghost" onPress={onLater} fullWidth />
        </View>
      }
    >
      <View style={styles.body}>
        {visible ? <SuccessCheck size={104} /> : <View style={styles.checkSpacer} />}
        <Text variant="h1" display align="center">
          {t('end.title')}
        </Text>
        <Text variant="body" color="muted" align="center" style={styles.message}>
          {t('end.message')}
        </Text>
        <View style={[styles.quizCard, { backgroundColor: colors.accentSoft, borderColor: colors.border }]}>
          <View style={[styles.quizIcon, { backgroundColor: colors.primary }]}>
            <Icon name="quiz" size={22} color={colors.accentLight} />
          </View>
          <View style={styles.flex}>
            <Text variant="bodyBold" numberOfLines={1}>
              {t('end.quizTitle')}
            </Text>
            <Text variant="caption" color="muted" numberOfLines={1}>
              {lessonTitle}
            </Text>
            <View style={styles.metaRow}>
              <Icon name="timer" size={13} color={colors.accent} />
              <Text variant="caption" color="accent" tabular>
                {t('end.quizInfo', { count: questionCount, min: minutes })}
              </Text>
            </View>
          </View>
        </View>
        <View style={styles.hint}>
          <Icon name="sparkles" size={14} color={colors.muted} />
          <Text variant="caption" color="muted">
            {t('end.quizHint')}
          </Text>
        </View>
      </View>
    </BottomSheet>
  );
});

const styles = StyleSheet.create({
  body: { alignItems: 'center', gap: space.md, paddingBottom: space.md },
  checkSpacer: { height: 104 },
  message: { maxWidth: 320 },
  quizCard: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: space.xs,
  },
  quizIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1, gap: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  hint: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  footer: { gap: space.sm },
});
