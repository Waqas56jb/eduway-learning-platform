import { LinearGradient } from 'expo-linear-gradient';
import { memo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
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
import { tutorSuggestions } from '@/data';
import { useI18n } from '@/hooks/useI18n';
import type { SubjectId } from '@/types';
import { gradients, palette, radius, shadows, space, subjectColors, useTheme } from '@/theme';
import type { IconName } from '@/components/icons';

interface SuggestedPromptsProps {
  subjectId: SubjectId;
  onSelect: (text: string) => void;
  disabled?: boolean;
}

/** Hero illustration: gold sparkle orb with a slowly breathing halo. */
const Hero = memo(function Hero() {
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
    <View style={styles.hero}>
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
  const prompts = tutorSuggestions[subjectId];

  return (
    <View style={styles.container}>
      <Animated.View entering={FadeInDown.duration(320)} style={styles.center}>
        <Hero />
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

      <Text variant="overline" color="muted" style={styles.sectionTitle}>
        {t('empty.tryAsking')}
      </Text>
      <View style={styles.list}>
        {prompts.map((p, i) => {
          const label = L(p);
          return (
            <Animated.View key={`${subjectId}-${i}`} entering={FadeInDown.duration(280).delay(120 + i * 60)}>
              <PressableScale
                onPress={() => onSelect(label)}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityLabel={label}
                style={[
                  styles.card,
                  shadows.sm,
                  { backgroundColor: colors.surface, borderColor: colors.border, opacity: disabled ? 0.5 : 1 },
                ]}
              >
                <View style={[styles.cardIcon, { backgroundColor: `${color}1F` }]}>
                  <SubjectIcon subjectId={subjectId} size={18} color={color} />
                </View>
                <Text variant="bodyMedium" style={styles.cardText}>
                  {label}
                </Text>
                <Icon name="arrow" size={18} color={colors.accent} />
              </PressableScale>
            </Animated.View>
          );
        })}
      </View>
    </View>
  );
});

const ORB = 88;

const styles = StyleSheet.create({
  container: { gap: space.md },
  center: { alignItems: 'center', gap: space.md, paddingTop: space.lg },
  hero: { width: 150, height: 150, alignItems: 'center', justifyContent: 'center', marginBottom: space.xs },
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
  sectionTitle: { marginTop: space.lg },
  list: { gap: space.sm },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 60,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  cardIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  cardText: { flex: 1 },
});
