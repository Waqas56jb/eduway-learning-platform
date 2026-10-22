import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useAppConfig } from '@/api';
import { AuthScaffold, DemoHint, StepIndicator } from '@/components/auth';
import { SessionRow } from '@/components/settings/SessionRow';
import { Icon } from '@/components/icons';
import { BottomSheet, Button, OtpInput, PressableScale, Text, toast } from '@/components/ui';
import { images } from '@/constants/images';
import { useI18n } from '@/hooks/useI18n';
import { useAuthStore } from '@/store';
import { HIT_SLOP, radius, SCREEN_PADDING, shadows, space, useTheme } from '@/theme';
import { formatDuration } from '@/utils/format';
import { maskPhone } from '@/utils/phone';
import { haptic } from '@/utils/haptics';

const DEFAULT_OTP_LENGTH = 6;
const DEFAULT_RESEND_SECONDS = 60;
const MAX_BOX = 56;
/** Unicode LTR isolate so "+964 770 ••• 4567" never reorders inside Arabic text. */
const ltr = (s: string) => `⁦${s}⁩`;

const enter = (i: number) => FadeInDown.duration(350).delay(Math.min(80 + i * 60, 300));

/** "+9647701234567" → "+964 770 ••• 4567" (any country, formatted with libphonenumber). */
function maskMobile(mobile: string): string {
  return maskPhone(mobile) || mobile;
}

/** Six boxes sized from the window width: equal boxes, equal gaps, centered, fits 320pt screens. */
function useOtpRowWidth(OTP_LENGTH: number): number {
  const { width } = useWindowDimensions();
  const available = width - SCREEN_PADDING * 2;
  const gap = width < 360 ? 8 : 12;
  const box = Math.min(MAX_BOX, Math.floor((available - gap * (OTP_LENGTH - 1)) / OTP_LENGTH));
  return box * OTP_LENGTH + gap * (OTP_LENGTH - 1);
}

