import { ArrowRight, Gift, MapPin, School, UserRound } from 'lucide-react';
import { Controller, useForm } from 'react-hook-form';
import { Trans, useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AuthLayout, AuthSteps, DemoHint } from '@/components/auth/AuthLayout';
import { MobileInput } from '@/components/auth/MobileInput';
import { isIraqiMobile, normalizeMobile } from '@/components/auth/mobile';
import { Button, Checkbox, Input, Select, Seo } from '@/components/ui';
import { governorates } from '@/data';
import { useAuth } from '@/hooks/useAuth';
import { useLang } from '@/hooks/useLang';
import { IMAGES } from '@/lib/images';

interface RegisterForm {
  name: string;
  mobile: string;
  governorate: string;
  school: string;
  referral: string;
  terms: boolean;
}

const linkCls = 'font-semibold text-primary underline decoration-accent/60 underline-offset-4 hover:text-accent';

export default function Register() {
  const { t } = useTranslation();
  const { l } = useLang();
  const { register: registerUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<RegisterForm>({
    defaultValues: { name: '', mobile: '', governorate: '', school: '', referral: '', terms: false },
  });

  const onSubmit = async (v: RegisterForm) => {
    await registerUser({
      name: v.name.trim(),
      mobile: normalizeMobile(v.mobile),
      governorate: v.governorate,
      school: v.school.trim() || undefined,
      referral: v.referral.trim().toUpperCase() || undefined,
    });
    navigate('/verify-otp', { state: { from } });
  };

  return (
    <AuthLayout variant="register" image={IMAGES.library} above={<AuthSteps current={1} />}>
      <Seo title={t('auth.register.seoTitle')} description={t('auth.register.seoDescription')} />

      <h1 className="text-3xl font-bold text-primary sm:text-4xl">{t('auth.register.title')}</h1>
      <p className="mt-2 text-muted">{t('auth.register.subtitle')}</p>

      <form className="mt-8 space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
        <Input
          label={t('auth.register.name')}
          placeholder={t('auth.register.namePlaceholder')}
          autoComplete="name"
          icon={<UserRound className="h-4 w-4" aria-hidden />}
          error={errors.name?.message}
          {...register('name', {
            required: t('validation.required'),
            validate: (v) => v.trim().length >= 3 || t('validation.minLength', { count: 3 }),
          })}
        />

        <MobileInput
          label={t('auth.mobile.label')}
          placeholder={t('auth.mobile.placeholder')}
          error={errors.mobile?.message}
          {...register('mobile', {
            required: t('validation.required'),
            validate: (v) => isIraqiMobile(v) || t('validation.mobile'),
          })}
        />

        <div className="relative">
          <Select
            label={t('auth.register.governorate')}
            error={errors.governorate?.message}
            className="ps-11"
            {...register('governorate', { required: t('validation.required') })}
          >
            <option value="" disabled>
              {t('auth.register.governoratePlaceholder')}
            </option>
            {governorates.map((g) => (
              <option key={g.id} value={g.id}>
                {l(g.name)}
              </option>
            ))}
          </Select>
          <MapPin className="pointer-events-none absolute start-4 top-[2.7rem] h-4 w-4 text-muted" aria-hidden />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Input
            label={t('auth.register.school')}
            optional={t('common.optional')}
            placeholder={t('auth.register.schoolPlaceholder')}
            icon={<School className="h-4 w-4" aria-hidden />}
            autoComplete="organization"
            {...register('school')}
          />
          <Input
            label={t('auth.register.referral')}
            optional={t('common.optional')}
            placeholder={t('auth.register.referralPlaceholder')}
            icon={<Gift className="h-4 w-4" aria-hidden />}
            className="num uppercase tracking-wider"
            dir="ltr"
            autoCapitalize="characters"
            autoComplete="off"
            error={errors.referral?.message}
            {...register('referral', {
              validate: (v) => !v.trim() || /^[A-Za-z0-9-]{4,12}$/.test(v.trim()) || t('auth.register.referralInvalid'),
            })}
          />
        </div>

        <Controller
          name="terms"
          control={control}
          rules={{ validate: (v) => v || t('validation.terms') }}
          render={({ field, fieldState }) => (
            <Checkbox
              name={field.name}
              checked={field.value}
              onChange={(e) => field.onChange(e.target.checked)}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
              label={
                <Trans
                  i18nKey="auth.register.terms"
                  components={{
                    terms: <Link to="/terms" target="_blank" className={linkCls} />,
                    privacy: <Link to="/privacy" target="_blank" className={linkCls} />,
                  }}
                />
              }
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
          {isSubmitting ? t('auth.register.submitting') : t('auth.register.submit')}
        </Button>
      </form>

      <DemoHint>{t('auth.demo.register')}</DemoHint>

      <p className="mt-8 text-center text-sm text-muted">
        {t('auth.register.haveAccount')}{' '}
        <Link to="/login" state={{ from }} className="font-semibold text-primary underline-offset-4 hover:text-accent hover:underline">
          {t('auth.register.login')}
        </Link>
      </p>
    </AuthLayout>
  );
}
