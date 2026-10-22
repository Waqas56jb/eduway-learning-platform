import { forwardRef, type ComponentRef } from 'react';
import type { TextInput, TextInputProps } from 'react-native';
import { Input } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { formatIraqiMobile } from '@/utils/format';
import { AUTH_FIELD_HEIGHT } from './SelectField';

interface MobileFieldProps extends Omit<TextInputProps, 'value' | 'onChangeText'> {
  value: string;
  /** Receives the live-formatted value, e.g. "770 123 4567". */
  onChangeText: (formatted: string) => void;
  error?: string;
  hint?: string;
  label?: string;
}

/** TextInput height inside `Input` that yields a 54pt field (Input adds a 1.25pt border on each side). */
export const AUTH_INPUT_STYLE = { minHeight: AUTH_FIELD_HEIGHT - 2.5 } as const;

/** Iraqi mobile number input: "+964" LTR prefix segment, phone pad, live "770 123 4567" formatting. */
export const MobileField = forwardRef<ComponentRef<typeof TextInput>, MobileFieldProps>(function MobileField(
  { value, onChangeText, error, hint, label, style, ...rest },
  ref,
) {
  const { t } = useI18n('auth');
  return (
    <Input
      ref={ref}
      label={label ?? t('fields.mobile.label')}
      placeholder={t('fields.mobile.placeholder')}
      prefix="+964"
      icon="phone"
      keyboardType="phone-pad"
      textContentType="telephoneNumber"
      autoComplete="tel"
      maxLength={12}
      value={value}
      onChangeText={(v) => onChangeText(formatIraqiMobile(v))}
      error={error}
      hint={hint}
      accessibilityLabel={t('fields.mobile.a11y')}
      accessibilityHint={t('fields.mobile.hint')}
      style={[AUTH_INPUT_STYLE, { letterSpacing: 0.4 }, style]}
      {...rest}
    />
  );
});
