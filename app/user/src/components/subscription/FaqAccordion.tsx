import { memo, useCallback, useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { FadeIn, LinearTransition, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { Icon } from '@/components/icons';
import { Card, PressableScale, Text } from '@/components/ui';
import { useFaq } from '@/api/public';
import { useI18n } from '@/hooks/useI18n';
import { space, useTheme } from '@/theme';
import type { Localized } from '@/types';

/** Built-in fallback questions (i18n) used until/unless the CMS returns FAQ items. */
const ITEMS = ['q1', 'q2', 'q3'] as const;

interface Item {
  id: string;
  q: Localized | null;
  a: Localized | null;
}

const FaqItem = memo(function FaqItem({
  item,
  open,
  last,
  onToggle,
}: {
  item: Item;
  open: boolean;
  last: boolean;
  onToggle: (id: string) => void;
}) {
  const { colors } = useTheme();
  const { t, L } = useI18n('subscription');
  const id = item.id;
  const chevron = useAnimatedStyle(() => ({
    transform: [{ rotate: withTiming(open ? '180deg' : '0deg', { duration: 220 }) }],
  }));

  return (
    <Animated.View
      layout={LinearTransition.duration(220)}
      style={!last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}
    >
      <PressableScale
        scaleTo={0.99}
        onPress={() => onToggle(id)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={styles.question}
      >
        <Text variant="bodyMedium" style={{ flex: 1 }}>
          {item.q ? L(item.q) : t(`faq.${id}`)}
        </Text>
        <Animated.View style={chevron}>
          <Icon name="chevron-down" size={18} color={colors.muted} />
        </Animated.View>
      </PressableScale>
      {open ? (
        <Animated.View entering={FadeIn.duration(220)} style={styles.answer}>
          <Text variant="body" color="muted">
            {item.a ? L(item.a) : t(`faq.${id.replace('q', 'a')}`)}
          </Text>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
});

/** Mini FAQ (PUB-07 `subscription_app`, i18n fallback), one item open at a time. */
export const FaqAccordion = memo(function FaqAccordion() {
  const { data } = useFaq('subscription_app');
  const items = useMemo<Item[]>(
    () =>
      data?.length
        ? [...data].sort((a, b) => a.order - b.order).map((f) => ({ id: f.id, q: f.q, a: f.a }))
        : ITEMS.map((id) => ({ id, q: null, a: null })),
    [data],
  );
  /** `undefined` = untouched → the first item starts open. */
  const [openId, setOpenId] = useState<string | null | undefined>(undefined);
  const firstId = items[0]?.id ?? null;
  const current = openId === undefined ? firstId : openId;
  const toggle = useCallback(
    (id: string) => setOpenId((cur) => ((cur === undefined ? firstId : cur) === id ? null : id)),
    [firstId],
  );

  return (
    <Card padded={false} style={{ overflow: 'hidden' }}>
      <Animated.View layout={LinearTransition.duration(220)}>
        {items.map((item, i) => (
          <FaqItem key={item.id} item={item} open={current === item.id} last={i === items.length - 1} onToggle={toggle} />
        ))}
      </Animated.View>
    </Card>
  );
});

const styles = StyleSheet.create({
  question: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, minHeight: 56 },
  answer: { paddingHorizontal: space.lg, paddingBottom: space.lg, marginTop: -space.xs },
});

