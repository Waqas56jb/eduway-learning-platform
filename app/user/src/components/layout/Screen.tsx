import { useEffect, type ReactNode, type RefObject } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { SCREEN_PADDING, TAB_BAR_SPACE, useTheme } from '@/theme';
import { KeyboardAvoiding } from './KeyboardAvoiding';

export interface ScreenProps {
  children?: ReactNode;
  /** Wrap content in a ScrollView. */
  scroll?: boolean;
  /** Apply horizontal SCREEN_PADDING. */
  padded?: boolean;
  /** Safe-area edges to inset. Defaults to ['top']. */
  edges?: Edge[];
  /** Add bottom padding so content clears the floating tab bar. */
  tabBarSpace?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  background?: string;
  contentContainerStyle?: StyleProp<ViewStyle>;
  /** Wrap in a KeyboardAvoidingView. */
  keyboard?: boolean;
  statusBar?: 'light' | 'dark' | 'auto';
  /** Ref to the inner ScrollView: `useRef<ScrollView>(null)` (RN 0.88 ScrollView is a function component). */
  scrollRef?: RefObject<ScrollView | null>;
  style?: StyleProp<ViewStyle>;
  /** Disable the fade/slide enter animation. */
  animated?: boolean;
}

// Subtle: a short fade + 8pt rise. Touches are never blocked (opacity/transform only).
const ENTER_MS = 300;
const ENTER_OFFSET = 8;

/** Base screen container: safe area, theme background, status bar, optional scroll/refresh/keyboard. */
export function Screen({
  children,
  scroll = false,
  padded = true,
  edges = ['top'],
  tabBarSpace = false,
  refreshing,
  onRefresh,
  background,
  contentContainerStyle,
  keyboard = false,
  statusBar = 'auto',
  scrollRef,
  style,
  animated = true,
}: ScreenProps) {
  const { colors, isDark } = useTheme();
  const progress = useSharedValue(animated ? 0 : 1);

  useEffect(() => {
    if (animated) {
      progress.value = withTiming(1, { duration: ENTER_MS, easing: Easing.out(Easing.cubic) });
    }
  }, [animated, progress]);

  const enterStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * ENTER_OFFSET }],
  }));

  const barStyle = statusBar === 'auto' ? (isDark ? 'light' : 'dark') : statusBar;
  const bg = background ?? colors.background;

  const padding: ViewStyle = {
    paddingHorizontal: padded ? SCREEN_PADDING : 0,
    paddingBottom: tabBarSpace ? TAB_BAR_SPACE : 0,
  };

  let content: ReactNode;
  if (scroll) {
    content = (
      <ScrollView
        ref={scrollRef}
        style={styles.flex}
        contentContainerStyle={[styles.grow, padding, contentContainerStyle]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentInsetAdjustmentBehavior="never"
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={!!refreshing}
              onRefresh={onRefresh}
              tintColor={colors.accent}
              colors={[colors.accent]}
              progressBackgroundColor={colors.surface}
            />
          ) : undefined
        }
      >
        {children}
      </ScrollView>
    );
  } else {
    content = <View style={[styles.flex, padding, contentContainerStyle]}>{children}</View>;
  }

  const body = <Animated.View style={[styles.flex, enterStyle]}>{content}</Animated.View>;

  return (
    <SafeAreaView edges={edges} style={[styles.flex, { backgroundColor: bg }, style]}>
      <StatusBar style={barStyle} animated />
      {keyboard ? <KeyboardAvoiding>{body}</KeyboardAvoiding> : body}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  grow: { flexGrow: 1 },
});
