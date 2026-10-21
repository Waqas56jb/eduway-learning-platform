import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ProgressRing, Text } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { gradients, palette, radius, shadows, space, useTheme } from '@/theme';

interface Props {
  unresolved: number;
  reviewed: number;
  mastered: number;
}

/** Navy hero card: mistake counts with colored dots + mastery ring. */
export const MistakesHero = memo(function MistakesHero({ unresolved, reviewed, mastered }: Props) {
  const { t } = useI18n('mistakes');
  const { colors } = useTheme();
  const total = unresolved + reviewed + mastered;
  const mastery = total ? Math.round((mastered / total) * 100) : 0;

  const stats = [
    { key: 'unresolved', value: unresolved, color: colors.danger },
    { key: 'reviewed', value: reviewed, color: colors.info },
    { key: 'mastered', value: mastered, color: colors.success },
  ] as const;

  return (
    <Animated.View entering={FadeInDown.duration(300)} style={[styles.wrap, shadows.md]}>
      <LinearGradient colors={gradients.navy} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.gradient}>
        <View style={styles.left}>
          <Text variant="overline" color={palette.goldLight}>
            {t('hero.overline')}
          </Text>
          <Text variant="caption" color="rgba(255,255,255,0.7)">
            {t('hero.total', { count: total })}
          </Text>
          <View style={styles.stats}>
            {stats.map((s) => (
              <View key={s.key} style={styles.stat} accessible accessibilityLabel={`${t(`hero.${s.key}`)}: ${s.value}`}>
                <Text variant="h2" color={palette.white} tabular>
                  {s.value}
                </Text>
                <View style={styles.statLabel}>
                  <View style={[styles.dot, { backgroundColor: s.color }]} />
                  <Text variant="caption" color="rgba(255,255,255,0.78)" numberOfLines={1} style={styles.shrink}>
                    {t(`hero.${s.key}`)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>
        <ProgressRing
          progress={mastery}
          size={88}
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
      </LinearGradient>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  wrap: { borderRadius: radius.lg },
  gradient: {
    borderRadius: radius.lg,
    padding: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    overflow: 'hidden',
  },
  left: { flex: 1, gap: space.xs },
  stats: { flexDirection: 'row', gap: space.md, marginTop: space.sm },
  stat: { flex: 1, gap: space.xxs },
  statLabel: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  dot: { width: 8, height: 8, borderRadius: 4 },
  shrink: { flexShrink: 1 },
  ringCenter: { alignItems: 'center', justifyContent: 'center', maxWidth: 72 },
});
