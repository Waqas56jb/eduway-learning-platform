import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { memo, useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { Icon } from '@/components/icons';
import { Avatar, IconButton, PressableScale, Text } from '@/components/ui';
import { BLURHASH, images } from '@/constants/images';
import { useAuthStore } from '@/store/authStore';
import { useI18n } from '@/hooks/useI18n';
import type { User } from '@/types';
import { gradients, palette, radius, SCREEN_PADDING, space } from '@/theme';
import { haptic } from '@/utils/haptics';

export interface ProfileHeaderProps {
  user: User;
  /** Extra bottom padding so a floating card can overlap the hero. */
  overlap?: number;
}

const AVATAR_SIZE = 104;

/** Small camera glyph for the avatar badge (not part of the icon set). */
function CameraGlyph({ size = 15, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.8l1.3-1.9A1.5 1.5 0 0 1 9.8 3.5h4.4a1.5 1.5 0 0 1 1.2.6L16.7 6h1.8A2.5 2.5 0 0 1 21 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5v-9Z"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <Circle cx={12} cy={13} r={3.6} stroke={color} strokeWidth={2} />
    </Svg>
  );
}

/** Soft radial gold glow drawn with SVG (no hard circle edges). */
function Glow({ size, opacity, style }: { size: number; opacity: number; style: object }) {
  const id = `glow${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <View pointerEvents="none" style={[{ position: 'absolute', width: size, height: size }, style]}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={palette.gold} stopOpacity={opacity} />
            <Stop offset="1" stopColor={palette.gold} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={size} height={size} fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/** Navy hero on the Profile tab: centered ringed avatar with camera badge, display name, contact line and package pill. */
export const ProfileHeader = memo(function ProfileHeader({ user, overlap = 52 }: ProfileHeaderProps) {
  const { t, L } = useI18n('settings');
  const insets = useSafeAreaInsets();
  const subscription = useAuthStore((s) => s.me?.subscription);
  const pkg = subscription && (subscription.status === 'active' || subscription.status === 'trial') ? subscription.package : null;
  const governorate = L(user.governorateName);
  const name = L(user.name);

  return (
    <View style={styles.root}>
      <LinearGradient colors={gradients.navy} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      {/* Soft HD texture + glows — purely decorative */}
      <Image
        source={{ uri: images.onboardingLibrary }}
        placeholder={{ blurhash: BLURHASH }}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={400}
        style={[StyleSheet.absoluteFill, styles.texture]}
        pointerEvents="none"
        accessible={false}
      />
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(11,31,58,0.35)', 'rgba(11,31,58,0.75)', 'rgba(7,20,38,0.96)']}
        style={StyleSheet.absoluteFill}
      />
      <Glow size={300} opacity={0.28} style={styles.glowTop} />
      <Glow size={220} opacity={0.14} style={styles.glowBottom} />

      <View style={[styles.content, { paddingTop: insets.top + space.sm, paddingBottom: overlap + space.xl }]}>
        <View style={styles.topRow}>
          <Text variant="h3" color={palette.white} accessibilityRole="header" numberOfLines={1} style={styles.flex}>
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
            hitSlop={8}
          >
            <View style={styles.avatarHalo}>
              <Avatar uri={user.avatar} name={name} size={AVATAR_SIZE} ring />
            </View>
            <View style={styles.camBadge}>
              <CameraGlyph color={palette.navy} />
            </View>
          </PressableScale>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(350).delay(60)} style={styles.center}>
          <Text variant="h1" display color={palette.white} align="center" numberOfLines={2} style={styles.name}>
            {name}
          </Text>

          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Icon name="phone" size={13} color={palette.goldLight} />
              <Text variant="label" color="rgba(255,255,255,0.86)" tabular style={styles.ltr} numberOfLines={1}>
                {`⁦${user.mobile}⁩`}
              </Text>
            </View>
            {governorate ? (
              <>
                <View style={styles.dot} />
                <View style={styles.metaItem}>
                  <Icon name="map-pin" size={13} color={palette.goldLight} />
                  <Text variant="label" color="rgba(255,255,255,0.86)" numberOfLines={1}>
                    {governorate}
                  </Text>
                </View>
              </>
            ) : null}
          </View>

          <PressableScale
            onPress={() => {
              haptic.light();
              router.push('/subscription');
            }}
            haptics={false}
            accessibilityRole="button"
            accessibilityLabel={pkg ? `${L(pkg.name)} · ${t('profile.menu.subscriptionSub', { count: user.daysRemaining })}` : t('profile.noPackage')}
            style={styles.pill}
          >
            <LinearGradient
              colors={['rgba(230,199,122,0.26)', 'rgba(201,162,74,0.12)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[StyleSheet.absoluteFill, styles.pillBg]}
              pointerEvents="none"
            />
            <Icon name="crown" size={14} color={palette.goldLight} filled />
            <Text variant="label" color={palette.goldLight} numberOfLines={1} style={styles.pillText}>
              {pkg ? L(pkg.name) : t('profile.noPackage')}
            </Text>
            {pkg ? (
              <>
                <View style={styles.pillDivider} />
                <Text variant="caption" color="rgba(255,255,255,0.8)" numberOfLines={1} tabular>
                  {t('profile.daysLeft', { count: user.daysRemaining })}
                </Text>
              </>
            ) : null}
          </PressableScale>
        </Animated.View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    borderBottomStartRadius: radius.xl + 4,
    borderBottomEndRadius: radius.xl + 4,
    overflow: 'hidden',
    backgroundColor: palette.navy,
  },
  texture: { opacity: 0.22 },
  glowTop: { top: -130, end: -110 },
  glowBottom: { bottom: -90, start: -90 },
  content: { paddingHorizontal: SCREEN_PADDING },
  flex: { flex: 1 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48, marginBottom: space.md },
  center: { alignItems: 'center', alignSelf: 'stretch' },
  avatarWrap: { marginBottom: space.lg },
  avatarHalo: {
    borderRadius: AVATAR_SIZE / 2,
    shadowColor: palette.gold,
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
  },
  camBadge: {
    position: 'absolute',
    bottom: 2,
    end: 2,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: palette.goldLight,
    borderWidth: 3,
    borderColor: palette.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { marginBottom: space.sm, maxWidth: '100%' },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    columnGap: space.sm,
    rowGap: space.xs,
    marginBottom: space.lg,
  },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 1 },
  ltr: { writingDirection: 'ltr' },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'rgba(230,199,122,0.6)' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 36,
    maxWidth: '100%',
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(230,199,122,0.55)',
  },
  pillBg: { borderRadius: radius.pill },
  pillText: { flexShrink: 1 },
  pillDivider: { width: StyleSheet.hairlineWidth, height: 14, backgroundColor: 'rgba(230,199,122,0.55)' },
});
