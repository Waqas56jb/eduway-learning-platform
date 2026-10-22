import { memo, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Icon, type IconName } from '@/components/icons';
import { radius, space, useTheme } from '@/theme';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

export interface ListRowProps {
  icon?: IconName;
  iconColor?: string;
  title: string;
  subtitle?: string;
  value?: string;
  onPress?: () => void;
  right?: ReactNode;
  destructive?: boolean;
  showChevron?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

/** Append an alpha channel to a #RRGGBB color. */
function tint(hex: string, alpha: number): string {
  if (!hex.startsWith('#') || hex.length !== 7) return hex;
  return `${hex}${Math.round(alpha * 255)
    .toString(16)
    .padStart(2, '0')}`;
}

/** Settings-style row: tinted icon tile, title/subtitle, value and chevron. */
export const ListRow = memo(function ListRow({
  icon,
  iconColor,
  title,
  subtitle,
  value,
  onPress,
  right,
  destructive = false,
  showChevron = true,
  disabled,
  style,
  accessibilityLabel,
}: ListRowProps) {
  const { colors, isDark } = useTheme();
  const accent = destructive ? colors.danger : iconColor ?? (isDark ? colors.accentLight : colors.accent);
  const tileBg = destructive ? colors.dangerSoft : iconColor ? tint(iconColor, isDark ? 0.2 : 0.12) : colors.accentSoft;

  const body = (
    <>
      {icon ? (
        <View style={[styles.tile, { backgroundColor: tileBg }]}>
          <Icon name={icon} size={18} color={accent} strokeWidth={1.9} />
        </View>
      ) : null}
      <View style={styles.texts}>
        <Text variant="bodyMedium" color={destructive ? colors.danger : colors.ink} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" color="muted" numberOfLines={2} style={styles.subtitle}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text variant="label" color="muted" numberOfLines={1} style={styles.value}>
          {value}
        </Text>
      ) : null}
      {right}
      {onPress && showChevron && !right ? (
        <View style={styles.chevron}>
          <Icon name="chevron" size={16} color={colors.muted} strokeWidth={2} />
        </View>
      ) : null}
    </>
  );

  if (onPress) {
    return (
      <PressableScale
        onPress={onPress}
        disabled={disabled}
        scaleTo={0.985}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? (value ? `${title}, ${value}` : title)}
        accessibilityHint={subtitle}
        style={[styles.row, style]}
      >
        {body}
      </PressableScale>
    );
  }

  return (
    <View style={[styles.row, style]} accessible={!right} accessibilityLabel={accessibilityLabel ?? title}>
      {body}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingVertical: space.sm,
    // Rows usually live inside unpadded cards; inset them so content never touches the card edge.
    paddingHorizontal: space.lg,
    gap: space.md,
  },
  tile: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: { flex: 1, justifyContent: 'center' },
  subtitle: { marginTop: 2 },
  value: { maxWidth: '40%', flexShrink: 1 },
  chevron: { width: 16, alignItems: 'center', justifyContent: 'center' },
});
