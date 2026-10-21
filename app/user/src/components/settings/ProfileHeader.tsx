import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/icons';
import { Avatar, Badge, IconButton, PressableScale, Text } from '@/components/ui';
import { getGovernorate, getPackage } from '@/data';
import { useI18n } from '@/hooks/useI18n';
import type { User } from '@/types';
import { gradients, palette, radius, SCREEN_PADDING, space } from '@/theme';

export interface ProfileHeaderProps {
  user: User;
}

const AVATAR_SIZE = 104;

/** Navy hero on the Profile tab: avatar with edit badge, name, contact line, plan badge and progress link. */
export const ProfileHeader = memo(function ProfileHeader({ user }: ProfileHeaderProps) {
  const { t, L } = useI18n('settings');
  const insets = useSafeAreaInsets();
  const pkg = getPackage(user.packageId);
  const governorate = L(getGovernorate(user.governorate)?.name);
  const school = L(user.school);
  const place = [governorate, school].filter(Boolean).join('  •  ');

  return (
    <LinearGradient
      colors={gradients.navy}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.root, { paddingTop: insets.top + space.md }]}
    >
      {/* Decorative gold glow */}
      <View pointerEvents="none" style={styles.glow} />
      <View pointerEvents="none" style={styles.glowSmall} />

      <View style={styles.topRow}>
        <Text variant="h3" color={palette.white} accessibilityRole="header">
          {t('profile.title')}
        </Text>
        <IconButton
          icon="settings"
          variant="glass"
          color={palette.white}
          onPress={() => router.push('/settings')}
          accessibilityLabel={t('profile.menu.settings')}
        />
      </View>

      <Animated.View entering={FadeIn.duration(350)} style={styles.center}>
        <PressableScale
          onPress={() => router.push('/settings/edit-profile')}
          accessibilityRole="button"
          accessibilityLabel={t('profile.editPhoto')}
          style={styles.avatarWrap}
        >
          <Avatar uri={user.avatar} name={L(user.name)} size={AVATAR_SIZE} ring />
          <View style={styles.editBadge}>
            <Icon name="edit" size={15} color={palette.navy} strokeWidth={2.2} />
          </View>
        </PressableScale>

        <Animated.View entering={FadeInDown.duration(300).delay(80)} style={styles.center}>
          <Text variant="h1" display color={palette.white} align="center" numberOfLines={2} style={styles.name}>
            {L(user.name)}
          </Text>
          <Text variant="bodyMedium" color={palette.goldLight} align="center" style={styles.mobile} tabular>
            {`⁦${user.mobile}⁩`}
          </Text>
          {place ? (
            <View style={styles.placeRow}>
              <Icon name="map-pin" size={14} color="rgba(255,255,255,0.7)" />
              <Text variant="caption" color="rgba(255,255,255,0.75)" align="center" numberOfLines={2} style={styles.placeText}>
                {place}
              </Text>
            </View>
          ) : null}
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(300).delay(140)} style={styles.actions}>
          <Badge label={pkg ? L(pkg.name) : t('profile.noPackage')} tone="gold" icon="crown" size="md" />
          <PressableScale
            onPress={() => router.push('/progress')}
            accessibilityRole="button"
            accessibilityLabel={t('profile.viewProgress')}
            style={styles.progressLink}
          >
            <Icon name="chart" size={15} color={palette.goldLight} />
            <Text variant="label" color={palette.goldLight}>
              {t('profile.viewProgress')}
            </Text>
            <Icon name="chevron" size={14} color={palette.goldLight} />
          </PressableScale>
        </Animated.View>
      </Animated.View>
    </LinearGradient>
  );
});

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: SCREEN_PADDING,
    paddingBottom: 64,
    borderBottomStartRadius: radius.xl,
    borderBottomEndRadius: radius.xl,
    overflow: 'hidden',
  },
  glow: {
    position: 'absolute',
    top: -80,
    end: -60,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: 'rgba(201,162,74,0.16)',
  },
  glowSmall: {
    position: 'absolute',
    bottom: -50,
    start: -40,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(201,162,74,0.08)',
  },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.sm },
  center: { alignItems: 'center' },
  avatarWrap: { marginBottom: space.lg },
  editBadge: {
    position: 'absolute',
    bottom: 2,
    end: 2,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: palette.gold,
    borderWidth: 3,
    borderColor: palette.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { marginBottom: space.xs },
  mobile: { writingDirection: 'ltr', marginBottom: space.xs },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: space.lg },
  placeText: { flexShrink: 1 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.lg, flexWrap: 'wrap', justifyContent: 'center' },
  progressLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.md,
    minHeight: 32,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(230,199,122,0.5)',
    backgroundColor: 'rgba(201,162,74,0.12)',
  },
});
