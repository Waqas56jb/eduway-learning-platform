import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Icon } from '@/components/icons';
import { Button, Card, PressableScale, ProgressBar, SectionHeader, Text } from '@/components/ui';
import { questionsBySubject } from '@/data';
import { useI18n } from '@/hooks/useI18n';
import { radius, space, subjectColors, useTheme } from '@/theme';
import type { Difficulty, Subject } from '@/types';
import { formatNumber } from '@/utils/format';

export interface QuestionBankTabProps {
  subject: Subject;
  locked: boolean;
}

const DIFFS: Difficulty[] = ['easy', 'medium', 'hard'];

export function QuestionBankTab({ subject, locked }: QuestionBankTabProps) {
  const { colors } = useTheme();
  const { t, L, lang } = useI18n(['subjects', 'common']);
  const color = subjectColors[subject.id];
  const qs = useMemo(() => questionsBySubject(subject.id), [subject.id]);

  const byDiff = useMemo(() => {
    const c: Record<Difficulty, number> = { easy: 0, medium: 0, hard: 0 };
    for (const q of qs) c[q.difficulty] += 1;
    return c;
  }, [qs]);

  const byUnit = useMemo(() => {
    const c: Record<string, number> = {};
    for (const q of qs) c[q.unitId] = (c[q.unitId] ?? 0) + 1;
    return c;
  }, [qs]);
  const maxUnit = Math.max(1, ...Object.values(byUnit));

  const diffColor: Record<Difficulty, { fg: string; bg: string }> = {
    easy: { fg: colors.success, bg: colors.successSoft },
    medium: { fg: colors.warning, bg: colors.warningSoft },
    hard: { fg: colors.danger, bg: colors.dangerSoft },
  };

  const startPractice = (unitId?: string) => {
    if (locked) return router.push('/subscription');
    router.push({
      pathname: '/question-bank/practice-session',
      params: unitId ? { subjectId: subject.id, unitId, count: '10' } : { subjectId: subject.id, count: '10' },
    });
  };

  return (
    <View style={styles.wrap}>
      <Animated.View entering={FadeInDown.duration(260)}>
        <Card padded={false} style={styles.hero}>
          <View style={[styles.heroIcon, { backgroundColor: `${color}1F` }]}>
            <Icon name="question-bank" size={26} color={color} />
          </View>
          <View style={styles.flex}>
            <Text variant="h3">{t('subjects:bank.title')}</Text>
            <Text variant="caption" color="muted">
              {t('subjects:bank.subtitle', { count: formatNumber(subject.questionsCount, lang) })}
            </Text>
          </View>
        </Card>
      </Animated.View>

      <SectionHeader title={t('subjects:bank.byDifficulty')} />
      <Animated.View entering={FadeInDown.duration(260).delay(60)} style={styles.diffRow}>
        {DIFFS.map((d) => (
          <View key={d} style={[styles.diffTile, { backgroundColor: diffColor[d].bg }]}>
            <Text variant="h2" color={diffColor[d].fg} tabular>
              {formatNumber(byDiff[d], lang)}
            </Text>
            <Text variant="label" color={diffColor[d].fg}>
              {t(`common:difficulty.${d}`)}
            </Text>
          </View>
        ))}
      </Animated.View>

      <SectionHeader
        title={t('subjects:bank.byUnit')}
        actionLabel={t('subjects:bank.browse')}
        onAction={() => router.push('/question-bank')}
      />
      <Animated.View entering={FadeInDown.duration(260).delay(120)}>
        <Card padded={false}>
          {subject.units.map((unit, i) => {
            const n = byUnit[unit.id] ?? 0;
            return (
              <PressableScale
                key={unit.id}
                onPress={() => startPractice(unit.id)}
                scaleTo={0.99}
                accessibilityLabel={`${L(unit.title)}, ${t('subjects:bank.practiceUnit')}`}
                style={[
                  styles.unitRow,
                  i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
                ]}
              >
                <View style={[styles.unitNum, { backgroundColor: `${color}1A` }]}>
                  <Text variant="label" color={color} tabular>
                    {i + 1}
                  </Text>
                </View>
                <View style={styles.unitBody}>
                  <View style={styles.unitTop}>
                    <Text variant="bodyMedium" numberOfLines={1} style={styles.flex}>
                      {L(unit.title)}
                    </Text>
                    <Text variant="label" color="muted" tabular>
                      {t('subjects:bank.unitCount', { count: n })}
                    </Text>
                  </View>
                  <ProgressBar progress={(n / maxUnit) * 100} height={4} color={color} />
                </View>
                <Icon name={locked ? 'lock' : 'chevron'} size={18} color={colors.muted} />
              </PressableScale>
            );
          })}
        </Card>
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(260).delay(180)} style={styles.cta}>
        <Button
          title={locked ? t('common:premium.unlock') : t('subjects:bank.start')}
          icon={locked ? 'lock' : 'target'}
          variant={locked ? 'secondary' : 'primary'}
          fullWidth
          onPress={() => startPractice()}
        />
        {!locked ? (
          <Text variant="caption" color="muted" align="center">
            {t('subjects:bank.startHint')}
          </Text>
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  wrap: { gap: space.md },
  hero: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
  heroIcon: { width: 52, height: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  diffRow: { flexDirection: 'row', gap: space.sm },
  diffTile: { flex: 1, borderRadius: radius.md, paddingVertical: space.md, alignItems: 'center', gap: 2 },
  unitRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, minHeight: 64 },
  unitNum: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  unitBody: { flex: 1, gap: space.sm },
  unitTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  cta: { gap: space.sm, marginTop: space.sm },
});
