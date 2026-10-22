import { LinearGradient } from 'expo-linear-gradient';
import { memo, useEffect } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Icon, SubjectIcon } from '@/components/icons';
import { PressableScale, Text } from '@/components/ui';
import { useTutorSuggestions } from '@/api/tutor';
import { useI18n } from '@/hooks/useI18n';
import type { SubjectId } from '@/types';
import { gradients, palette, radius, SCREEN_PADDING, shadows, space, subjectColors, useTheme } from '@/theme';
import type { IconName } from '@/components/icons';

interface SuggestedPromptsProps {
  subjectId: SubjectId;
  onSelect: (text: string) => void;
  disabled?: boolean;
}

/** Hero illustration: gold sparkle orb with a slowly breathing halo. */
const Hero = memo(function Hero({ compact }: { compact: boolean }) {
  const { colors } = useTheme();
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(pulse);
  }, [pulse]);
  const halo = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse.value * 0.12 }],
    opacity: 0.55 - pulse.value * 0.3,
  }));
  return (
    <View style={[styles.hero, compact && styles.heroCompact]}>
      <Animated.View style={[styles.halo, { backgroundColor: colors.accentSoft }, halo]} />
      <View style={[styles.haloInner, { borderColor: colors.accent }]} />
      <LinearGradient colors={gradients.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.orb, shadows.gold]}>
        <Icon name="sparkles" size={40} color={palette.navy} strokeWidth={1.8} />
      </LinearGradient>
      <View style={[styles.spark, styles.sparkA]}>
        <Icon name="sparkles" size={16} color={colors.accent} />
      </View>
      <View style={[styles.spark, styles.sparkB]}>
        <Icon name="star" size={12} color={colors.accent} filled />
      </View>
    </View>
  );
});

const FEATURES: { icon: IconName; key: string }[] = [
  { icon: 'lesson', key: 'empty.featureSteps' },
  { icon: 'note', key: 'empty.featureFormulas' },
  { icon: 'image', key: 'empty.featurePhotos' },
];

/** Empty conversation state: hero + subject-specific suggested prompts that send on tap. */
export const SuggestedPrompts = memo(function SuggestedPrompts({ subjectId, onSelect, disabled }: SuggestedPromptsProps) {
  const { colors } = useTheme();
  const { t, L } = useI18n('tutor');
  const color = subjectColors[subjectId];
  const { data: suggestions } = useTutorSuggestions(subjectId);
  const prompts = suggestions ?? [];
  const { width } = useWindowDimensions();
  // Even grid: two columns from the window width (one column on very narrow screens).
  const inner = width - SCREEN_PADDING * 2;
  const cols = inner >= 270 ? 2 : 1;
  const cardWidth = Math.floor((inner - GRID_GAP * (cols - 1)) / cols);
  const compactHero = width < 360;

  return (
    <View style={styles.container}>
      <Animated.View entering={FadeInDown.duration(320)} style={styles.center}>
        <Hero compact={compactHero} />
        <View style={[styles.badge, { backgroundColor: colors.accentSoft }]}>
          <Text variant="overline" color="accent">
            {t('empty.badge')}
          </Text>
        </View>
        <Text variant="h1" display align="center">
          {t('empty.title')}
        </Text>
        <Text variant="body" color="muted" align="center" style={styles.subtitle}>
          {t('empty.subtitle')}
        </Text>
        <View style={styles.features}>
          {FEATURES.map((f) => (
            <View key={f.key} style={[styles.feature, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <Icon name={f.icon} size={14} color={colors.accent} />
              <Text variant="caption" color="ink">
                {t(f.key)}
              </Text>
            </View>
          ))}
        </View>
      </Animated.View>

      <View style={styles.sectionHead}>
        <View style={[styles.rule, { backgroundColor: colors.border }]} />
        <Text variant="overline" color="accent">
          {t('empty.tryAsking')}
        </Text>
        <View style={[styles.rule, { backgroundColor: colors.border }]} />
      </View>
      <View style={styles.grid}>
        {prompts.map((p, i) => {
          const label = L(p);
          return (
            <Animated.View
              key={`${subjectId}-${i}`}
              entering={FadeInDown.duration(300).delay(Math.min(120 + i * 60, 300))}
              style={{ width: cardWidth }}
            >
              <PressableScale
                onPress={() => onSelect(label)}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityLabel={label}
                style={[styles.card, shadows.sm, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <View style={styles.cardTop}>
                  <View style={[styles.cardIcon, { backgroundColor: `${color}1F` }]}>
                    <SubjectIcon subjectId={subjectId} size={18} color={color} />
                  </View>
                  <View style={[styles.cardArrow, { backgroundColor: colors.accentSoft }]}>
                    <Icon name="arrow" size={14} color={colors.accent} />
                  </View>
                </View>
                <Text variant="bodyMedium" numberOfLines={4}>
                  {label}
                </Text>
              </PressableScale>
            </Animated.View>
          );
        })}
      </View>
    </View>
  );
});

const ORB = 88;
const GRID_GAP = space.md;

const styles = StyleSheet.create({
  container: { gap: space.md },
  center: { alignItems: 'center', gap: space.md },
  hero: { width: 150, height: 150, alignItems: 'center', justifyContent: 'center', marginBottom: space.xs },
  heroCompact: { transform: [{ scale: 0.82 }], marginVertical: -12 },
  halo: { position: 'absolute', width: 150, height: 150, borderRadius: 75 },
  haloInner: {
    position: 'absolute',
    width: 118,
    height: 118,
    borderRadius: 59,
    borderWidth: 1,
    borderStyle: 'dashed',
    opacity: 0.5,
  },
  orb: { width: ORB, height: ORB, borderRadius: ORB / 2, alignItems: 'center', justifyContent: 'center' },
  spark: { position: 'absolute' },
  sparkA: { top: 10, end: 18 },
  sparkB: { bottom: 18, start: 16 },
  badge: { paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: radius.pill },
  subtitle: { maxWidth: 340 },
  features: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space.sm, marginTop: space.xs },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.xl },
  rule: { flex: 1, height: StyleSheet.hairlineWidth },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP, alignItems: 'stretch' },
  card: {
    flex: 1,
    gap: space.md,
    minHeight: 120,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  cardArrow: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
