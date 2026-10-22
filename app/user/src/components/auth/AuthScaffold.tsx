import { createContext, useCallback, useContext, useEffect, useId, useRef, type ReactNode } from 'react';
import { isRTL } from '@/utils/rtl';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { Logo } from '@/components/icons';
import { IconButton, Text } from '@/components/ui';
import { BLURHASH } from '@/constants/images';
import { useI18n } from '@/hooks/useI18n';
import { gradients, palette, radius, SCREEN_PADDING, space, useTheme } from '@/theme';
import { useKeyboard } from './useKeyboard';

interface AuthScaffoldProps {
  title: string;
  subtitle?: string;
  /** Show the back button in the hero (default true). */
  showBack?: boolean;
  onBack?: () => void;
  /** Rendered under the subtitle inside the hero (e.g. step indicator). */
  accessory?: ReactNode;
  /** Optional HD photo blended softly into the navy hero. */
  image?: string;
  /** Primary action pinned at the bottom, always above the keyboard and the home indicator. */
  footer?: ReactNode;
  /** Secondary footer content (e.g. "Already have an account?") — hidden while the keyboard is open. */
  footerSecondary?: ReactNode;
  children: ReactNode;
}

const SHEET_OVERLAP = 28;
/** Space kept clear below a focused field (room for its hint / error line). */
const REVEAL_BOTTOM = 56;
const REVEAL_TOP = 16;

const RevealContext = createContext<() => void>(() => undefined);

/** Call from a field's `onFocus` to make sure it scrolls into view above the keyboard. */
export const useAuthReveal = () => useContext(RevealContext);

/** Soft gold radial light on the hero's end edge (RTL-aware), purely decorative. */
function GoldGlow() {
  const raw = useId();
  const id = `glow${raw.replace(/[^a-zA-Z0-9]/g, '')}`;
  const endX = isRTL() ? '8%' : '92%';
  const startX = isRTL() ? '92%' : '8%';
  return (
    <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <RadialGradient id={`${id}a`} cx={endX} cy="0%" rx="70%" ry="85%" fx={endX} fy="0%">
          <Stop offset="0" stopColor={palette.goldLight} stopOpacity={0.34} />
          <Stop offset="0.55" stopColor={palette.gold} stopOpacity={0.08} />
          <Stop offset="1" stopColor={palette.gold} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id={`${id}b`} cx={startX} cy="100%" rx="55%" ry="60%" fx={startX} fy="100%">
          <Stop offset="0" stopColor={palette.gold} stopOpacity={0.14} />
          <Stop offset="1" stopColor={palette.gold} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id}a)`} />
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id}b)`} />
    </Svg>
  );
}

/**
 * Auth layout: short cinematic navy hero (photo + gradient + gold glow, back button, logo, display title)
 * curving into a cream sheet that holds the form, with the primary CTA pinned above the keyboard.
 */
