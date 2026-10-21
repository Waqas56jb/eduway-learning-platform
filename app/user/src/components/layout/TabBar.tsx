import { memo, useEffect, useState } from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Icon, type IconName } from '@/components/icons';
import { Text } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { radius, shadows, space, useTheme } from '@/theme';
import { haptic } from '@/utils/haptics';

const BAR_HEIGHT = 64;
const H_MARGIN = 16;

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
  onPress: (routeKey: string, focused: boolean) => void;
  onLongPress: (routeKey: string) => void;
}

const TabItem = memo(function TabItem({ routeKey, name, focused, label, onPress, onLongPress }: TabItemProps) {
  const { colors, isDark } = useTheme();
  const active = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    active.value = withSpring(focused ? 1 : 0, { damping: 16, stiffness: 220, mass: 0.7 });
  }, [focused, active]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -2 * active.value }, { scale: 1 + 0.08 * active.value }],
  }));
  const dotStyle = useAnimatedStyle(() => ({
    opacity: active.value,
    transform: [{ scale: active.value }],
  }));

  const iconName: IconName = isTabKey(name) ? TAB_ICONS[name] : 'grid';
  const activeIcon = isDark ? colors.accent : colors.primary;
  const activeLabel = isDark ? colors.accentLight : colors.accent;

  return (
    <Pressable
      onPress={() => onPress(routeKey, focused)}
      onLongPress={() => onLongPress(routeKey)}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={label}
      style={styles.item}
    >
      <Animated.View style={iconStyle}>
        <Icon name={iconName} size={24} filled={focused} color={focused ? activeIcon : colors.muted} strokeWidth={focused ? 2 : 1.75} />
      </Animated.View>
      <Text
        variant="caption"
        numberOfLines={1}
        align="center"
        color={focused ? activeLabel : colors.muted}
        style={styles.label}
        maxFontSizeMultiplier={1.15}
      >
        {label}
      </Text>
      <Animated.View style={[styles.dot, { backgroundColor: colors.accent }, dotStyle]} />
    </Pressable>
  );
});

/** Floating, blurred pill tab bar for expo-router `Tabs` (`tabBar={(p) => <TabBar {...p} />}`). */
export function TabBar({ state, descriptors, emitter, navigateToTab, insets }: BottomTabBarProps) {
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
    transform: [{ translateY: hide.value * (BAR_HEIGHT + 40) }],
  }));

  const onPress = (routeKey: string, focused: boolean) => {
    const event = emitter.emit({ type: 'tabPress', target: routeKey, canPreventDefault: true });
    if (!focused) haptic.selection();
    if (!focused && !event.defaultPrevented) navigateToTab(routeKey);
  };
  const onLongPress = (routeKey: string) => {
    emitter.emit({ type: 'tabLongPress', target: routeKey });
  };

  return (
    <Animated.View
      pointerEvents={hidden ? 'none' : 'box-none'}
      style={[styles.wrapper, { bottom: insets.bottom + space.sm }, containerStyle]}
    >
      <View style={[styles.shadow, shadows.lg, Platform.OS === 'android' && { backgroundColor: colors.surface }]}>
        <View style={[styles.pill, { borderColor: colors.border }]}>
          <BlurView
            intensity={40}
            tint={isDark ? 'dark' : 'light'}
            style={StyleSheet.absoluteFill}
          />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.tabBar }]} />
          <View style={styles.row} accessibilityRole="tablist">
            {state.routes.map((route, i) => {
              const label = isTabKey(route.name)
                ? t(`tabs.${route.name}`)
                : descriptors[route.key]?.options.title ?? route.name;
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
  wrapper: { position: 'absolute', start: H_MARGIN, end: H_MARGIN },
  shadow: { borderRadius: radius.pill },
  pill: {
    height: BAR_HEIGHT,
    borderRadius: radius.pill,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.xs },
  item: { flex: 1, height: BAR_HEIGHT, alignItems: 'center', justifyContent: 'center', paddingTop: space.xxs },
  label: { fontSize: 10.5, lineHeight: 14, marginTop: 2 },
  dot: { width: 4, height: 4, borderRadius: 2, marginTop: 2 },
});
