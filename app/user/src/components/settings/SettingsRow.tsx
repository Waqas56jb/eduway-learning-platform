import { memo, useCallback, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Icon, type IconName } from '@/components/icons';
import { Text } from '@/components/ui';
import { palette, space, useTheme } from '@/theme';
import { haptic } from '@/utils/haptics';

/** Geometry of the inset-grouped list (iOS Settings look). */
export const ROW_PADDING = space.lg; // 16
export const ROW_TILE = 30;
export const ROW_GAP = space.md; // 12
/** Separator inset so hairlines start under the row title, not under the icon tile. */
export const ROW_TEXT_INSET = ROW_PADDING + ROW_TILE + ROW_GAP;
export const ROW_MIN_HEIGHT = 56;

export interface SettingsRowProps {
  icon?: IconName;
  /** Solid tile color behind a white glyph. Defaults to navy (gold glyph). */
  iconColor?: string;
  title: string;
  subtitle?: string;
  /** Muted value shown before the chevron (e.g. current language). */
  value?: string;
  onPress?: () => void;
  /** Trailing control (e.g. Switch). Replaces the chevron. */
  right?: ReactNode;
  /** Small element (count Badge) shown before the chevron; keeps the chevron. */
  badge?: ReactNode;
  destructive?: boolean;
  showChevron?: boolean;
  loading?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityRole?: 'button' | 'link';
  style?: StyleProp<ViewStyle>;
}

/** One 56pt row of an inset-grouped card: icon tile, title/subtitle, value, trailing control and chevron at the end edge. */
export const SettingsRow = memo(function SettingsRow({
  icon,
  iconColor,
  title,
  subtitle,
  value,
  onPress,
  right,
  badge,
  destructive = false,
  showChevron = true,
  loading = false,
  disabled = false,
  accessibilityLabel,
  accessibilityRole = 'button',
  style,
}: SettingsRowProps) {
  const { colors, isDark } = useTheme();

  const tileBg = destructive ? colors.dangerSoft : (iconColor ?? (isDark ? palette.navyLight : palette.navy));
  const glyph = destructive ? colors.danger : iconColor ? palette.white : palette.goldLight;

  const onPressIn = useCallback(() => haptic.light(), []);

  const body = (
    <>
      {icon ? (
        <View style={[styles.tile, { backgroundColor: tileBg }]}>
          <Icon name={icon} size={17} color={glyph} strokeWidth={2} />
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
        <Text variant="body" color="muted" numberOfLines={1} style={styles.value}>
          {value}
        </Text>
      ) : null}
      {badge}
      {loading ? <ActivityIndicator size="small" color={colors.accent} /> : right}
      {onPress && showChevron && !right && !loading ? (
        <Icon name="chevron" size={16} color={colors.muted} strokeWidth={2.2} />
      ) : null}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        onPressIn={onPressIn}
        disabled={disabled || loading}
        accessibilityRole={accessibilityRole}
        accessibilityLabel={accessibilityLabel ?? (value ? `${title}, ${value}` : title)}
        accessibilityHint={subtitle}
        accessibilityState={{ disabled: disabled || loading, busy: loading }}
        style={({ pressed }) => [
          styles.row,
          pressed && { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(11,31,58,0.05)' },
          disabled && styles.disabled,
          style,
        ]}
      >
        {body}
      </Pressable>
    );
  }

  return (
    <View style={[styles.row, style]} accessible={!right} accessibilityLabel={accessibilityLabel ?? (value ? `${title}, ${value}` : title)}>
      {body}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: ROW_MIN_HEIGHT,
    paddingHorizontal: ROW_PADDING,
    paddingVertical: space.sm + 2,
    gap: ROW_GAP,
  },
  tile: {
    width: ROW_TILE,
    height: ROW_TILE,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: { flex: 1, justifyContent: 'center', minWidth: 0 },
  subtitle: { marginTop: 1 },
  value: { maxWidth: '42%', flexShrink: 1 },
  disabled: { opacity: 0.45 },
});
