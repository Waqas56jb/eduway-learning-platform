import { LinearGradient } from 'expo-linear-gradient';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Icon, SubjectIcon } from '@/components/icons';
import { ProgressBar, ProgressRing, Text } from '@/components/ui';
import { toPackage } from '@/api/adapters';
import { useMySubscription } from '@/api/payments';
import { useI18n } from '@/hooks/useI18n';
import { useAuthStore } from '@/store';
import { gradients, palette, radius, shadows, space } from '@/theme';
import { formatDate } from '@/utils/format';

const NAVY_SOFT = 'rgba(11,31,58,0.10)';
const NAVY_TRACK = 'rgba(11,31,58,0.16)';
const NAVY_MUTED = 'rgba(11,31,58,0.72)';

interface CurrentPlanCardProps {
  /** `hero`: compact glass strip for use over a dark hero image. */
  variant?: 'card' | 'hero';
}

/** Gold hero card summarising the user's active package. */
export const CurrentPlanCard = memo(function CurrentPlanCard({ variant = 'card' }: CurrentPlanCardProps) {
  const user = useAuthStore((s) => s.user);
  const cached = useAuthStore((s) => s.me?.subscription ?? null);
  const { data } = useMySubscription(!!user);
  const { t, L, lang } = useI18n('subscription');
  if (!user) return null;

  // PAY-03 (falls back to the subscription embedded in /auth/me while loading).
  const sub = data !== undefined ? data : cached;
  const pkg = sub && sub.status !== 'cancelled' ? toPackage(sub.package) : undefined;
  const totalDays = Math.max(1, sub?.totalDays ?? 1);
  const daysLeft = Math.max(0, sub?.daysRemaining ?? 0);
  const daysPct = Math.min(100, Math.round(sub?.remainingPct ?? (daysLeft / totalDays) * 100));
  const aiUsed = sub?.aiAllowance.used ?? user.aiUsed;
  const aiQuota = sub?.aiAllowance.quota ?? user.aiQuota;
  const aiPct = aiQuota > 0 ? Math.min(100, Math.round((aiUsed / aiQuota) * 100)) : 0;
  const endDate = sub ? formatDate(sub.endsAt, lang, { day: 'numeric', month: 'long', year: 'numeric' }) : '';

  if (variant === 'hero') {
    return (
      <View
        style={styles.glass}
        accessible
        accessibilityLabel={`${t('current.overline')}: ${pkg ? L(pkg.name) : t('current.none')}`}
      >
        <View style={styles.glassIcon}>
          <Icon name="crown" size={18} color={palette.navy} filled />
        </View>
        <View style={styles.glassText}>
          <Text variant="caption" color="rgba(255,255,255,0.72)" numberOfLines={1}>
            {pkg ? t('current.overline') : t('current.none')}
          </Text>
          <Text variant="bodyBold" color={palette.white} numberOfLines={1}>
            {pkg ? L(pkg.name) : t('current.noneMsg')}
          </Text>
        </View>
        {pkg ? (
          <View style={styles.glassStat}>
            <Text variant="h3" color={palette.goldLight} tabular numberOfLines={1}>
              {String(daysLeft)}
            </Text>
            <Text variant="caption" color="rgba(255,255,255,0.72)" numberOfLines={1}>
              {t('current.daysLeft')}
            </Text>
          </View>
        ) : null}
      </View>
    );
  }

  if (!pkg) {
    return (
      <Animated.View entering={FadeInDown.duration(300)} style={[styles.card, shadows.gold]}>
        <LinearGradient colors={gradients.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.gradient}>
          <View style={styles.crownBadge}>
            <Icon name="crown" size={22} color={palette.goldLight} filled />
          </View>
          <Text variant="h3" color={palette.navy} style={{ marginTop: space.md }}>
            {t('current.none')}
          </Text>
          <Text variant="body" color={NAVY_MUTED}>
            {t('current.noneMsg')}
          </Text>
        </LinearGradient>
      </Animated.View>
    );
  }

  return (
    <Animated.View entering={FadeInDown.duration(300)} style={[styles.card, shadows.gold]}>
      <LinearGradient colors={gradients.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.gradient}>
        <View style={styles.watermark} pointerEvents="none">
          <Icon name="crown" size={160} color="rgba(255,255,255,0.18)" filled />
        </View>

        <View style={styles.topRow}>
          <View style={{ flex: 1, gap: space.xs }}>
            <View style={styles.row}>
              <View style={styles.crownBadge}>
                <Icon name="crown" size={20} color={palette.goldLight} filled />
              </View>
              <View style={styles.activePill}>
                <View style={styles.activeDot} />
                <Text variant="overline" color={palette.navy}>
                  {t('current.active')}
                </Text>
              </View>
            </View>
            <Text variant="overline" color={NAVY_MUTED} style={{ marginTop: space.sm }}>
              {t('current.overline')}
            </Text>
            <Text variant="h1" color={palette.navy}>
              {L(pkg.name)}
            </Text>
            <Text variant="caption" color={NAVY_MUTED}>
              {L(pkg.tagline)}
            </Text>
          </View>
          <ProgressRing
            progress={daysPct}
            size={84}
            strokeWidth={7}
            color={palette.navy}
            trackColor={NAVY_TRACK}
            label={String(daysLeft)}
            sublabel={t('current.daysLeft')}
          />
        </View>

        <View style={styles.chips}>
          {pkg.subjects.map((sid) => (
            <View key={sid} style={styles.chip}>
              <SubjectIcon subjectId={sid} size={14} color={palette.navy} />
              <Text variant="label" color={palette.navy}>
                {t(`common:subjects.${sid}`)}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.divider} />

        <View style={[styles.row, { justifyContent: 'space-between' }]}>
          <View style={styles.row}>
            <Icon name="calendar" size={16} color={palette.navy} />
            <Text variant="label" color={palette.navy}>
              {daysLeft > 0 ? t('current.renews', { date: endDate }) : t('current.expires', { date: endDate })}
            </Text>
          </View>
        </View>

        <View style={{ marginTop: space.md, gap: space.sm }}>
          <View style={[styles.row, { justifyContent: 'space-between' }]}>
            <View style={styles.row}>
              <Icon name="sparkles" size={16} color={palette.navy} />
              <Text variant="label" color={palette.navy}>
                {t('current.aiQuota')}
              </Text>
            </View>
            <Text variant="label" color={palette.navy} tabular>
              {t('current.aiUsage', { used: aiUsed, total: aiQuota })}
            </Text>
          </View>
          <ProgressBar progress={aiPct} height={6} color={palette.navy} trackColor={NAVY_TRACK} />
        </View>
      </LinearGradient>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  card: { borderRadius: radius.xl },
  gradient: { borderRadius: radius.xl, padding: space.xl, overflow: 'hidden' },
  watermark: { position: 'absolute', end: -30, bottom: -36, opacity: 0.9 },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  crownBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: palette.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: palette.success },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.lg },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: NAVY_SOFT,
  },
  glass: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    paddingEnd: space.lg,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  glassIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: palette.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glassText: { flex: 1, minWidth: 0, gap: 1 },
  glassStat: { alignItems: 'center', minWidth: 56 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(11,31,58,0.25)', marginVertical: space.lg },
});