export function AuthScaffold({
  title,
  subtitle,
  showBack = true,
  onBack,
  accessory,
  image,
  footer,
  footerSecondary,
  children,
}: AuthScaffoldProps) {
  const { colors, isDark } = useTheme();
  const { t } = useI18n('auth');
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboard();

  const scrollRef = useRef<ScrollView>(null);
  const viewportRef = useRef<View>(null);
  const scrollY = useRef(0);
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleBack = () => {
    if (onBack) return onBack();
    if (router.canGoBack()) router.back();
    else router.replace('/(auth)/welcome');
  };

  /** Scrolls the focused TextInput into the visible area (after the keyboard has settled). */
  const reveal = useCallback(() => {
    if (revealTimer.current) clearTimeout(revealTimer.current);
    revealTimer.current = setTimeout(() => {
      // May be null at runtime when nothing is focused.
      const input = TextInput.State.currentlyFocusedInput();
      const viewport = viewportRef.current;
      if (!input || !viewport) return;
      viewport.measureInWindow((_vx, vy, _vw, vh) => {
        input.measureInWindow((_ix, iy, _iw, ih) => {
          const visibleTop = vy + REVEAL_TOP;
          const visibleBottom = vy + vh - REVEAL_BOTTOM;
          let delta = 0;
          if (iy + ih > visibleBottom) delta = iy + ih - visibleBottom;
          else if (iy < visibleTop) delta = iy - visibleTop;
          if (Math.abs(delta) > 2) {
            scrollRef.current?.scrollTo({ y: Math.max(0, scrollY.current + delta), animated: true });
          }
        });
      });
    }, 300);
  }, []);

  useEffect(() => {
    if (keyboard.visible) reveal();
  }, [keyboard.visible, reveal]);

  useEffect(
    () => () => {
      if (revealTimer.current) clearTimeout(revealTimer.current);
    },
    [],
  );

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollY.current = e.nativeEvent.contentOffset.y;
  }, []);

  const bottomInset = Math.max(insets.bottom, space.lg);
  const bg = colors.background;

  return (
    <RevealContext.Provider value={reveal}>
      <View style={[styles.flex, { backgroundColor: bg }]}>
        <StatusBar style="light" animated />
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View ref={viewportRef} style={styles.flex} collapsable={false}>
            <ScrollView
              ref={scrollRef}
              style={styles.flex}
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              onScroll={onScroll}
              scrollEventThrottle={32}
            >
              {/* Navy extension so the iOS top bounce never reveals the cream background. */}
              <View pointerEvents="none" style={[styles.bounceFill, { backgroundColor: gradients.navy[0] }]} />

              <View style={[styles.hero, { paddingTop: insets.top + space.sm }]}>
                <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                  <LinearGradient
                    colors={gradients.navy}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                  {image ? (
                    <Image
                      source={{ uri: image }}
                      placeholder={{ blurhash: BLURHASH }}
                      transition={400}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                      style={[StyleSheet.absoluteFill, styles.heroImage]}
                    />
                  ) : null}
                  <LinearGradient
                    colors={['rgba(11,31,58,0.62)', 'rgba(11,31,58,0.84)', 'rgba(11,31,58,0.97)']}
                    locations={[0, 0.55, 1]}
                    style={StyleSheet.absoluteFill}
                  />
                  <GoldGlow />
                </View>

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
                    <View style={styles.sideSlot} />
                  )}
                  <Animated.View entering={FadeIn.duration(400)} style={styles.logoSlot}>
                    <Logo size={40} variant="gold" />
                  </Animated.View>
                  <View style={styles.sideSlot} />
                </View>

                <Animated.View entering={FadeInDown.duration(350).delay(60)} style={styles.titles}>
                  <Text variant="h1" color={palette.white} align="center" accessibilityRole="header" numberOfLines={2}>
                    {title}
                  </Text>
                  {subtitle ? (
                    <Text variant="body" color="rgba(255,255,255,0.72)" align="center" style={styles.subtitle}>
                      {subtitle}
                    </Text>
                  ) : null}
                </Animated.View>

                {accessory ? (
                  <Animated.View entering={FadeIn.duration(350).delay(160)} style={styles.accessory}>
                    {accessory}
                  </Animated.View>
                ) : null}
              </View>

              <View
                style={[
                  styles.sheet,
                  { backgroundColor: bg, paddingBottom: footer ? space.xxl : bottomInset + space.xxl },
                  isDark && { borderColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth },
                ]}
              >
                {children}
              </View>
            </ScrollView>
          </View>

          {footer ? (
            <Animated.View
              entering={FadeIn.duration(300).delay(120)}
              style={[
                styles.footer,
                { backgroundColor: bg, paddingBottom: keyboard.visible ? space.md : bottomInset },
              ]}
            >
              <View pointerEvents="none" style={styles.footerFade}>
                <LinearGradient colors={[`${bg}00`, bg]} style={StyleSheet.absoluteFill} />
              </View>
              {footer}
              {!keyboard.visible && footerSecondary ? footerSecondary : null}
            </Animated.View>
          ) : null}
        </KeyboardAvoidingView>
      </View>
    </RevealContext.Provider>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1 },
  bounceFill: { position: 'absolute', top: -1000, height: 1000, start: 0, end: 0 },
  hero: {
    paddingHorizontal: SCREEN_PADDING,
    paddingBottom: SHEET_OVERLAP + space.xxl,
    overflow: 'hidden',
  },
  heroImage: { opacity: 0.38 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  sideSlot: { width: 44, height: 44 },
  logoSlot: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  titles: { marginTop: space.lg, gap: space.sm, alignItems: 'center' },
  subtitle: { maxWidth: 340 },
  accessory: { marginTop: space.xl },
  sheet: {
    flexGrow: 1,
    marginTop: -SHEET_OVERLAP,
    borderTopStartRadius: radius.xl,
    borderTopEndRadius: radius.xl,
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: space.xxxl,
  },
  footer: {
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: space.md,
    gap: space.xs,
  },
  footerFade: { position: 'absolute', top: -20, height: 20, start: 0, end: 0 },
});
