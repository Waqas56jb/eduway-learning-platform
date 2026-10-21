import { memo, useEffect, useState } from 'react';
import { I18nManager, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Icon } from '@/components/icons';
import { Button, ProgressBar, Text } from '@/components/ui';
import { getPackage } from '@/data';
import { useI18n } from '@/hooks/useI18n';
import { useAuthStore } from '@/store';
import { gradients, palette, radius, shadows, space } from '@/theme';
import { formatDate } from '@/utils/format';

const SHEEN_WIDTH = 90;
const NAVY_SOFT = 'rgba(11,31,58,0.10)';

/** Gold premium card: package, subjects, days remaining and a Renew action. A diagonal sheen sweeps across it. */
export const SubscriptionCard = memo(function SubscriptionCard() {
  const { t, L, lang } = useI18n('home');
  const user = useAuthStore((s) => s.user);
  const pkg = getPackage(user?.packageId);
  const [width, setWidth] = useState(0);

  const reduceMotion = useReducedMotion();
  const sweep = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion || width === 0) return;
    sweep.value = 0;
    sweep.value = withRepeat(
      withDelay(1400, withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.cubic) })),
      -1,
      false,
    );
  }, [sweep, width, reduceMotion]);

  const dir = I18nManager.isRTL ? -1 : 1;
  const sheenStyle = useAnimatedStyle(() => {
    const x = -SHEEN_WIDTH * 2 + sweep.value * (width + SHEEN_WIDTH * 3);
    return { transform: [{ translateX: x * dir }, { rotate: '20deg' }] };
  });

  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));

  if (!user || !pkg) {
    return (
      <LinearGradient colors={gradients.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.card, shadows.gold]}>
        <View style={styles.headRow}>
          <Icon name="crown" size={18} color={palette.navy} filled />
          <Text variant="h3" color={palette.navy}>
            {t('subscription.noPlan')}
          </Text>
        </View>
        <Text variant="body" color={palette.navy} style={styles.noPlanBody}>
          {t('subscription.noPlanBody')}
        </Text>
        <Button title={t('subscription.viewPlans')} variant="secondary" size="md" onPress={() => router.push('/subscription')} />
      </LinearGradient>
    );
  }

  const start = new Date(user.subscriptionStart).getTime();
  const end = new Date(user.subscriptionEnd).getTime();
  const totalDays = Math.max(1, Math.round((end - start) / 86400000));
  const usedPct = Math.min(100, Math.max(0, Math.round(((totalDays - user.daysRemaining) / totalDays) * 100)));
  const pkgName = L(pkg.name);

  return (
    <View style={[styles.shadowWrap, shadows.gold]} onLayout={onLayout}>
      <LinearGradient
        colors={gradients.gold}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
        accessible={false}
      >
        {/* Premium texture: soft diagonal bands + a corner glow. */}
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <View style={[styles.band, { start: '38%' }]} />
          <View style={[styles.band, styles.bandThin, { start: '58%' }]} />
          <View style={styles.glow} />
        </View>
        {!reduceMotion && width > 0 ? (
          <Animated.View pointerEvents="none" style={[styles.sheen, sheenStyle]}>
            <LinearGradient
              colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.42)', 'rgba(255,255,255,0)']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        ) : null}

        <View style={styles.headRow} accessible accessibilityLabel={t('subscription.a11y', { name: pkgName, days: user.daysRemaining })}>
          <View style={styles.crown}>
            <Icon name="crown" size={16} color={palette.goldLight} filled />
          </View>
          <View style={styles.flex}>
            <Text variant="overline" color="rgba(11,31,58,0.7)">
              {t('subscription.overline').toLocaleUpperCase(lang === 'ar' ? 'ar' : 'en')}
            </Text>
            <Text variant="h2" display color={palette.navy} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
              {pkgName}
            </Text>
          </View>
          <View style={styles.activePill}>
            <View style={styles.activeDot} />
            <Text variant="label" color={palette.navy} style={styles.small}>
              {t('subscription.active')}
            </Text>
          </View>
        </View>

        <View style={styles.chips}>
          {pkg.subjects.map((sid) => (
            <View key={sid} style={styles.chip}>
              <Text variant="label" color={palette.navy} style={styles.small} numberOfLines={1}>
                {t(`common:subjects.${sid}`)}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.footer}>
          <View style={styles.flex}>
            <View style={styles.daysRow}>
              <Text variant="display" display tabular color={palette.navy} style={styles.days}>
                {String(user.daysRemaining)}
              </Text>
              <Text variant="label" color={palette.navy} style={styles.daysLabel} numberOfLines={1}>
                {t('subscription.daysLeftLabel')}
              </Text>
            </View>
            <ProgressBar progress={usedPct} height={5} color={palette.navy} trackColor="rgba(11,31,58,0.16)" />
            <Text variant="caption" color="rgba(11,31,58,0.72)" numberOfLines={1} style={styles.endsOn}>
              {t('subscription.endsOn', { date: formatDate(user.subscriptionEnd, lang, { day: 'numeric', month: 'long' }) })}
            </Text>
          </View>
          <Button
            title={t('subscription.renew')}
            variant="secondary"
            size="sm"
            icon="refresh"
            onPress={() => router.push('/subscription')}
            accessibilityLabel={t('subscription.renew')}
          />
        </View>
      </LinearGradient>
    </View>
  );
});

const styles = StyleSheet.create({
  shadowWrap: { borderRadius: radius.xl },
  card: {
    borderRadius: radius.xl,
    padding: space.xl,
    overflow: 'hidden',
    gap: space.lg,
  },
  band: {
    position: 'absolute',
    top: -80,
    width: 70,
    height: 400,
    backgroundColor: 'rgba(255,255,255,0.10)',
    transform: [{ rotate: '20deg' }],
  },
  bandThin: { width: 18, backgroundColor: 'rgba(255,255,255,0.14)' },
  glow: {
    position: 'absolute',
    top: -70,
    end: -60,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  sheen: {
    position: 'absolute',
    top: -60,
    bottom: -60,
    start: 0,
    width: SHEEN_WIDTH,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  crown: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: palette.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#15803D' },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs + 2,
  },
  chip: {
    paddingHorizontal: space.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: NAVY_SOFT,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(11,31,58,0.18)',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.lg,
  },
  daysRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space.xs + 2,
    marginBottom: space.sm,
  },
  days: { lineHeight: 38 },
  daysLabel: { flexShrink: 1 },
  endsOn: { marginTop: space.xs + 2 },
  noPlanBody: { marginBottom: space.xs },
  small: { fontSize: 12, lineHeight: 16 },
  flex: { flex: 1 },
});
