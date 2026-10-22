import { memo, useCallback, useEffect, useState } from 'react';
import { Keyboard, Platform, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Icon, type IconName } from '@/components/icons';
import { PressableScale, Text } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { useLangStore } from '@/store/langStore';
import { fontFor, lineHeightFor, radius, shadows, space, useTheme } from '@/theme';
import { haptic } from '@/utils/haptics';

const BAR_HEIGHT = 66;

/** Distance from the screen bottom to the floating bar's bottom edge for a given bottom safe-area inset. */
export function tabBarBottomOffset(insetBottom: number): number {
  return insetBottom > 0 ? Math.max(insetBottom - 8, space.sm) : space.md;
}

/** Distance from the screen bottom to the top edge of the floating tab bar. */
export function tabBarTopOffset(insetBottom: number): number {
  return tabBarBottomOffset(insetBottom) + BAR_HEIGHT;
}
const H_MARGIN = 16;
const PILL_W = 52;
const PILL_H = 30;

type TabKey = 'home' | 'subjects' | 'practice' | 'tutor' | 'profile';
const TAB_ICONS: Record<TabKey, IconName> = {
  home: 'home',
  subjects: 'subjects',
  practice: 'practice',
  tutor: 'tutor',
  profile: 'profile',
};

function isTabKey(name: string): name is TabKey {
  return name in TAB_ICONS;
}

/** Tracks keyboard visibility so the floating bar can slide away while typing. */
function useKeyboardVisible() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const s = Keyboard.addListener(showEvt, () => setVisible(true));
    const h = Keyboard.addListener(hideEvt, () => setVisible(false));
    return () => {
      s.remove();
      h.remove();
    };
  }, []);
  return visible;
}

interface TabItemProps {
  routeKey: string;
  name: string;
  focused: boolean;
  label: string;
  onPress: (routeKey: string) => void;
  onLongPress: (routeKey: string) => void;
}

const TabItem = memo(function TabItem({ routeKey, name, focused, label, onPress, onLongPress }: TabItemProps) {
  const { colors, isDark } = useTheme();
  const isAr = useLangStore((s) => s.isAr);
  const active = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    active.value = withSpring(focused ? 1 : 0, { damping: 18, stiffness: 260, mass: 0.7 });
  }, [focused, active]);

  const pillStyle = useAnimatedStyle(() => ({
    opacity: active.value,
    transform: [{ scaleX: 0.55 + 0.45 * active.value }, { scaleY: 0.8 + 0.2 * active.value }],
  }));

  const iconName: IconName = isTabKey(name) ? TAB_ICONS[name] : 'grid';
  const activeIcon = isDark ? colors.accentLight : colors.primary;
  const activeLabel = isDark ? colors.accentLight : colors.primary;
  const labelSize = isAr ? 11 : 10.5;

  const handlePress = useCallback(() => onPress(routeKey), [onPress, routeKey]);
  const handleLongPress = useCallback(() => onLongPress(routeKey), [onLongPress, routeKey]);

  return (
    <PressableScale
      onPress={handlePress}
      onLongPress={handleLongPress}
      haptics={false}
      scaleTo={0.9}
      pressedOpacity={0.8}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={label}
      style={styles.item}
    >
      <View style={styles.iconWrap}>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.pill,
            { backgroundColor: isDark ? 'rgba(201,162,74,0.20)' : 'rgba(201,162,74,0.18)' },
            pillStyle,
          ]}
        />
        <Icon name={iconName} size={22} filled={focused} color={focused ? activeIcon : colors.muted} strokeWidth={focused ? 2 : 1.75} />
      </View>
      <Text
        numberOfLines={1}
        align="center"
        color={focused ? activeLabel : colors.muted}
        style={[
          styles.label,
          {
            fontFamily: fontFor(focused ? 'semibold' : 'medium', isAr),
            fontSize: labelSize,
            lineHeight: lineHeightFor(labelSize, isAr, 14),
          },
        ]}
        maxFontSizeMultiplier={1.1}
      >
        {label}
      </Text>
    </PressableScale>
  );
});

/** Floating, blurred pill tab bar for expo-router `Tabs` (`tabBar={(p) => <TabBar {...p} />}`). */
export function TabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  const { colors, isDark } = useTheme();
  const { t } = useI18n('common');
  const keyboardVisible = useKeyboardVisible();

  const focusedRoute = state.routes[state.index];
  const focusedOptions = focusedRoute ? descriptors[focusedRoute.key]?.options : undefined;
  const hideOnKeyboard = focusedOptions?.tabBarHideOnKeyboard ?? true;
  const hidden = hideOnKeyboard && keyboardVisible;

  const hide = useSharedValue(0);
  useEffect(() => {
    hide.value = withTiming(hidden ? 1 : 0, { duration: 200, easing: Easing.out(Easing.quad) });
  }, [hidden, hide]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: 1 - hide.value,
    transform: [{ translateY: hide.value * (BAR_HEIGHT + 48) }],
  }));

  // Read latest navigation state inside stable callbacks so memoized TabItems never re-render needlessly.
  const focusedKey = focusedRoute?.key;
  const onPress = useCallback(
    (routeKey: string) => {
      const route = state.routes.find((r) => r.key === routeKey);
      if (!route) return;
      const isFocused = routeKey === focusedKey;
      const event = navigation.emit({ type: 'tabPress', target: routeKey, canPreventDefault: true });
      if (!isFocused && !event.defaultPrevented) {
        haptic.selection();
        navigation.navigate(route.name, route.params);
      }
    },
    [navigation, state.routes, focusedKey],
  );
  const onLongPress = useCallback(
    (routeKey: string) => {
      navigation.emit({ type: 'tabLongPress', target: routeKey });
    },
    [navigation],
  );

  // Sit just above the home indicator on notched iPhones; keep a comfortable margin elsewhere.
  const bottom = tabBarBottomOffset(insets.bottom);

  return (
    <Animated.View pointerEvents={hidden ? 'none' : 'box-none'} style={[styles.wrapper, { bottom }, containerStyle]}>
      <View style={[styles.shadow, shadows.lg, Platform.OS === 'android' && { backgroundColor: colors.surface }]}>
        <View style={[styles.bar, { borderColor: isDark ? 'rgba(255,255,255,0.08)' : colors.border }]}>
          <BlurView intensity={50} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} pointerEvents="none" />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.tabBar }]} pointerEvents="none" />
          <View style={styles.row} accessibilityRole="tablist">
            {state.routes.map((route, i) => {
              const label = isTabKey(route.name) ? t(`tabs.${route.name}`) : (descriptors[route.key]?.options.title ?? route.name);
              return (
                <TabItem
                  key={route.key}
                  routeKey={route.key}
                  name={route.name}
                  label={label}
                  focused={i === state.index}
                  onPress={onPress}
                  onLongPress={onLongPress}
                />
              );
            })}
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: { position: 'absolute', start: H_MARGIN, end: H_MARGIN, alignItems: 'center' },
  shadow: { borderRadius: radius.pill, alignSelf: 'stretch', maxWidth: 520 },
  bar: {
    height: BAR_HEIGHT,
    borderRadius: radius.pill,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.xs },
  item: { flex: 1, height: BAR_HEIGHT, alignItems: 'center', justifyContent: 'center', gap: 3 },
  iconWrap: { width: PILL_W, height: PILL_H, alignItems: 'center', justifyContent: 'center' },
  pill: { position: 'absolute', width: PILL_W, height: PILL_H, borderRadius: PILL_H / 2 },
  label: { alignSelf: 'stretch', paddingHorizontal: 2 },
});
