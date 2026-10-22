import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Text } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { radius, space, useTheme } from '@/theme';

interface AllowancePillProps {
  remaining: number;
  quota: number;
  /** Show only the remaining count (narrow screens). */
  compact?: boolean;
}

const RING = 18;
const STROKE = 3;

/** "73 / 100" remaining AI questions with a mini progress ring. Gold → warning (<10) → danger (0). */
export const AllowancePill = memo(function AllowancePill({ remaining, quota, compact = false }: AllowancePillProps) {
  const { colors } = useTheme();
  const { t } = useI18n('tutor');
  const tone = remaining <= 0 ? colors.danger : remaining < 10 ? colors.warning : colors.accent;
  const soft = remaining <= 0 ? colors.dangerSoft : remaining < 10 ? colors.warningSoft : colors.accentSoft;
  const ratio = quota > 0 ? Math.max(0, Math.min(1, remaining / quota)) : 0;
  const r = (RING - STROKE) / 2;
  const circumference = 2 * Math.PI * r;

  return (
    <View
      style={[styles.pill, { backgroundColor: soft, borderColor: tone }]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={t('allowance.a11y', { remaining: Math.max(0, remaining), quota })}
    >
      <Svg width={RING} height={RING} style={styles.ring}>
        <Circle cx={RING / 2} cy={RING / 2} r={r} stroke={tone} strokeOpacity={0.22} strokeWidth={STROKE} fill="none" />
        <Circle
          cx={RING / 2}
          cy={RING / 2}
          r={r}
          stroke={tone}
          strokeWidth={STROKE}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - ratio)}
        />
      </Svg>
      <Text variant="label" color={tone} tabular numberOfLines={1} style={styles.label}>
        {compact ? `${Math.max(0, remaining)}` : `${Math.max(0, remaining)} / ${quota}`}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    paddingStart: space.sm,
    paddingEnd: space.md - 2,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  ring: { transform: [{ rotate: '-90deg' }] },
  label: { writingDirection: 'ltr' },
});
