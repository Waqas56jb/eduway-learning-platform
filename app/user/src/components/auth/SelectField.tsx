import { Keyboard, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';
import { Icon, type IconName } from '@/components/icons';
import { PressableScale, Text } from '@/components/ui';
import { radius, space, useTheme } from '@/theme';

interface SelectFieldProps {
  label: string;
  /** Optional suffix next to the label, e.g. "(optional)". */
  labelSuffix?: string;
  value?: string;
  placeholder: string;
  icon?: IconName;
  error?: string;
  hint?: string;
  /** Highlights the field (gold border) while its picker is open. */
  active?: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
}

/** Field height shared by every auth input so the form lines up perfectly. */
export const AUTH_FIELD_HEIGHT = 54;

/** Input-styled field that opens a picker (BottomSheet) when tapped. Mirrors `Input` metrics exactly. */
export function SelectField({
  label,
  labelSuffix,
  value,
  placeholder,
  icon,
  error,
  hint,
  active,
  onPress,
  accessibilityLabel,
}: SelectFieldProps) {
  const { colors } = useTheme();
  const borderColor = error ? colors.danger : active ? colors.accent : colors.border;
  return (
    <View>
      <Text variant="label" color={error ? colors.danger : colors.ink} style={styles.label}>
        {label}
        {labelSuffix ? (
          <Text variant="caption" color="muted">
            {`  ${labelSuffix}`}
          </Text>
        ) : null}
      </Text>
      <PressableScale
        onPress={() => {
          Keyboard.dismiss();
          onPress();
        }}
        scaleTo={0.985}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityValue={{ text: value ?? placeholder }}
        accessibilityHint={error ?? hint}
        style={[styles.field, { backgroundColor: colors.surface, borderColor }]}
      >
        {icon ? (
          <Icon name={icon} size={20} color={error ? colors.danger : value || active ? colors.accent : colors.muted} />
        ) : null}
        <Text variant="body" color={value ? 'ink' : 'muted'} numberOfLines={1} style={styles.value}>
          {value ?? placeholder}
        </Text>
        <View style={[styles.chevron, { backgroundColor: colors.surfaceMuted }]}>
          <Icon name="chevron-down" size={16} color={active ? colors.accent : colors.muted} strokeWidth={2} />
        </View>
      </PressableScale>
      {error ? (
        <Animated.View entering={FadeInDown.duration(200)} exiting={FadeOut.duration(150)} style={styles.message}>
          <Icon name="alert" size={14} color={colors.danger} strokeWidth={2} />
          <Text variant="caption" color={colors.danger} style={styles.messageText} accessibilityLiveRegion="polite">
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
}

const styles = StyleSheet.create({
  label: { marginBottom: space.sm },
  field: {
    minHeight: AUTH_FIELD_HEIGHT,
    borderRadius: radius.md,
    borderWidth: 1.25,
    paddingStart: space.md + 2,
    paddingEnd: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm + 2,
  },
  value: { flex: 1 },
  chevron: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  message: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space.sm - 2 },
  messageText: { flex: 1 },
});
