import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Icon } from '@/components/icons';
import { Button, Text } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { gradients, palette, radius, shadows, space, useTheme } from '@/theme';
import { formatDate } from '@/utils/format';

interface LimitReachedProps {
  quota: number;
  /** ISO date when the allowance renews. */
  renewsAt?: string;
}

/** Shown when the monthly AI question allowance is exhausted. */
export const LimitReached = memo(function LimitReached({ quota, renewsAt }: LimitReachedProps) {
  const { colors } = useTheme();
  const { t, lang } = useI18n('tutor');
  const date = renewsAt ? formatDate(renewsAt, lang, { day: 'numeric', month: 'long' }) : '';

  return (
    <Animated.View
      entering={FadeInDown.duration(320)}
      style={[styles.card, shadows.md, { backgroundColor: colors.surface, borderColor: colors.accent }]}
      accessibilityLiveRegion="polite"
    >
      <LinearGradient colors={gradients.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.icon}>
        <Icon name="crown" size={26} color={palette.navy} />
      </LinearGradient>
      <Text variant="h3" align="center">
        {t('limit.title', { quota })}
      </Text>
      {date ? (
        <Text variant="body" color="muted" align="center">
          {t('limit.message', { date })}
        </Text>
      ) : null}
      {date ? (
        <View style={[styles.renew, { backgroundColor: colors.accentSoft }]}>
          <Icon name="calendar" size={14} color={colors.accent} />
          <Text variant="label" color="accent">
            {t('limit.renews', { date })}
          </Text>
        </View>
      ) : null}
      <Button
        title={t('limit.upgrade')}
        icon="crown"
        variant="primary"
        fullWidth
        onPress={() => router.push('/subscription')}
        style={styles.cta}
      />
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    gap: space.md,
    padding: space.xl,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  icon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  renew: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.md,
    paddingVertical: space.xs + 2,
    borderRadius: radius.pill,
  },
  cta: { marginTop: space.xs },
});
