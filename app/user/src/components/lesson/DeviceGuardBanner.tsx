import { memo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { Icon } from '@/components/icons';
import { PressableScale, Text } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { HIT_SLOP, SCREEN_PADDING, space, useTheme } from '@/theme';

/** Session guard shown under the player (playback is bound to this signed-in device; the server enforces the device limit). */
export const DeviceGuardBanner = memo(function DeviceGuardBanner({ onDismiss }: { onDismiss: () => void }) {
  const { t } = useI18n('lesson');
  const { colors } = useTheme();
  const device = Platform.OS === 'ios' ? t('guard.deviceIos') : Platform.OS === 'android' ? t('guard.deviceAndroid') : t('guard.deviceOther');

  return (
    <Animated.View
      entering={FadeInDown.duration(250)}
      exiting={FadeOutUp.duration(200)}
      style={[styles.wrap, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}
    >
      <View style={[styles.iconBox, { backgroundColor: colors.successSoft }]}>
        <Icon name="shield" size={18} color={colors.success} filled />
      </View>
      <View style={styles.texts}>
        <Text variant="label" numberOfLines={1}>
          {t('guard.playingOn', { device })}
        </Text>
        <Text variant="caption" color="muted" numberOfLines={1}>
          {t('guard.hint')}
        </Text>
      </View>
      <PressableScale
        onPress={onDismiss}
        hitSlop={HIT_SLOP}
        accessibilityRole="button"
        accessibilityLabel={t('guard.dismiss')}
        style={styles.close}
      >
        <Icon name="close" size={18} color={colors.muted} />
      </PressableScale>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: SCREEN_PADDING,
    paddingVertical: space.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconBox: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  texts: { flex: 1 },
  close: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
});
