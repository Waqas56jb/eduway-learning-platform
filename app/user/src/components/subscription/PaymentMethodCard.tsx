import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import { Icon } from '@/components/icons';
import { PressableScale, Text } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { radius, space, useTheme } from '@/theme';
import { haptic } from '@/utils/haptics';
import { methodLabel, type PaymentMethod } from './paymentMethods';

interface PaymentMethodCardProps {
  method: PaymentMethod;
  selected: boolean;
  onSelect: (id: PaymentMethod['id']) => void;
}

/** Brand monogram tile (Latin initials, always LTR). */
export const MethodMark = memo(function MethodMark({ method, size = 44 }: { method: PaymentMethod; size?: number }) {
  return (
    <View style={[styles.mark, { width: size, height: size, borderRadius: size * 0.28, backgroundColor: method.color }]}>
      {size >= 32 ? <Icon name={method.icon} size={size * 0.36} color="rgba(255,255,255,0.9)" /> : null}
      <Text
        variant="overline"
        color="#FFFFFF"
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
        style={{ fontSize: size * 0.22, lineHeight: size * 0.3, writingDirection: 'ltr', letterSpacing: 0.3 }}
      >
        {method.mark}
      </Text>
    </View>
  );
});

/** Radio card for a wallet or card payment method. */
export const PaymentMethodCard = memo(function PaymentMethodCard({ method, selected, onSelect }: PaymentMethodCardProps) {
  const { colors } = useTheme();
  const { t, L } = useI18n('subscription');
  const label = methodLabel(method, t, L);
  const hint = method.hint ? L(method.hint) : '';

  const dot = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(selected ? 1 : 0, { damping: 14, stiffness: 220 }) }],
    opacity: withTiming(selected ? 1 : 0, { duration: 150 }),
  }));

  return (
    <PressableScale
      onPress={() => {
        if (!selected) haptic.selection();
        onSelect(method.id);
      }}
      haptics={false}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      style={[
        styles.card,
        {
          backgroundColor: selected ? colors.accentSoft : colors.surface,
          borderColor: selected ? colors.accent : colors.border,
          borderWidth: selected ? 1.5 : 1,
          padding: selected ? space.md - 0.5 : space.md,
        },
      ]}
    >
      <MethodMark method={method} />
      <View style={styles.text}>
        <Text variant="bodyBold" numberOfLines={1}>
          {label}
        </Text>
        <Text variant="caption" color="muted" numberOfLines={1}>
          {hint || (method.kind === 'wallet' ? t('methods.walletHint') : t('methods.cardHint'))}
        </Text>
      </View>
      <View style={[styles.radio, { borderColor: selected ? colors.accent : colors.border }]}>
        <Animated.View style={[styles.radioDot, { backgroundColor: colors.accent }, dot]} />
      </View>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderRadius: radius.lg,
    minHeight: 72,
  },
  text: { flex: 1, minWidth: 0, gap: 2 },
  mark: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 12, height: 12, borderRadius: 6 },
});
