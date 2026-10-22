import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon, type IconName } from '@/components/icons';
import { PressableScale, Text } from '@/components/ui';
import { radius, shadows, space, useTheme } from '@/theme';

export interface EntryCardProps {
  icon: IconName;
  /** Icon tint; the tile background is the same color at low opacity unless `iconBg` is given. */
  iconColor: string;
  iconBg?: string;
  iconFilled?: boolean;
  title: string;
  subtitle: string;
  subtitleColor?: string;
  /** Optional count shown in a pill before the chevron. */
  value?: string;
  valueTone?: 'neutral' | 'danger' | 'accent';
  onPress(): void;
  accessibilityLabel: string;
}

/** Navigation row card used for Bookmarks / Mistakes / Exams on the Practice tab — one consistent shape. */
export const EntryCard = memo(function EntryCard({
  icon,
  iconColor,
  iconBg,
  iconFilled,
  title,
  subtitle,
  subtitleColor,
  value,
  valueTone = 'neutral',
  onPress,
  accessibilityLabel,
}: EntryCardProps) {
  const { colors } = useTheme();
  const pillBg = valueTone === 'danger' ? colors.dangerSoft : valueTone === 'accent' ? colors.accentSoft : colors.surfaceMuted;
  const pillFg = valueTone === 'danger' ? colors.danger : valueTone === 'accent' ? colors.accent : colors.ink;

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[styles.card, shadows.sm, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <View style={[styles.icon, { backgroundColor: iconBg ?? `${iconColor}1F` }]}>
        <Icon name={icon} size={22} color={iconColor} filled={iconFilled} />
      </View>
      <View style={styles.text}>
        <Text variant="bodyBold" numberOfLines={1}>
          {title}
        </Text>
        <Text variant="caption" color={subtitleColor ?? 'muted'} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      {value !== undefined ? (
        <View style={[styles.pill, { backgroundColor: pillBg }]}>
          <Text variant="label" color={pillFg} tabular>
            {value}
          </Text>
        </View>
      ) : null}
      <Icon name="chevron" size={18} color={colors.muted} />
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 76,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  icon: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: space.xxs },
  pill: {
    minWidth: 32,
    height: 26,
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
