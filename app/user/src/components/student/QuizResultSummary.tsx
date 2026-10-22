import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { Icon, type IconName } from '@/components/icons';
import { Confetti, ProgressRing, Text } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { radius, shadows, space, useTheme } from '@/theme';
import { formatDuration } from '@/utils/format';
import { QUIZ_PASS_MARK, scoreBand } from '@/utils/quiz';

export interface QuizResultSummaryProps {
  /** 0–100 */
  score: number;
  correct: number;
  total: number;
  timeSpentSec?: number;
  passed: boolean;
  /** Overrides the band headline ("Outstanding!", "Well done!", "Keep going!"). */
  title?: string;
  /** Pass mark shown in the status pill (quiz rule `passThreshold`). */
  passMark?: number;
}

/** Animated score ring, band message and stat pills. Fires confetti when passed. */
export const QuizResultSummary = memo(function QuizResultSummary({
  score,
  correct,
  total,
  timeSpentSec,
  passed,
  title,
  passMark = QUIZ_PASS_MARK,
}: QuizResultSummaryProps) {
  const { colors } = useTheme();
  const { t } = useI18n('quiz');
  const band = scoreBand(score, passMark);
  const ringColor = passed ? colors.accent : colors.warning;
  const incorrect = Math.max(0, total - correct);

  const pills: { key: string; icon: IconName; color: string; bg: string; value: string; label: string }[] = [
    { key: 'c', icon: 'check-circle', color: colors.success, bg: colors.successSoft, value: String(correct), label: t('result.correct') },
    { key: 'i', icon: 'x-circle', color: colors.danger, bg: colors.dangerSoft, value: String(incorrect), label: t('result.incorrect') },
  ];
  if (timeSpentSec !== undefined) {
    pills.push({
      key: 't',
      icon: 'timer',
      color: colors.info,
      bg: colors.infoSoft,
      value: formatDuration(timeSpentSec),
      label: t('result.time'),
    });
  }

  return (
    <View style={styles.container}>
      <Animated.View
        entering={ZoomIn.duration(420).springify().damping(18).stiffness(220)}
        style={styles.ringWrap}
        accessible
        accessibilityRole="summary"
        accessibilityLabel={t('result.scoreA11y', { score, correct, total })}
      >
        <View style={[styles.halo, { backgroundColor: passed ? colors.accentSoft : colors.warningSoft }]} pointerEvents="none" />
        <View style={[styles.ringPlate, shadows.md, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <ProgressRing
            progress={score}
            size={RING}
            strokeWidth={14}
            color={passed ? undefined : ringColor}
            trackColor={colors.surfaceMuted}
          >
            <View style={styles.ringCenter}>
              <Text variant="display" display tabular align="center" style={styles.score}>
                {score}
                <Text variant="h3" color="muted">
                  %
                </Text>
              </Text>
              <Text variant="caption" color="muted" align="center" tabular>
                {correct}/{total}
              </Text>
            </View>
          </ProgressRing>
        </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(300).delay(200)} style={styles.headline}>
        <View
          style={[
            styles.statusPill,
            { backgroundColor: passed ? colors.accentSoft : colors.warningSoft },
          ]}
        >
          <Icon name={passed ? 'trophy' : 'target'} size={14} color={passed ? colors.accent : colors.warning} />
          <Text variant="label" color={passed ? colors.accent : colors.warning}>
            {passed ? t('result.passed') : t('result.notPassed')} · {t('result.passMark', { value: passMark })}
          </Text>
        </View>
        <Text variant="h1" display align="center">
          {title ?? t(`result.${band}.title`)}
        </Text>
        <Text variant="body" color="muted" align="center" style={styles.message}>
          {t(`result.${band}.message`)}
        </Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(300).delay(320)} style={styles.pills}>
        {pills.map((p) => (
          <View key={p.key} style={[styles.pill, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.pillIcon, { backgroundColor: p.bg }]}>
              <Icon name={p.icon} size={16} color={p.color} />
            </View>
            <View>
              <Text variant="bodyBold" tabular>
                {p.value}
              </Text>
              <Text variant="caption" color="muted">
                {p.label}
              </Text>
            </View>
          </View>
        ))}
      </Animated.View>

      <Confetti fire={passed} />
    </View>
  );
});

const RING = 168;
const PLATE = RING + 24;
const HALO = PLATE + 40;

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: space.xl },
  ringWrap: { width: HALO, height: HALO, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: HALO, height: HALO, borderRadius: HALO / 2 },
  ringPlate: {
    width: PLATE,
    height: PLATE,
    borderRadius: PLATE / 2,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringCenter: { alignItems: 'center', justifyContent: 'center' },
  score: { fontSize: 46, lineHeight: 54 },
  headline: { alignItems: 'center', gap: space.sm, paddingHorizontal: space.md },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
  },
  message: { maxWidth: 320 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space.sm },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
    paddingStart: space.sm,
    paddingEnd: space.lg,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    minWidth: 96,
  },
  pillIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
