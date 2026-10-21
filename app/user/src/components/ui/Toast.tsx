import { memo, useCallback, useEffect, useRef } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { GestureDetector, GestureHandlerRootView, usePanGesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { create } from 'zustand';
import { Icon, type IconName } from '@/components/icons';
import { radius, shadows, useTheme } from '@/theme';
import { haptic } from '@/utils/haptics';
import { Text } from './Text';

export type ToastTone = 'default' | 'success' | 'error' | 'info';

export interface ToastOptions {
  message: string;
  tone?: ToastTone;
  icon?: IconName;
  /** Visible time in ms (default 2600). */
  duration?: number;
}

interface ToastItem extends Required<Omit<ToastOptions, 'icon'>> {
  id: number;
  icon?: IconName;
}

interface ToastState {
  current: ToastItem | null;
  push: (o: ToastOptions) => void;
  clear: (id: number) => void;
}

let seq = 0;

const useToastStore = create<ToastState>()((set) => ({
  current: null,
  push: (o) =>
    set({
      current: { id: ++seq, message: o.message, tone: o.tone ?? 'default', icon: o.icon, duration: o.duration ?? 2600 },
    }),
  clear: (id) => set((s) => (s.current?.id === id ? { current: null } : s)),
}));

/** Imperative toast API — call from anywhere (no hook needed). */
export const toast = {
  show: (o: ToastOptions) => useToastStore.getState().push(o),
  success: (message: string, duration?: number) => useToastStore.getState().push({ message, tone: 'success', duration }),
  error: (message: string, duration?: number) => useToastStore.getState().push({ message, tone: 'error', duration }),
  info: (message: string, duration?: number) => useToastStore.getState().push({ message, tone: 'info', duration }),
  hide: () => {
    const c = useToastStore.getState().current;
    if (c) useToastStore.getState().clear(c.id);
  },
};

const TONE_ICON: Record<ToastTone, IconName> = {
  default: 'sparkles',
  success: 'check-circle',
  error: 'x-circle',
  info: 'info',
};

const HIDDEN_Y = -160;

/** Mount once in the root layout. Renders the active toast below the status bar. */
export function ToastHost() {
  const current = useToastStore((s) => s.current);
  if (!current) return null;
  return <ToastView key={current.id} item={current} />;
}

const ToastView = memo(function ToastView({ item }: { item: ToastItem }) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const clear = useToastStore((s) => s.clear);
  const y = useSharedValue(HIDDEN_Y);
  const opacity = useSharedValue(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const remove = useCallback(() => clear(item.id), [clear, item.id]);

  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    opacity.value = withTiming(0, { duration: 180 });
    y.value = withTiming(HIDDEN_Y, { duration: 220 }, (done) => {
      if (done) scheduleOnRN(remove);
    });
  }, [opacity, remove, y]);

  useEffect(() => {
    y.value = withSpring(0, { damping: 18, stiffness: 220, mass: 0.8 });
    opacity.value = withTiming(1, { duration: 180 });
    if (item.tone === 'success') haptic.success();
    else if (item.tone === 'error') haptic.error();
    else haptic.light();
    AccessibilityInfo.announceForAccessibility(item.message);
    timer.current = setTimeout(dismiss, item.duration);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [dismiss, item, opacity, y]);

  const pan = usePanGesture({
    activeOffsetY: [-6, 6],
    onUpdate: (e) => {
      'worklet';
      y.value = e.translationY < 0 ? e.translationY : e.translationY * 0.15;
    },
    onDeactivate: (e) => {
      'worklet';
      if (e.translationY < -24 || e.velocityY < -500) {
        opacity.value = withTiming(0, { duration: 160 });
        y.value = withTiming(HIDDEN_Y, { duration: 200 }, (done) => {
          if (done) scheduleOnRN(remove);
        });
      } else {
        y.value = withSpring(0, { damping: 18, stiffness: 220 });
      }
    },
  });

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: y.value }],
  }));

  const toneColor =
    item.tone === 'success' ? colors.success : item.tone === 'error' ? colors.danger : item.tone === 'info' ? colors.info : colors.accent;
  const toneSoft =
    item.tone === 'success' ? colors.successSoft : item.tone === 'error' ? colors.dangerSoft : item.tone === 'info' ? colors.infoSoft : colors.accentSoft;
  const isIOS = Platform.OS === 'ios';

  return (
    <View style={[styles.host, { top: insets.top + 8 }]} pointerEvents="box-none">
      <GestureHandlerRootView style={styles.root}>
        <GestureDetector gesture={pan}>
          <Animated.View
            style={[styles.shadow, shadows.lg, animStyle]}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
          >
            <View style={[styles.pill, { borderColor: colors.border }]}>
            {isIOS ? (
              <BlurView intensity={70} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
            ) : null}
            <View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: isIOS ? (isDark ? 'rgba(14,35,66,0.55)' : 'rgba(255,255,255,0.6)') : colors.surfaceElevated },
              ]}
            />
            <View style={[styles.iconWrap, { backgroundColor: toneSoft }]}>
              <Icon name={item.icon ?? TONE_ICON[item.tone]} size={18} color={toneColor} />
            </View>
            <Text variant="label" color="ink" style={styles.message} numberOfLines={3}>
              {item.message}
            </Text>
            </View>
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </View>
  );
});

const styles = StyleSheet.create({
  host: { position: 'absolute', start: 16, end: 16, alignItems: 'center', zIndex: 9999, elevation: 9999 },
  root: { flex: 0, alignSelf: 'stretch', alignItems: 'center' },
  shadow: { borderRadius: radius.pill, maxWidth: 520 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    maxWidth: 520,
    minHeight: 48,
    paddingVertical: 8,
    paddingStart: 8,
    paddingEnd: 18,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  iconWrap: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  message: { flexShrink: 1 },
});
