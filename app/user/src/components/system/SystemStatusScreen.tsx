import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Logo } from '@/components/icons';
import { Button, Text } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { gradients, palette, SCREEN_PADDING, space } from '@/theme';
import { haptic } from '@/utils/haptics';
import type { Localized } from '@/types';

interface Props {
  kind: 'maintenance' | 'update';
  message?: Localized | null;
  storeUrl?: string | null;
  /** Re-check `/public/app-config`. */
  onRetry: () => Promise<unknown>;
}

/** Full-screen block shown while the platform is in maintenance or this app version is below the minimum. */
export function SystemStatusScreen({ kind, message, storeUrl, onRetry }: Props) {
  const { t, L } = useI18n('common');
  const { width } = useWindowDimensions();
  const float = useSharedValue(0);
  const [checking, setChecking] = useState(false);
  const markSize = Math.min(Math.round(width * 0.28), 112);

  useEffect(() => {
    const ease = Easing.inOut(Easing.sin);
    float.value = withRepeat(
      withSequence(withTiming(1, { duration: 1800, easing: ease }), withTiming(0, { duration: 1800, easing: ease })),
      -1,
    );
  }, [float]);
  const floatStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -8 * float.value }] }));

  const custom = message ? L(message).trim() : '';
  const title = kind === 'maintenance' ? t('appStatus.maintenanceTitle') : t('appStatus.updateTitle');
  const body = kind === 'maintenance' ? custom || t('appStatus.maintenanceBody') : t('appStatus.updateBody');

  const retry = async () => {
    haptic.light();
    setChecking(true);
    try {
      await onRetry();
    } finally {
      setChecking(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: palette.navy }]}>
      <LinearGradient colors={gradients.navy} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View pointerEvents="none" style={[styles.glow, { width: width * 1.1, height: width * 1.1, borderRadius: width * 0.55 }]} />
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <View style={styles.center}>
          <Animated.View style={[styles.mark, floatStyle]}>
            <Logo size={markSize} variant="gold" />
          </Animated.View>
          <Animated.View entering={FadeInDown.duration(350).delay(60)} style={styles.texts}>
            <Text variant="h2" display color={palette.white} align="center">
              {title}
            </Text>
            <Text variant="body" color="rgba(255,255,255,0.75)" align="center" style={styles.message}>
              {body}
            </Text>
          </Animated.View>
        </View>
        <Animated.View entering={FadeInDown.duration(350).delay(140)} style={styles.footer}>
          {kind === 'update' && storeUrl ? (
            <Button
              title={t('appStatus.updateCta')}
              icon="download"
              size="lg"
              fullWidth
              onPress={() => void Linking.openURL(storeUrl).catch(() => {})}
            />
          ) : (
            <Button title={t('appStatus.checkAgain')} icon="refresh" size="lg" fullWidth loading={checking} onPress={retry} />
          )}
          {kind === 'update' && storeUrl ? (
            <Pressable
              onPress={retry}
              accessibilityRole="button"
              style={({ pressed }) => [styles.ghost, pressed && styles.pressed]}
            >
              <Text variant="bodyMedium" color={palette.goldLight} align="center">
                {t('appStatus.checkAgain')}
              </Text>
            </Pressable>
          ) : null}
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  glow: { position: 'absolute', top: '18%', alignSelf: 'center', backgroundColor: 'rgba(201,162,74,0.08)' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SCREEN_PADDING },
  mark: { marginBottom: space.xl },
  texts: { alignItems: 'center', gap: space.sm, maxWidth: 360 },
  message: { marginTop: space.xs },
  footer: { paddingHorizontal: SCREEN_PADDING, paddingBottom: space.lg, gap: space.xs },
  ghost: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
  pressed: { opacity: 0.55, transform: [{ scale: 0.97 }] },
});
