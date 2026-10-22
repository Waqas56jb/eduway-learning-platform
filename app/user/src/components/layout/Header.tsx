import { memo, useCallback, useState, type ReactNode } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { router } from 'expo-router';
import { IconButton, Text } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { SCREEN_PADDING, palette, space, useTheme } from '@/theme';

export interface HeaderProps {
  title?: string;
  subtitle?: string;
  /** Show the back button. Defaults to true. */
  back?: boolean;
  /** Custom back handler; defaults to router.back() (or home when there is no history). */
  onBack?: () => void;
  /** Right (end) slot, e.g. IconButtons. */
  right?: ReactNode;
  /** Transparent background with glass back button — for headers over images/gradients. */
  transparent?: boolean;
  /**
   * Large-title variant (tab roots): display-face title (Playfair / Tajawal heavy). Without a back
   * button the title shares one row with the `right` actions; with a back button it sits below the row.
   */
  large?: boolean;
  /** Title / icon color override. */
  tint?: string;
  /** Title alignment in the compact row. Defaults to 'center'. */
  align?: 'center' | 'start';
  style?: StyleProp<ViewStyle>;
}

const ROW_HEIGHT = 56;
const SIDE_SLOT = 44;

export function goBackOrHome() {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)/home');
}

/**
 * Screen header: 56pt row with a 44pt circular RTL-mirrored back button, title + subtitle and an end slot.
 * In the centered layout both side slots get the SAME width (the wider of the two contents), so the
 * title is optically centered on the screen no matter how many actions sit on the end side.
 */
export const Header = memo(function Header({
  title,
  subtitle,
  back = true,
  onBack,
  right,
  transparent = false,
  large = false,
  tint,
  align = 'center',
  style,
}: HeaderProps) {
  const { colors } = useTheme();
  const { t } = useI18n('common');
  const titleColor = tint ?? (transparent ? palette.white : colors.ink);
  const subColor = transparent ? 'rgba(255,255,255,0.78)' : colors.muted;
  const centered = align === 'center' && !large;

  const [rightW, setRightW] = useState(0);
  const onRightLayout = useCallback((e: LayoutChangeEvent) => {
    const w = Math.ceil(e.nativeEvent.layout.width);
    setRightW((prev) => (prev === w ? prev : w));
  }, []);
  const sideW = Math.max(SIDE_SLOT, rightW);

  const backButton = back ? (
    <IconButton
      icon="back"
      variant={transparent ? 'glass' : 'surface'}
      color={tint}
      onPress={onBack ?? goBackOrHome}
      accessibilityLabel={t('a11y.back')}
    />
  ) : null;

  const rightContent = right ? (
    <View style={styles.rightInline} onLayout={centered ? onRightLayout : undefined}>
      {right}
    </View>
  ) : null;

  // Large title on a tab root (no back button): title + actions share one row.
  if (large && !back) {
    return (
      <View style={[styles.container, { backgroundColor: transparent ? 'transparent' : colors.background }, style]}>
        <View style={styles.largeRow}>
          <View style={styles.flex}>
            {title ? (
              <Text
                variant="display"
                color={titleColor}
                accessibilityRole="header"
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
              >
                {title}
              </Text>
            ) : null}
            {subtitle ? (
              <Text variant="body" color={subColor} numberOfLines={2} style={styles.largeSub}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          {rightContent}
        </View>
      </View>
    );
  }

  const titleBlock =
    !large && (title || subtitle) ? (
      <View style={[styles.titleWrap, centered ? styles.titleCenter : styles.titleStart]}>
        {title ? (
          <Text
            variant="h3"
            color={titleColor}
            align={centered ? 'center' : 'start'}
            numberOfLines={1}
            accessibilityRole="header"
            maxFontSizeMultiplier={1.2}
          >
            {title}
          </Text>
        ) : null}
        {subtitle ? (
          <Text variant="caption" color={subColor} align={centered ? 'center' : 'start'} numberOfLines={1} maxFontSizeMultiplier={1.2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    ) : (
      <View style={styles.flex} />
    );

  return (
    <View style={[styles.container, { backgroundColor: transparent ? 'transparent' : colors.background }, style]}>
      <View style={styles.row}>
        {centered ? (
          <>
            <View style={[styles.side, { width: sideW }]}>{backButton}</View>
            {titleBlock}
            <View style={[styles.side, styles.sideEnd, { width: sideW }]}>{rightContent}</View>
          </>
        ) : (
          <>
            {backButton}
            {titleBlock}
            {rightContent}
          </>
        )}
      </View>
      {large && (title || subtitle) ? (
        <View style={styles.large}>
          {title ? (
            <Text variant="display" color={titleColor} accessibilityRole="header" numberOfLines={2}>
              {title}
            </Text>
          ) : null}
          {subtitle ? (
            <Text variant="body" color={subColor} style={styles.largeSub}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { paddingHorizontal: SCREEN_PADDING },
  row: { height: ROW_HEIGHT, flexDirection: 'row', alignItems: 'center', gap: space.md },
  side: { flexDirection: 'row', alignItems: 'center' },
  sideEnd: { justifyContent: 'flex-end' },
  rightInline: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  titleWrap: { flex: 1, justifyContent: 'center' },
  titleCenter: { alignItems: 'center' },
  titleStart: { alignItems: 'flex-start' },
  largeRow: {
    minHeight: ROW_HEIGHT + space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingTop: space.sm,
    paddingBottom: space.md,
  },
  large: { paddingTop: space.xs, paddingBottom: space.md },
  largeSub: { marginTop: space.xs },
});
