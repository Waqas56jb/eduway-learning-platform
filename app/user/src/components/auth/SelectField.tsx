import { StyleSheet, View } from 'react-native';
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
  onPress: () => void;
  accessibilityLabel?: string;
}

/** Input-styled field that opens a picker (BottomSheet) when tapped. */
export function SelectField({
  label,
  labelSuffix,
  value,
  placeholder,
  icon,
  error,
  hint,
  onPress,
  accessibilityLabel,
}: SelectFieldProps) {
  const { colors } = useTheme();
  const borderColor = error ? colors.danger : colors.border;
  return (
    <View style={styles.wrap}>
      <Text variant="label" color="ink">
        {label}
        {labelSuffix ? (
          <Text variant="caption" color="muted">
            {` ${labelSuffix}`}
          </Text>
        ) : null}
      </Text>
      <PressableScale
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityValue={{ text: value ?? placeholder }}
        style={[styles.field, { backgroundColor: colors.surface, borderColor }]}
      >
        {icon ? <Icon name={icon} size={20} color={value ? colors.accent : colors.muted} /> : null}
        <Text
          variant="body"
          color={value ? 'ink' : 'muted'}
          numberOfLines={1}
          style={styles.value}
        >
          {value ?? placeholder}
        </Text>
        <Icon name="chevron-down" size={18} color={colors.muted} />
      </PressableScale>
      {error ? (
        <Text variant="caption" color="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" color="muted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs + 2 },
  field: {
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  value: { flex: 1 },
});
