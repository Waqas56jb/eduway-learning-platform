import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { useQueryClient } from '@tanstack/react-query';
import { toPackage } from '@/api/adapters';
import { toastError } from '@/api/errors';
import { qk } from '@/api/keys';
import {
  confirmMockPayment,
  initiatePayment,
  usePackage,
  usePackages,
  usePaymentMethodsForCheckout,
  useQuote,
  validatePromo,
  waitForPayment,
} from '@/api/payments';
import { newRequestId } from '@/api/session';
import type { Gateway } from '@/api/types';
import { Icon, SubjectIcon } from '@/components/icons';
import { Header, Screen } from '@/components/layout';
import {
  AnimatedPrice,
  GatewaySheet,
  isSelectableMethod,
  MethodMark,
  PaymentMethodCard,
  methodLabel,
  toPaymentMethod,
  type PaymentMethodId,
} from '@/components/subscription';
import { Badge, Button, Card, EmptyState, Input, SectionHeader, SkeletonCard, Text, toast } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { useAuthStore, type BillingCycle } from '@/store';
import { radius, SCREEN_PADDING, shadows, space, subjectColors, useTheme } from '@/theme';
import { formatPrice } from '@/utils/format';
import { haptic } from '@/utils/haptics';

const RETURN_URL = 'eduway://subscription/success';

