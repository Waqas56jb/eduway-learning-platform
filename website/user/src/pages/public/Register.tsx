import { ArrowRight, CheckCircle2, Gift, MapPin, School, UserRound } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Trans, useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AuthLayout, AuthSteps, DemoHint } from '@/components/auth/AuthLayout';
import { MobileInput } from '@/components/auth/MobileInput';
import { isIraqiMobile, normalizeMobile } from '@/components/auth/mobile';
import { Button, Checkbox, Input, Select, Seo } from '@/components/ui';
import { errorMessage, isApiError } from '@/api/client';
import { useLegalDocument } from '@/api/legal';
import { useGovernorates, useReferralCheck, useSchools } from '@/api/public';
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
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterForm>({
    defaultValues: { name: '', mobile: '', governorate: '', school: '', referral: '', terms: false },
  });

  // PUB-02 governorates, PUB-03 school suggestions (directory pick or free text), PUB-04 referral check,
  // PUB-11 current legal versions (sent as `acceptedLegal`).
  const { data: governorates = [], isLoading: govLoading } = useGovernorates();
  const governorate = watch('governorate');
  const schoolText = watch('school');
  const [schoolQ, setSchoolQ] = useState('');
  useEffect(() => {
    const id = window.setTimeout(() => setSchoolQ(schoolText.trim()), 250);
    return () => window.clearTimeout(id);
  }, [schoolText]);
  const { data: schools = [] } = useSchools(governorate || undefined, schoolQ || undefined, !!governorate || schoolQ.length >= 2);
  const schoolListId = useId();

  const referral = watch('referral').trim();
  const referralFormatOk = /^[A-Za-z0-9-]{4,20}$/.test(referral);
  const [referralToCheck, setReferralToCheck] = useState('');
  useEffect(() => {
    const id = window.setTimeout(() => setReferralToCheck(referralFormatOk ? referral : ''), 400);
    return () => window.clearTimeout(id);
  }, [referral, referralFormatOk]);
  const referralCheck = useReferralCheck(referralToCheck, !!referralToCheck);
  const referralInvalidRemote = !!referralToCheck && referralCheck.data?.valid === false;

  const terms = useLegalDocument('terms');
  const privacy = useLegalDocument('privacy');

  const onSubmit = async (v: RegisterForm) => {
    const name = v.school.trim();
    const match = schools.find((s) => s.name.en.toLowerCase() === name.toLowerCase() || s.name.ar === name);
    const acceptedLegal = [
      ...(terms.data ? [{ doc: 'terms' as const, version: terms.data.version }] : []),
      ...(privacy.data ? [{ doc: 'privacy' as const, version: privacy.data.version }] : []),
    ];
    try {
      await registerUser({
        name: v.name.trim(),
        mobile: normalizeMobile(v.mobile),
        governorate: v.governorate,
        schoolId: match?.id ?? null,
        schoolName: match ? undefined : name || undefined,
        referral: v.referral.trim().toUpperCase() || undefined,
        acceptedLegal,
      });
      navigate('/verify-otp', { state: { from } });
    } catch (e) {
      const field = isApiError(e) && e.reason === 'REFERRAL_CODE_INVALID' ? 'referral' : 'mobile';
      const fields = isApiError(e) ? (e.details.fields as Record<string, string> | undefined) : undefined;
      if (fields?.name) setError('name', { type: 'server', message: fields.name });
      setError(field, { type: 'server', message: fields?.phone ?? errorMessage(e) });
    }
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
              {govLoading ? t('common.loading') : t('auth.register.governoratePlaceholder')}
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
            list={schoolListId}
            {...register('school', { maxLength: { value: 80, message: t('validation.maxLength', { count: 80 }) } })}
          />
          <datalist id={schoolListId}>
            {schools.map((s) => (
              <option key={s.id} value={l(s.name)} />
            ))}
          </datalist>
          <Input
            label={t('auth.register.referral')}
            optional={t('common.optional')}
            placeholder={t('auth.register.referralPlaceholder')}
            icon={<Gift className="h-4 w-4" aria-hidden />}
            className="num uppercase tracking-wider"
            dir="ltr"
            autoCapitalize="characters"
            autoComplete="off"
            error={errors.referral?.message ?? (referralInvalidRemote ? t('errors.reasons.REFERRAL_CODE_INVALID') : undefined)}
            hint={
              referralCheck.data?.valid && referralCheck.data.label ? (
                <span className="inline-flex items-center gap-1 font-semibold text-success">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                  {l(referralCheck.data.label)}
                </span>
              ) : undefined
            }
            {...register('referral', {
              validate: (v) => !v.trim() || /^[A-Za-z0-9-]{4,20}$/.test(v.trim()) || t('auth.register.referralInvalid'),
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
          disabled={referralInvalidRemote}
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
