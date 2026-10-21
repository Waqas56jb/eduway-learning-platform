import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { router } from 'expo-router';
import { Icon } from '@/components/icons';
import { Header, Screen } from '@/components/layout';
import { Button, Text } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { space, useTheme } from '@/theme';

export default function NotFound() {
  const { t } = useI18n('common');
  const { colors } = useTheme();
  const float = useSharedValue(0);

  useEffect(() => {
    float.value = withRepeat(withSequence(withTiming(1, { duration: 1600 }), withTiming(0, { duration: 1600 })), -1);
  }, [float]);

  const floatStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -6 * float.value }] }));

  return (
    <Screen edges={['top', 'bottom']}>
      <Header back onBack={() => router.replace('/')} />
      <View style={styles.center}>
        <Animated.View style={[styles.halo, { backgroundColor: colors.accentSoft }, floatStyle]}>
          <View style={[styles.circle, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Icon name="search" size={44} color={colors.accent} />
          </View>
        </Animated.View>
        <Animated.View entering={FadeInDown.duration(300).delay(80)} style={styles.texts}>
          <Text variant="h1" align="center">
            {t('states.error')}
          </Text>
          <Text variant="body" color="muted" align="center">
            {t('states.empty')}
          </Text>
        </Animated.View>
      </View>
      <Animated.View entering={FadeInDown.duration(300).delay(160)} style={styles.footer}>
        <Button title={t('actions.goHome')} icon="home" fullWidth onPress={() => router.replace('/')} />
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.xxl },
  halo: { width: 168, height: 168, borderRadius: 84, alignItems: 'center', justifyContent: 'center' },
  circle: {
    width: 112,
    height: 112,
    borderRadius: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  texts: { gap: space.sm, paddingHorizontal: space.lg },
  footer: { paddingBottom: space.lg },
});
