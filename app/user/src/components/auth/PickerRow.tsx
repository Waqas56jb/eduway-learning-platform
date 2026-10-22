import { memo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { Icon, type IconName } from '@/components/icons';
import { PressableScale, Text } from '@/components/ui';
import { radius, space, useTheme } from '@/theme';

interface PickerRowProps {
  title: string;
  subtitle?: string;
  icon?: IconName;
  /** Custom content for the leading circle (e.g. a flag emoji); takes precedence over `icon`. */
  leading?: ReactNode;
  selected?: boolean;
  onPress: () => void;
}

/** Selectable row used inside the auth picker sheets (gold check when selected). */
export const PickerRow = memo(function PickerRow({ title, subtitle, icon, leading, selected, onPress }: PickerRowProps) {
  const { colors } = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      haptics={false}
      scaleTo={0.98}
      accessibilityRole="radio"
      accessibilityState={{ selected: !!selected, checked: !!selected }}
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      style={[
        styles.row,
        {
          backgroundColor: selected ? colors.accentSoft : colors.surface,
          borderColor: selected ? colors.accent : colors.border,
        },
      ]}
    >
      {leading || icon ? (
        <View style={[styles.iconWrap, { backgroundColor: selected ? colors.surface : colors.surfaceMuted }]}>
          {leading ?? (icon ? <Icon name={icon} size={18} color={selected ? colors.accent : colors.muted} /> : null)}
        </View>
      ) : null}
      <View style={styles.texts}>
        <Text variant={selected ? 'bodyBold' : 'bodyMedium'} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" color="muted" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={styles.checkSlot}>
        {selected ? (
          <Animated.View entering={ZoomIn.duration(180)} style={[styles.check, { backgroundColor: colors.accent }]}>
            <Icon name="check" size={14} color={colors.onAccent} strokeWidth={2.5} />
          </Animated.View>
        ) : null}
      </View>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  iconWrap: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  texts: { flex: 1, gap: 2 },
  checkSlot: { width: 24, alignItems: 'center' },
  check: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
