import { memo, useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import { Pressable, StyleSheet, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { fonts, radius, shadows, useTheme } from '@/theme';
import { haptic } from '@/utils/haptics';
import { Text } from './Text';

export interface OtpInputProps {
  length?: number;
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  /** Triggers a shake, red borders and an error haptic. */
  error?: boolean;
  autoFocus?: boolean;
  /** Accessible name of the hidden field. */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/** Normalize Arabic-Indic / Persian digits to ASCII and strip everything else. */
function normalizeDigits(input: string): string {
  return input
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\D/g, '');
}

interface BoxProps {
  char: string;
  active: boolean;
  error: boolean;
}

const OtpBox = memo(function OtpBox({ char, active, error }: BoxProps) {
  const { colors, isDark } = useTheme();
  const pop = useSharedValue(char ? 1 : 0);
  const caret = useSharedValue(0);

  useEffect(() => {
    if (char) {
      pop.value = 0.6;
      pop.value = withSpring(1, { damping: 12, stiffness: 260 });
    } else {
      pop.value = withTiming(0, { duration: 120 });
    }
  }, [char, pop]);

  useEffect(() => {
    if (active && !char) {
      caret.value = 1;
      caret.value = withRepeat(withSequence(withTiming(0, { duration: 450 }), withTiming(1, { duration: 450 })), -1, false);
    } else {
      cancelAnimation(caret);
      caret.value = 0;
    }
    return () => cancelAnimation(caret);
  }, [active, char, caret]);

  const charStyle = useAnimatedStyle(() => ({
    opacity: pop.value,
    transform: [{ scale: 0.6 + pop.value * 0.4 }, { translateY: (1 - pop.value) * 6 }],
  }));
  const caretStyle = useAnimatedStyle(() => ({ opacity: caret.value }));

  const borderColor = error ? colors.danger : active ? colors.accent : char ? (isDark ? colors.accentLight : colors.primary) : colors.border;
  const bg = error ? colors.dangerSoft : active ? colors.surface : char ? colors.surface : colors.surfaceMuted;

  return (
    <View
      style={[
        styles.box,
        { borderColor, backgroundColor: bg, borderWidth: active || error ? 1.75 : 1.25 },
        active && !error ? shadows.gold : null,
        active && !error ? styles.activeShadow : null,
      ]}
    >
      <Animated.View style={charStyle}>
        <Text style={[styles.digit, { color: error ? colors.danger : colors.ink }]} allowFontScaling={false}>
          {char}
        </Text>
      </Animated.View>
      {active && !char ? <Animated.View style={[styles.caret, { backgroundColor: colors.accent }, caretStyle]} /> : null}
    </View>
  );
});

/** One-time-code input: boxes are always LTR; a single hidden TextInput makes SMS autofill and paste work. */
export const OtpInput = memo(function OtpInput({
  length = 6,
  value,
  onChange,
  onComplete,
  error = false,
  autoFocus = false,
  accessibilityLabel,
  style,
}: OtpInputProps) {
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);
  const [focused, setFocused] = useState(false);
  const shake = useSharedValue(0);

  useEffect(() => {
    if (!error) return;
    haptic.error();
    shake.value = withSequence(
      withTiming(-10, { duration: 50 }),
      withTiming(10, { duration: 50 }),
      withTiming(-8, { duration: 50 }),
      withTiming(8, { duration: 50 }),
      withTiming(-4, { duration: 50 }),
      withTiming(0, { duration: 50 }),
    );
  }, [error, shake]);

  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  const handleChange = useCallback(
    (text: string) => {
      const next = normalizeDigits(text).slice(0, length);
      if (next === value) return;
      if (next.length > value.length) haptic.selection();
      onChange(next);
      if (next.length === length) onComplete?.(next);
    },
    [length, onChange, onComplete, value],
  );

  const focusInput = useCallback(() => inputRef.current?.focus(), []);

  const activeIndex = focused ? Math.min(value.length, length - 1) : -1;

  return (
    <Animated.View style={[styles.wrapper, shakeStyle, style]}>
      <Pressable onPress={focusInput} accessible={false} style={styles.row}>
        {Array.from({ length }, (_, i) => (
          <OtpBox
            key={i}
            char={value[i] ?? ''}
            active={i === activeIndex}
            error={error}
          />
        ))}
      </Pressable>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={handleChange}
        maxLength={length}
        keyboardType="number-pad"
        inputMode="numeric"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        autoFocus={autoFocus}
        caretHidden
        contextMenuHidden={false}
        selectionColor="transparent"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        accessibilityLabel={accessibilityLabel}
        style={styles.hiddenInput}
      />
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  wrapper: { direction: 'ltr', alignSelf: 'stretch' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, direction: 'ltr' },
  box: {
    flex: 1,
    maxWidth: 56,
    aspectRatio: 0.86,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeShadow: { shadowOpacity: 0.22 },
  digit: { fontFamily: fonts.semibold, fontSize: 24, lineHeight: 30, textAlign: 'center' },
  caret: { position: 'absolute', width: 2, height: 26, borderRadius: 1 },
  hiddenInput: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    start: 0,
    end: 0,
    opacity: 0.015,
    color: 'transparent',
    fontSize: 1,
  },
});
