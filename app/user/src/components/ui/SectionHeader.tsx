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

/**
 * Section title (h3) with an optional gold "See all" text button on the end edge. The action is
 * vertically centered on the title line (not the subtitle), so it reads as aligned with the title.
 */
export const SectionHeader = memo(function SectionHeader({ title, subtitle, actionLabel, onAction, style }: SectionHeaderProps) {
  const { colors, isDark } = useTheme();
  const actionColor = isDark ? colors.accentLight : '#8A6A22';

  return (
    <View style={[styles.container, style]}>
      <View style={styles.row}>
        <Text variant="h3" accessibilityRole="header" numberOfLines={1} style={styles.title}>
          {title}
        </Text>
        {actionLabel && onAction ? (
          <PressableScale
            onPress={onAction}
            hitSlop={HIT_SLOP}
            haptics={false}
            scaleTo={0.95}
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
            style={styles.action}
          >
            <Text variant="label" color={actionColor} numberOfLines={1} maxFontSizeMultiplier={1.2}>
              {actionLabel}
            </Text>
            <Icon name="chevron" size={14} color={actionColor} strokeWidth={2.2} />
          </PressableScale>
        ) : null}
      </View>
      {subtitle ? (
        <Text variant="caption" color="muted" numberOfLines={2} style={styles.subtitle}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { marginBottom: space.md },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md, minHeight: 28 },
  title: { flex: 1 },
  subtitle: { marginTop: 2 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 28, paddingStart: space.xs },
});
