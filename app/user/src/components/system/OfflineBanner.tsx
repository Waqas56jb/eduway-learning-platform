import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useConnectivity } from '@/api/connectivity';
import { Icon } from '@/components/icons';
import { Text } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { palette, radius, shadows, space } from '@/theme';

/**
 * Floating "you're offline" pill shown while the API is unreachable (see `src/api/connectivity.ts`).
 * Purely informational (touches pass through): queries pause and resume automatically, exam answers stay queued.
 */
export const OfflineBanner = memo(function OfflineBanner() {
  const online = useConnectivity((s) => s.online);
  const { t } = useI18n('common');
  const insets = useSafeAreaInsets();
  if (online) return null;
  return (
    <View pointerEvents="none" style={[styles.wrap, { top: insets.top + space.sm }]}>
      <Animated.View
        entering={FadeInUp.duration(300)}
        exiting={FadeOutUp.duration(250)}
        style={[styles.pill, shadows.md]}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
      >
        <Icon name="wifi-off" size={16} color={palette.goldLight} />
        <Text variant="caption" color={palette.white} style={styles.text} numberOfLines={2}>
          {t('states.offline')}
        </Text>
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { position: 'absolute', start: 0, end: 0, alignItems: 'center', paddingHorizontal: space.xl },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: palette.navy,
    borderRadius: radius.pill,
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
    maxWidth: 420,
  },
  text: { flexShrink: 1 },
});
