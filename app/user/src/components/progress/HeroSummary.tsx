import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon, type IconName } from '@/components/icons';
import { ProgressRing, Text } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { gradients, palette, radius, shadows, space } from '@/theme';
import { formatNumber } from '@/utils/format';

interface HeroSummaryProps {
  completion: number;
  streak: number;
  activeDays: number;
  hours: number;
  lessonsDone: number;
}

const ON_NAVY_MUTED = 'rgba(255,255,255,0.68)';

/** Navy gradient summary card: overall completion ring + key study stats. */
export const HeroSummary = memo(function HeroSummary({ completion, streak, activeDays, hours, lessonsDone }: HeroSummaryProps) {
  const { t, lang } = useI18n('progress');

  const stats: { icon: IconName; value: string; label: string }[] = [
    { icon: 'flame', value: formatNumber(streak, lang), label: t('hero.streak') },
    { icon: 'calendar', value: formatNumber(activeDays, lang), label: t('hero.activeDays') },
    { icon: 'clock', value: formatNumber(hours, lang), label: t('hero.hours') },
  ];

  return (
    <View style={[styles.shadow, shadows.lg]}>
      <LinearGradient colors={gradients.navy} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
        {/* Decorative gold glow */}
        <View pointerEvents="none" style={styles.glow} />
        <View pointerEvents="none" style={styles.glowSmall} />

        <View style={styles.top}>
          <ProgressRing
            progress={completion}
            size={112}
            strokeWidth={10}
            color={palette.gold}
            trackColor="rgba(255,255,255,0.12)"
            label=""
          >
            <View style={styles.ringCenter}>
              <Text variant="h1" display color={palette.white} tabular align="center">
                {`${completion}%`}
              </Text>
              <Text variant="caption" color={palette.goldLight} align="center" numberOfLines={1}>
                {t('hero.overall')}
              </Text>
            </View>
          </ProgressRing>

          <View style={styles.flex}>
            <Text variant="overline" color={palette.goldLight}>
              {t('hero.eyebrow')}
            </Text>
            <Text variant="h3" color={palette.white} style={styles.headline}>
              {t('hero.headline', { value: completion })}
            </Text>
            <View style={styles.pill}>
              <Icon name="check-circle" size={14} color={palette.goldLight} />
              <Text variant="caption" color={palette.white} numberOfLines={1}>
                {t('hero.lessonsDone', { value: lessonsDone })}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.stats}>
          {stats.map((s, i) => (
            <View key={s.icon} style={[styles.stat, i > 0 && styles.statBorder]}>
              <View style={styles.statIcon}>
                <Icon name={s.icon} size={16} color={palette.gold} filled={s.icon === 'flame'} />
              </View>
              <Text variant="h2" display color={palette.white} tabular align="center">
                {s.value}
              </Text>
              <Text variant="caption" color={ON_NAVY_MUTED} align="center" numberOfLines={1}>
                {s.label}
              </Text>
            </View>
          ))}
        </View>
      </LinearGradient>
    </View>
  );
});

const styles = StyleSheet.create({
  shadow: { borderRadius: radius.xl },
  card: { borderRadius: radius.xl, padding: space.xl, overflow: 'hidden' },
  glow: {
    position: 'absolute',
    top: -80,
    end: -60,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(201,162,74,0.16)',
  },
  glowSmall: {
    position: 'absolute',
    bottom: -50,
    start: -40,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(201,162,74,0.08)',
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  flex: { flex: 1, gap: space.xs },
  ringCenter: { alignItems: 'center', justifyContent: 'center' },
  headline: { marginBottom: space.xs },
  pill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.16)', marginVertical: space.lg },
  stats: { flexDirection: 'row' },
  stat: { flex: 1, alignItems: 'center', gap: 2, paddingHorizontal: space.xs },
  statBorder: { borderStartWidth: StyleSheet.hairlineWidth, borderStartColor: 'rgba(255,255,255,0.16)' },
  statIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(201,162,74,0.16)',
    marginBottom: space.xs,
  },
});
