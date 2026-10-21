import { forwardRef, useCallback } from 'react';
import { Pressable, type GestureResponderEvent, type PressableProps, type StyleProp, type View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
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
}

const SPRING_IN = { damping: 20, stiffness: 420, mass: 0.6 } as const;
const SPRING_OUT = { damping: 14, stiffness: 300, mass: 0.6 } as const;

/** Pressable with a soft spring scale and a light haptic — the base of every tappable surface. */
export const PressableScale = forwardRef<View, PressableScaleProps>(function PressableScale(
  {
    scaleTo = 0.97,
    haptics = true,
    style,
    disabled,
    disabledOpacity = 0.45,
    onPressIn,
    onPressOut,
    accessibilityRole = 'button',
    accessibilityState,
    children,
    ...rest
  },
  ref,
) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePressIn = useCallback(
    (e: GestureResponderEvent) => {
      scale.value = withSpring(scaleTo, SPRING_IN);
      if (haptics) haptic.light();
      onPressIn?.(e);
    },
    [haptics, onPressIn, scale, scaleTo],
  );

  const handlePressOut = useCallback(
    (e: GestureResponderEvent) => {
      scale.value = withSpring(1, SPRING_OUT);
      onPressOut?.(e);
    },
    [onPressOut, scale],
  );

  return (
    <AnimatedPressable
      ref={ref}
      disabled={disabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      accessibilityRole={accessibilityRole}
      accessibilityState={{ disabled: !!disabled, ...accessibilityState }}
      style={[style, animatedStyle, disabled ? { opacity: disabledOpacity } : null]}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
});
