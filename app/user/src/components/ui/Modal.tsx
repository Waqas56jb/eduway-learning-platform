import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { directionStyle, isRTL } from '@/utils/rtl';
import { Modal as RNModal, Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Icon, type IconName } from '@/components/icons';
import { useI18n } from '@/hooks/useI18n';
import { radius, shadows, space, useTheme } from '@/theme';
import { haptic } from '@/utils/haptics';
import { Button } from './Button';
import { Text } from './Text';

export type DialogTone = 'default' | 'danger' | 'success';

export interface DialogProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  message?: string;
  icon?: IconName;
  tone?: DialogTone;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  children?: ReactNode;
  /** Shows a spinner on the primary button. */
  primaryLoading?: boolean;
  /** Force button layout; defaults to side-by-side when both labels are short. */
  buttonLayout?: 'row' | 'stack';
  /** Close when tapping the backdrop (default true). */
  dismissible?: boolean;
}

const DEFAULT_ICON: Record<DialogTone, IconName> = {
  default: 'info',
  danger: 'alert',
  success: 'check-circle',
};

/** Centered alert/confirm dialog with scale + fade entrance. */
export function Dialog({
  visible,
  onClose,
  title,
  message,
  icon,
  tone = 'default',
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  children,
  primaryLoading,
  buttonLayout,
  dismissible = true,
}: DialogProps) {
  const { colors } = useTheme();
  const { t } = useI18n('common');
  const [mounted, setMounted] = useState(visible);
  const progress = useSharedValue(0);
  const scale = useSharedValue(0.9);

  const unmount = useCallback(() => setMounted(false), []);

  useEffect(() => {
    if (visible) setMounted(true);
  }, [visible]);

  useEffect(() => {
    if (!mounted) return;
    if (visible) {
      scale.value = 0.9;
      progress.value = withTiming(1, { duration: 200 });
      scale.value = withSpring(1, { damping: 16, stiffness: 260, mass: 0.8 });
      if (tone === 'danger') haptic.warning();
      else if (tone === 'success') haptic.success();
    } else {
      scale.value = withTiming(0.94, { duration: 160 });
      progress.value = withTiming(0, { duration: 160, easing: Easing.in(Easing.quad) }, (done) => {
        if (done) scheduleOnRN(unmount);
      });
    }
  }, [visible, mounted, tone, progress, scale, unmount]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const cardStyle = useAnimatedStyle(() => ({ opacity: progress.value, transform: [{ scale: scale.value }] }));

  if (!mounted) return null;

  const toneColor = tone === 'danger' ? colors.danger : tone === 'success' ? colors.success : colors.accent;
  const toneSoft = tone === 'danger' ? colors.dangerSoft : tone === 'success' ? colors.successSoft : colors.accentSoft;
  const layout = buttonLayout ?? (secondaryLabel && primaryLabel.length + secondaryLabel.length <= 22 ? 'row' : 'stack');
  const handleSecondary = onSecondary ?? onClose;

  const primary = (
    <Button
      title={primaryLabel}
      onPress={onPrimary}
      variant={tone === 'danger' ? 'danger' : 'primary'}
      size="lg"
      fullWidth
      loading={primaryLoading}
      style={layout === 'row' ? styles.rowBtn : undefined}
    />
  );
  const secondary = secondaryLabel ? (
    <Button
      title={secondaryLabel}
      onPress={handleSecondary}
      variant={layout === 'row' ? 'outline' : 'ghost'}
      size="lg"
      fullWidth
      style={layout === 'row' ? styles.rowBtn : undefined}
    />
  ) : null;

  return (
    <RNModal visible={mounted} transparent statusBarTranslucent navigationBarTranslucent animationType="none" onRequestClose={onClose}>
      <View style={[styles.root, directionStyle(isRTL())]}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }, backdropStyle]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={dismissible ? onClose : undefined}
            accessibilityRole="button"
            accessibilityLabel={t('common:a11y.close')}
          />
        </Animated.View>
        <Animated.View
          accessibilityViewIsModal
          accessibilityRole="alert"
          style={[styles.card, shadows.lg, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }, cardStyle]}
        >
          <View style={[styles.iconCircle, { backgroundColor: toneSoft }]}>
            <View style={[styles.iconInner, { borderColor: toneColor }]}>
              <Icon name={icon ?? DEFAULT_ICON[tone]} size={28} color={toneColor} />
            </View>
          </View>
          <Text variant="h3" align="center" accessibilityRole="header" style={styles.title}>
            {title}
          </Text>
          {message ? (
            <Text variant="body" color="muted" align="center" style={styles.message}>
              {message}
            </Text>
          ) : null}
          {children ? <View style={styles.children}>{children}</View> : null}
          {layout === 'row' ? (
            <View style={styles.row}>
              {secondary}
              {primary}
            </View>
          ) : (
            <View style={styles.stack}>
              {primary}
              {secondary}
            </View>
          )}
        </Animated.View>
      </View>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  card: {
    width: '100%',
    maxWidth: 400,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.xxl,
    paddingTop: space.xxl + 4,
    paddingBottom: space.xl,
    alignItems: 'center',
  },
  iconCircle: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: space.lg },
  iconInner: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { marginBottom: space.xs },
  message: { marginTop: space.xs },
  children: { alignSelf: 'stretch', marginTop: space.lg },
  row: { flexDirection: 'row', gap: space.md, alignSelf: 'stretch', marginTop: space.xxl },
  rowBtn: { flex: 1 },
  stack: { alignSelf: 'stretch', gap: space.sm, marginTop: space.xxl },
});
