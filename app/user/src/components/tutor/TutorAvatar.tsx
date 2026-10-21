import { LinearGradient } from 'expo-linear-gradient';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon } from '@/components/icons';
import { gradients, palette, shadows, useTheme } from '@/theme';

interface TutorAvatarProps {
  size?: number;
  /** Show the green "online" dot at the bottom-end corner. */
  online?: boolean;
}

/** Gold gradient circle with sparkles — the AI Tutor's identity mark. */
export const TutorAvatar = memo(function TutorAvatar({ size = 44, online = false }: TutorAvatarProps) {
  const { colors } = useTheme();
  const dot = Math.max(10, Math.round(size * 0.28));
  return (
    <View style={[{ width: size, height: size }, size >= 40 && shadows.gold]} accessible={false}>
      <LinearGradient
        colors={gradients.gold}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.circle, { width: size, height: size, borderRadius: size / 2 }]}
      >
        <Icon name="sparkles" size={Math.round(size * 0.5)} color={palette.navy} strokeWidth={1.9} />
      </LinearGradient>
      {online ? (
        <View
          style={[
            styles.dot,
            {
              width: dot,
              height: dot,
              borderRadius: dot / 2,
              backgroundColor: colors.success,
              borderColor: colors.background,
            },
          ]}
        />
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', bottom: 0, end: 0, borderWidth: 2 },
});
