import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Icon } from '@/components/icons';
import { Card, Text } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { space, useTheme } from '@/theme';
import type { Package } from '@/types';

type Cell = boolean | string;

const ROWS: { key: string; value: (p: Package) => Cell }[] = [
  { key: 'subjects', value: (p) => String(p.subjects.length) },
  { key: 'lessons', value: () => true },
  { key: 'quizzes', value: () => true },
  { key: 'questionBank', value: () => true },
  { key: 'mistakes', value: () => true },
  { key: 'exams', value: (p) => p.subjects.length > 1 },
  { key: 'ai', value: (p) => String(p.aiQuota) },
  { key: 'pdf', value: (p) => p.subjects.length > 1 },
  { key: 'analytics', value: (p) => p.subjects.length >= 5 },
  { key: 'support', value: (p) => p.subjects.length >= 5 },
];

interface ComparisonTableProps {
  packages: Package[];
  currentId?: string;
}

/** Feature × plan matrix; the popular plan column is highlighted. */
export const ComparisonTable = memo(function ComparisonTable({ packages, currentId }: ComparisonTableProps) {
  const { colors } = useTheme();
  const { t, L } = useI18n('subscription');

  const renderCell = (cell: Cell, popular: boolean) => {
    if (typeof cell === 'string') {
      return (
        <Text variant="bodyBold" align="center" color={popular ? 'accent' : 'ink'} tabular>
          {cell}
        </Text>
      );
    }
    return (
      <View accessible accessibilityLabel={cell ? t('compare.included') : t('compare.notIncluded')}>
        {cell ? (
          <Icon name="check-circle" size={18} color={colors.success} />
        ) : (
          <Icon name="minus" size={16} color={colors.muted} />
        )}
      </View>
    );
  };

  return (
    <Animated.View entering={FadeIn.duration(250)}>
      <Card padded={false} style={{ overflow: 'hidden' }}>
        <View style={[styles.row, styles.headRow, { backgroundColor: colors.surfaceMuted, borderBottomColor: colors.border }]}>
          <View style={styles.labelCol}>
            <Text variant="overline" color="muted">
              {t('compare.feature')}
            </Text>
          </View>
          {packages.map((p) => (
            <View key={p.id} style={[styles.col, p.popular && { backgroundColor: colors.accentSoft }]}>
              <Text variant="label" align="center" numberOfLines={2} color={p.popular ? 'accent' : 'ink'}>
                {L(p.name)}
              </Text>
              {p.id === currentId ? (
                <Text variant="caption" align="center" color="muted" numberOfLines={1}>
                  {t('compare.yours')}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
        {ROWS.map((row, i) => (
          <View
            key={row.key}
            style={[
              styles.row,
              i < ROWS.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
            ]}
          >
            <View style={styles.labelCol}>
              <Text variant="caption" color="ink">
                {t(`compare.rows.${row.key}`)}
              </Text>
            </View>
            {packages.map((p) => (
              <View key={p.id} style={[styles.col, p.popular && { backgroundColor: colors.accentSoft }]}>
                {renderCell(row.value(p), !!p.popular)}
              </View>
            ))}
          </View>
        ))}
      </Card>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'stretch' },
  headRow: { borderBottomWidth: StyleSheet.hairlineWidth },
  labelCol: { flex: 1.5, paddingVertical: space.md, paddingHorizontal: space.md, justifyContent: 'center' },
  col: { flex: 1, paddingVertical: space.md, paddingHorizontal: space.xs, alignItems: 'center', justifyContent: 'center' },
});
