import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal as RNModal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { GestureDetector, GestureHandlerRootView, usePanGesture } from 'react-native-gesture-handler';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { useI18n } from '@/hooks/useI18n';
import { radius, SCREEN_PADDING, shadows, space, useTheme } from '@/theme';
import { haptic } from '@/utils/haptics';
import { IconButton } from './IconButton';
import { Text } from './Text';

export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children?: ReactNode;
  /** 'auto' sizes to content (max 90% of screen), 'half' = 50%, 'full' = below the status bar. */
  snap?: 'auto' | 'half' | 'full';
  /** Sticky footer (e.g. primary action) pinned above the safe area. */
  footer?: ReactNode;
  /** Optional subtitle under the title. */
  subtitle?: string;
  /** Disable the inner ScrollView (when children manage their own scrolling, e.g. a FlatList). */
  scrollable?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
}

const SPRING = { damping: 24, stiffness: 240, mass: 0.9 } as const;

export function BottomSheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  snap = 'auto',
  footer,
  scrollable = true,
  contentContainerStyle,
}: BottomSheetProps) {
  const { colors, isDark } = useTheme();
  const { t } = useI18n('common');
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);

  const translateY = useSharedValue(screenH);
  const backdrop = useSharedValue(0);

  const unmount = useCallback(() => setMounted(false), []);

  useEffect(() => {
    if (visible) setMounted(true);
  }, [visible]);

  useEffect(() => {
    if (!mounted) return;
    if (visible) {
      translateY.value = screenH;
      backdrop.value = withTiming(1, { duration: 220 });
      translateY.value = withSpring(0, SPRING);
    } else {
      backdrop.value = withTiming(0, { duration: 200 });
      translateY.value = withTiming(screenH, { duration: 240, easing: Easing.in(Easing.cubic) }, (done) => {
        if (done) scheduleOnRN(unmount);
      });
    }
  }, [visible, mounted, screenH, translateY, backdrop, unmount]);

  const requestClose = useCallback(() => {
    haptic.light();
    onClose();
  }, [onClose]);

  const pan = usePanGesture({
    activeOffsetY: [-8, 8],
    onUpdate: (e) => {
      'worklet';
      // Resist upward drag, follow downward drag.
      translateY.value = e.translationY > 0 ? e.translationY : e.translationY * 0.2;
      backdrop.value = Math.max(0, 1 - Math.max(0, e.translationY) / (screenH * 0.6));
    },
    onDeactivate: (e) => {
      'worklet';
      if (e.translationY > 120 || e.velocityY > 900) {
        scheduleOnRN(requestClose);
      } else {
        translateY.value = withSpring(0, SPRING);
        backdrop.value = withTiming(1, { duration: 160 });
      }
    },
  });

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));

  const sizeStyle: ViewStyle =
    snap === 'half'
      ? { height: Math.round(screenH * 0.5) }
      : snap === 'full'
        ? { height: screenH - insets.top - 8 }
        : { maxHeight: Math.round(screenH * 0.9) };
  const fixed = snap !== 'auto';
  const bottomPad = Math.max(insets.bottom, space.lg);

  if (!mounted) return null;

  return (
    <RNModal
      visible={mounted}
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      animationType="none"
      onRequestClose={requestClose}
    >
      <GestureHandlerRootView style={styles.flex}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }, backdropStyle]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={requestClose}
            accessibilityRole="button"
            accessibilityLabel={t('common:a11y.close')}
          />
        </Animated.View>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.kav}
          pointerEvents="box-none"
        >
          <Animated.View
            accessibilityViewIsModal
            style={[
              styles.sheet,
              shadows.lg,
              {
                backgroundColor: isDark ? colors.surface : colors.surfaceElevated,
                borderColor: colors.border,
              },
              sizeStyle,
              sheetStyle,
            ]}
          >
            <GestureDetector gesture={pan}>
              <View style={styles.header} collapsable={false}>
                <View style={styles.handleArea}>
                  <View style={[styles.handle, { backgroundColor: isDark ? 'rgba(255,255,255,0.22)' : 'rgba(11,31,58,0.16)' }]} />
                </View>
                {title ? (
                  <View style={styles.titleRow}>
                    <View style={styles.titleText}>
                      <Text variant="h3" accessibilityRole="header" numberOfLines={2}>
                        {title}
                      </Text>
                      {subtitle ? (
                        <Text variant="caption" color="muted" style={styles.subtitle}>
                          {subtitle}
                        </Text>
                      ) : null}
                    </View>
                    <IconButton icon="close" size={36} variant="surface" onPress={requestClose} accessibilityLabel={t('common:a11y.close')} />
                  </View>
                ) : null}
              </View>
            </GestureDetector>

            {scrollable ? (
              <ScrollView
                style={fixed ? styles.flex : styles.autoScroll}
                contentContainerStyle={[
                  styles.content,
                  { paddingBottom: footer ? space.lg : bottomPad },
                  contentContainerStyle,
                ]}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                bounces={false}
              >
                {children}
              </ScrollView>
            ) : (
              <View style={[fixed ? styles.flex : styles.autoScroll, styles.content, { paddingBottom: footer ? space.lg : bottomPad }, contentContainerStyle]}>
                {children}
              </View>
            )}

            {footer ? (
              <View style={[styles.footer, { borderTopColor: colors.border, paddingBottom: bottomPad }]}>{footer}</View>
            ) : null}
          </Animated.View>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  kav: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    width: '100%',
    borderTopStartRadius: radius.xl,
    borderTopEndRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    overflow: 'hidden',
  },
  header: { paddingHorizontal: SCREEN_PADDING },
  handleArea: { alignItems: 'center', paddingTop: 10, paddingBottom: 6 },
  handle: { width: 40, height: 5, borderRadius: 3 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingTop: space.xs, paddingBottom: space.md },
  titleText: { flex: 1 },
  subtitle: { marginTop: 2 },
  autoScroll: { flexGrow: 0, flexShrink: 1 },
  content: { paddingHorizontal: SCREEN_PADDING, paddingTop: space.xs },
  footer: {
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
