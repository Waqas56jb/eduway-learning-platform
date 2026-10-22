import { forwardRef, useEffect, useState, type ComponentRef, type ReactNode } from 'react';
import { isRTL } from '@/utils/rtl';
import {
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Animated, { FadeInDown, FadeOut, interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Icon, type IconName } from '@/components/icons';
import { useLangStore } from '@/store/langStore';
import { fontFor, radius, space, useTheme } from '@/theme';
import { Text } from './Text';

export interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  hint?: string;
  icon?: IconName;
  /** Fixed prefix such as "+964"; always rendered left-to-right in its own segment. */
  prefix?: string;
  rightElement?: ReactNode;
  /** Style for the outer wrapper (label + field + messages). */
  containerStyle?: StyleProp<ViewStyle>;
}

const LTR_KEYBOARDS = new Set<TextInputProps['keyboardType']>(['phone-pad', 'number-pad', 'decimal-pad', 'numeric', 'email-address', 'url']);

/** Text field with label, gold focus ring, prefix segment and inline error. */
export const Input = forwardRef<ComponentRef<typeof TextInput>, InputProps>(function Input(
  {
    label,
    error,
    hint,
    icon,
    prefix,
    rightElement,
    containerStyle,
    style,
    onFocus,
    onBlur,
    editable = true,
    multiline,
    keyboardType,
    ...rest
  },
  ref,
) {
  const { colors, isDark } = useTheme();
  const isAr = useLangStore((s) => s.isAr);
  const [focused, setFocused] = useState(false);
  const focus = useSharedValue(0);
  const hasError = !!error;

  useEffect(() => {
    focus.value = withTiming(focused ? 1 : 0, { duration: 180 });
  }, [focused, focus]);

  const restColor = hasError ? colors.danger : colors.border;
  const activeColor = hasError ? colors.danger : colors.accent;

  const borderStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(focus.value, [0, 1], [restColor, activeColor]),
  }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: focus.value,
    transform: [{ scale: 1 + (1 - focus.value) * 0.015 }],
  }));

  const isLtrField = !!prefix || LTR_KEYBOARDS.has(keyboardType);
  // Let text fields follow the natural (layout) direction; force LTR for numbers/phones/emails.
  let textAlign: TextStyle['textAlign'];
  if (isLtrField) textAlign = 'left';
  else if (isAr && !isRTL()) textAlign = 'right';

  const handleFocus = (e: Parameters<NonNullable<TextInputProps['onFocus']>>[0]) => {
    setFocused(true);
    onFocus?.(e);
  };
  const handleBlur = (e: Parameters<NonNullable<TextInputProps['onBlur']>>[0]) => {
    setFocused(false);
    onBlur?.(e);
  };

  const iconColor = hasError ? colors.danger : focused ? colors.accent : colors.muted;

  return (
    <View style={[styles.wrapper, containerStyle]}>
      {label ? (
        <Text variant="label" color={hasError ? colors.danger : colors.ink} style={styles.label}>
          {label}
        </Text>
      ) : null}

      <View>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.ring,
            { borderColor: hasError ? colors.dangerSoft : isDark ? 'rgba(201,162,74,0.22)' : 'rgba(201,162,74,0.20)' },
            ringStyle,
          ]}
        />
        <Animated.View
          style={[
            styles.field,
            multiline && styles.fieldMultiline,
            {
              backgroundColor: editable ? colors.surface : colors.surfaceMuted,
              direction: isLtrField ? 'ltr' : undefined,
            },
            borderStyle,
          ]}
        >
          {icon ? (
            <View style={[styles.iconSlot, multiline && styles.iconTop]}>
              <Icon name={icon} size={20} color={iconColor} />
            </View>
          ) : null}

          {prefix ? (
            <View style={styles.prefix}>
              <Text variant="bodyMedium" color="ink" tabular style={styles.prefixText}>
                {prefix}
              </Text>
              <View style={[styles.prefixDivider, { backgroundColor: colors.border }]} />
            </View>
          ) : null}

          <TextInput
            ref={ref}
            editable={editable}
            multiline={multiline}
            keyboardType={keyboardType}
            placeholderTextColor={colors.muted}
            selectionColor={colors.accent}
            cursorColor={colors.accent}
            onFocus={handleFocus}
            onBlur={handleBlur}
            accessibilityLabel={rest.accessibilityLabel ?? label}
            accessibilityHint={error ?? hint}
            maxFontSizeMultiplier={1.3}
            {...rest}
            style={[
              styles.input,
              {
                color: editable ? colors.ink : colors.muted,
                fontFamily: fontFor('regular', isAr && !isLtrField),
                textAlign,
                writingDirection: isLtrField ? 'ltr' : isAr ? 'rtl' : 'ltr',
              },
              multiline && styles.inputMultiline,
              style,
            ]}
          />

          {rightElement ? <View style={styles.right}>{rightElement}</View> : null}
        </Animated.View>
      </View>

      {hasError ? (
        <Animated.View entering={FadeInDown.duration(200)} exiting={FadeOut.duration(150)} style={styles.message}>
          <View style={styles.messageIcon}>
            <Icon name="alert" size={14} color={colors.danger} strokeWidth={2} />
          </View>
          <Text variant="caption" color={colors.danger} style={styles.messageText}>
            {error}
          </Text>
        </Animated.View>
      ) : hint ? (
        <View style={styles.message}>
          <Text variant="caption" color="muted" style={styles.messageText}>
            {hint}
          </Text>
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: { gap: 0 },
  label: { marginBottom: space.sm },
  ring: {
    position: 'absolute',
    top: -4,
    bottom: -4,
    start: -4,
    end: -4,
    borderRadius: radius.md + 4,
    borderWidth: 4,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 54,
    borderRadius: radius.md,
    borderWidth: 1.25,
    paddingHorizontal: space.lg - 2,
    gap: space.sm + 2,
  },
  fieldMultiline: { minHeight: 112, alignItems: 'flex-start', paddingVertical: space.md },
  iconSlot: { width: 22, alignItems: 'center', justifyContent: 'center' },
  iconTop: { paddingTop: 2 },
  prefix: { flexDirection: 'row', alignItems: 'center', gap: space.sm + 2, direction: 'ltr' },
  prefixText: { letterSpacing: 0.3 },
  prefixDivider: { width: 1, height: 22 },
  input: {
    flex: 1,
    fontSize: 16,
    minHeight: 50,
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  inputMultiline: { minHeight: 84, paddingTop: 2, textAlignVertical: 'top' },
  right: { alignItems: 'center', justifyContent: 'center' },
  message: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: space.sm - 2 },
  messageText: { flex: 1 },
  messageIcon: { height: 18, justifyContent: 'center' },
});
