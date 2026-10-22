import { BlurView } from 'expo-blur';
import { memo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Icon, type IconName } from '@/components/icons';
import { PressableScale, Text } from '@/components/ui';
import { radius, space } from '@/theme';
import { CTA_HEIGHT, ink } from './tokens';

/** Frosted-glass secondary button for the cinematic photo screens. */
export const GlassButton = memo(function GlassButton({
  title,
  onPress,
  icon,
  style,
}: {
  title: string;
  onPress: () => void;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={title} style={[styles.btn, style]}>
      <View style={styles.clip} pointerEvents="none">
        <BlurView intensity={28} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={styles.wash} />
      </View>
      <View style={styles.row} pointerEvents="none">
        {icon ? <Icon name={icon} size={18} color={ink.goldHi} /> : null}
        <Text variant="bodyBold" color={ink.white} align="center" numberOfLines={1} style={styles.label}>
          {title}
        </Text>
      </View>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  btn: {
    height: CTA_HEIGHT,
    alignSelf: 'stretch',
    borderRadius: radius.md + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clip: {
    ...StyleSheet.absoluteFill,
    borderRadius: radius.md + 2,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: ink.hairline,
  },
  wash: { ...StyleSheet.absoluteFill, backgroundColor: ink.glass },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  label: { fontSize: 17, lineHeight: 22 },
});
