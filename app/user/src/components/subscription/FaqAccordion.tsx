import { memo, useCallback, useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { FadeIn, LinearTransition, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { Icon } from '@/components/icons';
import { Card, PressableScale, Text } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { space, useTheme } from '@/theme';

const ITEMS = ['q1', 'q2', 'q3'] as const;

const FaqItem = memo(function FaqItem({
  id,
  open,
  last,
  onToggle,
}: {
  id: (typeof ITEMS)[number];
  open: boolean;
  last: boolean;
  onToggle: (id: string) => void;
}) {
  const { colors } = useTheme();
  const { t } = useI18n('subscription');
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
          {t(`faq.${id}`)}
        </Text>
        <Animated.View style={chevron}>
          <Icon name="chevron-down" size={18} color={colors.muted} />
        </Animated.View>
      </PressableScale>
      {open ? (
        <Animated.View entering={FadeIn.duration(220)} style={styles.answer}>
          <Text variant="body" color="muted">
            {t(`faq.${id.replace('q', 'a')}`)}
          </Text>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
});

/** Three-question mini FAQ, one item open at a time. */
export const FaqAccordion = memo(function FaqAccordion() {
  const [openId, setOpenId] = useState<string | null>('q1');
  const toggle = useCallback((id: string) => setOpenId((cur) => (cur === id ? null : id)), []);

  return (
    <Card padded={false} style={{ overflow: 'hidden' }}>
      <Animated.View layout={LinearTransition.duration(220)}>
        {ITEMS.map((id, i) => (
          <FaqItem key={id} id={id} open={openId === id} last={i === ITEMS.length - 1} onToggle={toggle} />
        ))}
      </Animated.View>
    </Card>
  );
});

const styles = StyleSheet.create({
  question: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, minHeight: 56 },
  answer: { paddingHorizontal: space.lg, paddingBottom: space.lg, marginTop: -space.xs },
});

