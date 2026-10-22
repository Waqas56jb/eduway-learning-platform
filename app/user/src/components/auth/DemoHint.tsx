import { StyleSheet, View } from 'react-native';
import { Icon } from '@/components/icons';
import { Text } from '@/components/ui';
import { radius, space, useTheme } from '@/theme';

interface DemoHintProps {
  title: string;
  message: string;
}

/**
 * Subtle gold pill explaining the dev OTP bypass (server setting `otp.devBypassCode`, seeded demo student).
 * Rendered in development builds only.
 */
export function DemoHint({ title, message }: DemoHintProps) {
  const { colors, isDark } = useTheme();
  if (!__DEV__) return null;
  return (
    <View style={styles.center}>
      <View
        accessible
        accessibilityRole="text"
        accessibilityLabel={`${title}. ${message}`}
        style={[
          styles.pill,
          {
            backgroundColor: colors.accentSoft,
            borderColor: isDark ? 'rgba(201,162,74,0.32)' : 'rgba(201,162,74,0.38)',
          },
        ]}
      >
        <View style={[styles.icon, { backgroundColor: colors.accent }]}>
          <Icon name="sparkles" size={12} color={colors.onAccent} strokeWidth={2.2} />
        </View>
        <Text variant="caption" color="ink" style={styles.text}>
          <Text variant="label" color={isDark ? colors.accentLight : colors.primary}>
            {title}
          </Text>
          {'  ·  '}
          <Text variant="caption" color="muted">
            {message}
          </Text>
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center' },
  pill: {
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
    paddingStart: space.sm,
    paddingEnd: space.md + 2,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  icon: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  text: { flexShrink: 1 },
});
