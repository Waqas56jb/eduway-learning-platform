import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/icons';
import { Header, Screen } from '@/components/layout';
import {
  ComparisonTable,
  CurrentPlanCard,
  FaqAccordion,
  PlanCard,
  TrustRow,
  yearlySavingPercent,
} from '@/components/subscription';
import { toPackage } from '@/api/adapters';
import { useMySubscription, usePackages } from '@/api/payments';
import { Button, EmptyState, PressableScale, SectionHeader, SegmentedControl, SkeletonCard, Text } from '@/components/ui';
import { BLURHASH, images } from '@/constants/images';
import { useI18n } from '@/hooks/useI18n';
import { useAuthStore, type BillingCycle } from '@/store';
import { gradients, palette, radius, SCREEN_PADDING, shadows, space, useTheme } from '@/theme';
import type { Package } from '@/types';
import { formatPrice } from '@/utils/format';
import { haptic } from '@/utils/haptics';

export default function SubscriptionScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { t, L, lang } = useI18n('subscription');
  /** Optional deep-link context from a locked resource (`reason`, `subject` slug). */
  const { subject: lockedSubject } = useLocalSearchParams<{ reason?: string; subject?: string }>();
  const userPackageId = useAuthStore((s) => s.user?.packageId);
  const signedIn = useAuthStore((s) => s.isAuthenticated);
  const { data: mySub } = useMySubscription(signedIn);
  const currentId = (mySub && mySub.status !== 'cancelled' ? mySub.package.id : undefined) ?? (userPackageId || undefined);
  const packagesQuery = usePackages();
  const { data: packageDtos, isPending } = packagesQuery;
  const packages = useMemo(() => (packageDtos ?? []).map(toPackage), [packageDtos]);
  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  const [showCompare, setShowCompare] = useState(false);
  const [pickedId, setSelectedId] = useState<string | null>(null);

  // Default pick: the cheapest plan that unlocks the locked subject, else the popular plan.
  const defaultId = useMemo(() => {
    const unlocking = lockedSubject
      ? [...packages].filter((p) => p.subjects.includes(lockedSubject as never)).sort((a, b) => a.priceMonthly - b.priceMonthly)[0]
      : undefined;
    return (unlocking ?? packages.find((p) => p.popular) ?? packages[0])?.id ?? '';
  }, [packages, lockedSubject]);
  const selectedId = pickedId ?? defaultId;
  const selected = packages.find((p) => p.id === selectedId) ?? packages[0];

  const savePct = useMemo(() => {
    const ref = packages.find((p) => p.popular && p.priceYearly > 0) ?? packages.find((p) => p.priceYearly > 0);
    if (!ref) return 0;
    return ref.raw.yearlySavingPct ?? yearlySavingPercent(ref.priceMonthly, ref.priceYearly);
  }, [packages]);
  const yearlyOffered = packages.some((p) => p.priceYearly > 0);

  const cycleOptions = useMemo(
    () => [
      { key: 'monthly', label: t('cycle.monthly') },
      { key: 'yearly', label: t('cycle.yearly') },
    ],
    [t],
  );

  const onSelect = useCallback((pkg: Package) => setSelectedId(pkg.id), []);

  // A plan without a yearly option is always bought on its base plan.
  const effectiveCycle: BillingCycle = selected && cycle === 'yearly' && selected.priceYearly > 0 ? 'yearly' : 'monthly';

  const onContinue = () => {
    if (!selected) return;
    haptic.medium();
    router.push({ pathname: '/subscription/checkout', params: { packageId: selected.id, cycle: effectiveCycle } });
  };

  const price = selected ? (effectiveCycle === 'yearly' ? selected.priceYearly : selected.priceMonthly) : 0;
  const isCurrent = !!selected && selected.id === currentId;
  const ctaTitle = selected
    ? isCurrent
      ? t('cta.renew')
      : t('cta.continue', { plan: L(selected.name) })
    : t('plans.choose');

  return (
    <Screen padded={false} edges={[]} statusBar="light">
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + 150 }}
      >
        {/* Hero */}
        <View style={[styles.hero, { paddingTop: insets.top }]}>
          <Image
            source={{ uri: images.graduation }}
            placeholder={{ blurhash: BLURHASH }}
            transition={300}
            contentFit="cover"
            cachePolicy="memory-disk"
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(7,20,38,0.55)', 'rgba(11,31,58,0.82)', palette.navy900]}
            locations={[0, 0.55, 1]}
            style={StyleSheet.absoluteFill}
          />
          <Header transparent tint={palette.white} />
          <Animated.View entering={FadeInDown.duration(350)} style={styles.heroBody}>
            <View style={styles.heroBadge}>
              <Icon name="crown" size={14} color={palette.navy} filled />
              <Text variant="overline" color={palette.navy}>
                {t('hero.overline')}
              </Text>
            </View>
            <Text variant="display" display color={palette.white}>
              {t('hero.title')}
            </Text>
            <Text variant="body" color="rgba(255,255,255,0.78)">
              {t('hero.subtitle')}
            </Text>
            <View style={styles.heroCurrent}>
              <CurrentPlanCard variant="hero" />
            </View>
          </Animated.View>
        </View>

        <View style={styles.content}>
          {/* Billing toggle */}
          <Animated.View entering={FadeInDown.duration(350).delay(60)} style={styles.section}>
            <SectionHeader title={t('plans.title')} subtitle={t('plans.subtitle')} />
            {yearlyOffered ? (
            <View style={styles.cycleWrap}>
              <SegmentedControl
                options={cycleOptions}
                value={cycle}
                height={48}
                onChange={(k) => setCycle(k === 'yearly' ? 'yearly' : 'monthly')}
              />
              <View pointerEvents="none" style={styles.saveBadge}>
                <LinearGradient
                  colors={gradients.gold}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[styles.saveInner, shadows.gold]}
                >
                  <Text variant="overline" color={palette.navy} numberOfLines={1}>
                    {t('cycle.save', { pct: savePct })}
                  </Text>
                </LinearGradient>
              </View>
            </View>
            ) : null}
          </Animated.View>

          {/* Plans */}
          <View accessibilityRole="radiogroup" style={styles.plans}>
            {isPending ? (
              <>
                <SkeletonCard lines={4} />
                <SkeletonCard lines={4} />
              </>
            ) : packagesQuery.isError && !packageDtos ? (
              <EmptyState
                icon="wifi-off"
                title={t('common:states.error')}
                message={packagesQuery.error.isNetwork ? t('common:states.offline') : packagesQuery.error.message}
                actionLabel={t('common:actions.retry')}
                onAction={() => void packagesQuery.refetch()}
              />
            ) : null}
            {packages.map((p, i) => (
              <PlanCard
                key={p.id}
                pkg={p}
                cycle={cycle}
                index={i}
                isCurrent={p.id === currentId}
                selected={p.id === selectedId}
                onSelect={onSelect}
              />
            ))}
          </View>

          {/* Compare */}
          <View style={styles.section}>
            <PressableScale
              onPress={() => setShowCompare((v) => !v)}
              accessibilityRole="button"
              accessibilityState={{ expanded: showCompare }}
              style={[styles.compareToggle, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <View style={[styles.compareIcon, { backgroundColor: colors.accentSoft }]}>
                <Icon name="grid" size={18} color={colors.accent} />
              </View>
              <Text variant="bodyMedium" style={styles.flex}>
                {showCompare ? t('compare.hide') : t('compare.show')}
              </Text>
              <View style={{ transform: [{ rotate: showCompare ? '180deg' : '0deg' }] }}>
                <Icon name="chevron-down" size={18} color={colors.muted} />
              </View>
            </PressableScale>
            {showCompare ? <ComparisonTable packages={packages} currentId={currentId} /> : null}
          </View>

          <View style={styles.section}>
            <SectionHeader title={t('faq.title')} />
            <FaqAccordion />
          </View>

          <TrustRow />
        </View>
      </ScrollView>

      {/* Sticky CTA */}
      <View
        style={[
          styles.footer,
          shadows.lg,
          {
            paddingBottom: Math.max(insets.bottom, space.md) + space.sm,
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
          },
        ]}
      >
        {selected ? (
          <View style={styles.footerInfo}>
            <Text variant="caption" color="muted" numberOfLines={1} style={styles.flex}>
              {L(selected.name)}
            </Text>
            <Text variant="label" color={isDark ? 'accent' : 'ink'} tabular numberOfLines={1}>
              {`${formatPrice(price, lang)} ${effectiveCycle === 'yearly' ? t('plans.perYear') : t('plans.perMonth')}`}
            </Text>
          </View>
        ) : null}
        <Button
          title={ctaTitle}
          icon="arrow"
          iconPosition="end"
          variant="primary"
          size="lg"
          fullWidth
          onPress={onContinue}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hero: { overflow: 'hidden', backgroundColor: palette.navy900 },
  heroBody: { paddingHorizontal: SCREEN_PADDING, paddingTop: space.sm, paddingBottom: space.xxl, gap: space.sm },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: space.md,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: palette.gold,
    marginBottom: space.xs,
  },
  heroCurrent: { marginTop: space.lg },
  content: { paddingHorizontal: SCREEN_PADDING, paddingTop: space.xxl, gap: space.xxxl },
  section: { gap: space.md },
  cycleWrap: { marginTop: space.md },
  saveBadge: { position: 'absolute', top: -11, end: space.md },
  saveInner: { paddingHorizontal: space.sm + 2, height: 22, justifyContent: 'center', borderRadius: radius.pill },
  plans: { gap: space.lg, marginTop: -space.md },
  compareToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.md,
    minHeight: 56,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  compareIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  footer: {
    position: 'absolute',
    start: 0,
    end: 0,
    bottom: 0,
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: space.md,
    gap: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopStartRadius: radius.lg,
    borderTopEndRadius: radius.lg,
  },
  footerInfo: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});