export default function CheckoutScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { t, L, lang } = useI18n('subscription');
  const params = useLocalSearchParams<{ packageId?: string; cycle?: string }>();
  const qc = useQueryClient();

  // PAY-02 (falls back to the popular plan from PAY-01 when no id is given).
  const pkgQuery = usePackage(params.packageId);
  const { data: allPackages } = usePackages();
  const pkgDto =
    pkgQuery.data ?? (params.packageId ? undefined : (allPackages?.find((p) => p.popular) ?? allPackages?.[0]));
  const pkg = useMemo(() => (pkgDto ? toPackage(pkgDto) : undefined), [pkgDto]);
  const cycle: BillingCycle = params.cycle === 'yearly' && (pkgDto?.priceYearly ?? 0) > 0 ? 'yearly' : 'monthly';
  const basePrice = pkg ? (cycle === 'yearly' ? pkg.priceYearly : pkg.priceMonthly) : 0;

  const [code, setCode] = useState('');
  /** Applied promo (validated by PAY-05). */
  const [promo, setPromo] = useState<{ code: string; pct: number } | null>(null);
  const [promoError, setPromoError] = useState<string | undefined>();
  const [applying, setApplying] = useState(false);
  const [methodId, setMethodId] = useState<PaymentMethodId>('');
  const [sheetOpen, setSheetOpen] = useState(false);
  /** One Idempotency-Key per checkout attempt (renewed after a failed attempt). */
  const idemKey = useRef(newRequestId());
  const paymentRef = useRef<{ id: string; receipt: string | null; amount: number } | null>(null);

  // PAY-04 — authoritative totals (promo + proration).
  const { data: quote } = useQuote(pkg?.id, cycle, promo?.code);
  const price = quote?.subtotal ?? basePrice;
  const discount = promo ? (quote?.discount ?? Math.round((price * promo.pct) / 100)) : 0;
  const total = quote?.total ?? price - discount;

  // PAY-11 / PUB-09 — enabled gateways.
  const { data: methodDtos, isPending: methodsLoading } = usePaymentMethodsForCheckout();
  const methods = useMemo(() => (methodDtos ?? []).filter(isSelectableMethod).map(toPaymentMethod), [methodDtos]);
  useEffect(() => {
    if (methods.length && !methods.some((m) => m.id === methodId)) setMethodId(methods[0]!.id);
  }, [methods, methodId]);
  const method = methods.find((m) => m.id === methodId) ?? methods[0];

  const wallets = useMemo(() => methods.filter((m) => m.kind === 'wallet'), [methods]);
  const cards = useMemo(() => methods.filter((m) => m.kind === 'card'), [methods]);

  const applyPromo = async () => {
    const normalized = code.trim().toUpperCase();
    if (!normalized) {
      setPromoError(t('checkout.promo.empty'));
      haptic.error();
      return;
    }
    if (!pkg) return;
    setApplying(true);
    try {
      const res = await validatePromo({ code: normalized, packageId: pkg.id, cycle });
      if (res.valid) {
        const sub = res.quote?.subtotal ?? price;
        const pct = res.type === 'percent' ? Math.round(res.value) : sub > 0 ? Math.round((res.discountAmount / sub) * 100) : 0;
        if (res.quote) qc.setQueryData(['payments', 'quote', pkg.id, cycle, normalized], res.quote);
        setPromo({ code: normalized, pct });
        setPromoError(undefined);
        setCode(normalized);
        haptic.success();
        toast.success(t('checkout.promo.applied', { code: normalized, pct }));
      } else {
        setPromo(null);
        setPromoError(res.message || t('checkout.promo.invalid'));
        haptic.error();
      }
    } catch (err) {
      toastError(err);
    } finally {
      setApplying(false);
    }
  };

  const removePromo = () => {
    setPromo(null);
    setCode('');
    setPromoError(undefined);
    haptic.light();
  };

  /** PAY-06 → gateway (mock confirm / hosted page / wallet app) → PAY-08 poll. Resolves true when paid. */
  const onPay = useCallback(
    async (walletPhone?: string): Promise<boolean> => {
      if (!pkg || !method) return false;
      try {
        const init = await initiatePayment(
          {
            packageId: pkg.id,
            cycle,
            gateway: method.id as Gateway,
            promoCode: promo?.code,
            walletPhone: method.requiresPhone ? walletPhone : undefined,
            returnScheme: RETURN_URL,
          },
          idemKey.current,
        );
        // How long to keep polling PAY-08 once the student is back (the gateway may confirm a moment later).
        let pollMs = 60_000;
        if (init.mock) {
          await confirmMockPayment(init.paymentId, 'success');
        } else if (init.redirectUrl) {
          // Hosted page (ZainCash / Qi / FastPay, live or sandbox). The API's callback redirects to RETURN_URL,
          // which closes the in-app browser; closing it by hand means the student left the page.
          const result = await WebBrowser.openAuthSessionAsync(init.redirectUrl, RETURN_URL);
          if (result.type !== 'success') pollMs = 6_000;
        } else if (init.deeplink) {
          await Linking.openURL(init.deeplink).catch(() => {});
        }
        const final = await waitForPayment(init.paymentId, pollMs);
        if (final.status !== 'paid') {
          idemKey.current = newRequestId();
          haptic.error();
          if (final.status === 'pending' || final.status === 'initiated') toast.info(t('gateway.notCompleted'));
          // Declined by the gateway (e.g. a sandbox wallet without balance): suggest another method such as Qi Card.
          else toast.error(t('gateway.failedTryOther', { method: methodLabel(method, t, L) }));
          return false;
        }
        paymentRef.current = { id: final.id, receipt: final.receiptNumber, amount: final.amount };
        // Entitlements come from the webhook; refresh everything that depends on them.
        await useAuthStore.getState().refreshMe();
        void qc.invalidateQueries({ queryKey: qk.payments.all });
        void qc.invalidateQueries({ queryKey: qk.progress.all });
        void qc.invalidateQueries({ queryKey: qk.catalog.all });
        void qc.invalidateQueries({ queryKey: qk.tutor.allowance });
        void qc.invalidateQueries({ queryKey: qk.notifications.all });
        return true;
      } catch (err) {
        idemKey.current = newRequestId();
        toastError(err);
        return false;
      }
    },
    [pkg, method, cycle, promo, qc, t, L],
  );

  const onPaid = useCallback(() => {
    if (!pkg || !method) return;
    const paid = paymentRef.current;
    haptic.success();
    setSheetOpen(false);
    router.replace({
      pathname: '/subscription/success',
      params: {
        paymentId: paid?.id ?? '',
        receipt: paid?.receipt ?? '',
        packageId: pkg.id,
        cycle,
        amount: String(paid?.amount ?? total),
        method: method.id,
      },
    });
  }, [pkg, method, cycle, total]);

  if (!pkg) {
    return (
      <Screen padded={false} keyboard>
        <Header title={t('checkout.title')} subtitle={t('checkout.subtitle')} />
        <View style={styles.content}>
          {pkgQuery.isError ? (
            <EmptyState
              icon="crown"
              title={t('common:states.error')}
              actionLabel={t('common:actions.retry')}
              onAction={() => void pkgQuery.refetch()}
            />
          ) : (
            <>
              <SkeletonCard lines={4} />
              <SkeletonCard lines={2} />
            </>
          )}
        </View>
      </Screen>
    );
  }

  return (
    <Screen padded={false} keyboard>
      <Header title={t('checkout.title')} subtitle={t('checkout.subtitle')} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        keyboardDismissMode="interactive"
      >
        {/* Order summary */}
        <Animated.View entering={FadeInDown.duration(300)}>
          <Card style={{ gap: space.lg }}>
            <View style={styles.row}>
              <View style={[styles.pkgIcon, { backgroundColor: colors.accentSoft }]}>
                <Icon name="crown" size={22} color={colors.accent} filled />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="overline" color="muted">
                  {t('checkout.summary')}
                </Text>
                <Text variant="h3" numberOfLines={1}>
                  {L(pkg.name)}
                </Text>
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
              {promo ? (
                <Animated.View entering={FadeIn.duration(250)} exiting={FadeOut.duration(150)} style={styles.lineRow}>
                  <Text variant="body" color="success" style={styles.flexShrink}>
                    {t('checkout.discount', { code: promo.code, pct: promo.pct })}
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
                editable={!promo}
                icon="gift"
                error={promoError}
                hint={promo ? undefined : t('checkout.promo.hint')}
                returnKeyType="done"
                onSubmitEditing={() => void applyPromo()}
                accessibilityLabel={t('checkout.promo.title')}
              />
            </View>
            <View style={styles.promoBtn}>
              {promo ? (
                <Button title={t('checkout.promo.remove')} variant="outline" size="lg" onPress={removePromo} />
              ) : (
                <Button
                  title={t('common:actions.apply')}
                  variant="secondary"
                  size="lg"
                  loading={applying}
                  onPress={() => void applyPromo()}
                />
              )}
            </View>
          </View>
        </Animated.View>

        {/* Payment methods */}
        <Animated.View entering={FadeInDown.duration(300).delay(160)} style={{ gap: space.md }}>
          <SectionHeader title={t('checkout.payWith')} />
          {methodsLoading ? <SkeletonCard lines={2} /> : null}
          {wallets.length ? (
            <>
              <Text variant="overline" color="muted">
                {t('checkout.wallets')}
              </Text>
              <View accessibilityRole="radiogroup" style={{ gap: space.sm }}>
                {wallets.map((m) => (
                  <PaymentMethodCard key={m.id} method={m} selected={m.id === method?.id} onSelect={setMethodId} />
                ))}
              </View>
            </>
          ) : null}
          {cards.length ? (
            <>
              <Text variant="overline" color="muted" style={{ marginTop: space.sm }}>
                {t('checkout.cards')}
              </Text>
              <View accessibilityRole="radiogroup" style={{ gap: space.sm }}>
                {cards.map((m) => (
                  <PaymentMethodCard key={m.id} method={m} selected={m.id === method?.id} onSelect={setMethodId} />
                ))}
              </View>
            </>
          ) : null}
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
          shadows.lg,
          {
            paddingBottom: Math.max(insets.bottom, space.md) + space.sm,
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
          },
        ]}
      >
        <View style={styles.footerInfo}>
          {method ? (
            <View style={styles.footerMethod}>
              <MethodMark method={method} size={22} />
              <Text variant="caption" color="muted" numberOfLines={1} style={styles.flexShrink}>
                {methodLabel(method, t, L)}
              </Text>
            </View>
          ) : (
            <View style={styles.footerMethod} />
          )}
          <Text variant="label" tabular numberOfLines={1}>
            {`${t('checkout.total')} · ${formatPrice(total, lang)}`}
          </Text>
        </View>
        <Button
          title={t('checkout.pay', { amount: formatPrice(total, lang) })}
          icon="lock"
          variant="primary"
          size="lg"
          fullWidth
          disabled={!method}
          onPress={() => {
            haptic.medium();
            setSheetOpen(true);
          }}
        />
      </View>

      {method ? (
        <GatewaySheet
          visible={sheetOpen}
          amount={total}
          method={method}
          onClose={() => setSheetOpen(false)}
          onPay={onPay}
          onSuccess={onPaid}
        />
      ) : null}
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
  promoBtn: { height: 54, justifyContent: 'center', minWidth: 96 },
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
    gap: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopStartRadius: radius.lg,
    borderTopEndRadius: radius.lg,
  },
  footerInfo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  footerMethod: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexShrink: 1 },
  flexShrink: { flexShrink: 1 },
});
