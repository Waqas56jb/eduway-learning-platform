import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertCircle, ArrowLeft, CheckCircle2, Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Input';
import { authApi } from '@/api/auth';
import { errorMessage } from '@/api/client';
import { AuthShell } from './AuthShell';
import { passwordSchema } from './password';

/** AUTH-16 — reached from the emailed link `/reset-password?token=…`. */
export default function ResetPassword() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const schema = z
    .object({ password: passwordSchema(t), confirm: z.string() })
    .refine((v) => v.password === v.confirm, { path: ['confirm'], message: t('auth.passwordMismatch') });
  type Form = z.infer<typeof schema>;
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { password: '', confirm: '' } });

  const onSubmit = async (v: Form) => {
    setError(null);
    try {
      await authApi.resetPassword(token, v.password);
      setDone(true);
      toast.success(t('auth.resetDone'));
      setTimeout(() => navigate('/login', { replace: true }), 1500);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <AuthShell title={t('auth.resetTitle')}>
      {done ? (
        <div className="text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-success/10 text-success">
            <CheckCircle2 className="h-7 w-7" />
          </span>
          <h1 className="mt-4 font-display text-xl font-bold text-primary">{t('auth.resetDone')}</h1>
        </div>
      ) : (
        <>
          <h1 className="font-display text-2xl font-bold text-primary">{t('auth.resetTitle')}</h1>
          <p className="mt-1 text-sm text-muted">{t('auth.resetSub')}</p>
          {(!token || error) && (
            <div role="alert" className="mt-5 flex items-center gap-2 rounded-lg border border-danger/20 bg-danger/5 px-3 py-2.5 text-sm text-danger">
              <AlertCircle className="h-4 w-4 shrink-0" /> {error ?? t('apiErrors.reasons.RESET_TOKEN_INVALID')}
            </div>
          )}
          <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
            <Field label={t('auth.newPassword')} error={errors.password?.message} hint={t('auth.passwordPolicy')} htmlFor="rp-pass">
              <Input id="rp-pass" type="password" autoComplete="new-password" icon={<Lock />} invalid={!!errors.password} {...register('password')} />
            </Field>
            <Field label={t('auth.confirmPassword')} error={errors.confirm?.message} htmlFor="rp-confirm">
              <Input id="rp-confirm" type="password" autoComplete="new-password" icon={<Lock />} invalid={!!errors.confirm} {...register('confirm')} />
            </Field>
            <Button type="submit" size="lg" className="w-full" loading={isSubmitting} disabled={!token}>
              {t('auth.resetSubmit')}
            </Button>
          </form>
        </>
      )}
      <Link to="/login" className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-accent">
        <ArrowLeft className="h-4 w-4 flip-rtl" /> {t('auth.backToLogin')}
      </Link>
    </AuthShell>
  );
}
