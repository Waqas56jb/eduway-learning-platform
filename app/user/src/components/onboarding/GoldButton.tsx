import { LinearGradient } from 'expo-linear-gradient';
import { memo, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Icon, type IconName } from '@/components/icons';
import { PressableScale, Text } from '@/components/ui';
import { gradients, palette, radius, shadows } from '@/theme';
import { CTA_HEIGHT } from './tokens';

/**
 * Signature 56pt gold-gradient CTA for the cinematic screens. Pass `title` for a simple label
 * or `children` for custom (e.g. morphing) content.
 */
export const GoldButton = memo(function GoldButton({
  title,
  icon,
  onPress,
  accessibilityLabel,
  children,
  style,
}: {
  title?: string;
  icon?: IconName;
  onPress: () => void;
  accessibilityLabel?: string;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.97}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      style={[styles.btn, shadows.gold, style]}
    >
      <View style={styles.clip} pointerEvents="none">
        <LinearGradient
          colors={gradients.gold}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.sheen} />
      </View>
      {children ?? (
        <View style={styles.row} pointerEvents="none">
          <Text variant="bodyBold" color={palette.navy} numberOfLines={1} style={styles.label}>
            {title}
          </Text>
          {icon ? <Icon name={icon} size={20} color={palette.navy} strokeWidth={2.2} /> : null}
        </View>
      )}
    </PressableScale>
  );
});

export const goldButtonStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  label: { fontSize: 17, lineHeight: 22 },
});

const styles = StyleSheet.create({
  btn: {
    height: CTA_HEIGHT,
    alignSelf: 'stretch',
    borderRadius: radius.md + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clip: { ...StyleSheet.absoluteFill, borderRadius: radius.md + 2, overflow: 'hidden' },
  sheen: {
    position: 'absolute',
    top: 0,
    start: 0,
    end: 0,
    height: '50%',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  row: goldButtonStyles.row,
  label: goldButtonStyles.label,
});
