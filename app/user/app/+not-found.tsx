import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
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
import { Header, Screen } from '@/components/layout';
import { goBackOrHome } from '@/components/layout/Header';
import { Button, Text } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { gradients, palette, SCREEN_PADDING, space } from '@/theme';
import { haptic } from '@/utils/haptics';

export default function NotFound() {
  const { t } = useI18n('settings');
  const { width, height } = useWindowDimensions();
  const float = useSharedValue(0);
  const markSize = Math.min(Math.round(width * 0.3), 120);
  const compact = height < 640;

  useEffect(() => {
    const ease = Easing.inOut(Easing.sin);
    float.value = withRepeat(
      withSequence(withTiming(1, { duration: 1800, easing: ease }), withTiming(0, { duration: 1800, easing: ease })),
      -1,
    );
  }, [float]);

  const floatStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -8 * float.value }] }));

  return (
    <Screen padded={false} edges={['top', 'bottom']} background={palette.navy} statusBar="light">
      <LinearGradient colors={gradients.navy} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View pointerEvents="none" style={[styles.glow, { width: width * 1.1, height: width * 1.1, borderRadius: width * 0.55 }]} />

      <Header transparent onBack={goBackOrHome} />

      <View style={styles.center}>
        <Animated.View style={[styles.mark, floatStyle]}>
          <Logo size={markSize} variant="gold" />
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(350).delay(60)} style={styles.texts}>
          <Text
            variant="display"
            display
            color={palette.goldLight}
            align="center"
            allowFontScaling={false}
            style={[styles.code, compact && styles.codeCompact]}
          >
            404
          </Text>
          <Text variant="h2" display color={palette.white} align="center">
            {t('notFound.title')}
          </Text>
          <Text variant="body" color="rgba(255,255,255,0.75)" align="center" style={styles.message}>
            {t('notFound.message')}
          </Text>
        </Animated.View>
      </View>

      <Animated.View entering={FadeInDown.duration(350).delay(140)} style={styles.footer}>
        <Button title={t('common:actions.goHome')} icon="home" size="lg" fullWidth onPress={() => router.replace('/')} />
        <Pressable
          onPressIn={() => haptic.light()}
          onPress={goBackOrHome}
          accessibilityRole="button"
          style={({ pressed }) => [styles.ghost, pressed && styles.pressed]}
        >
          <Text variant="bodyMedium" color={palette.goldLight} align="center">
            {t('notFound.back')}
          </Text>
        </Pressable>
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  glow: {
    position: 'absolute',
    top: '18%',
    alignSelf: 'center',
    backgroundColor: 'rgba(201,162,74,0.08)',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SCREEN_PADDING },
  mark: { marginBottom: space.xl },
  texts: { alignItems: 'center', gap: space.sm, maxWidth: 360 },
  code: { fontSize: 64, lineHeight: 72, letterSpacing: 2 },
  codeCompact: { fontSize: 48, lineHeight: 56 },
  message: { marginTop: space.xs },
  footer: { paddingHorizontal: SCREEN_PADDING, paddingBottom: space.lg, gap: space.xs },
  ghost: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
  pressed: { opacity: 0.55, transform: [{ scale: 0.97 }] },
});
