import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { AuthScaffold, DemoHint } from '@/components/auth';
import { Icon } from '@/components/icons';
import { Button, OtpInput, PressableScale, Text, toast } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { useAuthStore } from '@/store';
import { HIT_SLOP, radius, space, useTheme } from '@/theme';
import { formatDuration } from '@/utils/format';
import { haptic } from '@/utils/haptics';

const OTP_LENGTH = 6;
const RESEND_SECONDS = 60;
/** Unicode LTR isolate so "+964 770 ••• 4567" never reorders inside Arabic text. */
const ltr = (s: string) => `⁦${s}⁩`;

/** "+964 770 123 4567" → "+964 770 ••• 4567" */
function maskMobile(mobile: string): string {
  const parts = mobile.trim().split(/\s+/);
  if (parts.length === 4) return `${parts[0]} ${parts[1]} ••• ${parts[3]}`;
  const digits = mobile.replace(/\D/g, '');
  return digits.length > 4 ? `${mobile.slice(0, -4).replace(/\d/g, '•')}${mobile.slice(-4)}` : mobile;
}

export default function VerifyOtpScreen() {
  const { t } = useI18n('auth');
  const { colors } = useTheme();
  const pendingMobile = useAuthStore((s) => s.pendingMobile);

  const [code, setCode] = useState('');
  const [error, setError] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [seconds, setSeconds] = useState(RESEND_SECONDS);
  /** Set once a verification succeeds so clearing `pendingMobile` doesn't bounce us to login. */
  const verifiedRef = useRef(false);
  const verifyingRef = useRef(false);

  // No number awaiting verification → back to login.
  useEffect(() => {
    if (!pendingMobile && !verifiedRef.current) router.replace('/(auth)/login');
  }, [pendingMobile]);

  // Resend countdown (restarts whenever `seconds` is reset to RESEND_SECONDS).
  const counting = seconds > 0;
  useEffect(() => {
    if (!counting) return;
    const id = setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [counting]);

  const verify = useCallback(
    async (value: string) => {
      if (value.length !== OTP_LENGTH || verifyingRef.current) return;
      verifyingRef.current = true;
      setVerifying(true);
      setError(false);
      // Mark as verified *before* the store clears pendingMobile, then roll back on failure.
      verifiedRef.current = true;
      const ok = await useAuthStore.getState().verifyOtp(value);
      verifyingRef.current = false;
      setVerifying(false);
      if (ok) {
        haptic.success();
        toast.success(t('otp.success'));
        router.replace('/(tabs)/home');
      } else {
        verifiedRef.current = false;
        haptic.error();
        setError(true);
        setCode('');
      }
    },
    [t],
  );

  const resend = useCallback(async () => {
    const { pendingRegistration, pendingMobile: mobile, requestOtp, startRegistration } = useAuthStore.getState();
    if (!mobile || resending) return;
    setResending(true);
    // Keep the registration details when re-sending during sign-up.
    if (pendingRegistration) await startRegistration(pendingRegistration);
    else await requestOtp(mobile);
    setResending(false);
    setCode('');
    setError(false);
    setSeconds(RESEND_SECONDS);
    haptic.light();
    toast.success(t('otp.resent'));
  }, [resending, t]);

  const editNumber = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(auth)/login');
  };

  if (!pendingMobile && !verifiedRef.current) return null;
  const masked = ltr(maskMobile(pendingMobile ?? ''));

  return (
    <AuthScaffold title={t('otp.title')} subtitle={t('otp.subtitle')} onBack={editNumber}>
      <Animated.View
        entering={FadeInDown.duration(300).delay(60)}
        style={[styles.numberCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <View style={[styles.numberIcon, { backgroundColor: colors.accentSoft }]}>
          <Icon name="otp" size={20} color={colors.accent} />
        </View>
        <View style={styles.numberTexts}>
          <Text variant="caption" color="muted">
            {t('otp.sentTo')}
          </Text>
          <Text variant="bodyBold" tabular accessibilityLabel={t('otp.sentToA11y', { number: pendingMobile ?? '' })}>
            {masked}
          </Text>
        </View>
        <PressableScale
          onPress={editNumber}
          hitSlop={HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel={t('otp.editA11y')}
          style={styles.editBtn}
        >
          <Icon name="edit" size={16} color={colors.accent} />
          <Text variant="label" color="accent">
            {t('otp.edit')}
          </Text>
        </PressableScale>
      </Animated.View>

      <Animated.View
        entering={FadeInDown.duration(300).delay(120)}
        style={styles.otpWrap}
        accessibilityLabel={t('otp.a11y')}
      >
        <OtpInput
          length={OTP_LENGTH}
          value={code}
          onChange={(v) => {
            setCode(v);
            if (error) setError(false);
          }}
          onComplete={(v) => void verify(v)}
          error={error}
          autoFocus
        />
        {error ? (
          <Animated.View entering={FadeIn.duration(200)} style={styles.errorRow}>
            <Icon name="alert" size={16} color={colors.danger} />
            <Text variant="caption" color="danger" accessibilityLiveRegion="assertive" style={styles.flex}>
              {t('otp.wrongCode')}
            </Text>
          </Animated.View>
        ) : null}
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(300).delay(180)}>
        <Button
          title={verifying ? t('otp.verifying') : t('otp.verify')}
          variant="primary"
          size="lg"
          icon="check-circle"
          iconPosition="end"
          fullWidth
          loading={verifying}
          disabled={verifying || code.length !== OTP_LENGTH}
          onPress={() => void verify(code)}
        />
      </Animated.View>

      <View style={styles.resendRow}>
        {seconds > 0 ? (
          <Text variant="body" color="muted" align="center" tabular accessibilityLiveRegion="none">
            {t('otp.resendIn', { time: formatDuration(seconds) })}
          </Text>
        ) : (
          <View style={styles.resendCol}>
            <Text variant="caption" color="muted" align="center">
              {t('otp.didntGet')}
            </Text>
            <Button
              title={t('otp.resend')}
              variant="ghost"
              size="md"
              icon="refresh"
              loading={resending}
              disabled={resending}
              onPress={() => void resend()}
            />
          </View>
        )}
      </View>

      <Animated.View entering={FadeInDown.duration(300).delay(240)}>
        <DemoHint title={t('demo.title')} message={t('demo.code')} />
      </Animated.View>
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  numberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  numberIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  numberTexts: { flex: 1, gap: 2 },
  editBtn: {
    minHeight: 44,
    minWidth: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    paddingHorizontal: space.sm,
  },
  otpWrap: { gap: space.md, alignItems: 'stretch', paddingVertical: space.sm },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, justifyContent: 'center' },
  flex: { flexShrink: 1 },
  resendRow: { minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  resendCol: { alignItems: 'center', gap: space.xxs },
});
