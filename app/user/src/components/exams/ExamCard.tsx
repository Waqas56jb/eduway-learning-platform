import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Icon, SubjectIcon } from '@/components/icons';
import { Badge, Button, Card, Text } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import type { ExamDraft } from '@/store';
import { radius, space, subjectColors, useTheme } from '@/theme';
import type { ExamBlueprint } from '@/types';
import { formatDuration } from '@/utils/format';

export interface ExamCardProps {
  exam: ExamBlueprint;
  index: number;
  attemptsLeft: number;
  bestScore?: number;
  draft?: ExamDraft;
  /** Epoch ms used to show the draft's remaining time. */
  now: number;
  onStart(): void;
}

/** Blueprint card: subject identity, paper facts, attempts dots, best score and the start/resume CTA. */
export const ExamCard = memo(function ExamCard({ exam, index, attemptsLeft, bestScore, draft, now, onStart }: ExamCardProps) {
  const { colors } = useTheme();
  const { t, L } = useI18n('exams');
  const color = subjectColors[exam.subjectId];
  const remainingSec = draft ? Math.max(0, Math.round((draft.endsAt - now) / 1000)) : 0;
  const canStart = !!draft || attemptsLeft > 0;

  return (
    <Animated.View entering={FadeInDown.duration(300).delay(120 + index * 70)}>
      <Card style={styles.card} accessibilityLabel={t('card.a11y', { title: L(exam.title), questions: exam.questionCount, minutes: exam.durationMin })}>
        <View style={[styles.accent, { backgroundColor: color }]} />
        <View style={styles.headRow}>
          <View style={[styles.iconWrap, { backgroundColor: `${color}1F` }]}>
            <SubjectIcon subjectId={exam.subjectId} size={24} color={color} />
          </View>
          <View style={styles.flex}>
            <Text variant="overline" color={color}>
              {t(`common:subjects.${exam.subjectId}`)}
            </Text>
            <Text variant="h3" numberOfLines={2}>
              {L(exam.title)}
            </Text>
          </View>
        </View>

        <Text variant="body" color="muted" style={styles.desc}>
          {L(exam.description)}
        </Text>

        <View style={styles.chips}>
          <Badge icon="quiz" label={t('card.questions', { count: exam.questionCount })} tone="navy" size="md" />
          <Badge icon="timer" label={t('card.duration', { count: exam.durationMin })} tone="navy" size="md" />
          <Badge icon="target" label={t('card.passMark', { value: exam.passMark })} tone="gold" size="md" />
        </View>

        <View style={[styles.metaRow, { borderColor: colors.border }]}>
          <View style={styles.flex}>
            <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              {Array.from({ length: exam.attemptsTotal }, (_, i) => (
                <View
                  key={i}
                  style={[
                    styles.dot,
                    i < attemptsLeft
                      ? { backgroundColor: colors.accent, borderColor: colors.accent }
                      : { backgroundColor: 'transparent', borderColor: colors.border },
                  ]}
                />
              ))}
            </View>
            <Text variant="caption" color={attemptsLeft > 0 ? 'muted' : 'danger'}>
              {attemptsLeft > 0 ? t('card.attemptsLeft', { left: attemptsLeft, total: exam.attemptsTotal }) : t('card.noAttempts')}
            </Text>
          </View>
          <View style={styles.best}>
            <Text variant="caption" color="muted" align="end">
              {t('card.bestScore')}
            </Text>
            {bestScore !== undefined ? (
              <Text variant="h3" color="accent" tabular align="end">
                {`${bestScore}%`}
              </Text>
            ) : (
              <Text variant="label" color="muted" align="end">
                {t('card.noBest')}
              </Text>
            )}
          </View>
        </View>

        {draft ? (
          <View style={[styles.draft, { backgroundColor: colors.accentSoft }]}>
            <Icon name="history" size={16} color={colors.accent} />
            <Text variant="label" color="accent" style={styles.flex}>
              {remainingSec > 0 ? t('card.inProgress', { time: formatDuration(remainingSec) }) : t('card.expired')}
            </Text>
          </View>
        ) : null}

        <Button
          title={draft ? t('card.resume') : attemptsLeft > 0 ? t('card.start') : t('card.noAttempts')}
          icon={draft ? 'play' : attemptsLeft > 0 ? 'exam' : 'lock'}
          variant={draft ? 'secondary' : 'primary'}
          disabled={!canStart}
          onPress={onStart}
          fullWidth
          style={styles.cta}
        />
      </Card>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  card: { overflow: 'hidden', paddingTop: space.xl },
  accent: { position: 'absolute', top: 0, start: 0, end: 0, height: 4 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  iconWrap: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  desc: { marginTop: space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: space.lg,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: space.md,
  },
  dots: { flexDirection: 'row', gap: space.xs + 2, marginBottom: space.xs + 2 },
  dot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5 },
  best: { alignItems: 'flex-end' },
  draft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.sm,
  },
  cta: { marginTop: space.lg },
});
