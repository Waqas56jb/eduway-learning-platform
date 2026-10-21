import { memo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Icon } from '@/components/icons';
import { HIT_SLOP, space, useTheme } from '@/theme';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

export interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}

/** Section title with an optional "See all" style action at the end edge. */
export const SectionHeader = memo(function SectionHeader({ title, subtitle, actionLabel, onAction, style }: SectionHeaderProps) {
  const { colors, isDark } = useTheme();
  const actionColor = isDark ? colors.accentLight : '#8A6A22';

  return (
    <View style={[styles.row, style]}>
      <View style={styles.texts}>
        <Text variant="h3" accessibilityRole="header" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" color="muted" numberOfLines={2} style={styles.subtitle}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {actionLabel && onAction ? (
        <PressableScale
          onPress={onAction}
          hitSlop={HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          style={styles.action}
        >
          <Text variant="label" color={actionColor}>
            {actionLabel}
          </Text>
          <Icon name="chevron" size={14} color={actionColor} strokeWidth={2.2} />
        </PressableScale>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: space.md,
    gap: space.md,
  },
  texts: { flex: 1 },
  subtitle: { marginTop: 2 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 28, paddingVertical: 2 },
});
