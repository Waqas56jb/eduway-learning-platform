import { ArrowRight, LockKeyhole, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AuthLayout, DemoHint } from '@/components/auth/AuthLayout';
import { MobileInput } from '@/components/auth/MobileInput';
import { DEMO_MOBILE, isIraqiMobile, normalizeMobile } from '@/components/auth/mobile';
import { errorMessage, isApiError } from '@/api/client';
import { Button, Seo } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { IMAGES } from '@/lib/images';

interface LoginForm {
  mobile: string;
}

export default function Login() {
  const { t } = useTranslation();
  const { requestOtp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ defaultValues: { mobile: '' } });

  const onSubmit = async ({ mobile }: LoginForm) => {
    try {
      await requestOtp(normalizeMobile(mobile));
      navigate('/verify-otp', { state: { from } });
    } catch (e) {
      // ACCOUNT_NOT_FOUND / ACCOUNT_LOCKED / OTP_RESEND_* … shown inline under the field.
      setError('mobile', { type: 'server', message: errorMessage(e) });
      if (isApiError(e) && e.reason === 'ACCOUNT_NOT_FOUND') setNotFound(true);
    }
  };
  const [notFound, setNotFound] = useState(false);

  const fillDemo = () => {
    setValue('mobile', DEMO_MOBILE, { shouldValidate: true });
    void handleSubmit(onSubmit)();
  };

  return (
    <AuthLayout variant="login" image={IMAGES.studentBooks}>
      <Seo title={t('auth.login.seoTitle')} description={t('auth.login.seoDescription')} />

      <span className="eyebrow">
        <Sparkles className="h-3.5 w-3.5" aria-hidden />
        {t('auth.login.eyebrow')}
      </span>
      <h1 className="mt-4 text-3xl font-bold text-primary sm:text-4xl">{t('auth.login.title')}</h1>
      <p className="mt-2 text-muted">{t('auth.login.subtitle')}</p>

      <form className="mt-8 space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
        <MobileInput
          label={t('auth.mobile.label')}
          placeholder={t('auth.mobile.placeholder')}
          hint={t('auth.mobile.hint')}
          error={errors.mobile?.message}
          autoFocus
            {...register('mobile', {
            required: t('validation.required'),
            validate: (v) => isIraqiMobile(v) || t('validation.mobile'),
            onChange: () => setNotFound(false),
          })}
        />

        <Button
          type="submit"
          variant="gold"
          size="lg"
          fullWidth
          loading={isSubmitting}
          rightIcon={<ArrowRight className="h-5 w-5 rtl:-scale-x-100" aria-hidden />}
        >
          {isSubmitting ? t('auth.login.sending') : t('auth.login.submit')}
        </Button>

        {notFound && (
          <Button to="/register" variant="outline" fullWidth>
            {t('auth.login.register')}
          </Button>
        )}

        <p className="flex items-center justify-center gap-2 text-xs text-muted">
          <LockKeyhole className="h-3.5 w-3.5 text-accent" aria-hidden />
          {t('auth.login.secure')}
        </p>
      </form>

      <DemoHint
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={fillDemo}
            disabled={isSubmitting}
            rightIcon={<ArrowRight className="h-4 w-4 rtl:-scale-x-100" aria-hidden />}
          >
            {t('auth.demo.useAccount')}
          </Button>
        }
      >
        {t('auth.demo.login')}
      </DemoHint>

      <p className="mt-8 text-center text-sm text-muted">
        {t('auth.login.noAccount')}{' '}
        <Link to="/register" state={{ from }} className="font-semibold text-primary underline-offset-4 hover:text-accent hover:underline">
          {t('auth.login.register')}
        </Link>
      </p>
    </AuthLayout>
  );
}
