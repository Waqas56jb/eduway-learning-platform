import { Stack } from 'expo-router';
import { useTheme } from '@/theme';

export default function SplashLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        gestureEnabled: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}
