import { LinearGradient } from 'expo-linear-gradient';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import { Icon, SubjectIcon } from '@/components/icons';
import { Button, PressableScale, Text } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import type { BillingCycle } from '@/store';
import { gradients, palette, radius, shadows, space, subjectColors, useTheme } from '@/theme';
import type { Package } from '@/types';
import { formatPrice } from '@/utils/format';
import { haptic } from '@/utils/haptics';
import { AnimatedPrice } from './AnimatedPrice';

interface PlanCardProps {
  pkg: Package;
  cycle: BillingCycle;
  isCurrent: boolean;
  index?: number;
  /** Legacy mode: a "Choose plan" button inside the card. */
  onChoose?: (pkg: Package) => void;
  /** Selectable mode (paywall with sticky CTA): the whole card is a radio option. */
  selected?: boolean;
  onSelect?: (pkg: Package) => void;
}

const RADIO = 24;

/** Radio indicator with spring-in dot. */
const Radio = memo(function Radio({ on }: { on: boolean }) {
  const { colors } = useTheme();
  const dot = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(on ? 1 : 0, { damping: 18, stiffness: 320 }) }],
    opacity: withTiming(on ? 1 : 0, { duration: 120 }),
  }));
  return (
    <View style={[styles.radio, { borderColor: on ? colors.accent : colors.border }]}>
      <Animated.View style={[styles.radioDot, { backgroundColor: colors.accent }, dot]} />
    </View>
  );
});

