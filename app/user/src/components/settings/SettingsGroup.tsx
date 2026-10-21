import { Children, Fragment, isValidElement, memo, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Card, Divider, Text } from '@/components/ui';
import { space } from '@/theme';

export interface SettingsGroupProps {
  title?: string;
  /** Muted note rendered under the card. */
  footer?: string;
  children: ReactNode;
  /** Stagger index for the entering animation. */
  index?: number;
  style?: StyleProp<ViewStyle>;
}

/** A titled card that groups ListRows with hairline dividers between them. */
export const SettingsGroup = memo(function SettingsGroup({ title, footer, children, index = 0, style }: SettingsGroupProps) {
  const items = Children.toArray(children).filter(isValidElement);
  return (
    <Animated.View entering={FadeInDown.duration(280).delay(80 + index * 50)} style={[styles.wrap, style]}>
      {title ? (
        <Text variant="overline" color="muted" style={styles.title} accessibilityRole="header">
          {title}
        </Text>
      ) : null}
      <Card padded={false} style={styles.card}>
        {items.map((child, i) => (
          <Fragment key={child.key ?? i}>
            {i > 0 ? <Divider /> : null}
            {child}
          </Fragment>
        ))}
      </Card>
      {footer ? (
        <Text variant="caption" color="muted" style={styles.footer}>
          {footer}
        </Text>
      ) : null}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  wrap: { marginBottom: space.xxl },
  title: { marginBottom: space.sm, marginStart: space.xs, textTransform: 'uppercase' },
  card: { overflow: 'hidden' },
  footer: { marginTop: space.sm, marginHorizontal: space.xs },
});

/** Padded container for custom (non-ListRow) content inside a SettingsGroup. */
export function SettingsBlock({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ padding: space.lg }, style]}>{children}</View>;
}
