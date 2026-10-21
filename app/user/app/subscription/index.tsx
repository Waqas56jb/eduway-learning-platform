import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
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
import { PressableScale, SectionHeader, SegmentedControl, Text } from '@/components/ui';
import { packages } from '@/data';
import { useI18n } from '@/hooks/useI18n';
import { useAuthStore, type BillingCycle } from '@/store';
import { gradients, palette, radius, SCREEN_PADDING, space, useTheme } from '@/theme';
import type { Package } from '@/types';

export default function SubscriptionScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useI18n('subscription');
  const currentId = useAuthStore((s) => s.user?.packageId);
  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  const [showCompare, setShowCompare] = useState(false);

  const savePct = useMemo(() => {
    const ref = packages.find((p) => p.popular) ?? packages[0];
    return ref ? yearlySavingPercent(ref.priceMonthly, ref.priceYearly) : 0;
  }, []);

  const cycleOptions = useMemo(
    () => [
      { key: 'monthly', label: t('cycle.monthly') },
      { key: 'yearly', label: t('cycle.yearly') },
    ],
    [t],
  );

  const choose = useCallback(
    (pkg: Package) => {
      router.push({ pathname: '/subscription/checkout', params: { packageId: pkg.id, cycle } });
    },
    [cycle],
  );

  return (
    <Screen padded={false}>
      <Header title={t('title')} subtitle={t('subtitle')} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.huge }]}
      >
        <CurrentPlanCard />

        <Animated.View entering={FadeInDown.duration(300).delay(80)} style={{ gap: space.lg }}>
          <SectionHeader title={t('plans.title')} subtitle={t('plans.subtitle')} />
          <View style={styles.cycleWrap}>
            <SegmentedControl
              options={cycleOptions}
              value={cycle}
              onChange={(k) => setCycle(k === 'yearly' ? 'yearly' : 'monthly')}
            />
            <View pointerEvents="none" style={styles.saveBadge}>
              <LinearGradient colors={gradients.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.saveInner}>
                <Text variant="overline" color={palette.navy}>
                  {t('cycle.save', { pct: savePct })}
                </Text>
              </LinearGradient>
            </View>
          </View>
        </Animated.View>

        <View style={{ gap: space.lg }}>
          {packages.map((p, i) => (
            <PlanCard key={p.id} pkg={p} cycle={cycle} index={i} isCurrent={p.id === currentId} onChoose={choose} />
          ))}
        </View>

        <Animated.View layout={LinearTransition.duration(240)} style={{ gap: space.md }}>
          <PressableScale
            onPress={() => setShowCompare((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showCompare }}
            style={[styles.compareToggle, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Icon name="grid" size={18} color={colors.accent} />
            <Text variant="bodyMedium" style={{ flex: 1 }}>
              {showCompare ? t('compare.hide') : t('compare.show')}
            </Text>
            <View style={{ transform: [{ rotate: showCompare ? '180deg' : '0deg' }] }}>
              <Icon name="chevron-down" size={18} color={colors.muted} />
            </View>
          </PressableScale>
          {showCompare ? <ComparisonTable packages={packages} currentId={currentId} /> : null}
        </Animated.View>

        <Animated.View layout={LinearTransition.duration(240)} style={{ gap: space.md }}>
          <SectionHeader title={t('faq.title')} />
          <FaqAccordion />
        </Animated.View>

        <Animated.View layout={LinearTransition.duration(240)}>
          <TrustRow />
        </Animated.View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: SCREEN_PADDING, paddingTop: space.sm, gap: space.xxl },
  cycleWrap: { marginTop: space.sm },
  saveBadge: { position: 'absolute', top: -12, end: space.lg, borderRadius: radius.pill, overflow: 'hidden' },
  saveInner: { paddingHorizontal: space.sm, paddingVertical: 3, borderRadius: radius.pill },
  compareToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    minHeight: 52,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
