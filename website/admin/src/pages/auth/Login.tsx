import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertCircle, Eye, EyeOff, KeyRound, Lock, Mail } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DEMO_EMAIL, DEMO_PASSWORD, useAuth } from '@/store/auth';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Input';
import { Checkbox } from '@/components/ui/Switch';
import { AuthShell } from './AuthShell';

export default function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const login = useAuth((s) => s.login);
  const [show, setShow] = useState(false);
  const [error, setError] = useState(false);

  const schema = z.object({
    email: z.string().email(t('auth.emailInvalid')),
    password: z.string().min(1, t('auth.passwordRequired')),
    remember: z.boolean(),
  });
  type Form = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '', remember: true } });

  const onSubmit = async (v: Form) => {
    setError(false);
    await new Promise((r) => setTimeout(r, 650));
    if (login(v.email, v.password, v.remember)) navigate('/verify-2fa');
    else setError(true);
  };

  return (
    <AuthShell title={t('auth.signIn')}>
      <h1 className="font-display text-2xl font-bold text-primary">{t('auth.welcome')}</h1>
      <p className="mt-1 text-sm text-muted">{t('auth.signInSub')}</p>

      {error && (
        <div role="alert" className="mt-5 flex items-center gap-2 rounded-lg border border-danger/20 bg-danger/5 px-3 py-2.5 text-sm text-danger">
          <AlertCircle className="h-4 w-4 shrink-0" /> {t('auth.invalid')}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
        <Field label={t('auth.email')} error={errors.email?.message} htmlFor="email">
          <Input id="email" type="email" autoComplete="username" icon={<Mail />} placeholder="name@eduway.iq" invalid={!!errors.email} {...register('email')} />
        </Field>
        <Field label={t('auth.password')} error={errors.password?.message} htmlFor="password">
          <div className="relative">
            <Input id="password" type={show ? 'text' : 'password'} autoComplete="current-password" icon={<Lock />} className="[&_input]:pe-10" invalid={!!errors.password} {...register('password')} />
            <button type="button" onClick={() => setShow((s) => !s)} className="absolute end-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted hover:text-ink" aria-label={show ? 'Hide password' : 'Show password'}>
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Field>
        <div className="flex items-center justify-between">
          <Checkbox label={t('auth.remember')} checked={watch('remember')} onChange={(e) => setValue('remember', e.target.checked)} />
          <Link to="/forgot-password" className="text-sm font-medium text-accent hover:underline">
            {t('auth.forgot')}
          </Link>
        </div>
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
          {isSubmitting ? t('auth.signingIn') : t('auth.signIn')}
        </Button>
      </form>

      <button
        type="button"
        onClick={() => {
          setValue('email', DEMO_EMAIL, { shouldValidate: true });
          setValue('password', DEMO_PASSWORD, { shouldValidate: true });
        }}
        className="mt-6 flex w-full items-center gap-3 rounded-xl border border-dashed border-accent/50 bg-accent/[0.05] px-4 py-3 text-start transition hover:bg-accent/10"
      >
        <KeyRound className="h-4 w-4 shrink-0 text-accent" />
        <span className="text-xs">
          <span className="block font-semibold text-ink">{t('auth.demoHint')}</span>
          <span className="text-muted" dir="ltr">
            {DEMO_EMAIL} · {DEMO_PASSWORD} · 2FA 123456
          </span>
        </span>
      </button>
    </AuthShell>
  );
}
