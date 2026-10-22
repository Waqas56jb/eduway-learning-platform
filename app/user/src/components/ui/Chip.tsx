import { memo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Icon, type IconName } from '@/components/icons';
import { useLangStore } from '@/store/langStore';
import { fontFor, palette, radius, useTheme } from '@/theme';
import { formatNumber } from '@/utils/format';
import { haptic } from '@/utils/haptics';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconName;
  /** Accent color (icon / dot), e.g. a subject color. */
  color?: string;
  count?: number;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Filter / choice chip. */
export const Chip = memo(function Chip({ label, selected = false, onPress, icon, color, count, disabled, style }: ChipProps) {
  const { colors, isDark } = useTheme();
  const isAr = useLangStore((s) => s.isAr);
  const lang = useLangStore((s) => s.lang);

  const selBg = isDark ? colors.accent : palette.navy;
  const selFg = isDark ? palette.navy : '#FFFFFF';
  const bg = selected ? selBg : colors.surface;
  const fg = selected ? selFg : colors.ink;
  const iconColor = selected ? selFg : color ?? colors.muted;

  return (
    <PressableScale
      onPress={
        onPress
          ? () => {
              haptic.selection();
              onPress();
            }
          : undefined
      }
      haptics={false}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled: !!disabled }}
      hitSlop={CHIP_SLOP}
      scaleTo={0.95}
      style={[
        styles.base,
        { backgroundColor: bg, borderColor: selected ? selBg : colors.border },
        style,
      ]}
    >
      {icon ? (
        <Icon name={icon} size={16} color={iconColor} strokeWidth={2} />
      ) : color && !selected ? (
        <View style={[styles.dot, { backgroundColor: color }]} />
      ) : null}
      <Text
        variant="label"
        color={fg}
        numberOfLines={1}
        maxFontSizeMultiplier={1.2}
        style={[styles.text, { fontFamily: fontFor(selected ? 'semibold' : 'medium', isAr) }]}
      >
        {label}
      </Text>
      {typeof count === 'number' ? (
        <View
          style={[
            styles.count,
            { backgroundColor: selected ? (isDark ? 'rgba(11,31,58,0.18)' : 'rgba(255,255,255,0.18)') : colors.surfaceMuted },
          ]}
        >
          <Text variant="caption" color={selected ? selFg : colors.muted} tabular style={{ fontFamily: fontFor('semibold', isAr) }}>
            {formatNumber(count, lang)}
          </Text>
        </View>
      ) : null}
    </PressableScale>
  );
});

/** 40pt chip + 2pt slop each side = 44pt touch target. */
const CHIP_SLOP = { top: 2, bottom: 2, left: 2, right: 2 } as const;

const styles = StyleSheet.create({
  text: { flexShrink: 1 },
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: 16,
    maxWidth: '100%',
    borderRadius: radius.pill,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  count: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
