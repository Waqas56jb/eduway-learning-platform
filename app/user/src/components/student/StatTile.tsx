import { memo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Icon, type IconName } from '@/components/icons';
import { PressableScale, Text } from '@/components/ui';
import { withAlpha } from '@/components/home/color';
import { radius, shadows, space, useTheme } from '@/theme';

export interface StatTileProps {
  icon: IconName;
  label: string;
  value: string;
  sublabel?: string;
  /** Accent color for the icon square (defaults to gold). */
  color?: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

/** KPI tile: tinted icon square, large tabular Playfair value, label and muted sublabel. Fixed internal rhythm. */
export const StatTile = memo(function StatTile({ icon, label, value, sublabel, color, onPress, style }: StatTileProps) {
  const { colors, isDark } = useTheme();
  const tint = color ?? colors.accent;
  const a11y = `${label}: ${value}${sublabel ? `, ${sublabel}` : ''}`;

  const content = (
    <>
      <View style={[styles.iconBox, { backgroundColor: withAlpha(tint, isDark ? 0.22 : 0.12) }]}>
        <Icon name={icon} size={18} color={tint} />
      </View>
      <Text
        variant="h1"
        display
        tabular
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
        style={styles.value}
      >
        {value}
      </Text>
      <Text variant="label" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>
        {label}
      </Text>
      <Text variant="caption" color="muted" numberOfLines={1} style={styles.sub}>
        {sublabel ?? ' '}
      </Text>
    </>
  );

  const boxStyle = [
    styles.tile,
    { backgroundColor: colors.surface, borderColor: colors.border },
    !isDark && shadows.sm,
    style,
  ];

  if (onPress) {
    return (
      <PressableScale onPress={onPress} style={boxStyle} accessibilityRole="button" accessibilityLabel={a11y}>
        {content}
      </PressableScale>
    );
  }
  return (
    <View style={boxStyle} accessible accessibilityLabel={a11y}>
      {content}
    </View>
  );
});

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.lg,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.md,
  },
  value: { marginBottom: space.xxs },
  sub: { marginTop: space.xxs },
});
