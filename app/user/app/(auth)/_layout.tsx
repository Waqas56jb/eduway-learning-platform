import { I18nManager, Platform } from 'react-native';
import { Stack } from 'expo-router';
import { useTheme } from '@/theme';

const PUSH_ANIMATION = Platform.OS === 'android' ? (I18nManager.isRTL ? 'ios_from_left' : 'ios_from_right') : 'default';

export default function AuthLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: PUSH_ANIMATION,
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}
