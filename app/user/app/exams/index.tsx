import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ExamCard } from '@/components/exams/ExamCard';
import { attemptsRemaining } from '@/components/exams/examUtils';
import { Icon, SubjectIcon, type IconName } from '@/components/icons';
import { Header, Screen } from '@/components/layout';
import { BottomSheet, Button, Card, EmptyState, SectionHeader, Text } from '@/components/ui';
import { exams, getExam } from '@/data';
import { useI18n } from '@/hooks/useI18n';
import { useProgressStore } from '@/store';
import { gradients, palette, radius, shadows, space, subjectColors, useTheme } from '@/theme';
import type { ExamBlueprint } from '@/types';
import { formatDate } from '@/utils/format';

const INTRO_BULLETS: { key: string; icon: IconName }[] = [
  { key: 'timer', icon: 'timer' },
  { key: 'autosave', icon: 'shield' },
  { key: 'attempts', icon: 'target' },
  { key: 'analysis', icon: 'chart' },
];

export default function ExamsScreen() {
  const { colors } = useTheme();
  const { t, L, lang } = useI18n('exams');
  const attempts = useProgressStore((s) => s.attempts);
  const drafts = useProgressStore((s) => s.examDrafts);
  const used = useProgressStore((s) => s.examAttemptsUsed);
  const [selected, setSelected] = useState<ExamBlueprint | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Keep "x left" on resume cards fresh.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const examAttempts = useMemo(() => attempts.filter((a) => a.kind === 'exam'), [attempts]);

  const bestFor = useCallback(
    (exam: ExamBlueprint) => {
      const scores = examAttempts.filter((a) => a.refId === exam.id).map((a) => a.score);
      if (exam.bestScore !== undefined) scores.push(exam.bestScore);
      return scores.length ? Math.max(...scores) : undefined;
    },
    [examAttempts],
  );

  const selectedDraft = selected ? drafts[selected.id] : undefined;
  const selectedLeft = selected ? attemptsRemaining(selected, used[selected.id]) : 0;

  const begin = () => {
    if (!selected) return;
    const id = selected.id;
    setSelected(null);
    router.push({ pathname: '/exams/room/[id]', params: { id } });
  };

  return (
    <Screen scroll padded edges={['top', 'bottom']}>
      <Header title={t('title')} subtitle={t('subtitle')} />

      <Animated.View entering={FadeInDown.duration(320)}>
        <LinearGradient colors={gradients.navy} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.intro, shadows.lg]}>
          <View style={[styles.introGlow, { backgroundColor: palette.gold }]} />
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
        {exams.map((exam, i) => (
          <ExamCard
            key={exam.id}
            exam={exam}
            index={i}
            now={now}
            draft={drafts[exam.id]}
            attemptsLeft={attemptsRemaining(exam, used[exam.id])}
            bestScore={bestFor(exam)}
            onStart={() => setSelected(exam)}
          />
        ))}
      </View>

      <SectionHeader title={t('previous')} subtitle={examAttempts.length ? t('previousSub') : undefined} style={styles.section} />
      {examAttempts.length ? (
        <View style={styles.list}>
          {examAttempts.map((a, i) => {
            const exam = getExam(a.refId);
            const sid = exam?.subjectId ?? a.subjectId ?? 'math';
            const color = subjectColors[sid];
            const passed = a.score >= (exam?.passMark ?? 50);
            return (
              <Animated.View key={a.id} entering={FadeInDown.duration(260).delay(i * 40)}>
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
                      {exam ? L(exam.title) : t(`common:subjects.${sid}`)}
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

      <View style={styles.bottomSpace} />

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
  intro: {
    borderRadius: radius.xl,
    padding: space.xl,
    marginTop: space.sm,
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
  attempt: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  attemptIcon: { width: 40, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  scorePill: { paddingHorizontal: space.sm + 2, paddingVertical: space.xs, borderRadius: radius.pill },
  bottomSpace: { height: space.xxxl },
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
