import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertCircle, ArrowLeft, Lock, MailCheck, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Feedback';
import { authApi } from '@/api/auth';
import { errorMessage } from '@/api/client';
import { useAuth } from '@/store/auth';
import { useLang } from '@/hooks/useLocale';
import { fmtDateTime } from '@/utils/format';
import { AuthShell } from './AuthShell';
import { passwordSchema } from './password';

/** AUTH-17/18 — reached from the invitation email `/accept-invite?token=…`. */
export default function AcceptInvite() {
  const { t } = useTranslation();
  const lang = useLang();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const setSession = useAuth((s) => s.setSession);
  const [error, setError] = useState<string | null>(null);

  const invite = useQuery({
    queryKey: ['invite', token],
    queryFn: () => authApi.invite(token),
    enabled: !!token,
    retry: false,
    meta: { silentError: true },
  });

  const schema = z
    .object({
      name_en: z.string().trim().min(3, t('errors.min', { min: 3 })),
      name_ar: z.string().trim().min(3, t('errors.min', { min: 3 })),
      password: passwordSchema(t),
      confirm: z.string(),
    })
    .refine((v) => v.password === v.confirm, { path: ['confirm'], message: t('auth.passwordMismatch') });
  type Form = z.infer<typeof schema>;
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Form>({
    resolver: zodResolver(schema),
    values: invite.data ? { name_en: invite.data.name.en, name_ar: invite.data.name.ar, password: '', confirm: '' } : undefined,
  });

  const onSubmit = async (v: Form) => {
    setError(null);
    try {
      const res = await authApi.acceptInvite({ token, password: v.password, name: { en: v.name_en, ar: v.name_ar } });
      setSession(res.tokens, res.me, true);
      if (res.mfaEnrollmentRequired) {
        // The session is active; MFA enrolment continues from Profile → Security.
        toast(t('auth.inviteMfaRequired'));
        navigate('/profile', { replace: true });
        return;
      }
      toast.success(`${t('auth.welcome')}, ${res.me.admin.name.en.split(' ')[0] ?? ''}`);
      navigate('/', { replace: true });
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const invalid = !token || invite.isError;

  return (
    <AuthShell title={t('auth.inviteTitle')}>
      <span className="grid h-12 w-12 place-items-center rounded-xl bg-accent/10 text-accent">
        <MailCheck className="h-6 w-6" />
      </span>
      <h1 className="mt-4 font-display text-2xl font-bold text-primary">{t('auth.inviteTitle')}</h1>
      {token && invite.isLoading ? (
        <div className="mt-3 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : invalid ? (
        <div role="alert" className="mt-5 flex items-center gap-2 rounded-lg border border-danger/20 bg-danger/5 px-3 py-2.5 text-sm text-danger">
          <AlertCircle className="h-4 w-4 shrink-0" /> {invite.error ? errorMessage(invite.error) : t('apiErrors.reasons.INVITE_INVALID')}
        </div>
      ) : (
        invite.data && (
          <>
            <p className="mt-1 text-sm text-muted">{t('auth.inviteSub', { email: invite.data.email, role: invite.data.roleName[lang] })}</p>
            <p className="mt-1 text-xs text-muted">{t('auth.inviteExpires', { date: fmtDateTime(invite.data.expiresAt) })}</p>
            {error && (
              <div role="alert" className="mt-5 flex items-center gap-2 rounded-lg border border-danger/20 bg-danger/5 px-3 py-2.5 text-sm text-danger">
                <AlertCircle className="h-4 w-4 shrink-0" /> {error}
              </div>
            )}
            <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('auth.nameEn')} error={errors.name_en?.message} htmlFor="ai-name-en">
                  <Input id="ai-name-en" icon={<UserRound />} invalid={!!errors.name_en} {...register('name_en')} />
                </Field>
                <Field label={t('auth.nameAr')} error={errors.name_ar?.message} htmlFor="ai-name-ar">
                  <Input id="ai-name-ar" dir="rtl" icon={<UserRound />} invalid={!!errors.name_ar} {...register('name_ar')} />
                </Field>
              </div>
              <Field label={t('auth.newPassword')} error={errors.password?.message} hint={t('auth.passwordPolicy')} htmlFor="ai-pass">
                <Input id="ai-pass" type="password" autoComplete="new-password" icon={<Lock />} invalid={!!errors.password} {...register('password')} />
              </Field>
              <Field label={t('auth.confirmPassword')} error={errors.confirm?.message} htmlFor="ai-confirm">
                <Input id="ai-confirm" type="password" autoComplete="new-password" icon={<Lock />} invalid={!!errors.confirm} {...register('confirm')} />
              </Field>
              <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
                {t('auth.inviteAccept')}
              </Button>
            </form>
          </>
        )
      )}
      <Link to="/login" className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-accent">
        <ArrowLeft className="h-4 w-4 flip-rtl" /> {t('auth.backToLogin')}
      </Link>
    </AuthShell>
  );
}
