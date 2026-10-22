import { ArrowRight, LockKeyhole, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AuthLayout, DemoHint } from '@/components/auth/AuthLayout';
import { PhoneInput } from '@/components/auth/PhoneInput';
import { demoPhone, emptyPhone } from '@/components/auth/mobile';
import { DEFAULT_COUNTRY, isValidPhone, phoneToE164, type PhoneValue } from '@/lib/phone';
import { errorMessage, isApiError } from '@/api/client';
import { Button, Seo } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { IMAGES } from '@/lib/images';

interface LoginForm {
  mobile: PhoneValue;
}

export default function Login() {
  const { t } = useTranslation();
  const { requestOtp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  const {
    control,
    handleSubmit,
    setValue,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ defaultValues: { mobile: emptyPhone() } });
  const country = watch('mobile').country;

  const onSubmit = async ({ mobile }: LoginForm) => {
    try {
      await requestOtp(phoneToE164(mobile));
      navigate('/verify-otp', { state: { from } });
    } catch (e) {
      // ACCOUNT_NOT_FOUND / ACCOUNT_LOCKED / OTP_RESEND_* … shown inline under the field.
      setError('mobile', { type: 'server', message: errorMessage(e) });
      if (isApiError(e) && e.reason === 'ACCOUNT_NOT_FOUND') setNotFound(true);
    }
  };
  const [notFound, setNotFound] = useState(false);

  const fillDemo = () => {
    setValue('mobile', demoPhone(), { shouldValidate: true });
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
        <Controller
          name="mobile"
          control={control}
          rules={{
            validate: (v) => (!v.national.trim() ? t('validation.required') : isValidPhone(v) || t('validation.mobile')),
          }}
          render={({ field }) => (
            <PhoneInput
              label={t('auth.mobile.label')}
              placeholder={country === DEFAULT_COUNTRY ? t('auth.mobile.placeholder') : undefined}
              hint={country === DEFAULT_COUNTRY ? t('auth.mobile.hint') : t('auth.phone.hint')}
              error={errors.mobile?.message}
              autoFocus
              ref={field.ref}
              name={field.name}
              value={field.value}
              onBlur={field.onBlur}
              onChange={(v) => {
                field.onChange(v);
                setNotFound(false);
              }}
            />
          )}
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
