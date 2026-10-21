import { memo, useEffect, useRef, useState } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { Text, type TextProps } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { formatPrice } from '@/utils/format';

interface AnimatedPriceProps {
  value: number;
  variant?: TextProps['variant'];
  color?: TextProps['color'];
  duration?: number;
}

const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);

/** Price that counts to its new value and pulses when it changes (e.g. after a promo code). */
export const AnimatedPrice = memo(function AnimatedPrice({
  value,
  variant = 'h2',
  color = 'ink',
  duration = 650,
}: AnimatedPriceProps) {
  const { lang } = useI18n('subscription');
  const [shown, setShown] = useState(value);
  const fromRef = useRef(value);
  const scale = useSharedValue(1);

  useEffect(() => {
    const from = fromRef.current;
    if (from === value) return;
    scale.value = withSequence(withTiming(1.12, { duration: 160 }), withSpring(1, { damping: 12, stiffness: 180 }));
    const start = Date.now();
    let frame = 0;
    const tick = () => {
      const p = Math.min(1, (Date.now() - start) / duration);
      const next = Math.round(from + (value - from) * easeOut(p));
      setShown(next);
      fromRef.current = next;
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration, scale]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={style}>
      <Text variant={variant} color={color} tabular accessibilityLabel={formatPrice(value, lang)}>
        {formatPrice(shown, lang)}
      </Text>
    </Animated.View>
  );
});
