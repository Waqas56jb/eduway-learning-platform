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

/** Compact KPI tile: tinted icon square, large Playfair value (tabular), label caption. */
export const StatTile = memo(function StatTile({ icon, label, value, sublabel, color, onPress, style }: StatTileProps) {
  const { colors, isDark } = useTheme();
  const tint = color ?? colors.accent;

  const content = (
    <>
      <View style={styles.top}>
        <View style={[styles.iconBox, { backgroundColor: withAlpha(tint, isDark ? 0.22 : 0.12) }]}>
          <Icon name={icon} size={20} color={tint} />
        </View>
        {onPress ? <Icon name="chevron" size={16} color={colors.muted} /> : null}
      </View>
      <Text variant="h1" display tabular numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={styles.value}>
        {value}
      </Text>
      <Text variant="label" numberOfLines={1}>
        {label}
      </Text>
      {sublabel ? (
        <Text variant="caption" color="muted" numberOfLines={1} style={styles.sub}>
          {sublabel}
        </Text>
      ) : null}
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
      <PressableScale
        onPress={onPress}
        style={boxStyle}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value}${sublabel ? `, ${sublabel}` : ''}`}
      >
        {content}
      </PressableScale>
    );
  }
  return (
    <View style={boxStyle} accessible accessibilityLabel={`${label}: ${value}${sublabel ? `, ${sublabel}` : ''}`}>
      {content}
    </View>
  );
});

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    minHeight: 132,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.lg,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.md,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: { marginBottom: space.xxs },
  sub: { marginTop: space.xxs },
});
