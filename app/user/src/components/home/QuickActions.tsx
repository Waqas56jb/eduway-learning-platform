import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { Icon, type IconName } from '@/components/icons';
import { PressableScale, Text } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { palette, radius, shadows, space, useTheme } from '@/theme';
import { withAlpha } from './color';

interface QuickAction {
  key: 'questionBank' | 'mistakes' | 'exams' | 'progress';
  icon: IconName;
  href: Href;
  color: string;
}

const ACTIONS: QuickAction[] = [
  { key: 'questionBank', icon: 'question-bank', href: '/question-bank', color: '#2563EB' },
  { key: 'mistakes', icon: 'mistakes', href: '/mistakes', color: '#DC2626' },
  { key: 'exams', icon: 'exam', href: '/exams', color: palette.gold },
  { key: 'progress', icon: 'chart', href: '/progress', color: '#059669' },
];

/** Row of four shortcut tiles. */
export const QuickActions = memo(function QuickActions() {
  const { colors, isDark } = useTheme();
  const { t } = useI18n('home');

  return (
    <View style={styles.row}>
      {ACTIONS.map((a) => {
        const label = t(`quick.${a.key}`);
        return (
          <PressableScale
            key={a.key}
            onPress={() => router.push(a.href)}
            accessibilityRole="button"
            accessibilityLabel={label}
            style={[styles.tile, { backgroundColor: colors.surface, borderColor: colors.border }, !isDark && shadows.sm]}
          >
            <View style={[styles.icon, { backgroundColor: withAlpha(a.color, isDark ? 0.24 : 0.12) }]}>
              <Icon name={a.icon} size={22} color={a.color} />
            </View>
            <Text variant="caption" align="center" numberOfLines={2}>
              {label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.sm },
  tile: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: space.md,
    paddingHorizontal: space.xs,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 96,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.sm,
  },
});
