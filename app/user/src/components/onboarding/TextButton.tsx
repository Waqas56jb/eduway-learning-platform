import { memo } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { PressableScale, Text } from '@/components/ui';
import { HIT_SLOP, space } from '@/theme';
import { ink } from './tokens';

/** Borderless text action (Skip, "I already have an account", legal links) with a 44pt hit area. */
export const TextButton = memo(function TextButton({
  title,
  onPress,
  color = ink.white,
  variant = 'bodyMedium',
  accessibilityLabel,
  accessibilityRole = 'button',
  style,
}: {
  title: string;
  onPress: () => void;
  color?: string;
  variant?: 'bodyMedium' | 'bodyBold' | 'label' | 'caption';
  accessibilityLabel?: string;
  accessibilityRole?: 'button' | 'link';
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.94}
      hitSlop={HIT_SLOP}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel ?? title}
      style={[styles.btn, style]}
    >
      <Text variant={variant} color={color} align="center" numberOfLines={1}>
        {title}
      </Text>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  btn: { minHeight: 44, minWidth: 44, paddingHorizontal: space.sm, alignItems: 'center', justifyContent: 'center' },
});
