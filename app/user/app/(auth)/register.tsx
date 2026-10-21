import { useCallback, useRef, useState } from 'react';
import { StyleSheet, View, type TextInput } from 'react-native';
import { router } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  AuthScaffold,
  GovernoratePicker,
  LegalLinks,
  MobileField,
  SchoolPicker,
  SelectField,
  StepIndicator,
  registerSchema,
  toE164ish,
  useFieldError,
  type RegisterInput,
  type RegisterOutput,
} from '@/components/auth';
import { Button, Checkbox, Input, PressableScale, Text } from '@/components/ui';
import { getGovernorate } from '@/data';
import { useI18n } from '@/hooks/useI18n';
import { useAuthStore } from '@/store';
import { space } from '@/theme';
import { haptic } from '@/utils/haptics';

const enter = (i: number) => FadeInDown.duration(280).delay(60 + i * 40);

export default function RegisterScreen() {
  const { t, L } = useI18n('auth');
  const fieldError = useFieldError();
  const mobileRef = useRef<TextInput>(null);
  const [govOpen, setGovOpen] = useState(false);
  const [schoolOpen, setSchoolOpen] = useState(false);

  const {
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput, unknown, RegisterOutput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', mobile: '', governorate: '', school: '', referral: '', acceptTerms: false },
    mode: 'onTouched',
  });

  const governorate = watch('governorate');
  const school = watch('school');

  const onSubmit = handleSubmit(
    async (v) => {
      await useAuthStore.getState().startRegistration({
        name: v.name,
        mobile: toE164ish(v.mobile),
        governorate: v.governorate,
        school: v.school || undefined,
        referral: v.referral || undefined,
      });
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
    (name: string) => setValue('school', name, { shouldValidate: true, shouldDirty: true }),
    [setValue],
  );
  const closeGov = useCallback(() => setGovOpen(false), []);
  const closeSchool = useCallback(() => setSchoolOpen(false), []);

  return (
    <>
      <AuthScaffold
        title={t('register.title')}
        subtitle={t('register.subtitle')}
        accessory={
          <StepIndicator
            current={1}
            total={2}
            label={t('register.step', { current: 1, total: 2 })}
            caption={t('register.stepCaption')}
          />
        }
      >
        <Animated.View entering={enter(0)}>
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
                autoCapitalize="words"
                autoComplete="name"
                textContentType="name"
                returnKeyType="next"
                maxLength={60}
                onSubmitEditing={() => mobileRef.current?.focus()}
                error={fieldError(errors.name?.message)}
                accessibilityLabel={t('fields.name.label')}
              />
            )}
          />
        </Animated.View>

        <Animated.View entering={enter(1)}>
          <Controller
            control={control}
            name="mobile"
            render={({ field: { value, onChange, onBlur, ref } }) => (
              <MobileField
                ref={(el) => {
                  ref(el);
                  mobileRef.current = el;
                }}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={fieldError(errors.mobile?.message)}
              />
            )}
          />
        </Animated.View>

        <Animated.View entering={enter(2)}>
          <SelectField
            label={t('fields.governorate.label')}
            placeholder={t('fields.governorate.placeholder')}
            value={governorate ? L(getGovernorate(governorate)?.name) : undefined}
            icon="map-pin"
            error={fieldError(errors.governorate?.message)}
            onPress={() => setGovOpen(true)}
          />
        </Animated.View>

        <Animated.View entering={enter(3)}>
          <SelectField
            label={t('fields.school.label')}
            labelSuffix={t('fields.optional')}
            placeholder={t('fields.school.placeholder')}
            value={school || undefined}
            icon="school"
            hint={governorate ? undefined : t('fields.school.hint')}
            error={fieldError(errors.school?.message)}
            onPress={() => setSchoolOpen(true)}
          />
        </Animated.View>

        <Animated.View entering={enter(4)}>
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
                onChangeText={(v) => onChange(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))}
                onBlur={onBlur}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={10}
                hint={t('fields.referral.hint')}
                error={fieldError(errors.referral?.message)}
                accessibilityLabel={t('fields.referral.label')}
                style={{ writingDirection: 'ltr' }}
              />
            )}
          />
        </Animated.View>

        <Animated.View entering={enter(5)} style={styles.terms}>
          <Controller
            control={control}
            name="acceptTerms"
            render={({ field: { value, onChange } }) => (
              <Checkbox
                checked={value}
                onChange={(v) => {
                  haptic.selection();
                  onChange(v);
                }}
                label={<LegalLinks prefix={t('legal.agreePrefix')} variant="body" />}
              />
            )}
          />
          {errors.acceptTerms ? (
            <Text variant="caption" color="danger" accessibilityLiveRegion="polite">
              {fieldError(errors.acceptTerms.message)}
            </Text>
          ) : null}
        </Animated.View>

        <Animated.View entering={enter(6)}>
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
        </Animated.View>

        <View style={styles.spacer} />

        <PressableScale
          onPress={() => router.replace('/(auth)/login')}
          accessibilityRole="link"
          accessibilityLabel={`${t('register.haveAccount')} ${t('register.signIn')}`}
          style={styles.switchRow}
        >
          <Text variant="body" color="muted">
            {t('register.haveAccount')}{' '}
            <Text variant="bodyBold" color="accent">
              {t('register.signIn')}
            </Text>
          </Text>
        </PressableScale>
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

const styles = StyleSheet.create({
  terms: { gap: space.xs },
  spacer: { flexGrow: 1 },
  switchRow: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
