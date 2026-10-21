import { Platform, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Icon, type IconName } from '@/components/icons';
import { PressableScale } from '@/components/ui';
import { HIT_SLOP } from '@/theme';

export interface GlassButtonProps {
  icon: IconName;
  onPress: () => void;
  accessibilityLabel: string;
  filled?: boolean;
  color?: string;
}

const SIZE = 40;

/** Round frosted button for use over imagery / the navy compact bar. */
export function GlassButton({ icon, onPress, accessibilityLabel, filled, color = '#FFFFFF' }: GlassButtonProps) {
  return (
    <PressableScale
      onPress={onPress}
      hitSlop={HIT_SLOP}
      scaleTo={0.92}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={styles.btn}
    >
      {Platform.OS === 'ios' ? <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} /> : null}
      <View style={[StyleSheet.absoluteFill, styles.tint]} />
      <Icon name={icon} size={20} color={color} filled={filled} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  tint: { backgroundColor: Platform.OS === 'ios' ? 'rgba(7,20,38,0.25)' : 'rgba(7,20,38,0.5)' },
});
