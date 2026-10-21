import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Logo } from '@/components/icons';
import { Screen } from '@/components/layout';
import { IconButton, Text } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { gradients, palette, radius, SCREEN_PADDING, space, useTheme } from '@/theme';

interface AuthScaffoldProps {
  title: string;
  subtitle?: string;
  /** Show the back button in the hero (default true). */
  showBack?: boolean;
  onBack?: () => void;
  /** Rendered under the subtitle inside the hero (e.g. step indicator). */
  accessory?: ReactNode;
  children: ReactNode;
}

const SHEET_OVERLAP = 28;

/** Compact navy hero (gradient + logo + back) curving into a cream sheet that holds the form. */
export function AuthScaffold({ title, subtitle, showBack = true, onBack, accessory, children }: AuthScaffoldProps) {
  const { colors } = useTheme();
  const { t } = useI18n('auth');
  const insets = useSafeAreaInsets();

  const handleBack = () => {
    if (onBack) return onBack();
    if (router.canGoBack()) router.back();
    else router.replace('/(auth)/welcome');
  };

  return (
    <Screen
      scroll
      keyboard
      padded={false}
      edges={['bottom']}
      statusBar="light"
      background={colors.background}
      contentContainerStyle={styles.content}
    >
      <LinearGradient
        colors={gradients.navy}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.hero, { paddingTop: insets.top + space.sm }]}
      >
        <View pointerEvents="none" style={styles.glowLarge} />
        <View pointerEvents="none" style={styles.glowSmall} />

        <View style={styles.topRow}>
          {showBack ? (
            <IconButton
              icon="back"
              variant="glass"
              color={palette.white}
              onPress={handleBack}
              accessibilityLabel={t('common:a11y.back')}
            />
          ) : (
            <View style={styles.spacer} />
          )}
          <Logo size={48} variant="gold" />
          <View style={styles.spacer} />
        </View>

        <Animated.View entering={FadeInDown.duration(300)} style={styles.titles}>
          <Text variant="h1" color={palette.white} align="center" accessibilityRole="header">
            {title}
          </Text>
          {subtitle ? (
            <Text variant="body" color="rgba(255,255,255,0.74)" align="center">
              {subtitle}
            </Text>
          ) : null}
        </Animated.View>
        {accessory ? <View style={styles.accessory}>{accessory}</View> : null}
      </LinearGradient>

      <View style={[styles.sheet, { backgroundColor: colors.background }]}>{children}</View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1 },
  hero: {
    paddingHorizontal: SCREEN_PADDING,
    paddingBottom: SHEET_OVERLAP + space.xl,
    overflow: 'hidden',
  },
  glowLarge: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    top: -90,
    end: -70,
    backgroundColor: 'rgba(201,162,74,0.16)',
  },
  glowSmall: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    bottom: 10,
    start: -50,
    backgroundColor: 'rgba(201,162,74,0.08)',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
  },
  spacer: { width: 44, height: 44 },
  titles: { marginTop: space.lg, gap: space.xs },
  accessory: { marginTop: space.lg },
  sheet: {
    flexGrow: 1,
    marginTop: -SHEET_OVERLAP,
    borderTopStartRadius: radius.xl,
    borderTopEndRadius: radius.xl,
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: space.xxl,
    paddingBottom: space.xxl,
    gap: space.lg,
  },
});
