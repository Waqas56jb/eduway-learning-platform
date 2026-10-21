import * as Clipboard from 'expo-clipboard';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { BackHandler, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/icons';
import { Screen } from '@/components/layout';
import { getPaymentMethod, MethodMark } from '@/components/subscription';
import { Button, Card, Confetti, PressableScale, SuccessCheck, Text, toast } from '@/components/ui';
import { getPackage } from '@/data';
import { useI18n } from '@/hooks/useI18n';
import { useAuthStore } from '@/store';
import { HIT_SLOP, radius, SCREEN_PADDING, space, useTheme } from '@/theme';
import { formatDate, formatPrice } from '@/utils/format';
import { haptic } from '@/utils/haptics';

const goHome = () => router.replace('/(tabs)/home');

export default function SubscriptionSuccessScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { t, L, lang } = useI18n('subscription');
  const params = useLocalSearchParams<{
    receipt?: string;
    packageId?: string;
    cycle?: string;
    amount?: string;
    method?: string;
  }>();
  const user = useAuthStore((s) => s.user);
  const [fire, setFire] = useState(false);
  const [paidAt] = useState(() => new Date().toISOString());

  const pkg = getPackage(params.packageId ?? user?.packageId);
  const cycle = params.cycle === 'yearly' ? 'yearly' : 'monthly';
  const amount = Number(params.amount) || (pkg ? (cycle === 'yearly' ? pkg.priceYearly : pkg.priceMonthly) : 0);
  const method = getPaymentMethod(params.method);
  const receipt = params.receipt ?? 'EDW-00000000';

  useEffect(() => {
    const id = setTimeout(() => {
      setFire(true);
      haptic.success();
    }, 350);
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      goHome();
      return true;
    });
    return () => {
      clearTimeout(id);
      sub.remove();
    };
  }, []);

  const rows = useMemo(
    () => [
      { key: 'receiptNo', label: t('success.receiptNo'), value: receipt, ltr: true },
      { key: 'package', label: t('success.package'), value: pkg ? L(pkg.name) : '—' },
      { key: 'cycle', label: t('success.cycle'), value: cycle === 'yearly' ? t('cycle.yearly') : t('cycle.monthly') },
      { key: 'amount', label: t('success.amount'), value: formatPrice(amount, lang) },
      {
        key: 'date',
        label: t('success.date'),
        value: formatDate(paidAt, lang, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
      },
      { key: 'method', label: t('success.method'), value: method ? t(`methods.${method.id}`) : '—' },
    ],
    [t, L, lang, receipt, pkg, cycle, amount, paidAt, method],
  );

  const copy = async () => {
    const text = [t('success.receiptTitle'), ...rows.map((r) => `${r.label}: ${r.value}`)].join('\n');
    try {
      await Clipboard.setStringAsync(text);
      haptic.success();
      toast.success(t('success.copied'));
    } catch {
      toast.error(t('common:states.error'));
    }
  };

  return (
    <Screen padded={false} edges={['top']}>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: space.xxl }]}
      >
        <View style={styles.hero}>
          <SuccessCheck size={120} />
          <Animated.View entering={FadeInUp.duration(400).delay(250)} style={{ gap: space.xs, alignItems: 'center' }}>
            <Text variant="h1" align="center">
              {t('success.title')}
            </Text>
            <Text variant="body" color="muted" align="center">
              {t('success.subtitle', { plan: pkg ? L(pkg.name) : '' })}
            </Text>
          </Animated.View>
        </View>

        <Animated.View entering={FadeInDown.duration(400).delay(400)}>
          <Card padded={false} style={{ overflow: 'hidden' }}>
            <View style={[styles.receiptHead, { backgroundColor: colors.surfaceMuted, borderBottomColor: colors.border }]}>
              <Icon name="receipt" size={20} color={colors.accent} />
              <Text variant="label" style={{ flex: 1 }}>
                {t('success.receiptTitle')}
              </Text>
              <PressableScale
                onPress={copy}
                hitSlop={HIT_SLOP}
                accessibilityRole="button"
                accessibilityLabel={t('success.copy')}
                style={[styles.copyBtn, { borderColor: colors.accent }]}
              >
                <Icon name="note" size={14} color={colors.accent} />
                <Text variant="caption" color="accent">
                  {t('success.copy')}
                </Text>
              </PressableScale>
            </View>
            <View style={styles.receiptBody}>
              {rows.map((r, i) => (
                <View
                  key={r.key}
                  style={[
                    styles.receiptRow,
                    i < rows.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
                  ]}
                >
                  <Text variant="body" color="muted">
                    {r.label}
                  </Text>
                  <View style={styles.valueWrap}>
                    {r.key === 'method' && method ? <MethodMark method={method} size={24} /> : null}
                    <Text
                      variant={r.key === 'amount' ? 'bodyBold' : 'bodyMedium'}
                      color={r.key === 'amount' ? 'accent' : 'ink'}
                      tabular
                      selectable={r.key === 'receiptNo'}
                      style={r.ltr ? { writingDirection: 'ltr' } : undefined}
                    >
                      {r.value}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
            {/* Perforation */}
            <View style={styles.perforation}>
              {Array.from({ length: 18 }).map((_, i) => (
                <View key={i} style={[styles.perfDot, { backgroundColor: colors.border }]} />
              ))}
            </View>
            <View style={styles.receiptFoot}>
              <Icon name="shield" size={14} color={colors.success} />
              <Text variant="caption" color="muted" style={{ flex: 1 }}>
                {t('success.footnote')}
              </Text>
            </View>
          </Card>
        </Animated.View>
      </ScrollView>

      <Animated.View
        entering={FadeInDown.duration(400).delay(600)}
        style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}
      >
        <Button title={t('success.start')} icon="arrow" iconPosition="end" size="lg" fullWidth onPress={goHome} />
        <Button
          title={t('success.manage')}
          variant="ghost"
          size="md"
          fullWidth
          onPress={() => router.replace('/subscription')}
        />
      </Animated.View>

      <Confetti fire={fire} count={90} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: SCREEN_PADDING, gap: space.xxl },
  hero: { alignItems: 'center', gap: space.xl, paddingTop: space.xxxl },
  receiptHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: space.md,
    minHeight: 32,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  receiptBody: { paddingHorizontal: space.lg },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
  },
  valueWrap: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexShrink: 1 },
  perforation: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: space.lg, marginTop: space.xs },
  perfDot: { width: 6, height: 6, borderRadius: 3 },
  receiptFoot: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.lg },
  footer: { paddingHorizontal: SCREEN_PADDING, paddingTop: space.md, gap: space.xs },
});
