import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { asSubjectId, toExam } from '@/api/adapters';
import { useAvailableExams, useExamAttempts } from '@/api/exams';
import { openSubscription } from '@/api/locked';
import { ExamCard } from '@/components/exams/ExamCard';
import { Icon, SubjectIcon, type IconName } from '@/components/icons';
import { Header, Screen } from '@/components/layout';
import { BottomSheet, Button, Card, EmptyState, SectionHeader, SkeletonCard, Text } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { SCREEN_PADDING, gradients, palette, radius, shadows, space, subjectColors, useTheme } from '@/theme';
import { formatDate } from '@/utils/format';

const INTRO_BULLETS: { key: string; icon: IconName }[] = [
  { key: 'timer', icon: 'timer' },
  { key: 'autosave', icon: 'shield' },
  { key: 'attempts', icon: 'target' },
  { key: 'analysis', icon: 'chart' },
];

type Exam = ReturnType<typeof toExam>;

export default function ExamsScreen() {
  const { colors } = useTheme();
  const { t, L, lang } = useI18n('exams');
  const examsQuery = useAvailableExams();
  const attemptsQuery = useExamAttempts();
  const exams = useMemo(() => (examsQuery.data ?? []).map(toExam), [examsQuery.data]);
  const [selected, setSelected] = useState<Exam | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // In-progress attempts (server `activeAttempt`) as resume "drafts" keyed by exam id.
  const drafts = useMemo(() => {
    const out: Record<string, { endsAt: number }> = {};
    for (const e of exams) if (e.activeAttempt) out[e.id] = { endsAt: new Date(e.activeAttempt.endsAt).getTime() };
    return out;
  }, [exams]);
  const examById = useMemo(() => new Map(exams.map((e) => [e.id, e])), [exams]);

  // Keep "x left" on resume cards fresh — only tick while a paper is in progress.
  const hasDraft = Object.keys(drafts).length > 0;
  useEffect(() => {
    if (!hasDraft) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [hasDraft]);

  const examAttempts = useMemo(
    () => (attemptsQuery.data ?? []).filter((a) => a.status !== 'in_progress'),
    [attemptsQuery.data],
  );

  const onStart = useCallback((exam: Exam) => {
    if (exam.locked) openSubscription({ reason: 'SUBJECT_NOT_IN_PACKAGE', subjectSlug: exam.subjectId });
    else setSelected(exam);
  }, []);

  const selectedDraft = selected ? drafts[selected.id] : undefined;
  const selectedLeft = selected ? selected.attemptsLeft : 0;

  const begin = () => {
    if (!selected) return;
    const id = selected.id;
    setSelected(null);
    router.push({ pathname: '/exams/room/[id]', params: { id } });
  };

  return (
    <Screen padded={false} edges={['top']}>
      <Header title={t('title')} subtitle={t('subtitle')} />
      <ScrollView style={styles.flex} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Animated.View entering={FadeInDown.duration(350)} style={[styles.introShadow, shadows.lg]}>
        <LinearGradient colors={gradients.navy} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.intro}>
          <View style={[styles.introGlow, { backgroundColor: palette.gold }]} pointerEvents="none" />
          <View style={styles.introHead}>
            <View style={styles.introBadge}>
              <Icon name="exam" size={22} color={palette.navy} />
            </View>
            <View style={styles.flex}>
              <Text variant="overline" color={palette.goldLight}>
                {t('intro.overline')}
              </Text>
              <Text variant="h2" display color={palette.white}>
                {t('intro.title')}
              </Text>
            </View>
          </View>
          <Text variant="body" color="rgba(255,255,255,0.78)" style={styles.introBody}>
            {t('intro.body')}
          </Text>
          <View style={styles.bullets}>
            {INTRO_BULLETS.map((b) => (
              <View key={b.key} style={styles.bullet}>
                <View style={styles.bulletIcon}>
                  <Icon name={b.icon} size={14} color={palette.gold} />
                </View>
                <Text variant="label" color={palette.white} style={styles.flex}>
                  {t(`intro.bullets.${b.key}`)}
                </Text>
              </View>
            ))}
          </View>
        </LinearGradient>
      </Animated.View>

      <SectionHeader title={t('blueprints')} subtitle={t('blueprintsSub')} style={styles.section} />
      <View style={styles.list}>
        {examsQuery.isPending ? (
          <>
            <SkeletonCard lines={4} />
            <SkeletonCard lines={4} />
          </>
        ) : exams.length ? (
          exams.map((exam, i) => (
            <ExamCard
              key={exam.id}
              exam={exam}
              index={i}
              now={now}
              draft={drafts[exam.id]}
              attemptsLeft={exam.attemptsLeft}
              bestScore={exam.bestScore}
              onStart={() => onStart(exam)}
            />
          ))
        ) : (
          <EmptyState
            icon="exam"
            title={examsQuery.isError ? t('common:states.error') : t('notFound.title')}
            message={examsQuery.isError ? undefined : t('notFound.message')}
            actionLabel={examsQuery.isError ? t('common:actions.retry') : undefined}
            onAction={examsQuery.isError ? () => void examsQuery.refetch() : undefined}
          />
        )}
      </View>

      <SectionHeader title={t('previous')} subtitle={examAttempts.length ? t('previousSub') : undefined} style={styles.section} />
      {attemptsQuery.isPending ? (
        <View style={styles.list}>
          <SkeletonCard lines={2} />
        </View>
      ) : examAttempts.length ? (
        <View style={styles.list}>
          {examAttempts.map((a, i) => {
            const exam = examById.get(a.examId);
            const sid = asSubjectId(a.subjectSlug);
            const color = subjectColors[sid] ?? colors.accent;
            const passed = a.passed;
            return (
              <Animated.View key={a.id} entering={FadeInDown.duration(350).delay(Math.min(i * 60, 300))}>
                <Card
                  onPress={() => router.push({ pathname: '/exams/result/[id]', params: { id: a.id } })}
                  accessibilityRole="button"
                  style={styles.attempt}
                >
                  <View style={[styles.attemptIcon, { backgroundColor: `${color}1F` }]}>
                    <SubjectIcon subjectId={sid} size={20} color={color} />
                  </View>
                  <View style={styles.flex}>
                    <Text variant="bodyBold" numberOfLines={1}>
                      {a.title ? L(a.title) : exam ? L(exam.title) : t(`common:subjects.${sid}`)}
                    </Text>
                    <Text variant="caption" color="muted">
                      {t('attemptMeta', {
                        no: a.attemptNo,
                        date: formatDate(a.date, lang, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
                      })}
                    </Text>
                  </View>
                  <View style={[styles.scorePill, { backgroundColor: passed ? colors.successSoft : colors.dangerSoft }]}>
                    <Text variant="label" tabular color={passed ? colors.success : colors.danger}>
                      {`${a.score}%`}
                    </Text>
                  </View>
                  <Icon name="chevron" size={18} color={colors.muted} />
                </Card>
              </Animated.View>
            );
          })}
        </View>
      ) : (
        <EmptyState icon="history" title={t('noPrevious')} message={t('noPreviousMsg')} />
      )}

      </ScrollView>

      <BottomSheet
        visible={!!selected}
        onClose={() => setSelected(null)}
        title={selectedDraft ? t('card.resume') : t('rules.title')}
        footer={
          <View style={styles.sheetFooter}>
            <Button
              title={selectedDraft ? t('rules.continue') : t('rules.begin')}
              icon={selectedDraft ? 'play' : 'exam'}
              onPress={begin}
              fullWidth
            />
            <Button title={t('rules.cancel')} variant="ghost" onPress={() => setSelected(null)} fullWidth />
          </View>
        }
      >
        {selected ? (
          <View style={styles.sheetBody}>
            <Text variant="h3">{L(selected.title)}</Text>
            <Text variant="label" color="muted">
              {t('rules.subtitle', { questions: selected.questionCount, minutes: selected.durationMin, pass: selected.passMark })}
            </Text>
            {selectedDraft ? (
              <View style={[styles.note, { backgroundColor: colors.accentSoft }]}>
                <Icon name="history" size={18} color={colors.accent} />
                <Text variant="label" color="accent" style={styles.flex}>
                  {t('rules.resumeNote')}
                </Text>
              </View>
            ) : null}
            <View style={styles.rules}>
              {(
                [
                  { icon: 'timer', text: t('rules.timer') },
                  { icon: 'alert', text: t('rules.autoSubmit') },
                  { icon: 'shield', text: t('rules.leaving') },
                  ...(selectedDraft ? [] : [{ icon: 'target' as IconName, text: t('rules.attempt', { left: selectedLeft }) }]),
                ] satisfies { icon: IconName; text: string }[]
              ).map((r) => (
                <View key={r.text} style={styles.rule}>
                  <View style={[styles.ruleIcon, { backgroundColor: colors.surfaceMuted }]}>
                    <Icon name={r.icon} size={16} color={colors.accent} />
                  </View>
                  <Text variant="body" style={styles.flex}>
                    {r.text}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: SCREEN_PADDING, paddingTop: space.sm, paddingBottom: space.huge },
  introShadow: { borderRadius: radius.lg, backgroundColor: palette.navy },
  intro: {
    borderRadius: radius.lg,
    padding: space.xl,
    overflow: 'hidden',
  },
  introGlow: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    top: -120,
    end: -80,
    opacity: 0.16,
  },
  introHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  introBadge: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: palette.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  introBody: { marginTop: space.md },
  bullets: { marginTop: space.lg, gap: space.sm + 2 },
  bullet: { flexDirection: 'row', alignItems: 'center', gap: space.sm + 2 },
  bulletIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(201,162,74,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: { marginTop: space.xxl, marginBottom: space.md },
  list: { gap: space.md },
  attempt: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 76, paddingVertical: space.md },
  attemptIcon: { width: 44, height: 44, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  scorePill: { minWidth: 52, height: 28, paddingHorizontal: space.sm + 2, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  sheetBody: { gap: space.sm },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.sm,
    marginTop: space.sm,
  },
  rules: { gap: space.md, marginTop: space.md },
  rule: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  ruleIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  sheetFooter: { gap: space.sm },
});
