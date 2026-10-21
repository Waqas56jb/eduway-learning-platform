import { memo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme';

export interface DividerProps {
  /** Indent from the start edge (e.g. to align with list text after an icon). */
  inset?: number;
  vertical?: boolean;
  /** Vertical space around a horizontal divider. */
  spacing?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}

/** Hairline separator. */
export const Divider = memo(function Divider({ inset = 0, vertical = false, spacing = 0, color, style }: DividerProps) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[
        vertical
          ? { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', marginHorizontal: spacing }
          : { height: StyleSheet.hairlineWidth, marginStart: inset, marginVertical: spacing },
        { backgroundColor: color ?? colors.border },
        style,
      ]}
    />
  );
});
