import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import { Icon } from '@/components/icons';
import { PressableScale, Text } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { radius, space, useTheme } from '@/theme';
import type { PaymentMethod } from './paymentMethods';

interface PaymentMethodCardProps {
  method: PaymentMethod;
  selected: boolean;
  onSelect: (id: PaymentMethod['id']) => void;
}

/** Brand monogram tile (Latin initials, always LTR). */
export const MethodMark = memo(function MethodMark({ method, size = 44 }: { method: PaymentMethod; size?: number }) {
  return (
    <View style={[styles.mark, { width: size, height: size, borderRadius: size * 0.28, backgroundColor: method.color }]}>
      <Icon name={method.icon} size={size * 0.36} color="rgba(255,255,255,0.9)" />
      <Text variant="overline" color="#FFFFFF" style={{ fontSize: size * 0.2, lineHeight: size * 0.26, writingDirection: 'ltr' }}>
        {method.mark}
      </Text>
    </View>
  );
});

/** Radio card for a wallet or card payment method. */
export const PaymentMethodCard = memo(function PaymentMethodCard({ method, selected, onSelect }: PaymentMethodCardProps) {
  const { colors } = useTheme();
  const { t } = useI18n('subscription');

  const dot = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(selected ? 1 : 0, { damping: 14, stiffness: 220 }) }],
    opacity: withTiming(selected ? 1 : 0, { duration: 150 }),
  }));

  return (
    <PressableScale
      onPress={() => onSelect(method.id)}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={t(`methods.${method.id}`)}
      style={[
        styles.card,
        {
          backgroundColor: selected ? colors.accentSoft : colors.surface,
          borderColor: selected ? colors.accent : colors.border,
          borderWidth: selected ? 1.5 : StyleSheet.hairlineWidth,
        },
      ]}
    >
      <MethodMark method={method} />
      <View style={{ flex: 1 }}>
        <Text variant="bodyBold">{t(`methods.${method.id}`)}</Text>
        <Text variant="caption" color="muted">
          {method.kind === 'wallet' ? t('methods.walletHint') : t('methods.cardHint')}
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
    padding: space.md,
    borderRadius: radius.lg,
    minHeight: 68,
  },
  mark: { alignItems: 'center', justifyContent: 'center' },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 12, height: 12, borderRadius: 6 },
});
