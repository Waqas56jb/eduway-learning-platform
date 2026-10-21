import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { Icon, type IconName } from '@/components/icons';
import { PressableScale, Text } from '@/components/ui';
import { radius, space, useTheme } from '@/theme';

interface PickerRowProps {
  title: string;
  subtitle?: string;
  icon?: IconName;
  selected?: boolean;
  onPress: () => void;
}

/** Selectable row used inside the auth picker sheets (checkmark when selected). */
export const PickerRow = memo(function PickerRow({ title, subtitle, icon, selected, onPress }: PickerRowProps) {
  const { colors } = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: !!selected, checked: !!selected }}
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      style={[
        styles.row,
        { backgroundColor: selected ? colors.accentSoft : 'transparent', borderColor: selected ? colors.accent : 'transparent' },
      ]}
    >
      {icon ? (
        <View style={[styles.iconWrap, { backgroundColor: colors.surfaceMuted }]}>
          <Icon name={icon} size={18} color={selected ? colors.accent : colors.muted} />
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
      {selected ? (
        <Animated.View entering={ZoomIn.duration(180)} style={[styles.check, { backgroundColor: colors.accent }]}>
          <Icon name="check" size={14} color={colors.onAccent} strokeWidth={2.5} />
        </Animated.View>
      ) : null}
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  iconWrap: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  texts: { flex: 1, gap: 2 },
  check: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
