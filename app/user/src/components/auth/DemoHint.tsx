import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Icon } from '@/components/icons';
import { Text } from '@/components/ui';
import { radius, space, useTheme } from '@/theme';

interface DemoHintProps {
  title: string;
  message: string;
}

/** Subtle gold card explaining the demo credentials. */
export function DemoHint({ title, message }: DemoHintProps) {
  const { colors } = useTheme();
  return (
    <Animated.View
      entering={FadeIn.duration(300).delay(150)}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${title}. ${message}`}
      style={[styles.card, { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}
    >
      <View style={[styles.icon, { backgroundColor: colors.accent }]}>
        <Icon name="sparkles" size={16} color={colors.onAccent} />
      </View>
      <View style={styles.texts}>
        <Text variant="label" color="ink">
          {title}
        </Text>
        <Text variant="caption" color="muted">
          {message}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
  },
  icon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  texts: { flex: 1, gap: 2 },
});
