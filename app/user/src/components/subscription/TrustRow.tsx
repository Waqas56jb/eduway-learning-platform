import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon } from '@/components/icons';
import { Text } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { radius, space, useTheme } from '@/theme';

const PROVIDERS = ['zaincash', 'fastpay', 'qicard', 'visaMastercard'] as const;

/** "Secure payments" reassurance row with accepted providers as text chips. */
export const TrustRow = memo(function TrustRow() {
  const { colors } = useTheme();
  const { t } = useI18n('subscription');
  return (
    <View style={[styles.wrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.head}>
        <View style={[styles.shield, { backgroundColor: colors.successSoft }]}>
          <Icon name="shield" size={20} color={colors.success} />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="label">{t('trust.title')}</Text>
          <Text variant="caption" color="muted">
            {t('trust.subtitle')}
          </Text>
        </View>
        <Icon name="lock" size={16} color={colors.muted} />
      </View>
      <View style={styles.chips}>
        {PROVIDERS.map((p) => (
          <View key={p} style={[styles.chip, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
            <Text variant="label" color="ink">
              {t(`methods.${p}`)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: space.lg, gap: space.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  shield: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
