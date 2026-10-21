import { LinearGradient } from 'expo-linear-gradient';
import { memo, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import { Icon } from '@/components/icons';
import { BottomSheet, Button, Input, ProgressBar, Text } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { useAuthStore } from '@/store';
import { gradients, palette, radius, space, useTheme } from '@/theme';
import { formatPrice } from '@/utils/format';
import { haptic } from '@/utils/haptics';
import { MethodMark } from './PaymentMethodCard';
import type { PaymentMethod } from './paymentMethods';

interface GatewaySheetProps {
  visible: boolean;
  amount: number;
  method: PaymentMethod;
  onClose: () => void;
  /** Called once the mock payment has been "authorised". */
  onSuccess: () => void;
}

type Phase = 'form' | 'processing';
const STEPS = ['connecting', 'verifying', 'activating'] as const;
const STEP_MS = 700;

/** Mock, navy-branded secure payment gateway shown in a bottom sheet. */
export const GatewaySheet = memo(function GatewaySheet({ visible, amount, method, onClose, onSuccess }: GatewaySheetProps) {
  const { colors } = useTheme();
  const { t, L, lang } = useI18n('subscription');
  const user = useAuthStore((s) => s.user);
  const [phase, setPhase] = useState<Phase>('form');
  const [step, setStep] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const [phone, setPhone] = useState('770 123 4567');
  const [pin, setPin] = useState('1234');
  const [cardNumber, setCardNumber] = useState(method.id === 'qicard' ? '6262 1500 4418 2093' : '4242 4242 4242 4242');
  const [expiry, setExpiry] = useState('12/28');
  const [cvv, setCvv] = useState('123');
  const [holder, setHolder] = useState('');

  useEffect(() => {
    if (visible) {
      setPhase('form');
      setStep(0);
      setHolder(L(user?.name));
      setCardNumber(method.id === 'qicard' ? '6262 1500 4418 2093' : method.id === 'mastercard' ? '5355 0012 7781 4406' : '4242 4242 4242 4242');
    }
  }, [visible, method.id, user, L]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const methodName = t(`methods.${method.id}`);

  const pay = () => {
    haptic.medium();
    setPhase('processing');
    setStep(0);
    timers.current.forEach(clearTimeout);
    timers.current = [
      setTimeout(() => setStep(1), STEP_MS),
      setTimeout(() => setStep(2), STEP_MS * 2),
      setTimeout(() => setStep(3), STEP_MS * 2 + 600),
      setTimeout(() => onSuccess(), STEP_MS * 2 + 950),
    ];
  };

  const processing = phase === 'processing';

  return (
    <BottomSheet
      visible={visible}
      onClose={processing ? () => undefined : onClose}
      snap="auto"
      footer={
        processing ? null : (
          <View style={{ gap: space.sm }}>
            <Button
              title={t('gateway.confirm', { amount: formatPrice(amount, lang) })}
              icon="lock"
              onPress={pay}
              fullWidth
            />
            <Text variant="caption" color="muted" align="center">
              {t('gateway.disclaimer')}
            </Text>
          </View>
        )
      }
    >
      <LinearGradient colors={gradients.navy} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.brand}>
        <View style={styles.brandRow}>
          <View style={styles.lockBadge}>
            <Icon name="lock" size={18} color={palette.navy} />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="bodyBold" color={palette.white}>
              {t('gateway.title')}
            </Text>
            <Text variant="caption" color="rgba(255,255,255,0.7)">
              {t('gateway.secured')}
            </Text>
          </View>
          <Icon name="shield" size={22} color={palette.gold} />
        </View>
        <View style={styles.brandDivider} />
        <View style={styles.brandRow}>
          <MethodMark method={method} size={36} />
          <View style={{ flex: 1 }}>
            <Text variant="caption" color="rgba(255,255,255,0.7)">
              {t('gateway.payingWith')}
            </Text>
            <Text variant="label" color={palette.white}>
              {methodName}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text variant="caption" color="rgba(255,255,255,0.7)">
              {t('gateway.amount')}
            </Text>
            <Text variant="bodyBold" color={palette.goldLight} tabular>
              {formatPrice(amount, lang)}
            </Text>
          </View>
        </View>
      </LinearGradient>

      {processing ? (
        <Animated.View entering={FadeIn.duration(220)} style={styles.processing}>
          <View style={styles.spinnerWrap}>
            {step >= STEPS.length ? (
              <Animated.View entering={ZoomIn.springify()} style={[styles.doneCircle, { backgroundColor: colors.success }]}>
                <Icon name="check" size={30} color="#FFFFFF" strokeWidth={3} />
              </Animated.View>
            ) : (
              <ActivityIndicator size="large" color={colors.accent} />
            )}
          </View>
          <Text variant="h3" align="center">
            {step >= STEPS.length ? t('gateway.approved') : t('gateway.processing')}
          </Text>
          <Text variant="caption" color="muted" align="center">
            {t('gateway.doNotClose')}
          </Text>
          <ProgressBar
            progress={Math.min(100, Math.round((step / STEPS.length) * 100))}
            gradient
            height={6}
          />
          <View style={{ gap: space.md, marginTop: space.sm }}>
            {STEPS.map((key, i) => {
              const done = step > i;
              const active = step === i;
              return (
                <Animated.View
                  key={key}
                  entering={FadeInDown.duration(250).delay(i * 80)}
                  style={[styles.stepRow, { opacity: done || active ? 1 : 0.45 }]}
                >
                  <View
                    style={[
                      styles.stepDot,
                      {
                        backgroundColor: done ? colors.success : active ? colors.accentSoft : colors.surfaceMuted,
                        borderColor: done ? colors.success : active ? colors.accent : colors.border,
                      },
                    ]}
                  >
                    {done ? (
                      <Icon name="check" size={14} color="#FFFFFF" strokeWidth={3} />
                    ) : active ? (
                      <ActivityIndicator size="small" color={colors.accent} />
                    ) : (
                      <Text variant="caption" color="muted">
                        {i + 1}
                      </Text>
                    )}
                  </View>
                  <Text variant={active ? 'bodyBold' : 'body'} style={{ flex: 1 }}>
                    {t(`gateway.steps.${key}`, { method: methodName })}
                  </Text>
                </Animated.View>
              );
            })}
          </View>
        </Animated.View>
      ) : (
        <Animated.View entering={FadeIn.duration(220)} style={styles.form}>
          {method.kind === 'wallet' ? (
            <>
              <Input
                label={t('gateway.walletNumber')}
                prefix="+964"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                icon="phone"
                maxLength={12}
              />
              <Input
                label={t('gateway.pin')}
                value={pin}
                onChangeText={setPin}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={4}
                icon="lock"
                hint={t('gateway.pinHint', { method: methodName })}
              />
            </>
          ) : (
            <>
              <Input
                label={t('gateway.cardNumber')}
                value={cardNumber}
                onChangeText={setCardNumber}
                keyboardType="number-pad"
                icon="card"
                maxLength={19}
                style={{ writingDirection: 'ltr' }}
              />
              <View style={styles.twoCol}>
                <View style={{ flex: 1 }}>
                  <Input label={t('gateway.expiry')} value={expiry} onChangeText={setExpiry} maxLength={5} keyboardType="number-pad" />
                </View>
                <View style={{ flex: 1 }}>
                  <Input
                    label={t('gateway.cvv')}
                    value={cvv}
                    onChangeText={setCvv}
                    maxLength={3}
                    keyboardType="number-pad"
                    secureTextEntry
                  />
                </View>
              </View>
              <Input label={t('gateway.cardHolder')} value={holder} onChangeText={setHolder} icon="user" />
            </>
          )}
        </Animated.View>
      )}
    </BottomSheet>
  );
});

const styles = StyleSheet.create({
  brand: { borderRadius: radius.lg, padding: space.lg, gap: space.md },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  brandDivider: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.18)' },
  lockBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: palette.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  form: { gap: space.md, marginTop: space.lg, marginBottom: space.sm },
  twoCol: { flexDirection: 'row', gap: space.md },
  processing: { gap: space.sm, marginTop: space.xl, marginBottom: space.lg },
  spinnerWrap: { height: 64, alignItems: 'center', justifyContent: 'center' },
  doneCircle: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
