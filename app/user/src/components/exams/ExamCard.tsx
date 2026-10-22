import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Icon, SubjectIcon, type IconName } from '@/components/icons';
import { Button, Card, Text } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { radius, space, subjectColors, useTheme } from '@/theme';
import type { ExamBlueprint } from '@/types';
import { formatDuration } from '@/utils/format';

export interface ExamCardProps {
  exam: ExamBlueprint;
  index: number;
  attemptsLeft: number;
  bestScore?: number;
  /** In-progress attempt (server `activeAttempt`), `endsAt` in epoch ms. */
  draft?: { endsAt: number };
  /** Epoch ms used to show the draft's remaining time. */
  now: number;
  onStart(): void;
}

/** Blueprint card: subject identity, a 3-up facts strip, attempts dots, best score and the start/resume CTA. */
export const ExamCard = memo(function ExamCard({ exam, index, attemptsLeft, bestScore, draft, now, onStart }: ExamCardProps) {
  const { colors } = useTheme();
  const { t, L } = useI18n('exams');
  const color = subjectColors[exam.subjectId];
  const remainingSec = draft ? Math.max(0, Math.round((draft.endsAt - now) / 1000)) : 0;
  const canStart = !!draft || attemptsLeft > 0;

  const facts: { key: string; icon: IconName; value: string; label: string }[] = [
    { key: 'q', icon: 'quiz', value: String(exam.questionCount), label: t('card.factQuestions') },
    { key: 'd', icon: 'timer', value: String(exam.durationMin), label: t('card.factMinutes') },
    { key: 'p', icon: 'target', value: `${exam.passMark}%`, label: t('card.factPass') },
  ];

  return (
    <Animated.View entering={FadeInDown.duration(350).delay(Math.min(120 + index * 60, 300))}>
      <Card
        padded={false}
        style={styles.card}
        accessibilityLabel={t('card.a11y', { title: L(exam.title), questions: exam.questionCount, minutes: exam.durationMin })}
      >
        <View style={[styles.accent, { backgroundColor: color }]} pointerEvents="none" />

        <View style={styles.headRow}>
          <View style={[styles.iconWrap, { backgroundColor: `${color}1F` }]}>
            <SubjectIcon subjectId={exam.subjectId} size={24} color={color} />
          </View>
          <View style={styles.flex}>
            <Text variant="overline" color={color} numberOfLines={1}>
              {t(`common:subjects.${exam.subjectId}`)}
            </Text>
            <Text variant="h3" numberOfLines={2}>
              {L(exam.title)}
            </Text>
          </View>
        </View>

        <Text variant="body" color="muted" numberOfLines={3}>
          {L(exam.description)}
        </Text>

        <View style={[styles.facts, { backgroundColor: colors.surfaceMuted }]}>
          {facts.map((f, i) => (
            <View key={f.key} style={styles.factWrap}>
              {i > 0 ? <View style={[styles.factDivider, { backgroundColor: colors.border }]} /> : null}
              <View style={styles.fact}>
                <Icon name={f.icon} size={16} color={colors.accent} />
                <Text variant="h3" tabular numberOfLines={1} style={styles.ltr}>
                  {f.value}
                </Text>
                <Text variant="caption" color="muted" numberOfLines={1}>
                  {f.label}
                </Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.metaRow}>
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
            <Text variant="caption" color={attemptsLeft > 0 ? 'muted' : 'danger'} numberOfLines={2}>
              {attemptsLeft > 0 ? t('card.attemptsLeft', { left: attemptsLeft, total: exam.attemptsTotal }) : t('card.noAttempts')}
            </Text>
          </View>
          <View style={styles.best}>
            <Text variant="caption" color="muted" align="end" numberOfLines={1}>
              {t('card.bestScore')}
            </Text>
            {bestScore !== undefined ? (
              <Text variant="h2" color="accent" tabular align="end" style={styles.ltr}>
                {`${bestScore}%`}
              </Text>
            ) : (
              <Text variant="label" color="muted" align="end" numberOfLines={1}>
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
        />
      </Card>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  card: { overflow: 'hidden', padding: space.xl, paddingTop: space.xl + 4, gap: space.lg },
  accent: { position: 'absolute', top: 0, start: 0, end: 0, height: 4 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  iconWrap: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  ltr: { writingDirection: 'ltr' },
  facts: { flexDirection: 'row', borderRadius: radius.md, paddingVertical: space.md },
  factWrap: { flex: 1, flexDirection: 'row' },
  factDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch' },
  fact: { flex: 1, alignItems: 'center', gap: space.xxs, paddingHorizontal: space.xs },
  metaRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.md },
  dots: { flexDirection: 'row', gap: space.xs + 2, marginBottom: space.xs + 2 },
  dot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5 },
  best: { alignItems: 'flex-end', maxWidth: '50%' },
  draft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
    borderRadius: radius.md,
  },
});
