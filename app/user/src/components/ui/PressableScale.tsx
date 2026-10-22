import { forwardRef, useCallback, type ComponentRef } from 'react';
import { Pressable, StyleSheet, type GestureResponderEvent, type PressableProps, type StyleProp, View, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { haptic } from '@/utils/haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface PressableScaleProps extends Omit<PressableProps, 'style'> {
  /** Scale reached while pressed. */
  scaleTo?: number;
  /** Fire a light haptic on press in. */
  haptics?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Opacity applied when disabled. */
  disabledOpacity?: number;
  /** Opacity reached while pressed (default 0.88). Pass 1 to disable the dim. */
  pressedOpacity?: number;
}

// Press-in is a short timing curve so the feedback is visible even on very quick taps
// (a spring barely moves before the finger lifts). Release springs back softly.
const IN = { duration: 90, easing: Easing.out(Easing.quad) } as const;
const SPRING_OUT = { damping: 15, stiffness: 320, mass: 0.6 } as const;

/**
 * Pressable with instant scale + dim feedback and a light haptic — the base of every tappable surface.
 * Layout styles passed via `style` apply to the pressable itself (no extra wrapper), so `flex`, margins
 * and absolute positioning behave exactly like a View.
 */
export const PressableScale = forwardRef<ComponentRef<typeof View>, PressableScaleProps>(function PressableScale(
  {
    scaleTo = 0.97,
    haptics = true,
    style,
    disabled,
    disabledOpacity = 0.45,
    pressedOpacity = 0.88,
    onPressIn,
    onPressOut,
    accessibilityRole = 'button',
    accessibilityState,
    children,
    ...rest
  },
  ref,
) {
  const pressed = useSharedValue(0);
  const isDisabled = !!disabled;
  // Honor a static opacity passed through `style` (the animated opacity would otherwise override it).
  const flatOpacity = StyleSheet.flatten(style)?.opacity;
  const baseOpacity = typeof flatOpacity === 'number' ? flatOpacity : 1;

  const animatedStyle = useAnimatedStyle(() => {
    const p = pressed.value;
    return {
      opacity: baseOpacity * (isDisabled ? disabledOpacity : 1 - (1 - pressedOpacity) * Math.min(1, Math.max(0, p))),
      transform: [{ scale: 1 - (1 - scaleTo) * p }],
    };
  });

  const handlePressIn = useCallback(
    (e: GestureResponderEvent) => {
      pressed.value = withTiming(1, IN);
      if (haptics) haptic.light();
      onPressIn?.(e);
    },
    [haptics, onPressIn, pressed],
  );

  const handlePressOut = useCallback(
    (e: GestureResponderEvent) => {
      pressed.value = withSpring(0, SPRING_OUT);
      onPressOut?.(e);
    },
    [onPressOut, pressed],
  );

  return (
    <AnimatedPressable
      ref={ref}
      {...rest}
      disabled={disabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      accessibilityRole={accessibilityRole}
      accessibilityState={{ disabled: isDisabled, ...accessibilityState }}
      style={[style, animatedStyle]}
    >
      {children}
    </AnimatedPressable>
  );
});
