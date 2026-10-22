import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import {
  AUTH_INPUT_STYLE,
  AuthScaffold,
  AuthSwitchLink,
  FormSection,
  GovernoratePicker,
  LegalLinks,
  MobileField,
  SchoolPicker,
  SelectField,
  StepIndicator,
  registerSchema,
  toE164ish,
  useAuthReveal,
  useFieldError,
  type RegisterInput,
  type RegisterOutput,
} from '@/components/auth';
import { Icon } from '@/components/icons';
import { Button, Checkbox, Input, Text } from '@/components/ui';
import { images } from '@/constants/images';
import { checkReferralCode, normalizeError, useGovernorates, useLegalDoc } from '@/api';
import { useI18n } from '@/hooks/useI18n';
import { useAuthStore } from '@/store';
import { space, useTheme } from '@/theme';
import { haptic } from '@/utils/haptics';

const enter = (i: number) => FadeInDown.duration(350).delay(Math.min(80 + i * 60, 300));

/** Checkbox row metrics: 24pt box centered in a 44pt row, aligned with the first 22pt text line. */
const CHECK_ROW = 44;
const CHECK_BOX = 24;
const BODY_LINE = 22;

export default function RegisterScreen() {
  const { t } = useI18n('auth');
  const fieldError = useFieldError();
  const [govOpen, setGovOpen] = useState(false);
  const [schoolOpen, setSchoolOpen] = useState(false);

  const {
    control,
    handleSubmit,
    setValue,
    setFocus,
    setError,
    clearErrors,
    getValues,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput, unknown, RegisterOutput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', mobile: '', governorate: '', school: '', referral: '', acceptTerms: false },
    mode: 'onTouched',
  });

  const governorate = watch('governorate');
  const school = watch('school');
  /** Directory id of the picked school (null for a free-text name). */
  const [schoolId, setSchoolId] = useState<string | null>(null);
  // Current published legal versions the student accepts with the checkbox (PUB-11).
  const terms = useLegalDoc('terms');
  const privacy = useLegalDoc('privacy');

  /** PUB-04 — true when empty or valid; flags the field otherwise. Network errors don't block sign-up. */
  const validateReferral = useCallback(
    async (code: string) => {
      const trimmed = code.trim();
      if (!trimmed || !/^[A-Za-z0-9-]{4,20}$/.test(trimmed)) return true;
      try {
        const res = await checkReferralCode(trimmed);
        if (!res.valid) {
          setError('referral', { type: 'server', message: 'referral.invalid' });
          return false;
        }
        clearErrors('referral');
        return true;
      } catch (err) {
        return normalizeError(err).isNetwork;
      }
    },
    [setError, clearErrors],
  );

  const onSubmit = handleSubmit(
    async (v) => {
      if (!(await validateReferral(v.referral))) {
        haptic.error();
        return;
      }
      const acceptedLegal = [terms.data, privacy.data]
        .filter((d): d is NonNullable<typeof d> => !!d)
        .map((d) => ({ doc: d.doc, version: d.version }));
      const sent = await useAuthStore.getState().startRegistration({
        name: v.name,
        mobile: toE164ish(v.mobile),
        governorate: v.governorate,
        schoolId: v.school ? schoolId : null,
        school: v.school || undefined,
        referral: v.referral || undefined,
        acceptedLegal,
      });
      if (!sent) {
        haptic.error();
        return;
      }
      haptic.success();
      router.push('/(auth)/verify-otp');
    },
    () => haptic.error(),
  );

  const selectGovernorate = useCallback(
    (id: string) => setValue('governorate', id, { shouldValidate: true, shouldDirty: true }),
    [setValue],
  );
  const selectSchool = useCallback(
    (name: string, id: string | null) => {
      setSchoolId(id);
      setValue('school', name, { shouldValidate: true, shouldDirty: true });
    },
    [setValue],
  );
  const closeGov = useCallback(() => setGovOpen(false), []);
  const closeSchool = useCallback(() => setSchoolOpen(false), []);

  return (
    <>
      <AuthScaffold
        title={t('register.title')}
        subtitle={t('register.subtitle')}
        image={images.onboardingStudents}
        accessory={
          <StepIndicator
            current={1}
            total={2}
            label={t('register.step', { current: 1, total: 2 })}
            caption={t('register.stepCaption')}
          />
        }
        footer={
          <Button
            title={t('register.submit')}
            variant="primary"
            size="lg"
            icon="arrow"
            iconPosition="end"
            fullWidth
            loading={isSubmitting}
            disabled={isSubmitting}
            onPress={() => void onSubmit()}
          />
        }
        footerSecondary={
          <AuthSwitchLink
            prompt={t('register.haveAccount')}
            action={t('register.signIn')}
            onPress={() => router.replace('/(auth)/login')}
          />
        }
      >
        <RegisterForm
          control={control}
          errors={errors}
          fieldError={fieldError}
          setFocus={setFocus}
          governorate={governorate}
          school={school}
          govOpen={govOpen}
          schoolOpen={schoolOpen}
          onOpenGov={() => setGovOpen(true)}
          onOpenSchool={() => setSchoolOpen(true)}
          onSubmit={() => void onSubmit()}
          onReferralBlur={() => void validateReferral(getValues('referral'))}
        />
      </AuthScaffold>

      <GovernoratePicker visible={govOpen} onClose={closeGov} value={governorate} onSelect={selectGovernorate} />
      <SchoolPicker
        visible={schoolOpen}
        onClose={closeSchool}
        governorate={governorate}
        value={school}
        onSelect={selectSchool}
      />
    </>
  );
}

