import { memo, useCallback } from 'react';
import { isRTL } from '@/utils/rtl';
import { StyleSheet, View } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, {
  FadeInDown,
  FadeOut,
  interpolate,
  LinearTransition,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import { Icon, type IconName } from '@/components/icons';
import { PressableScale, Text } from '@/components/ui';
import { useI18n } from '@/hooks/useI18n';
import { radius, space, useTheme, type ThemeColors } from '@/theme';
import type { AppNotification, NotificationType } from '@/types';
import { timeAgo } from '@/utils/format';
import { haptic } from '@/utils/haptics';

const ACTION_WIDTH = 88;

export function notificationVisual(type: NotificationType, colors: ThemeColors): { icon: IconName; color: string } {
  switch (type) {
    case 'lesson':
      return { icon: 'video', color: colors.info };
    case 'exam':
      return { icon: 'exam', color: '#7C3AED' };
    case 'payment':
      return { icon: 'receipt', color: colors.success };
    case 'subscription':
      return { icon: 'crown', color: colors.accent };
    case 'system':
    default:
      return { icon: 'chart', color: '#0D9488' };
  }
}

interface DeleteActionProps {
  progress: SharedValue<number>;
  label: string;
  onPress: () => void;
  color: string;
}

function DeleteAction({ progress, label, onPress, color }: DeleteActionProps) {
  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(progress.value, [0, 1], [0.6, 1], 'clamp') }],
    opacity: interpolate(progress.value, [0, 0.6, 1], [0, 0.6, 1], 'clamp'),
  }));
  return (
    <View style={styles.actionWrap}>
      <PressableScale
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        scaleTo={0.94}
        style={[styles.action, { backgroundColor: color }]}
      >
        <Animated.View style={[styles.actionInner, iconStyle]}>
          <Icon name="trash" size={22} color="#FFFFFF" />
          <Text variant="caption" color="#FFFFFF" numberOfLines={1}>
            {label}
          </Text>
        </Animated.View>
      </PressableScale>
    </View>
  );
}

interface NotificationRowProps {
  item: AppNotification;
  index: number;
  onPress: (item: AppNotification) => void;
  onDelete: (item: AppNotification) => void;
}

/** Swipe-to-delete notification row (delete action revealed on the trailing edge, RTL aware). */
export const NotificationRow = memo(function NotificationRow({ item, index, onPress, onDelete }: NotificationRowProps) {
  const { colors } = useTheme();
  const { t, L, lang } = useI18n('notifications');
  const visual = notificationVisual(item.type, colors);
  const rtl = isRTL();
  const unread = !item.read;

  const renderAction = useCallback(
    (progress: SharedValue<number>, _translation: SharedValue<number>, methods: SwipeableMethods) => (
      <DeleteAction
        progress={progress}
        label={t('delete')}
        color={colors.danger}
        onPress={() => {
          methods.close();
          onDelete(item);
        }}
      />
    ),
    [t, colors.danger, onDelete, item],
  );

  return (
    <Animated.View
      entering={FadeInDown.duration(280).delay(Math.min(index, 10) * 45)}
      exiting={FadeOut.duration(180)}
      layout={LinearTransition.duration(220)}
      style={styles.outer}
    >
      <ReanimatedSwipeable
        friction={1.6}
        overshootLeft={false}
        overshootRight={false}
        rightThreshold={ACTION_WIDTH / 2}
        leftThreshold={ACTION_WIDTH / 2}
        dragOffsetFromLeftEdge={12}
        dragOffsetFromRightEdge={12}
        renderRightActions={rtl ? undefined : renderAction}
        renderLeftActions={rtl ? renderAction : undefined}
        containerStyle={styles.swipeContainer}
      >
        <PressableScale
          scaleTo={0.985}
          haptics={false}
          onPress={() => {
            haptic.selection();
            onPress(item);
          }}
          accessibilityRole="button"
          accessibilityLabel={`${unread ? `${t('unreadA11y')}, ` : ''}${L(item.title)}. ${L(item.body)}`}
          accessibilityHint={t('swipeHint')}
          style={[
            styles.row,
            {
              backgroundColor: unread ? colors.surfaceElevated : colors.surface,
              borderColor: unread ? colors.accentSoft : colors.border,
            },
          ]}
        >
          <View style={[styles.iconTile, { backgroundColor: `${visual.color}1A`, borderColor: `${visual.color}33` }]}>
            <Icon name={visual.icon} size={20} color={visual.color} />
          </View>
          <View style={styles.texts}>
            <View style={styles.titleRow}>
              <Text variant={unread ? 'bodyBold' : 'bodyMedium'} style={styles.title} numberOfLines={1}>
                {L(item.title)}
              </Text>
              <Text variant="caption" color={unread ? 'accent' : 'muted'} numberOfLines={1}>
                {timeAgo(item.date, lang)}
              </Text>
              <View style={[styles.dot, { backgroundColor: unread ? colors.accent : 'transparent' }]} />
            </View>
            <Text variant="body" color="muted" numberOfLines={2}>
              {L(item.body)}
            </Text>
          </View>
        </PressableScale>
      </ReanimatedSwipeable>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  outer: { marginBottom: space.sm + 2 },
  swipeContainer: { borderRadius: radius.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    paddingVertical: space.lg - 2,
    paddingHorizontal: space.lg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 80,
  },
  iconTile: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: { flex: 1, minWidth: 0, gap: 3 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 22 },
  title: { flex: 1, minWidth: 0 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  actionWrap: { width: ACTION_WIDTH + space.sm, paddingStart: space.sm },
  action: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: radius.lg },
  actionInner: { alignItems: 'center', gap: 4 },
});