export default function VerifyOtpScreen() {
  const { t } = useI18n('auth');
  const { colors } = useTheme();
  const pendingMobile = useAuthStore((s) => s.pendingMobile);
  const isRegistering = useAuthStore((s) => !!s.pendingRegistration);
  const otpInfo = useAuthStore((s) => s.otp);
  const deviceSessions = useAuthStore((s) => s.deviceLimitSessions);
  const { data: config } = useAppConfig();
  const OTP_LENGTH = otpInfo?.codeLength ?? config?.otp.codeLength ?? DEFAULT_OTP_LENGTH;
  const RESEND_SECONDS = otpInfo?.resendInSeconds ?? config?.otp.resendCooldownSeconds ?? DEFAULT_RESEND_SECONDS;
  const otpWidth = useOtpRowWidth(OTP_LENGTH);
  const [revoking, setRevoking] = useState<string | null>(null);

  const [code, setCode] = useState('');
  const [error, setError] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [seconds, setSeconds] = useState(RESEND_SECONDS);
  /** Set once a verification succeeds so clearing `pendingMobile` doesn't bounce us to login. */
  const verifiedRef = useRef(false);
  const verifyingRef = useRef(false);
  /** Remember the step indicator while verifying (the store clears registration on success). */
  const [showSteps] = useState(isRegistering);

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
        const { lastError } = useAuthStore.getState();
        // Wrong/expired code: OtpInput shakes and fires haptic.error() when `error` flips on.
        // Other failures (device limit, network…) keep the code and are explained by a toast/sheet.
        if (lastError?.reason === 'OTP_INVALID' || lastError?.reason === 'OTP_EXPIRED') {
          setError(true);
          setCode('');
        } else {
          haptic.error();
        }
      }
    },
    [t, OTP_LENGTH],
  );

  /** DEVICE_LIMIT_REACHED → sign out the chosen device and retry with the same code. */
  const revokeAndRetry = useCallback(
    async (sessionId: string) => {
      if (revoking) return;
      setRevoking(sessionId);
      verifiedRef.current = true;
      const ok = await useAuthStore.getState().verifyOtp(code, sessionId);
      setRevoking(null);
      if (ok) {
        haptic.success();
        toast.success(t('otp.success'));
        router.replace('/(tabs)/home');
      } else {
        verifiedRef.current = false;
      }
    },
    [code, revoking, t],
  );
  const closeDeviceSheet = useCallback(() => useAuthStore.setState({ deviceLimitSessions: null }), []);

  const resend = useCallback(async () => {
    const { pendingMobile: mobile, resendOtp } = useAuthStore.getState();
    if (!mobile || resending) return;
    setResending(true);
    // Keeps the registration details when re-sending during sign-up.
    const sent = await resendOtp();
    setResending(false);
    if (!sent) return;
    const next = useAuthStore.getState().otp?.resendInSeconds;
    setCode('');
    setError(false);
    setSeconds(next ?? RESEND_SECONDS);
    haptic.light();
    toast.success(t('otp.resent'));
  }, [resending, t, RESEND_SECONDS]);

  const editNumber = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(auth)/login');
  };

  if (!pendingMobile && !verifiedRef.current) return null;
  const masked = ltr(otpInfo?.maskedPhone || maskMobile(pendingMobile ?? ''));

  return (
    <AuthScaffold
      title={t('otp.title')}
      subtitle={otpInfo?.channel === 'whatsapp' ? t('otp.subtitleWhatsapp', { count: OTP_LENGTH }) : t('otp.subtitle', { count: OTP_LENGTH })}
      onBack={editNumber}
      image={images.studyDesk}
      accessory={
        showSteps ? (
          <StepIndicator
            current={2}
            total={2}
            label={t('register.step', { current: 2, total: 2 })}
            caption={t('otp.stepCaption')}
          />
        ) : undefined
      }
      footer={
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
      }
    >
      {/* Sent-to card */}
      <Animated.View
        entering={enter(0)}
        style={[styles.numberCard, shadows.sm, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <View style={[styles.numberIcon, { backgroundColor: colors.accentSoft }]}>
          <Icon name="otp" size={20} color={colors.accent} />
        </View>
        <View style={styles.numberTexts}>
          <Text variant="caption" color="muted">
            {otpInfo?.channel === 'whatsapp' ? t('otp.sentToWhatsapp') : t('otp.sentTo')}
          </Text>
          <Text
            variant="bodyBold"
            tabular
            numberOfLines={1}
            accessibilityLabel={t('otp.sentToA11y', { number: pendingMobile ?? '' })}
          >
            {masked}
          </Text>
        </View>
        <PressableScale
          onPress={editNumber}
          hitSlop={HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel={t('otp.editA11y')}
          style={[styles.editBtn, { backgroundColor: colors.accentSoft }]}
        >
          <Icon name="edit" size={14} color={colors.accent} strokeWidth={2} />
          <Text variant="label" color="accent">
            {t('otp.edit')}
          </Text>
        </PressableScale>
      </Animated.View>

      {/* Code boxes */}
      <Animated.View entering={enter(1)} style={styles.otpBlock}>
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
          accessibilityLabel={t('otp.a11y', { count: OTP_LENGTH })}
          style={[styles.otp, { width: otpWidth }]}
        />
        <View style={styles.errorSlot}>
          {error ? (
            <Animated.View entering={FadeIn.duration(200)} style={styles.errorRow}>
              <Icon name="alert" size={16} color={colors.danger} />
              <Text variant="caption" color="danger" align="center" accessibilityLiveRegion="assertive" style={styles.shrink}>
                {t('otp.wrongCode')}
              </Text>
            </Animated.View>
          ) : null}
        </View>
      </Animated.View>

      {/* Resend */}
      <Animated.View entering={enter(2)} style={styles.resend}>
        {seconds > 0 ? (
          <View style={styles.countdown} accessibilityLiveRegion="none">
            <Icon name="clock" size={16} color={colors.muted} />
            <Text variant="body" color="muted" align="center" tabular>
              {`${t('otp.resendLabel')} `}
              <Text variant="bodyBold" color="ink" tabular>
                {ltr(formatDuration(seconds))}
              </Text>
            </Text>
          </View>
        ) : (
          <Animated.View entering={FadeIn.duration(250)} style={styles.resendCol}>
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
          </Animated.View>
        )}
      </Animated.View>

      <Animated.View entering={enter(3)} style={styles.demo}>
        <DemoHint title={t('demo.title')} message={t('demo.code')} />
      </Animated.View>

      <BottomSheet visible={!!deviceSessions?.length} onClose={closeDeviceSheet} title={t('deviceLimit.title')} snap="auto">
        <Text variant="body" color="muted" style={styles.sheetMessage}>
          {t('deviceLimit.message')}
        </Text>
        {(deviceSessions ?? []).map((s) => (
          <SessionRow
            key={s.id}
            session={{ id: s.id, device: s.device, location: s.location, lastActive: s.lastActive, current: false }}
            onLogout={() => void revokeAndRetry(s.id)}
          />
        ))}
      </BottomSheet>
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  numberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    paddingEnd: space.sm + 2,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  numberIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  numberTexts: { flex: 1, gap: 2 },
  editBtn: {
    height: 36,
    minWidth: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs + 2,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
  },
  otpBlock: { marginTop: space.xxxl, alignItems: 'center' },
  otp: { alignSelf: 'center' },
  errorSlot: { minHeight: 36, justifyContent: 'center', alignSelf: 'stretch' },
  errorRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs + 2 },
  shrink: { flexShrink: 1 },
  resend: { minHeight: 76, alignItems: 'center', justifyContent: 'center' },
  countdown: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  resendCol: { alignItems: 'center', gap: space.xxs },
  demo: { marginTop: space.lg },
  sheetMessage: { marginBottom: space.md },
});
