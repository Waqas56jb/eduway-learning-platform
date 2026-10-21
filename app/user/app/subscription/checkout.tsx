import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, SubjectIcon } from '@/components/icons';
import { Header, Screen } from '@/components/layout';
import {
  AnimatedPrice,
  GatewaySheet,
  PAYMENT_METHODS,
  PROMO_CODES,
  PaymentMethodCard,
  generateReceiptNumber,
  type PaymentMethodId,
} from '@/components/subscription';
import { Badge, Button, Card, Input, SectionHeader, Text, toast } from '@/components/ui';
import { getPackage, packages } from '@/data';
import { useI18n } from '@/hooks/useI18n';
import { useAuthStore, useNotificationsStore, type BillingCycle } from '@/store';
import { radius, SCREEN_PADDING, space, subjectColors, useTheme } from '@/theme';
import { formatPrice } from '@/utils/format';
import { haptic } from '@/utils/haptics';

export default function CheckoutScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { t, L, lang, i18n } = useI18n('subscription');
  const params = useLocalSearchParams<{ packageId?: string; cycle?: string }>();
  const subscribe = useAuthStore((s) => s.subscribe);
  const addNotification = useNotificationsStore((s) => s.add);

  const pkg = getPackage(params.packageId) ?? packages.find((p) => p.popular) ?? packages[0]!;
  const cycle: BillingCycle = params.cycle === 'yearly' ? 'yearly' : 'monthly';
  const price = cycle === 'yearly' ? pkg.priceYearly : pkg.priceMonthly;

  const [code, setCode] = useState('');
  const [promoPct, setPromoPct] = useState<number | null>(null);
  const [promoError, setPromoError] = useState<string | undefined>();
  const [applying, setApplying] = useState(false);
  const [methodId, setMethodId] = useState<PaymentMethodId>('zaincash');
  const [sheetOpen, setSheetOpen] = useState(false);

  const method = PAYMENT_METHODS.find((m) => m.id === methodId) ?? PAYMENT_METHODS[0]!;
  const discount = promoPct ? Math.round((price * promoPct) / 100) : 0;
  const total = price - discount;

  const wallets = useMemo(() => PAYMENT_METHODS.filter((m) => m.kind === 'wallet'), []);
  const cards = useMemo(() => PAYMENT_METHODS.filter((m) => m.kind === 'card'), []);

  const applyPromo = () => {
    const normalized = code.trim().toUpperCase();
    if (!normalized) {
      setPromoError(t('checkout.promo.empty'));
      haptic.error();
      return;
    }
    setApplying(true);
    setTimeout(() => {
      setApplying(false);
      const pct = PROMO_CODES[normalized];
      if (pct) {
        setPromoPct(pct);
        setPromoError(undefined);
        setCode(normalized);
        haptic.success();
        toast.success(t('checkout.promo.applied', { code: normalized, pct }));
      } else {
        setPromoPct(null);
        setPromoError(t('checkout.promo.invalid'));
        haptic.error();
      }
    }, 600);
  };

  const removePromo = () => {
    setPromoPct(null);
    setCode('');
    setPromoError(undefined);
    haptic.light();
  };

  const onPaid = useCallback(() => {
    const receipt = generateReceiptNumber();
    subscribe(pkg.id, cycle);
    addNotification({
      type: 'payment',
      title: {
        en: i18n.t('subscription:notification.title', { lng: 'en' }),
        ar: i18n.t('subscription:notification.title', { lng: 'ar' }),
      },
      body: {
        en: i18n.t('subscription:notification.body', {
          lng: 'en',
          amount: formatPrice(total, 'en'),
          plan: pkg.name.en,
          receipt,
        }),
        ar: i18n.t('subscription:notification.body', {
          lng: 'ar',
          amount: formatPrice(total, 'ar'),
          plan: pkg.name.ar,
          receipt,
        }),
      },
      link: '/subscription',
    });
    haptic.success();
    setSheetOpen(false);
    router.replace({
      pathname: '/subscription/success',
      params: { receipt, packageId: pkg.id, cycle, amount: String(total), method: methodId },
    });
  }, [subscribe, addNotification, i18n, pkg, cycle, total, methodId]);

  return (
    <Screen padded={false} keyboard>
      <Header title={t('checkout.title')} subtitle={t('checkout.subtitle')} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {/* Order summary */}
        <Animated.View entering={FadeInDown.duration(300)}>
          <Card style={{ gap: space.lg }}>
            <View style={styles.row}>
              <View style={[styles.pkgIcon, { backgroundColor: colors.accentSoft }]}>
                <Icon name="crown" size={22} color={colors.accent} filled />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="overline" color="muted">
                  {t('checkout.summary')}
                </Text>
                <Text variant="h3">{L(pkg.name)}</Text>
              </View>
              <Badge label={cycle === 'yearly' ? t('cycle.yearly') : t('cycle.monthly')} tone="gold" size="sm" />
            </View>

            <View style={styles.subjects}>
              {pkg.subjects.map((sid) => (
                <View key={sid} style={[styles.subjectPill, { backgroundColor: `${subjectColors[sid]}1A` }]}>
                  <SubjectIcon subjectId={sid} size={13} color={subjectColors[sid]} />
                  <Text variant="caption" color={subjectColors[sid]}>
                    {t(`common:subjects.${sid}`)}
                  </Text>
                </View>
              ))}
            </View>

            <View style={[styles.hr, { backgroundColor: colors.border }]} />

            <View style={{ gap: space.sm }}>
              <View style={styles.lineRow}>
                <Text variant="body" color="muted">
                  {t('checkout.subtotal')}
                </Text>
                <Text variant="bodyMedium" tabular>
                  {formatPrice(price, lang)}
                </Text>
              </View>
              {promoPct ? (
                <Animated.View entering={FadeIn.duration(250)} exiting={FadeOut.duration(150)} style={styles.lineRow}>
                  <Text variant="body" color="success">
                    {t('checkout.discount', { code, pct: promoPct })}
                  </Text>
                  <Text variant="bodyMedium" color="success" tabular>
                    −{formatPrice(discount, lang)}
                  </Text>
                </Animated.View>
              ) : null}
              <View style={styles.lineRow}>
                <Text variant="body" color="muted">
                  {t('checkout.access')}
                </Text>
                <Text variant="bodyMedium">
                  {t(cycle === 'yearly' ? 'checkout.days365' : 'checkout.days30')}
                </Text>
              </View>
            </View>

            <View style={[styles.hr, { backgroundColor: colors.border }]} />

            <View style={[styles.lineRow, { alignItems: 'center' }]}>
              <Text variant="bodyBold">{t('checkout.total')}</Text>
              <AnimatedPrice value={total} variant="h2" color="accent" />
            </View>
          </Card>
        </Animated.View>

        {/* Promo code */}
        <Animated.View entering={FadeInDown.duration(300).delay(80)} layout={LinearTransition.duration(200)}>
          <SectionHeader title={t('checkout.promo.title')} />
          <View style={styles.promoRow}>
            <View style={{ flex: 1 }}>
              <Input
                value={code}
                onChangeText={(v) => {
                  setCode(v.toUpperCase());
                  if (promoError) setPromoError(undefined);
                }}
                placeholder={t('checkout.promo.placeholder')}
                autoCapitalize="characters"
                autoCorrect={false}
                editable={!promoPct}
                icon="gift"
                error={promoError}
                hint={promoPct ? undefined : t('checkout.promo.hint')}
                returnKeyType="done"
                onSubmitEditing={applyPromo}
                accessibilityLabel={t('checkout.promo.title')}
              />
            </View>
            {promoPct ? (
              <Button title={t('checkout.promo.remove')} variant="ghost" size="lg" onPress={removePromo} />
            ) : (
              <Button title={t('common:actions.apply')} variant="secondary" size="lg" loading={applying} onPress={applyPromo} />
            )}
          </View>
        </Animated.View>

        {/* Payment methods */}
        <Animated.View entering={FadeInDown.duration(300).delay(160)} style={{ gap: space.md }}>
          <SectionHeader title={t('checkout.payWith')} />
          <Text variant="overline" color="muted">
            {t('checkout.wallets')}
          </Text>
          <View accessibilityRole="radiogroup" style={{ gap: space.sm }}>
            {wallets.map((m) => (
              <PaymentMethodCard key={m.id} method={m} selected={m.id === methodId} onSelect={setMethodId} />
            ))}
          </View>
          <Text variant="overline" color="muted" style={{ marginTop: space.sm }}>
            {t('checkout.cards')}
          </Text>
          <View accessibilityRole="radiogroup" style={{ gap: space.sm }}>
            {cards.map((m) => (
              <PaymentMethodCard key={m.id} method={m} selected={m.id === methodId} onSelect={setMethodId} />
            ))}
          </View>
        </Animated.View>

        <View style={[styles.secureNote, { backgroundColor: colors.surfaceMuted }]}>
          <Icon name="shield" size={18} color={colors.success} />
          <Text variant="caption" color="muted" style={{ flex: 1 }}>
            {t('checkout.secureNote')}
          </Text>
        </View>
      </ScrollView>

      <View
        style={[
          styles.footer,
          { paddingBottom: insets.bottom + space.md, backgroundColor: colors.surface, borderTopColor: colors.border },
        ]}
      >
        <Button
          title={t('checkout.pay', { amount: formatPrice(total, lang) })}
          icon="lock"
          variant="primary"
          size="lg"
          fullWidth
          onPress={() => {
            haptic.medium();
            setSheetOpen(true);
          }}
        />
      </View>

      <GatewaySheet
        visible={sheetOpen}
        amount={total}
        method={method}
        onClose={() => setSheetOpen(false)}
        onSuccess={onPaid}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: SCREEN_PADDING, paddingTop: space.sm, paddingBottom: space.xxxl, gap: space.xxl },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  pkgIcon: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  subjects: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  subjectPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: space.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  hr: { height: StyleSheet.hairlineWidth },
  lineRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md },
  promoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, marginTop: space.md },
  secureNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
  },
  footer: {
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
