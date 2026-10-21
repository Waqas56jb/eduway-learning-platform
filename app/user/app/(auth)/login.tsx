import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  AuthScaffold,
  DemoHint,
  LegalLinks,
  MobileField,
  loginSchema,
  toE164ish,
  useFieldError,
  type LoginValues,
} from '@/components/auth';
import { Button, PressableScale, Text } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { useAuthStore } from '@/store';
import { space } from '@/theme';
import { haptic } from '@/utils/haptics';

export default function LoginScreen() {
  const { t } = useI18n('auth');
  const fieldError = useFieldError();
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { mobile: '' },
    mode: 'onTouched',
  });

  const onSubmit = handleSubmit(
    async ({ mobile }) => {
      await useAuthStore.getState().requestOtp(toE164ish(mobile));
      haptic.success();
      router.push('/(auth)/verify-otp');
    },
    () => haptic.error(),
  );

  return (
    <AuthScaffold title={t('login.title')} subtitle={t('login.subtitle')}>
      <Animated.View entering={FadeInDown.duration(300).delay(60)} style={styles.form}>
        <Controller
          control={control}
          name="mobile"
          render={({ field: { value, onChange, onBlur, ref } }) => (
            <MobileField
              ref={ref}
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={fieldError(errors.mobile?.message)}
              hint={t('fields.mobile.hint')}
              returnKeyType="done"
              onSubmitEditing={() => void onSubmit()}
              autoFocus
            />
          )}
        />

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

        <LegalLinks prefix={t('legal.continuePrefix')} align="center" />
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(300).delay(120)}>
        <DemoHint title={t('demo.title')} message={t('demo.login')} />
      </Animated.View>

      <View style={styles.spacer} />

      <PressableScale
        onPress={() => router.push('/(auth)/register')}
        accessibilityRole="link"
        accessibilityLabel={`${t('login.newHere')} ${t('login.createAccount')}`}
        style={styles.switchRow}
      >
        <Text variant="body" color="muted">
          {t('login.newHere')}{' '}
          <Text variant="bodyBold" color="accent">
            {t('login.createAccount')}
          </Text>
        </Text>
      </PressableScale>
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  form: { gap: space.lg },
  spacer: { flexGrow: 1 },
  switchRow: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
