import '@/i18n';
import { useEffect, useMemo } from 'react';
import { I18nManager, Platform, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider,
  router,
  useRootNavigationState,
  useSegments,
  type Theme as NavTheme,
} from 'expo-router';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { PlayfairDisplay_700Bold, PlayfairDisplay_800ExtraBold } from '@expo-google-fonts/playfair-display';
import { Tajawal_400Regular, Tajawal_500Medium, Tajawal_700Bold, Tajawal_800ExtraBold } from '@expo-google-fonts/tajawal';
import { QueryClientProvider } from '@tanstack/react-query';
import { useAppStatus } from '@/api/appStatus';
import { useApiBoot } from '@/api/boot';
import { queryClient } from '@/api/queryClient';
import { OfflineBanner } from '@/components/system/OfflineBanner';
import { SystemStatusScreen } from '@/components/system/SystemStatusScreen';
import { ToastHost } from '@/components/ui';
import { directionStyle, useIsRTL } from '@/utils/rtl';
import { useAuthStore, useLangStore, usePrefsStore } from '@/store';
import { fonts, useTheme } from '@/theme';

// Keep the native splash up until fonts, language and persisted stores are ready.
void SplashScreen.preventAutoHideAsync().catch(() => {});

// Show notifications as banners even while the app is in the foreground.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

// Load the persisted language (and RTL direction) as early as possible.
void useLangStore.getState().init();

/**
 * Push transition. iOS 'default' is the native push, which already follows RTL.
 * On Android 'slide_from_right' is not direction-aware, so pick the side from the layout direction.
 */
const PUSH_ANIMATION = Platform.OS === 'android' ? (I18nManager.isRTL ? 'ios_from_left' : 'ios_from_right') : 'default';

/** Route groups an unauthenticated user may visit. */
const PUBLIC_GROUPS = new Set(['(auth)', '(splash)', 'legal', '+not-found']);

/**
 * Keeps the user on the right side of the auth wall:
 * - signed-in users are bounced from onboarding/auth to the tabs;
 * - signed-out users are bounced from protected routes to the welcome screen.
 * The initial routing decision lives in app/index.tsx.
 */
function useAuthGuard(enabled: boolean) {
  const segments = useSegments() as string[];
  const navState = useRootNavigationState();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const onboardingSeen = usePrefsStore((s) => s.onboardingSeen);
  const navReady = !!navState?.key;
  const first = segments[0];

  useEffect(() => {
    if (!enabled || !navReady || first === undefined) return; // index route handles itself
    if (isAuthenticated) {
      if (first === '(auth)' || (first === '(splash)' && onboardingSeen)) {
        router.replace('/(tabs)/home');
      }
    } else if (!PUBLIC_GROUPS.has(first)) {
      router.replace('/(auth)/welcome');
    }
  }, [enabled, navReady, first, isAuthenticated, onboardingSeen]);
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    [fonts.regular]: Inter_400Regular,
    [fonts.medium]: Inter_500Medium,
    [fonts.semibold]: Inter_600SemiBold,
    [fonts.bold]: Inter_700Bold,
    [fonts.display]: PlayfairDisplay_700Bold,
    [fonts.displayHeavy]: PlayfairDisplay_800ExtraBold,
    [fonts.arRegular]: Tajawal_400Regular,
    [fonts.arMedium]: Tajawal_500Medium,
    [fonts.arBold]: Tajawal_700Bold,
    [fonts.arHeavy]: Tajawal_800ExtraBold,
  });
  const langReady = useLangStore((s) => s.ready);
  const rtl = useIsRTL();
  const prefsHydrated = usePrefsStore((s) => s.hydrated);
  const authHydrated = useAuthStore((s) => s.hydrated);
  const { colors, isDark } = useTheme();

  // A font failure must not brick the app: fall back to system fonts.
  const ready = (fontsLoaded || !!fontError) && langReady && prefsHydrated && authHydrated;

  useAuthGuard(ready);
  const signedIn = useAuthStore((s) => s.isAuthenticated);
  const recheck = useApiBoot(ready, signedIn);
  const maintenance = useAppStatus((s) => s.maintenance);
  const update = useAppStatus((s) => s.update);

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  const navTheme = useMemo<NavTheme>(() => {
    const base = isDark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      dark: isDark,
      colors: {
        ...base.colors,
        primary: colors.accent,
        background: colors.background,
        card: colors.surface,
        text: colors.ink,
        border: colors.border,
        notification: colors.accent,
      },
    };
  }, [isDark, colors]);

  if (!ready) return null;

  return (
    // Yoga `direction` on the root flips the whole app for Arabic without a native reload.
    <GestureHandlerRootView style={[styles.root, directionStyle(rtl), { backgroundColor: colors.background }]}>
      <QueryClientProvider client={queryClient}>
      <SafeAreaProvider style={{ backgroundColor: colors.background }}>
        <ThemeProvider value={navTheme}>
          <StatusBar style={isDark ? 'light' : 'dark'} animated />
          <Stack
            screenOptions={{
              headerShown: false,
              animation: PUSH_ANIMATION,
              contentStyle: { backgroundColor: colors.background },
            }}
          >
            <Stack.Screen name="index" options={{ animation: 'none' }} />
            <Stack.Screen name="(splash)" options={{ animation: 'fade' }} />
            <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
            <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
            <Stack.Screen name="lesson/[id]" />
            <Stack.Screen
              name="quiz/[lessonId]"
              options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom', gestureEnabled: false }}
            />
            <Stack.Screen name="exams/room/[id]" options={{ gestureEnabled: false, fullScreenGestureEnabled: false }} />
            <Stack.Screen name="subscription/success" options={{ gestureEnabled: false, animation: 'fade' }} />
          </Stack>
          {update.required || maintenance.enabled ? (
            <View style={StyleSheet.absoluteFill}>
              <SystemStatusScreen
                kind={update.required ? 'update' : 'maintenance'}
                message={maintenance.message}
                storeUrl={update.storeUrl}
                onRetry={recheck}
              />
            </View>
          ) : null}
          <OfflineBanner />
          <ToastHost />
        </ThemeProvider>
      </SafeAreaProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
