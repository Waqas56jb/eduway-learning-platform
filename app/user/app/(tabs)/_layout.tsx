import { Tabs } from 'expo-router/js-tabs';
import { TabBar } from '@/components/layout';
import { useTheme } from '@/theme';

export default function TabsLayout() {
  const { colors } = useTheme();
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        headerShown: false,
        lazy: true,
        tabBarHideOnKeyboard: true,
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen name="home" />
      <Tabs.Screen name="subjects" />
      <Tabs.Screen name="practice" />
      <Tabs.Screen name="tutor" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
