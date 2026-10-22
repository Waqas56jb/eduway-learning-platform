import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Copy, QrCode, Smartphone } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { cn } from '@/utils/cn';
import { useAuth } from '@/store/auth';
import { authApi, type MfaSetupDto } from '@/api/auth';
import { errorMessage, isApiError } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Feedback';
import { AuthShell } from './AuthShell';

export default function Verify2FA() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const stage = useAuth((s) => s.stage);
  const mfaToken = useAuth((s) => s.mfaToken);
  const remember = useAuth((s) => s.remember);
  const setSession = useAuth((s) => s.setSession);
  const setMfa = useAuth((s) => s.setMfa);
  const logout = useAuth((s) => s.logout);
  const email = (() => {
    try {
      return sessionStorage.getItem('eduway.admin.mfaEmail') ?? '';
    } catch {
      return '';
    }
  })();
  const [digits, setDigits] = useState<string[]>(Array(6).fill(''));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [setup, setSetup] = useState<MfaSetupDto | null>(null);
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const enrolling = stage === 'enroll';

  // Forced enrolment: fetch the QR / secret with the mfaToken as bearer.
  useEffect(() => {
    if (!enrolling || !mfaToken || setup) return;
    authApi
      .mfaSetup(mfaToken)
      .then(setSetup)
      .catch((e) => setError(errorMessage(e)));
  }, [enrolling, mfaToken, setup]);

  if (stage === 'auth') return <Navigate to={from} replace />;
  if ((stage !== '2fa' && stage !== 'enroll') || !mfaToken) return <Navigate to="/login" replace />;

  const code = digits.join('');

  const finish = async (value: string) => {
    const res = await authApi.verifyMfa({ mfaToken, code: value, remember });
    setSession(res.tokens, res.me, remember);
    try {
      sessionStorage.removeItem('eduway.admin.mfaEmail');
    } catch {
      /* storage unavailable */
    }
    toast.success(`${t('auth.welcome')}, ${res.me.admin.name.en.split(' ')[0] ?? ''}`);
    navigate(from, { replace: true });
  };

  const fail = (e: unknown) => {
    setError(isApiError(e) && (e.reason === 'MFA_INVALID' || e.status === 401) && !e.message ? t('auth.invalidCode') : errorMessage(e));
    setLoading(false);
    setDigits(Array(6).fill(''));
    refs.current[0]?.focus();
  };

  const submit = async (value = code) => {
    if (value.length !== 6 || loading) return;
    setLoading(true);
    setError(null);
    try {
      if (enrolling) {
        const r = await authApi.mfaEnable(value, mfaToken);
        setRecovery(r.recoveryCodes);
        setMfa(mfaToken, false, remember);
        setLoading(false);
        setDigits(Array(6).fill(''));
        return;
      }
      await finish(value);
    } catch (e) {
      fail(e);
    }
  };

  const setAt = (i: number, v: string) => {
    const clean = v.replace(/\D/g, '');
    if (clean.length > 1) {
      const next = clean.slice(0, 6).split('');
      const filled = [...next, ...Array(6 - next.length).fill('')];
      setDigits(filled);
      refs.current[Math.min(5, next.length)]?.focus();
      if (next.length === 6) submit(next.join(''));
      return;
    }
    const next = [...digits];
    next[i] = clean;
    setDigits(next);
    if (clean && i < 5) refs.current[i + 1]?.focus();
    if (next.every(Boolean)) submit(next.join(''));
  };

  return (
    <AuthShell title={t('auth.twoFaTitle')}>
      <span className="grid h-12 w-12 place-items-center rounded-xl bg-accent/10 text-accent">
        {enrolling ? <QrCode className="h-6 w-6" /> : <Smartphone className="h-6 w-6" />}
      </span>
      <h1 className="mt-4 font-display text-2xl font-bold text-primary">{enrolling ? t('auth.enrollTitle') : t('auth.twoFaTitle')}</h1>
      <p className="mt-1 text-sm text-muted">{enrolling ? t('auth.enrollSub') : t('auth.twoFaSub', { email })}</p>

      {enrolling && (
        <div className="mt-5 flex flex-col items-center gap-3 rounded-xl border border-line bg-surface-2 p-4">
          {setup ? (
            <>
              <img src={setup.qrDataUrl} alt="" className="h-40 w-40 rounded-lg bg-white p-2" />
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(setup.secret);
                  toast.success(t('toast.copied'));
                }}
                className="inline-flex items-center gap-1.5 font-mono text-xs text-ink"
                dir="ltr"
              >
                {setup.secret} <Copy className="h-3.5 w-3.5 text-muted" />
              </button>
            </>
          ) : (
            <Skeleton className="h-40 w-40 rounded-lg" />
          )}
        </div>
      )}

      {recovery && (
        <div className="mt-5 rounded-xl border border-warning/30 bg-warning/5 p-4">
          <p className="text-sm font-semibold text-ink">{t('auth.recoveryTitle')}</p>
          <p className="mt-1 text-xs text-muted">{t('auth.recoverySub')}</p>
          <div className="mt-3 grid grid-cols-2 gap-1.5 font-mono text-xs" dir="ltr">
            {recovery.map((c) => (
              <span key={c} className="rounded bg-surface px-2 py-1 ring-1 ring-line">
                {c}
              </span>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">{t('auth.recoveryNext')}</p>
        </div>
      )}

      <form
        className="mt-6"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="flex justify-between gap-2" dir="ltr" role="group" aria-label="6-digit code">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => (refs.current[i] = el)}
              value={d}
              inputMode="numeric"
              autoComplete={i === 0 ? 'one-time-code' : 'off'}
              maxLength={6}
              autoFocus={i === 0}
              aria-label={`Digit ${i + 1}`}
              onChange={(e) => setAt(i, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Backspace' && !digits[i] && i > 0) refs.current[i - 1]?.focus();
              }}
              className={cn(
                'h-14 w-full min-w-0 rounded-xl border bg-surface text-center text-xl font-bold text-primary num transition focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/15',
                error ? 'border-danger' : 'border-line',
              )}
            />
          ))}
        </div>
        {error && (
          <p role="alert" className="mt-3 flex items-center gap-1.5 text-sm text-danger">
            <AlertCircle className="h-4 w-4" /> {error}
          </p>
        )}
        <Button type="submit" size="lg" className="mt-6 w-full" loading={loading} disabled={code.length !== 6}>
          {loading ? t('auth.verifying') : enrolling ? t('auth.enrollEnable') : t('auth.verify')}
        </Button>
      </form>

      <Link
        to="/login"
        onClick={() => logout({ silent: true })}
        className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-accent"
      >
        <ArrowLeft className="h-4 w-4 flip-rtl" /> {t('auth.backToLogin')}
      </Link>
    </AuthShell>
  );
}
