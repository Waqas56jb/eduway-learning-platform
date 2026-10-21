import { AnimatePresence, motion, useAnimationControls } from 'framer-motion';
import { Check, MessageSquareText, PencilLine, RotateCw, ShieldCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AuthLayout, AuthSteps, DemoHint } from '@/components/auth/AuthLayout';
import { OtpInput, type OtpInputHandle } from '@/components/auth/OtpInput';
import { maskMobile } from '@/components/auth/mobile';
import { Button, Seo, useToast } from '@/components/ui';
import { DEMO_OTP } from '@/context/AuthContext';
import { useAuth } from '@/hooks/useAuth';
import { IMAGES } from '@/lib/images';
import { formatClock } from '@/lib/utils';

const LENGTH = 6;
const RESEND_SECONDS = 60;
const empty = () => Array.from({ length: LENGTH }, () => '');

type Status = 'idle' | 'verifying' | 'error' | 'success';

export default function VerifyOtp() {
  const { t } = useTranslation();
  const { pending, verifyOtp, requestOtp } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  const [digits, setDigits] = useState<string[]>(empty);
  const [status, setStatus] = useState<Status>('idle');
  const [seconds, setSeconds] = useState(RESEND_SECONDS);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  const otpRef = useRef<OtpInputHandle>(null);
  const shake = useAnimationControls();

  useEffect(() => {
    if (seconds <= 0) return;
    const id = window.setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => window.clearTimeout(id);
  }, [seconds]);

  if (!pending && status !== 'success') return <Navigate to="/login" replace state={{ from }} />;

  const verify = async (code: string) => {
    if (status === 'verifying' || status === 'success') return;
    if (code.length < LENGTH) {
      setError(t('validation.otp'));
      setStatus('error');
      void shake.start({ x: [0, -10, 10, -8, 8, -4, 4, 0], transition: { duration: 0.5 } });
      return;
    }
    setStatus('verifying');
    if (code === DEMO_OTP) {
      // Celebrate first: once verifyOtp resolves the user is signed in and this guest route unmounts.
      setStatus('success');
      toast.success(t('auth.verify.successToast'), t('auth.verify.successBody'));
      await new Promise((r) => setTimeout(r, 900));
    }
    const ok = await verifyOtp(code);
    if (ok) {
      navigate(from || '/student/dashboard', { replace: true });
      return;
    }
    setError(t('validation.otpInvalid'));
    setStatus('error');
    setDigits(empty());
    void shake.start({ x: [0, -10, 10, -8, 8, -4, 4, 0], transition: { duration: 0.5 } });
    otpRef.current?.focus(0);
  };

  const resend = async () => {
    if (!pending) return;
    setResending(true);
    await requestOtp(pending.mobile);
    setResending(false);
    setSeconds(RESEND_SECONDS);
    setDigits(empty());
    setStatus('idle');
    otpRef.current?.focus(0);
    toast.info(t('auth.verify.resentToast'), t('auth.verify.resentBody'));
  };

  const mobile = pending ? maskMobile(pending.mobile) : '';
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
            <p className="mt-2 text-muted">{t('auth.verify.subtitle')}</p>
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

            <DemoHint>{t('auth.demo.otp', { code: DEMO_OTP })}</DemoHint>

            <p className="mt-6 flex items-center justify-center gap-2 text-xs text-muted">
              <ShieldCheck className="h-3.5 w-3.5 text-accent" aria-hidden />
              {t('auth.verify.secure')}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </AuthLayout>
  );
}
