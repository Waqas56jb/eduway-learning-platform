import { forwardRef, type ComponentRef } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Logo } from '@/components/icons';
import { Text } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { gradients, palette, radius, space } from '@/theme';

export interface ShareScoreCardProps {
  studentName: string;
  examTitle: string;
  subjectLabel: string;
  score: number;
  passed: boolean;
  dateLabel: string;
}

/** Branded navy/gold card captured with react-native-view-shot for sharing. Brand colors only (theme independent). */
export const ShareScoreCard = forwardRef<ComponentRef<typeof View>, ShareScoreCardProps>(function ShareScoreCard(
  { studentName, examTitle, subjectLabel, score, passed, dateLabel },
  ref,
) {
  const { t } = useI18n('exams');
  const { width } = useWindowDimensions();
  const narrow = width < 375;
  // Score disc scales with the screen so the meta column keeps room at 320pt.
  const disc = narrow ? 92 : 112;
  return (
    <View ref={ref} collapsable={false} style={styles.shell}>
      <LinearGradient
        colors={gradients.navy}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.card, narrow && styles.cardNarrow]}
      >
        <View style={styles.glow} pointerEvents="none" />
        <View style={styles.glowSmall} pointerEvents="none" />
        <View style={styles.top}>
          <Logo size={40} variant="gold" withWordmark />
          <Text variant="caption" color="rgba(255,255,255,0.6)">
            {dateLabel}
          </Text>
        </View>

        <Text variant="overline" color={palette.goldLight} style={styles.overline}>
          {t('result.card.overline')}
        </Text>
        <Text variant="h2" display color={palette.white} numberOfLines={2}>
          {examTitle}
        </Text>
        <Text variant="label" color="rgba(255,255,255,0.7)">
          {subjectLabel}
        </Text>

        <View style={[styles.scoreRow, narrow && styles.scoreRowNarrow]}>
          <View style={[styles.scoreCircle, { width: disc, height: disc, borderRadius: disc / 2 }]}>
            <Text
              variant={narrow ? 'h1' : 'display'}
              display
              color={palette.navy}
              tabular
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
              style={styles.scoreText}
            >
              {`${score}%`}
            </Text>
          </View>
          <View style={styles.meta}>
            <Text variant="caption" color="rgba(255,255,255,0.6)">
              {t('result.card.student')}
            </Text>
            <Text variant="bodyBold" color={palette.white} numberOfLines={1}>
              {studentName}
            </Text>
            <Text variant="caption" color="rgba(255,255,255,0.6)" style={styles.metaGap}>
              {t('result.card.status')}
            </Text>
            <View style={[styles.status, { backgroundColor: passed ? 'rgba(34,197,94,0.18)' : 'rgba(245,158,11,0.18)' }]}>
              <Text variant="label" color={passed ? '#4ADE80' : '#FBBF24'}>
                {passed ? t('result.passed') : t('result.failed')}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.footer}>
          <View style={styles.footerLine} />
          <Text variant="caption" color={palette.gold}>
            {t('result.card.footer')}
          </Text>
          <View style={styles.footerLine} />
        </View>
      </LinearGradient>
    </View>
  );
});

const styles = StyleSheet.create({
  shell: { borderRadius: radius.xl, overflow: 'hidden' },
  card: { padding: space.xxl, overflow: 'hidden' },
  cardNarrow: { padding: space.xl },
  glow: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    top: -140,
    end: -100,
    backgroundColor: palette.gold,
    opacity: 0.14,
  },
  glowSmall: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    bottom: -70,
    start: -50,
    backgroundColor: palette.gold,
    opacity: 0.08,
  },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  overline: { marginTop: space.xl, marginBottom: space.xs },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: space.xl, marginTop: space.xl },
  scoreRowNarrow: { gap: space.lg },
  scoreCircle: {
    paddingHorizontal: space.sm,
    backgroundColor: palette.gold,
    borderWidth: 4,
    borderColor: palette.goldLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreText: { writingDirection: 'ltr' },
  meta: { flex: 1 },
  metaGap: { marginTop: space.sm },
  status: { alignSelf: 'flex-start', paddingHorizontal: space.sm + 2, paddingVertical: 3, borderRadius: radius.pill, marginTop: 2 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.xl },
  footerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(201,162,74,0.5)' },
});
