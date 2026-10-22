import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui';
import { space, useTheme } from '@/theme';

interface FormSectionProps {
  title: string;
  children: ReactNode;
}

/** Gold overline label with a hairline rule, grouping related form fields (16pt rhythm). */
export function FormSection({ title, children }: FormSectionProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text variant="overline" color="accent" accessibilityRole="header">
          {title}
        </Text>
        <View style={[styles.rule, { backgroundColor: colors.border }]} />
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  rule: { flex: 1, height: StyleSheet.hairlineWidth },
});
