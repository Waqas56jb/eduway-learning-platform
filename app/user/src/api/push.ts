import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import { CLIENT_PLATFORM } from './config';
import { del, post } from './client';
import { getDeviceId } from './session';
import type { OkDto } from './types';

let registeredToken: string | null = null;

/**
 * ME-07: ask for permission and register the Expo push token. Guarded for Expo Go / simulators / missing
 * EAS projectId — any failure is silent (push is a progressive enhancement).
 */
export async function registerPushToken(): Promise<void> {
  try {
    if (Platform.OS === 'web') return;
    const current = await Notifications.getPermissionsAsync();
    let granted = current.granted;
    if (!granted && current.canAskAgain) granted = (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) return;
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'EDUWAY',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    const projectId =
      (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
      Constants.easConfig?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    if (!token || token === registeredToken) return;
    await post<OkDto>('/me/push-token', { token, provider: 'expo', platform: CLIENT_PLATFORM, deviceId: getDeviceId() });
    registeredToken = token;
  } catch {
    // Expo Go without a projectId, simulator, or network error — skip silently.
  }
}

/** ME-08 — called on logout (before the session is revoked). */
export async function unregisterPushToken(): Promise<void> {
  const token = registeredToken;
  registeredToken = null;
  if (!token) return;
  try {
    await del<OkDto>('/me/push-token', { token });
  } catch {
    // ignore
  }
}

const ALLOWED_PREFIXES = ['/lesson/', '/subject/', '/exams', '/mistakes', '/subscription', '/notifications', '/progress', '/tutor', '/quiz/'];

/** Open the canonical app route carried by a notification (`AppNotification.link` / push `data.link`). */
export function openNotificationLink(link: string | null | undefined): boolean {
  if (!link || !ALLOWED_PREFIXES.some((p) => link.startsWith(p))) return false;
  const href = link === '/tutor' ? '/(tabs)/tutor' : link;
  router.push(href as never);
  return true;
}

/** Route taps on push notifications. Returns the unsubscribe function. */
export function listenForPushTaps(): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
    const data = resp.notification.request.content.data as { link?: string } | undefined;
    openNotificationLink(data?.link);
  });
  return () => sub.remove();
}