/** Subscription plan card: name, price, subjects and an aligned feature checklist. */
export const PlanCard = memo(function PlanCard({
  pkg,
  cycle,
  isCurrent,
  index = 0,
  onChoose,
  selected,
  onSelect,
}: PlanCardProps) {
  const { colors, isDark } = useTheme();
  const { t, L, lang } = useI18n('subscription');
  const selectable = !!onSelect;
  const on = selectable && !!selected;
  // Plans without a yearly option (`priceYearly` null → 0) always show the base plan.
  const yearly = cycle === 'yearly' && pkg.priceYearly > 0;
  const price = yearly ? pkg.priceYearly : pkg.priceMonthly;
  const fullYear = pkg.priceMonthly * 12;
  const perMonthEquivalent = Math.round(pkg.priceYearly / 12);
  const saving = fullYear - pkg.priceYearly;

  const borderColor = on ? colors.accent : colors.border;
  const content = (
    <>
      {pkg.popular || isCurrent ? (
        <View style={styles.tags}>
          {pkg.popular ? (
            <LinearGradient colors={gradients.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.popular}>
              <Icon name="star" size={11} color={palette.navy} filled />
              <Text variant="overline" color={palette.navy} numberOfLines={1}>
                {t('plans.popular')}
              </Text>
            </LinearGradient>
          ) : null}
          {isCurrent ? (
            <View style={[styles.currentTag, { backgroundColor: colors.successSoft }]}>
              <Icon name="check-circle" size={12} color={colors.success} />
              <Text variant="overline" color="success" numberOfLines={1}>
                {t('plans.currentPlan')}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.headRow}>
        <View style={[styles.iconBadge, { backgroundColor: pkg.popular ? colors.accentSoft : colors.surfaceMuted }]}>
          <Icon
            name={pkg.popular ? 'crown' : pkg.subjects.length >= 5 ? 'trophy' : 'book'}
            size={22}
            color={colors.accent}
            filled={!!pkg.popular}
          />
        </View>
        <View style={styles.headText}>
          <Text variant="h3" numberOfLines={1}>
            {L(pkg.name)}
          </Text>
          <Text variant="caption" color="muted" numberOfLines={2}>
            {L(pkg.tagline)}
          </Text>
        </View>
        {selectable ? <Radio on={on} /> : null}
      </View>

      <View style={styles.priceRow}>
        <AnimatedPrice value={price} variant="h1" color="ink" />
        <Text variant="bodyMedium" color="muted" style={styles.per}>
          {yearly ? t('plans.perYear') : t('plans.perMonth')}
        </Text>
      </View>
      {yearly ? (
        <View style={styles.yearlyRow}>
          <Text variant="caption" color="muted" style={styles.strike} tabular>
            {formatPrice(fullYear, lang)}
          </Text>
          <View style={[styles.savePill, { backgroundColor: colors.successSoft }]}>
            <Text variant="caption" color="success">
              {t('plans.save', { amount: formatPrice(saving, lang) })}
            </Text>
          </View>
          <Text variant="caption" color="muted">
            {t('plans.equivalent', { price: formatPrice(perMonthEquivalent, lang) })}
          </Text>
        </View>
      ) : (
        <Text variant="caption" color="muted" style={styles.billed}>
          {t('plans.billedMonthly')}
        </Text>
      )}

      <View style={styles.subjectsRow}>
        <View style={styles.subjectIcons}>
          {pkg.subjects.map((sid, i) => (
            <View
              key={sid}
              accessibilityLabel={t(`common:subjects.${sid}`)}
              style={[
                styles.subjectDot,
                {
                  backgroundColor: isDark ? colors.surfaceMuted : colors.surface,
                  borderColor: colors.surface,
                  marginStart: i === 0 ? 0 : -8,
                },
              ]}
            >
              <View style={[StyleSheet.absoluteFill, styles.subjectTint, { backgroundColor: `${subjectColors[sid]}22` }]} />
              <SubjectIcon subjectId={sid} size={15} color={subjectColors[sid]} />
            </View>
          ))}
        </View>
        <Text variant="caption" color="muted" style={styles.subjectNames} numberOfLines={2}>
          {pkg.subjects.map((sid) => t(`common:subjects.${sid}`)).join(' · ')}
        </Text>
      </View>

      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      <View style={styles.features}>
        {pkg.features.map((f, i) => (
          <View key={i} style={styles.featureRow}>
            <View style={[styles.check, { backgroundColor: on || pkg.popular ? colors.accent : colors.accentSoft }]}>
              <Icon name="check" size={11} color={on || pkg.popular ? palette.navy : colors.accent} strokeWidth={3} />
            </View>
            <Text variant="body" style={styles.featureText}>
              {L(f)}
            </Text>
          </View>
        ))}
      </View>

      {onChoose && !selectable ? (
        <Button
          title={isCurrent ? t('plans.currentPlan') : t('plans.choose')}
          variant={isCurrent ? 'outline' : pkg.popular ? 'primary' : 'secondary'}
          icon={isCurrent ? 'check-circle' : undefined}
          disabled={isCurrent}
          fullWidth
          onPress={() => onChoose(pkg)}
          accessibilityLabel={`${isCurrent ? t('plans.currentPlan') : t('plans.choose')} — ${L(pkg.name)}`}
          style={styles.cta}
        />
      ) : null}
    </>
  );

  return (
    <Animated.View entering={FadeInDown.duration(350).delay(Math.min(120 + index * 60, 300))}>
      {selectable ? (
        <PressableScale
          onPress={() => {
            if (!on) haptic.selection();
            onSelect?.(pkg);
          }}
          haptics={false}
          scaleTo={0.985}
          accessibilityRole="radio"
          accessibilityState={{ checked: on }}
          accessibilityLabel={`${L(pkg.name)}, ${formatPrice(price, lang)} ${yearly ? t('plans.perYear') : t('plans.perMonth')}`}
          style={[
            styles.card,
            on ? shadows.md : shadows.sm,
            {
              backgroundColor: colors.surface,
              borderColor,
              borderWidth: on ? 2 : StyleSheet.hairlineWidth,
              // keep content from shifting when the border thickens
              padding: on ? space.xl - 2 + StyleSheet.hairlineWidth : space.xl,
            },
          ]}
        >
          {content}
        </PressableScale>
      ) : (
        <View
          style={[
            styles.card,
            shadows.sm,
            {
              backgroundColor: colors.surface,
              borderColor: pkg.popular ? colors.accent : colors.border,
              borderWidth: pkg.popular ? 1.5 : StyleSheet.hairlineWidth,
              padding: space.xl,
            },
          ]}
        >
          {content}
        </View>
      )}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.md },
  popular: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: space.sm + 2,
    height: 24,
    borderRadius: radius.pill,
  },
  currentTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: space.sm + 2,
    height: 24,
    borderRadius: radius.pill,
  },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  headText: { flex: 1, minWidth: 0, gap: 2 },
  iconBadge: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  radio: {
    width: RADIO,
    height: RADIO,
    borderRadius: RADIO / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 12, height: 12, borderRadius: 6 },
  priceRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, marginTop: space.lg, flexWrap: 'wrap' },
  per: { flexShrink: 1, marginBottom: 5 },
  billed: { marginTop: space.xs },
  yearlyRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.sm, marginTop: space.xs },
  strike: { textDecorationLine: 'line-through' },
  savePill: { paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: radius.pill },
  subjectsRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.lg },
  subjectIcons: { flexDirection: 'row', alignItems: 'center' },
  subjectDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  subjectTint: { borderRadius: 15 },
  subjectNames: { flex: 1 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: space.lg },
  features: { gap: space.md - 2 },
  featureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  check: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  featureText: { flex: 1 },
  cta: { marginTop: space.xl },
});
