import { Redirect } from 'expo-router';
import { useAuthStore, usePrefsStore } from '@/store';

/**
 * Entry gate. The root layout only renders once fonts, language and persisted stores are ready,
 * so these values are already hydrated here.
 */
export default function Index() {
  const onboardingSeen = usePrefsStore((s) => s.onboardingSeen);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (!onboardingSeen) return <Redirect href="/(splash)/splash-1" />;
  if (!isAuthenticated) return <Redirect href="/(auth)/welcome" />;
  return <Redirect href="/(tabs)/home" />;
}
