import { memo, useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { BLURHASH } from '@/constants/images';
import { useLangStore } from '@/store/langStore';
import { fontFor, gradients, palette, useTheme } from '@/theme';
import { Text } from './Text';

export interface AvatarProps {
  uri?: string;
  name?: string;
  size?: number;
  /** Gold gradient ring around the avatar. */
  ring?: boolean;
  style?: StyleProp<ViewStyle>;
}

function initialsOf(name?: string): string {
  if (!name) return '';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

/** Round user avatar: photo, or elegant initials on navy. */
export const Avatar = memo(function Avatar({ uri, name, size = 44, ring = false, style }: AvatarProps) {
  const { colors } = useTheme();
  const isAr = useLangStore((s) => s.isAr);
  const initials = useMemo(() => initialsOf(name), [name]);
  const ringWidth = ring ? Math.max(2, Math.round(size * 0.05)) : 0;
  const gap = ring ? Math.max(2, Math.round(size * 0.04)) : 0;
  const inner = size - (ringWidth + gap) * 2;

  const content = uri ? (
    <Image
      source={{ uri }}
      placeholder={{ blurhash: BLURHASH }}
      transition={300}
      contentFit="cover"
      cachePolicy="memory-disk"
      style={{ width: inner, height: inner, borderRadius: inner / 2 }}
      accessibilityIgnoresInvertColors
    />
  ) : (
    <View style={[styles.center, { width: inner, height: inner, borderRadius: inner / 2, overflow: 'hidden' }]}>
      <LinearGradient colors={gradients.navy} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <Text
        color={palette.goldLight}
        align="center"
        style={{
          fontFamily: fontFor(isAr ? 'bold' : 'display', isAr),
          fontSize: Math.round(inner * 0.38),
          lineHeight: Math.round(inner * 0.5),
        }}
        allowFontScaling={false}
      >
        {initials}
      </Text>
    </View>
  );

  return (
    <View
      style={[styles.center, { width: size, height: size, borderRadius: size / 2 }, style]}
      accessibilityRole="image"
      accessibilityLabel={name}
    >
      {ring ? (
        <>
          <LinearGradient
            colors={gradients.gold}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[StyleSheet.absoluteFill, { borderRadius: size / 2 }]}
          />
          <View
            style={[
              styles.center,
              {
                width: size - ringWidth * 2,
                height: size - ringWidth * 2,
                borderRadius: (size - ringWidth * 2) / 2,
                backgroundColor: colors.background,
              },
            ]}
          >
            {content}
          </View>
        </>
      ) : (
        content
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
});
