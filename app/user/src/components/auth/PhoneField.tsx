import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState, type ComponentRef } from 'react';
import { StyleSheet, type TextInput, type TextInputProps } from 'react-native';
import { Icon } from '@/components/icons';
import { Input, PressableScale, Text } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { useTheme } from '@/theme';
import {
  DEFAULT_COUNTRY,
  applyPhoneInput,
  countryName,
  dialCode,
  examplePlaceholder,
  flagEmoji,
  formatNational,
  type PhoneValue,
} from '@/utils/phone';
import { AUTH_INPUT_STYLE } from './MobileField';
import { CountryPicker } from './CountryPicker';

export type { PhoneValue };

interface PhoneFieldProps extends Omit<TextInputProps, 'value' | 'onChangeText' | 'onChange'> {
  value: PhoneValue;
  onChange: (value: PhoneValue) => void;
  error?: string;
  hint?: string;
  label?: string;
}

/** Empty field value for a form's `defaultValues` (Iraq selected). */
export const emptyPhone = (country: string = DEFAULT_COUNTRY): PhoneValue => ({ country, national: '' });

/**
 * International mobile number input: a country button (flag + calling code, opens a searchable
 * sheet) in the LTR prefix segment, then the national number with as-you-type formatting.
 * Pasting a full "+44 …" number switches the country; a typed trunk "0" (07701234567) is dropped.
 * The value is `{ country, national }` — convert with `phoneToE164` before sending.
 */
export const PhoneField = forwardRef<ComponentRef<typeof TextInput>, PhoneFieldProps>(function PhoneField(
  { value, onChange, error, hint, label, style, onFocus, ...rest },
  ref,
) {
  const { t, lang } = useI18n('auth');
  const { colors } = useTheme();
  const [pickerOpen, setPickerOpen] = useState(false);
  const inputRef = useRef<TextInput | null>(null);
  useImperativeHandle(ref, () => inputRef.current as TextInput, []);

  const country = value?.country || DEFAULT_COUNTRY;
  const national = value?.national ?? '';
  const dial = dialCode(country);
  const name = countryName(country, lang === 'ar' ? 'ar' : 'en');

  const placeholder = useMemo(
    () => (country === DEFAULT_COUNTRY ? t('fields.mobile.placeholder') : examplePlaceholder(country) || t('fields.mobile.placeholder')),
    [country, t],
  );

  const selectCountry = useCallback(
    (code: string) => {
      onChange({ country: code, national: formatNational(national, code) });
      // Let the sheet finish closing before raising the keyboard again.
      setTimeout(() => inputRef.current?.focus(), 350);
    },
    [national, onChange],
  );
  const closePicker = useCallback(() => setPickerOpen(false), []);

  const countryButton = (
    <PressableScale
      onPress={() => {
        inputRef.current?.blur();
        setPickerOpen(true);
      }}
      scaleTo={0.94}
      hitSlop={{ top: 12, bottom: 12, left: 8, right: 4 }}
      accessibilityRole="button"
      accessibilityLabel={t('fields.mobile.countryA11y', { country: name, dial })}
      accessibilityHint={t('pickers.country.title')}
      style={styles.country}
    >
      <Text style={styles.flag} accessible={false} maxFontSizeMultiplier={1.2}>
        {flagEmoji(country)}
      </Text>
      <Text variant="bodyMedium" color="ink" tabular style={styles.dial} accessible={false}>
        {dial}
      </Text>
      <Icon name="chevron-down" size={14} color={pickerOpen ? colors.accent : colors.muted} strokeWidth={2} />
    </PressableScale>
  );

  return (
    <>
      <Input
        ref={inputRef}
        label={label ?? t('fields.mobile.label')}
        placeholder={placeholder}
        prefixElement={countryButton}
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        autoComplete="tel"
        maxLength={22}
        value={national}
        onChangeText={(text) => onChange(applyPhoneInput(text, { country, national }))}
        onFocus={onFocus}
        error={error}
        hint={hint}
        accessibilityLabel={t('fields.mobile.a11yCountry', { country: name, dial })}
        accessibilityHint={t('fields.mobile.hint')}
        style={[AUTH_INPUT_STYLE, styles.input, style]}
        {...rest}
      />
      <CountryPicker visible={pickerOpen} onClose={closePicker} value={country} onSelect={selectCountry} />
    </>
  );
});

const styles = StyleSheet.create({
  country: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, direction: 'ltr' },
  flag: { fontSize: 20, lineHeight: 26 },
  dial: { letterSpacing: 0.3 },
  input: { letterSpacing: 0.4, writingDirection: 'ltr', textAlign: 'left' },
});
