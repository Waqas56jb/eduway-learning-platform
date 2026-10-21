import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export type TestNotificationResult = 'scheduled' | 'denied' | 'failed';

/** Ask for permission (if needed) and schedule a local notification `seconds` from now. */
export async function sendTestNotification(title: string, body: string, seconds = 2): Promise<TestNotificationResult> {
  try {
    let { granted } = await Notifications.getPermissionsAsync();
    if (!granted) {
      ({ granted } = await Notifications.requestPermissionsAsync());
    }
    if (!granted) return 'denied';

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'EDUWAY',
        importance: Notifications.AndroidImportance.HIGH,
        lightColor: '#C9A24A',
      });
    }

    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: true, data: { link: '/notifications' } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds, channelId: 'default' },
    });
    return 'scheduled';
  } catch {
    return 'failed';
  }
}
