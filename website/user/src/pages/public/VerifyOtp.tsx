import { AnimatePresence, motion, useAnimationControls } from 'framer-motion';
import { Check, LogOut, MessageCircle, MessageSquareText, Monitor, PencilLine, RotateCw, ShieldCheck, Smartphone } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AuthLayout, AuthSteps, DemoHint } from '@/components/auth/AuthLayout';
import { OtpInput, type OtpInputHandle } from '@/components/auth/OtpInput';
import { maskMobile } from '@/components/auth/mobile';
import { errorMessage, isApiError } from '@/api/client';
import type { SessionDto } from '@/api/types';
import { Button, Modal, Seo, useToast } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { useLang } from '@/hooks/useLang';
import { IMAGES } from '@/lib/images';
import { formatClock } from '@/lib/utils';

/** Seeded demo student's dev code (server: settings.otp.devBypassCode, non-production only). */
const DEV_OTP = '123456';
const empty = (n: number) => Array.from({ length: n }, () => '');
const secondsLeft = (sentAt: number, total: number) => Math.max(0, Math.ceil(total - (Date.now() - sentAt) / 1000));

type Status = 'idle' | 'verifying' | 'error' | 'success';

export default function VerifyOtp() {
  const { t } = useTranslation();
  const { pending, verifyOtp, resendOtp, completeSignIn } = useAuth();
  const { l, fmtRelative } = useLang();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  // Code length + resend cooldown come from the send-otp response (settings-driven).
  const LENGTH = pending?.codeLength ?? 6;
  const [digits, setDigits] = useState<string[]>(() => empty(LENGTH));
  const [status, setStatus] = useState<Status>('idle');
  const [seconds, setSeconds] = useState(() => (pending ? secondsLeft(pending.sentAt, pending.resendInSeconds) : 60));
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  // DEVICE_LIMIT_REACHED -> let the student sign out one device, then retry with `revokeSessionId`.
  const [deviceLimit, setDeviceLimit] = useState<{ code: string; sessions: SessionDto[] } | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  useEffect(() => {
    if (digits.length !== LENGTH) setDigits(empty(LENGTH));
  }, [LENGTH, digits.length]);
  const otpRef = useRef<OtpInputHandle>(null);
  const shake = useAnimationControls();

  useEffect(() => {
    if (seconds <= 0) return;
    const id = window.setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => window.clearTimeout(id);
  }, [seconds]);

  if (!pending && status !== 'success') return <Navigate to="/login" replace state={{ from }} />;

  const fail = (message: string) => {
    setError(message);
    setStatus('error');
    setDigits(empty(LENGTH));
    void shake.start({ x: [0, -10, 10, -8, 8, -4, 4, 0], transition: { duration: 0.5 } });
    otpRef.current?.focus(0);
  };

  const verify = async (code: string, revokeSessionId?: string) => {
    if (status === 'verifying' || status === 'success') return;
    if (code.length < LENGTH) {
      setError(t('validation.otp'));
      setStatus('error');
      void shake.start({ x: [0, -10, 10, -8, 8, -4, 4, 0], transition: { duration: 0.5 } });
      return;
    }
    setStatus('verifying');
    try {
      const res = await verifyOtp(code, revokeSessionId);
      setDeviceLimit(null);
      // Celebrate first: once the session is committed this guest route unmounts.
      setStatus('success');
      toast.success(t('auth.verify.successToast'), t('auth.verify.successBody'));
      await new Promise((r) => setTimeout(r, 900));
      completeSignIn(res);
      navigate(from || '/student/dashboard', { replace: true });
    } catch (e) {
      if (isApiError(e) && e.reason === 'DEVICE_LIMIT_REACHED') {
        setStatus('idle');
        setDeviceLimit({ code, sessions: (e.details.sessions as SessionDto[] | undefined) ?? [] });
        return;
      }
      if (isApiError(e) && e.reason === 'ACCOUNT_NOT_FOUND') {
        toast.error(errorMessage(e));
        navigate('/register', { replace: true, state: { from } });
        return;
      }
      fail(errorMessage(e));
    }
  };

  const signOutDevice = async (sessionId: string) => {
    if (!deviceLimit) return;
    setRevoking(sessionId);
    await verify(deviceLimit.code, sessionId);
    setRevoking(null);
  };

  const resend = async () => {
    if (!pending) return;
    setResending(true);
    try {
      const res = await resendOtp();
      setSeconds(res.resendInSeconds);
      setDigits(empty(res.codeLength));
      setStatus('idle');
      otpRef.current?.focus(0);
      toast.info(t('auth.verify.resentToast'), res.channel === 'whatsapp' ? t('auth.verify.resentBodyWhatsapp') : t('auth.verify.resentBody'));
    } catch (e) {
      if (isApiError(e) && e.retryAfterSeconds) setSeconds(e.retryAfterSeconds);
      setError(errorMessage(e));
      setStatus('error');
    } finally {
      setResending(false);
    }
  };

  const mobile = pending ? pending.maskedPhone || maskMobile(pending.phone) : '';
  const isRegister = pending?.mode === 'register';
  const busy = status === 'verifying' || status === 'success';

  return (
    <AuthLayout variant="verify" image={IMAGES.studentLaptop} above={isRegister ? <AuthSteps current={2} /> : undefined}>
      <Seo title={t('auth.verify.seoTitle')} description={t('auth.verify.seoDescription')} />

      <AnimatePresence mode="wait" initial={false}>
        {status === 'success' ? (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center py-8 text-center"
            role="status"
            aria-live="polite"
          >
            <div className="relative">
              <motion.span
                className="absolute inset-0 rounded-full bg-accent/30"
                initial={{ scale: 1, opacity: 0.7 }}
                animate={{ scale: 1.9, opacity: 0 }}
                transition={{ duration: 1.2, repeat: Infinity, ease: 'easeOut' }}
                aria-hidden
              />
              <motion.span
                className="relative flex h-24 w-24 items-center justify-center rounded-full bg-gold-grad shadow-glow"
                initial={{ scale: 0, rotate: -45 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 260, damping: 16 }}
              >
                <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.25, type: 'spring', stiffness: 400 }}>
                  <Check className="h-12 w-12 text-primary" strokeWidth={3} aria-hidden />
                </motion.span>
              </motion.span>
            </div>
            <h1 className="mt-8 text-3xl font-bold text-primary">{t('auth.verify.successTitle')}</h1>
            <p className="mt-2 text-muted">{t('auth.verify.redirecting')}</p>
          </motion.div>
        ) : (
          <motion.div key="form" exit={{ opacity: 0, scale: 0.98 }}>
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-accent-light shadow-soft">
              <MessageSquareText className="h-6 w-6" aria-hidden />
            </span>
            <h1 className="mt-6 text-3xl font-bold text-primary sm:text-4xl">{t('auth.verify.title')}</h1>
            <p className="mt-2 text-muted">{pending?.channel === 'whatsapp' ? t('auth.verify.subtitleWhatsapp') : t('auth.verify.subtitle')}</p>
            {pending?.channel === 'whatsapp' && (
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#25D366]/10 px-3 py-1 text-xs font-semibold text-[#128C7E]" role="status">
                <MessageCircle className="h-3.5 w-3.5" aria-hidden />
                {t('auth.verify.sentViaWhatsapp')}
              </p>
            )}
            <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span dir="ltr" className="num font-bold tracking-wide text-primary">
                {mobile}
              </span>
              <Link
                to={isRegister ? '/register' : '/login'}
                state={{ from }}
                className="inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline"
              >
                <PencilLine className="h-3.5 w-3.5" aria-hidden />
                {t('auth.verify.changeNumber')}
              </Link>
            </p>

            <form
              className="mt-8"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                void verify(digits.join(''));
              }}
            >
              <motion.div animate={shake}>
                <OtpInput
                  ref={otpRef}
                  value={digits}
                  onChange={(next) => {
                    setDigits(next);
                    if (status === 'error') setStatus('idle');
                  }}
                  onComplete={(code) => void verify(code)}
                  disabled={busy}
                  invalid={status === 'error'}
                  describedBy="otp-status"
                />
              </motion.div>

              <p id="otp-status" aria-live="assertive" className="mt-3 min-h-[1.25rem] text-center text-sm text-danger">
                {status === 'error' ? error : ''}
              </p>

              <Button type="submit" variant="gold" size="lg" fullWidth loading={status === 'verifying'} className="mt-4">
                {status === 'verifying' ? t('auth.verify.verifying') : t('auth.verify.submit')}
              </Button>
            </form>

            <div className="mt-6 flex items-center justify-center text-sm" aria-live="polite">
              {seconds > 0 ? (
                <p className="text-muted">
                  {t('auth.verify.resendIn')}{' '}
                  <span dir="ltr" className="num font-semibold text-primary">
                    {formatClock(seconds)}
                  </span>
                </p>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void resend()}
                  loading={resending}
                  leftIcon={<RotateCw className="h-4 w-4" aria-hidden />}
                >
                  {t('auth.verify.resend')}
                </Button>
              )}
            </div>

            <DemoHint>{t('auth.demo.otp', { code: DEV_OTP })}</DemoHint>

            <p className="mt-6 flex items-center justify-center gap-2 text-xs text-muted">
              <ShieldCheck className="h-3.5 w-3.5 text-accent" aria-hidden />
              {t('auth.verify.secure')}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <Modal
        open={!!deviceLimit}
        onClose={() => setDeviceLimit(null)}
        title={t('system.deviceLimit.title')}
        description={t('system.deviceLimit.body')}
      >
        <ul className="space-y-2">
          {deviceLimit?.sessions.map((s) => {
            const Icon = s.platform === 'web' ? Monitor : Smartphone;
            return (
              <li key={s.id} className="flex items-center gap-3 rounded-xl border border-primary/10 px-4 py-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/5 text-primary">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-primary">{s.device}</span>
                  <span className="block truncate text-xs text-muted">
                    {l(s.location)} · {fmtRelative(s.lastActive, { clampFuture: true })}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  loading={revoking === s.id}
                  disabled={!!revoking && revoking !== s.id}
                  onClick={() => void signOutDevice(s.id)}
                  leftIcon={<LogOut className="h-3.5 w-3.5 rtl:-scale-x-100" aria-hidden />}
                >
                  {t('system.deviceLimit.revoke')}
                </Button>
              </li>
            );
          })}
        </ul>
      </Modal>
    </AuthLayout>
  );
}
