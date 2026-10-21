import { LinearGradient } from 'expo-linear-gradient';
import { memo } from 'react';
import { I18nManager, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Icon, SubjectIcon } from '@/components/icons';
import { Button, Card, Text } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import type { BillingCycle } from '@/store';
import { gradients, palette, radius, space, subjectColors, useTheme } from '@/theme';
import type { Package } from '@/types';
import { formatPrice } from '@/utils/format';
import { AnimatedPrice } from './AnimatedPrice';

interface PlanCardProps {
  pkg: Package;
  cycle: BillingCycle;
  isCurrent: boolean;
  index?: number;
  onChoose: (pkg: Package) => void;
}

export const PlanCard = memo(function PlanCard({ pkg, cycle, isCurrent, index = 0, onChoose }: PlanCardProps) {
  const { colors } = useTheme();
  const { t, L, lang } = useI18n('subscription');
  const yearly = cycle === 'yearly';
  const price = yearly ? pkg.priceYearly : pkg.priceMonthly;
  const fullYear = pkg.priceMonthly * 12;
  const perMonthEquivalent = Math.round(pkg.priceYearly / 12);
  const saving = fullYear - pkg.priceYearly;
  const rtl = I18nManager.isRTL;

  return (
    <Animated.View entering={FadeInDown.duration(320).delay(120 + index * 70)}>
      <Card
        padded={false}
        style={[
          styles.card,
          pkg.popular && { borderColor: colors.accent, borderWidth: 1.5 },
          isCurrent && !pkg.popular && { borderColor: colors.primaryLight, borderWidth: 1.5 },
        ]}
      >
        {pkg.popular ? (
          <View pointerEvents="none" style={styles.ribbonWrap}>
            <LinearGradient
              colors={gradients.gold}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.ribbon, { transform: [{ rotate: rtl ? '-45deg' : '45deg' }] }]}
            >
              <Text variant="overline" color={palette.navy} align="center" numberOfLines={1}>
                {t('plans.popular')}
              </Text>
            </LinearGradient>
          </View>
        ) : null}

        <View style={styles.body}>
          <View style={styles.headRow}>
            <View style={[styles.iconBadge, { backgroundColor: pkg.popular ? colors.accentSoft : colors.surfaceMuted }]}>
              <Icon name={pkg.popular ? 'crown' : pkg.subjects.length >= 5 ? 'trophy' : 'book'} size={22} color={colors.accent} filled={!!pkg.popular} />
            </View>
            <View style={{ flex: 1, paddingEnd: pkg.popular ? 56 : 0 }}>
              <Text variant="h3">{L(pkg.name)}</Text>
              <Text variant="caption" color="muted" numberOfLines={2}>
                {L(pkg.tagline)}
              </Text>
            </View>
          </View>

          <View style={styles.priceRow}>
            <AnimatedPrice value={price} variant="h1" color="ink" />
            <Text variant="bodyMedium" color="muted" style={{ marginBottom: 4 }}>
              {yearly ? t('plans.perYear') : t('plans.perMonth')}
            </Text>
          </View>
          {yearly ? (
            <View style={styles.yearlyRow}>
              <Text variant="caption" color="muted" style={styles.strike} tabular>
                {formatPrice(fullYear, lang)}
              </Text>
              <View style={[styles.savePill, { backgroundColor: colors.successSoft }]}>
                <Text variant="caption" color="success">
                  {t('plans.save', { amount: formatPrice(saving, lang) })}
                </Text>
              </View>
              <Text variant="caption" color="muted">
                {t('plans.equivalent', { price: formatPrice(perMonthEquivalent, lang) })}
              </Text>
            </View>
          ) : (
            <Text variant="caption" color="muted">
              {t('plans.billedMonthly')}
            </Text>
          )}

          <View style={styles.subjectsRow}>
            {pkg.subjects.map((sid) => (
              <View
                key={sid}
                accessibilityLabel={t(`common:subjects.${sid}`)}
                style={[styles.subjectDot, { backgroundColor: `${subjectColors[sid]}1F` }]}
              >
                <SubjectIcon subjectId={sid} size={16} color={subjectColors[sid]} />
              </View>
            ))}
            <Text variant="caption" color="muted" style={{ marginStart: space.xs, flexShrink: 1 }} numberOfLines={1}>
              {pkg.subjects.map((sid) => t(`common:subjects.${sid}`)).join(' · ')}
            </Text>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <View style={{ gap: space.sm }}>
            {pkg.features.map((f, i) => (
              <View key={i} style={styles.featureRow}>
                <View style={[styles.check, { backgroundColor: colors.accentSoft }]}>
                  <Icon name="check" size={12} color={colors.accent} strokeWidth={2.5} />
                </View>
                <Text variant="body" style={{ flex: 1 }}>
                  {L(f)}
                </Text>
              </View>
            ))}
          </View>

          <View style={[styles.aiRow, { backgroundColor: colors.surfaceMuted }]}>
            <Icon name="sparkles" size={16} color={colors.accent} />
            <Text variant="label" style={{ flex: 1 }}>
              {t('plans.aiQuota', { count: pkg.aiQuota })}
            </Text>
          </View>

          <Button
            title={isCurrent ? t('plans.currentPlan') : t('plans.choose')}
            variant={isCurrent ? 'outline' : pkg.popular ? 'primary' : 'secondary'}
            icon={isCurrent ? 'check-circle' : undefined}
            disabled={isCurrent}
            fullWidth
            onPress={() => onChoose(pkg)}
            accessibilityLabel={`${isCurrent ? t('plans.currentPlan') : t('plans.choose')} — ${L(pkg.name)}`}
            style={{ marginTop: space.lg }}
          />
        </View>
      </Card>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  card: { overflow: 'hidden' },
  body: { padding: space.xl },
  ribbonWrap: { position: 'absolute', top: 0, end: -44, width: 160, height: 100, zIndex: 2 },
  ribbon: {
    position: 'absolute',
    top: 24,
    start: 0,
    width: 160,
    paddingVertical: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  iconBadge: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  priceRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, marginTop: space.lg, flexWrap: 'wrap' },
  yearlyRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.sm, marginTop: space.xs },
  strike: { textDecorationLine: 'line-through' },
  savePill: { paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: radius.pill },
  subjectsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space.lg },
  subjectDot: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: space.lg },
  featureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  check: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  aiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.lg,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
  },
});
