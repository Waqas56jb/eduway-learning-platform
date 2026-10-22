import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Icon, type IconName } from '@/components/icons';
import { Badge, Button, Card, Dialog, EmptyState, SkeletonCard, Text } from '@/components/ui';
import { toExam, useSubjectExams } from '@/api';
import { openSubscription } from '@/api/locked';
import { useI18n } from '@/hooks/useI18n';
import { radius, space, subjectColors, useTheme } from '@/theme';
import type { ExamBlueprint, Subject } from '@/types';

export interface ExamsTabProps {
  subject: Subject;
  locked: boolean;
}

export function ExamsTab({ subject, locked }: ExamsTabProps) {
  const { t, L } = useI18n(['subjects', 'common']);
  const { data, isLoading } = useSubjectExams(subject.id);
  const list = useMemo(() => (data ?? []).map(toExam), [data]);
  const [pending, setPending] = useState<ExamBlueprint | null>(null);

  if (isLoading) return <SkeletonCard lines={3} />;

  if (!list.length) {
    return (
      <EmptyState
        icon="exam"
        title={t('subjects:exams.emptyTitle')}
        message={t('subjects:exams.emptyMessage')}
        actionLabel={t('subjects:exams.emptyAction')}
        onAction={() => router.push('/question-bank')}
      />
    );
  }

  const confirm = () => {
    const exam = pending;
    setPending(null);
    if (exam) router.push({ pathname: '/exams/room/[id]', params: { id: exam.id } });
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text variant="h3">{t('subjects:exams.title')}</Text>
        <Text variant="caption" color="muted">
          {t('subjects:exams.subtitle')}
        </Text>
      </View>
      {list.map((exam, i) => (
        <Animated.View key={exam.id} entering={FadeInDown.duration(350).delay(Math.min(i * 60, 300))}>
          <ExamCard
            exam={exam}
            left={Math.max(0, exam.attemptsLeft)}
            locked={locked || exam.locked}
            onStart={() =>
              locked || exam.locked
                ? openSubscription({ reason: 'NO_SUBSCRIPTION', subjectSlug: subject.id })
                : setPending(exam)
            }
          />
        </Animated.View>
      ))}

      <Dialog
        visible={!!pending}
        onClose={() => setPending(null)}
        icon="exam"
        title={t('subjects:exams.confirmTitle')}
        message={
          pending
            ? t('subjects:exams.confirmMessage', {
                title: L(pending.title),
                count: pending.questionCount,
                minutes: pending.durationMin,
              })
            : ''
        }
        primaryLabel={t('subjects:exams.confirmPrimary')}
        onPrimary={confirm}
        secondaryLabel={t('common:actions.cancel')}
        onSecondary={() => setPending(null)}
      />
    </View>
  );
}

function ExamCard({ exam, left, locked, onStart }: { exam: ExamBlueprint; left: number; locked: boolean; onStart: () => void }) {
  const { colors } = useTheme();
  const { t, L } = useI18n(['subjects', 'common']);
  const color = subjectColors[exam.subjectId] ?? colors.accent;
  const exhausted = left <= 0;

  return (
    <Card style={styles.card}>
      <View style={[styles.accent, { backgroundColor: color }]} />
      <View style={styles.top}>
        <View style={[styles.icon, { backgroundColor: `${color}1A` }]}>
          <Icon name="exam" size={22} color={color} />
        </View>
        <View style={styles.flex}>
          <Text variant="bodyBold" numberOfLines={2}>
            {L(exam.title)}
          </Text>
          <Text variant="caption" color="muted" numberOfLines={2}>
            {L(exam.description)}
          </Text>
        </View>
      </View>

      <View style={styles.metaRow}>
        <Meta icon="question-bank" label={t('common:units.questions', { count: exam.questionCount })} color={colors.muted} />
        <Meta icon="timer" label={t('common:units.min', { count: exam.durationMin })} color={colors.muted} />
        <Meta icon="refresh" label={t('subjects:exams.attempts', { left, total: exam.attemptsTotal })} color={colors.muted} />
      </View>

      <View style={styles.badges}>
        {exam.bestScore != null ? (
          <Badge label={t('subjects:exams.best', { score: exam.bestScore })} tone="gold" icon="trophy" size="sm" />
        ) : null}
        <Badge label={t('subjects:exams.passMark', { value: exam.passMark })} tone="neutral" size="sm" />
      </View>

      <Button
        title={locked ? t('common:premium.unlock') : exhausted ? t('subjects:exams.noAttempts') : t('subjects:exams.start')}
        icon={locked ? 'lock' : 'play'}
        variant={locked ? 'secondary' : 'outline'}
        size="md"
        fullWidth
        disabled={!locked && exhausted}
        onPress={onStart}
      />
    </Card>
  );
}

function Meta({ icon, label, color }: { icon: IconName; label: string; color: string }) {
  return (
    <View style={styles.meta}>
      <Icon name={icon} size={14} color={color} />
      <Text variant="caption" color="muted">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  wrap: { gap: space.md },
  head: { gap: 2 },
  card: { gap: space.md, overflow: 'hidden' },
  accent: { position: 'absolute', top: 0, start: 0, end: 0, height: 3 },
  top: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  icon: { width: 44, height: 44, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.lg, rowGap: space.xs },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
