import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ProgressRing, Text } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { gradients, palette, radius, shadows, space } from '@/theme';

interface Props {
  unresolved: number;
  reviewed: number;
  mastered: number;
}

const STAT_COLORS = {
  unresolved: '#F87171',
  reviewed: '#60A5FA',
  mastered: '#4ADE80',
} as const;

/** Navy hero: total logged + mastery ring on top, three equal stat tiles underneath. */
export const MistakesHero = memo(function MistakesHero({ unresolved, reviewed, mastered }: Props) {
  const { t } = useI18n('mistakes');
  const total = unresolved + reviewed + mastered;
  const mastery = total ? Math.round((mastered / total) * 100) : 0;

  const stats = [
    { key: 'unresolved', value: unresolved },
    { key: 'reviewed', value: reviewed },
    { key: 'mastered', value: mastered },
  ] as const;

  return (
    <Animated.View entering={FadeInDown.duration(350)} style={[styles.shadow, shadows.lg]}>
      <View style={styles.card}>
        <LinearGradient
          colors={gradients.navy}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View style={styles.glow} pointerEvents="none" />

        <View style={styles.top}>
          <View style={styles.flex}>
            <Text variant="overline" color={palette.goldLight} numberOfLines={1}>
              {t('hero.overline')}
            </Text>
            <Text variant="display" color={palette.white} tabular numberOfLines={1} style={styles.total}>
              {total}
            </Text>
            <Text variant="caption" color="rgba(255,255,255,0.72)" numberOfLines={2}>
              {t('hero.totalLabel')}
            </Text>
          </View>
          <ProgressRing
            progress={mastery}
            size={84}
            strokeWidth={8}
            color={palette.gold}
            trackColor="rgba(255,255,255,0.14)"
          >
            <View style={styles.ringCenter}>
              <Text variant="h3" color={palette.white} tabular align="center">
                {`${mastery}%`}
              </Text>
              <Text variant="caption" color="rgba(255,255,255,0.7)" align="center" numberOfLines={1}>
                {t('hero.masteryLabel')}
              </Text>
            </View>
          </ProgressRing>
        </View>

        <View style={styles.stats}>
          {stats.map((s) => (
            <View
              key={s.key}
              style={styles.stat}
              accessible
              accessibilityLabel={`${t(`hero.${s.key}`)}: ${s.value}`}
            >
              <View style={styles.statHead}>
                <View style={[styles.dot, { backgroundColor: STAT_COLORS[s.key] }]} />
                <Text variant="h2" color={palette.white} tabular numberOfLines={1}>
                  {s.value}
                </Text>
              </View>
              <Text variant="caption" color="rgba(255,255,255,0.75)" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                {t(`hero.${s.key}`)}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  shadow: { borderRadius: radius.lg, backgroundColor: palette.navy },
  card: { borderRadius: radius.lg, overflow: 'hidden', padding: space.lg + 2, gap: space.lg },
  glow: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    top: -120,
    start: -70,
    backgroundColor: 'rgba(201,162,74,0.14)',
  },
  flex: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  total: { marginTop: space.xs },
  ringCenter: { alignItems: 'center', justifyContent: 'center', maxWidth: 68 },
  stats: { flexDirection: 'row', gap: space.sm },
  stat: {
    flex: 1,
    gap: space.xxs,
    paddingVertical: space.md,
    paddingHorizontal: space.sm + 2,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  statHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
