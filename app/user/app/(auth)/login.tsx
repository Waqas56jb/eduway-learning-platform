import { useEffect, useRef } from 'react';
import { StyleSheet, View, type TextInput } from 'react-native';
import { router } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  AuthScaffold,
  AuthSwitchLink,
  DemoHint,
  LegalLinks,
  PhoneField,
  emptyPhone,
  loginSchema,
  toE164,
  useFieldError,
  type LoginValues,
} from '@/components/auth';
import { Button } from '@/components/ui';
import { images } from '@/constants/images';
import { useI18n } from '@/hooks/useI18n';
import { useAuthStore } from '@/store';
import { space } from '@/theme';
import { haptic } from '@/utils/haptics';

const enter = (i: number) => FadeInDown.duration(350).delay(Math.min(80 + i * 60, 300));

export default function LoginScreen() {
  const { t } = useI18n('auth');
  const fieldError = useFieldError();
  const mobileRef = useRef<TextInput | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { mobile: emptyPhone() },
    mode: 'onTouched',
  });

  // Raise the keyboard once the push transition has settled (smoother than autoFocus).
  useEffect(() => {
    const id = setTimeout(() => mobileRef.current?.focus(), 450);
    return () => clearTimeout(id);
  }, []);

  const onSubmit = handleSubmit(
    async ({ mobile }) => {
      const sent = await useAuthStore.getState().requestOtp(toE164(mobile));
      if (!sent) {
        haptic.error();
        return;
      }
      haptic.success();
      router.push('/(auth)/verify-otp');
    },
    () => haptic.error(),
  );

  return (
    <AuthScaffold
      title={t('login.title')}
      subtitle={t('login.subtitle')}
      image={images.onboardingLibrary}
      footer={
        <Button
          title={t('login.sendOtp')}
          variant="primary"
          size="lg"
          icon="arrow"
          iconPosition="end"
          fullWidth
          loading={isSubmitting}
          disabled={isSubmitting}
          onPress={() => void onSubmit()}
          accessibilityLabel={t('login.sendOtp')}
        />
      }
      footerSecondary={
        <AuthSwitchLink
          prompt={t('login.newHere')}
          action={t('login.createAccount')}
          onPress={() => router.push('/(auth)/register')}
        />
      }
    >
      <Animated.View entering={enter(0)}>
        <Controller
          control={control}
          name="mobile"
          render={({ field: { value, onChange, onBlur, ref } }) => (
            <PhoneField
              ref={(node) => {
                ref(node);
                mobileRef.current = node;
              }}
              value={value}
              onChange={onChange}
              onBlur={onBlur}
              error={fieldError(errors.mobile?.message)}
              hint={t('fields.mobile.hint')}
              returnKeyType="done"
              onSubmitEditing={() => void onSubmit()}
            />
          )}
        />
      </Animated.View>

      <Animated.View entering={enter(1)} style={styles.demo}>
        <DemoHint title={t('demo.title')} message={t('demo.login')} />
      </Animated.View>

      <View style={styles.spacer} />

      <Animated.View entering={enter(2)} style={styles.legal}>
        <LegalLinks prefix={t('legal.continuePrefix')} align="center" />
      </Animated.View>
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  demo: { marginTop: space.xxl },
  spacer: { flexGrow: 1, minHeight: space.xxl },
  legal: { paddingHorizontal: space.sm },
});
