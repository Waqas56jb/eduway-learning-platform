import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { Icon, type IconName } from '@/components/icons';
import { Text } from '@/components/ui';
import { shadows, space, radius, useTheme } from '@/theme';

export interface ProfileStat {
  key: string;
  icon: IconName;
  value: string;
  label: string;
  color: string;
}

/** Floating 4-up stats card that overlaps the bottom of the profile hero. */
export const ProfileStats = memo(function ProfileStats({ stats }: { stats: ProfileStat[] }) {
  const { colors } = useTheme();
  return (
    <Animated.View
      entering={FadeInUp.duration(320).delay(120)}
      style={[styles.card, shadows.md, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      {stats.map((s, i) => (
        <View
          key={s.key}
          style={[styles.cell, i > 0 && { borderStartWidth: StyleSheet.hairlineWidth, borderStartColor: colors.border }]}
          accessible
          accessibilityLabel={`${s.label}: ${s.value}`}
        >
          <View style={[styles.iconWrap, { backgroundColor: `${s.color}1F` }]}>
            <Icon name={s.icon} size={16} color={s.color} />
          </View>
          <Text variant="h3" tabular align="center" numberOfLines={1}>
            {s.value}
          </Text>
          <Text variant="caption" color="muted" align="center" numberOfLines={2}>
            {s.label}
          </Text>
        </View>
      ))}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: space.lg,
  },
  cell: { flex: 1, alignItems: 'center', gap: space.xs, paddingHorizontal: space.xs },
  iconWrap: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: space.xxs },
});
