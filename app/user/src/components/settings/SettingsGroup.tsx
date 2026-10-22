import { Children, Fragment, isValidElement, memo, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Divider, Text } from '@/components/ui';
import { useLangStore } from '@/store/langStore';
import { radius, shadows, space, useTheme } from '@/theme';
import { ROW_PADDING, ROW_TEXT_INSET } from './SettingsRow';

export interface SettingsGroupProps {
  title?: string;
  /** Muted note rendered under the card. */
  footer?: string;
  children: ReactNode;
  /** Stagger index for the entering animation. */
  index?: number;
  /** Override the separator inset (defaults to the row text start when the row has an icon). */
  dividerInset?: number;
  style?: StyleProp<ViewStyle>;
}

function hasIcon(node: ReactNode): boolean {
  if (!isValidElement(node)) return false;
  const props = node.props as { icon?: unknown };
  return props.icon !== undefined && props.icon !== null;
}

/** iOS inset-grouped card: overline title, white radius-20 card, separators inset to the text start. */
export const SettingsGroup = memo(function SettingsGroup({
  title,
  footer,
  children,
  index = 0,
  dividerInset,
  style,
}: SettingsGroupProps) {
  const { colors, isDark } = useTheme();
  const isAr = useLangStore((s) => s.isAr);
  const items = Children.toArray(children).filter(isValidElement);

  return (
    <Animated.View entering={FadeInDown.duration(320).delay(Math.min(60 + index * 50, 300))} style={[styles.wrap, style]}>
      {title ? (
        <Text
          variant="overline"
          color="muted"
          style={[styles.title, !isAr && styles.upper]}
          accessibilityRole="header"
          numberOfLines={1}
        >
          {title}
        </Text>
      ) : null}
      <View
        style={[
          styles.shadow,
          isDark ? shadows.none : shadows.sm,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <View style={styles.clip}>
          {items.map((child, i) => (
            <Fragment key={child.key ?? i}>
              {i > 0 ? <Divider inset={dividerInset ?? (hasIcon(child) ? ROW_TEXT_INSET : ROW_PADDING)} /> : null}
              {child}
            </Fragment>
          ))}
        </View>
      </View>
      {footer ? (
        <Text variant="caption" color="muted" style={styles.footer}>
          {footer}
        </Text>
      ) : null}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  wrap: { marginBottom: space.xxl + space.xs },
  title: { marginBottom: space.sm, marginStart: ROW_PADDING },
  upper: { textTransform: 'uppercase' },
  shadow: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth },
  clip: { borderRadius: radius.lg, overflow: 'hidden' },
  footer: { marginTop: space.sm, marginHorizontal: ROW_PADDING },
});

/** Padded container for custom (non-row) content inside a SettingsGroup. */
export function SettingsBlock({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[blockStyles.block, style]}>{children}</View>;
}

const blockStyles = StyleSheet.create({
  block: { paddingHorizontal: ROW_PADDING, paddingVertical: space.lg },
});