type Form = ReturnType<typeof useForm<RegisterInput, unknown, RegisterOutput>>;

interface RegisterFormProps {
  control: Form['control'];
  errors: Form['formState']['errors'];
  fieldError: (message: string | undefined) => string | undefined;
  setFocus: Form['setFocus'];
  governorate: string;
  school: string;
  govOpen: boolean;
  schoolOpen: boolean;
  onOpenGov: () => void;
  onOpenSchool: () => void;
  onSubmit: () => void;
  onReferralBlur: () => void;
}

/** Rendered inside AuthScaffold so fields can use `useAuthReveal` (scroll the focused field above the keyboard). */
function RegisterForm({
  control,
  errors,
  fieldError,
  setFocus,
  governorate,
  school,
  govOpen,
  schoolOpen,
  onOpenGov,
  onOpenSchool,
  onSubmit,
  onReferralBlur,
}: RegisterFormProps) {
  const { t, L } = useI18n('auth');
  const { data: governorates } = useGovernorates();
  const govName = governorates?.find((g) => g.id === governorate)?.name;
  const { colors } = useTheme();
  const reveal = useAuthReveal();

  return (
    <View style={styles.form}>
      <Animated.View entering={enter(0)}>
        <FormSection title={t('register.sections.personal')}>
          <Controller
            control={control}
            name="name"
            render={({ field: { value, onChange, onBlur, ref } }) => (
              <Input
                ref={ref}
                label={t('fields.name.label')}
                placeholder={t('fields.name.placeholder')}
                icon="user"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                onFocus={reveal}
                autoCapitalize="words"
                autoComplete="name"
                textContentType="name"
                returnKeyType="next"
                submitBehavior="submit"
                maxLength={60}
                onSubmitEditing={() => setFocus('mobile')}
                error={fieldError(errors.name?.message)}
                accessibilityLabel={t('fields.name.label')}
                style={AUTH_INPUT_STYLE}
              />
            )}
          />
          <Controller
            control={control}
            name="mobile"
            render={({ field: { value, onChange, onBlur, ref } }) => (
              <MobileField
                ref={ref}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                onFocus={reveal}
                error={fieldError(errors.mobile?.message)}
              />
            )}
          />
        </FormSection>
      </Animated.View>

      <Animated.View entering={enter(1)}>
        <FormSection title={t('register.sections.school')}>
          <SelectField
            label={t('fields.governorate.label')}
            placeholder={t('fields.governorate.placeholder')}
            value={governorate && govName ? L(govName) : undefined}
            icon="map-pin"
            active={govOpen}
            error={fieldError(errors.governorate?.message)}
            onPress={onOpenGov}
          />
          <SelectField
            label={t('fields.school.label')}
            labelSuffix={t('fields.optional')}
            placeholder={t('fields.school.placeholder')}
            value={school || undefined}
            icon="school"
            active={schoolOpen}
            hint={governorate ? undefined : t('fields.school.hint')}
            error={fieldError(errors.school?.message)}
            onPress={onOpenSchool}
          />
        </FormSection>
      </Animated.View>

      <Animated.View entering={enter(2)}>
        <FormSection title={t('register.sections.extras')}>
          <Controller
            control={control}
            name="referral"
            render={({ field: { value, onChange, onBlur, ref } }) => (
              <Input
                ref={ref}
                label={`${t('fields.referral.label')} ${t('fields.optional')}`}
                placeholder={t('fields.referral.placeholder')}
                icon="gift"
                value={value}
                onChangeText={(v) => onChange(v.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 20))}
                onBlur={() => {
                  onBlur();
                  onReferralBlur();
                }}
                onFocus={reveal}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={20}
                returnKeyType="done"
                onSubmitEditing={onSubmit}
                hint={t('fields.referral.hint')}
                error={fieldError(errors.referral?.message)}
                accessibilityLabel={t('fields.referral.label')}
                style={[AUTH_INPUT_STYLE, styles.ltr]}
              />
            )}
          />

          <Controller
            control={control}
            name="acceptTerms"
            render={({ field: { value, onChange } }) => {
              const toggle = () => {
                haptic.selection();
                onChange(!value);
              };
              return (
                <View>
                  <View style={styles.termsRow}>
                    <Checkbox
                      checked={value}
                      onChange={(v) => onChange(v)}
                      error={!!errors.acceptTerms}
                      accessibilityLabel={`${t('legal.agreePrefix')} ${t('legal.terms')} ${t('legal.and')} ${t('legal.privacy')}`}
                    />
                    <View style={styles.termsText}>
                      <LegalLinks prefix={t('legal.agreePrefix')} variant="body" onPress={toggle} />
                    </View>
                  </View>
                  {errors.acceptTerms ? (
                    <Animated.View entering={FadeIn.duration(200)} style={styles.termsError}>
                      <Icon name="alert" size={14} color={colors.danger} strokeWidth={2} />
                      <Text variant="caption" color="danger" accessibilityLiveRegion="polite" style={styles.flex}>
                        {fieldError(errors.acceptTerms.message)}
                      </Text>
                    </Animated.View>
                  ) : null}
                </View>
              );
            }}
          />
        </FormSection>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: space.xxxl },
  ltr: { writingDirection: 'ltr' },
  termsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  termsText: { flex: 1, paddingTop: (CHECK_ROW - BODY_LINE) / 2 },
  termsError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: space.xs,
    marginStart: CHECK_BOX + space.md,
  },
  flex: { flex: 1 },
});
