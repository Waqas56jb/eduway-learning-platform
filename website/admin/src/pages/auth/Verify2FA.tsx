import { useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Smartphone } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { cn } from '@/utils/cn';
import { useAuth, useCurrentAdmin } from '@/store/auth';
import { Button } from '@/components/ui/Button';
import { AuthShell } from './AuthShell';

export default function Verify2FA() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const stage = useAuth((s) => s.stage);
  const verify = useAuth((s) => s.verify2fa);
  const logout = useAuth((s) => s.logout);
  const admin = useCurrentAdmin();
  const [digits, setDigits] = useState<string[]>(Array(6).fill(''));
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  if (stage === 'auth') return <Navigate to="/" replace />;
  if (stage !== '2fa') return <Navigate to="/login" replace />;

  const code = digits.join('');

  const submit = async (value = code) => {
    if (value.length !== 6) return;
    setLoading(true);
    setError(false);
    await new Promise((r) => setTimeout(r, 600));
    if (verify(value)) {
      toast.success(`${t('auth.welcome')}, ${admin?.name.split(' ')[0] ?? ''}`);
      navigate('/', { replace: true });
    } else {
      setError(true);
      setLoading(false);
      setDigits(Array(6).fill(''));
      refs.current[0]?.focus();
    }
  };

  const setAt = (i: number, v: string) => {
    const clean = v.replace(/\D/g, '');
    if (clean.length > 1) {
      // Paste of the full code
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
        <Smartphone className="h-6 w-6" />
      </span>
      <h1 className="mt-4 font-display text-2xl font-bold text-primary">{t('auth.twoFaTitle')}</h1>
      <p className="mt-1 text-sm text-muted">{t('auth.twoFaSub', { email: admin?.email ?? '' })}</p>

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
            <AlertCircle className="h-4 w-4" /> {t('auth.invalidCode')}
          </p>
        )}
        <Button type="submit" size="lg" className="mt-6 w-full" loading={loading} disabled={code.length !== 6}>
          {loading ? t('auth.verifying') : t('auth.verify')}
        </Button>
      </form>

      <p className="mt-4 rounded-lg bg-surface-2 px-3 py-2 text-center text-xs text-muted">
        {t('auth.demoHint')}: <span className="font-semibold text-ink num">123456</span>
      </p>

      <Link
        to="/login"
        onClick={() => logout()}
        className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-accent"
      >
        <ArrowLeft className="h-4 w-4 flip-rtl" /> {t('auth.backToLogin')}
      </Link>
    </AuthShell>
  );
}
