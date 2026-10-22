import * as SecureStore from 'expo-secure-store';
import type { AuthTokens } from './types';

/**
 * Secure persistence for the auth tokens and the per-install device id (expo-secure-store),
 * with an in-memory cache so request interceptors never wait on the keychain.
 */
const ACCESS_KEY = 'eduway.accessToken';
const REFRESH_KEY = 'eduway.refreshToken';
const DEVICE_KEY = 'eduway.deviceId';

let access: string | null = null;
let refresh: string | null = null;
let deviceId: string | null = null;
let loaded: Promise<void> | null = null;

function uuidv4(): string {
  const hex = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) out += '-';
    else if (i === 14) out += '4';
    else if (i === 19) out += hex[(Math.random() * 4) | 8];
    else out += hex[(Math.random() * 16) | 0];
  }
  return out;
}

async function safeGet(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function safeSet(key: string, value: string | null): Promise<void> {
  try {
    if (value === null) await SecureStore.deleteItemAsync(key);
    else await SecureStore.setItemAsync(key, value);
  } catch {
    // keychain unavailable — the in-memory copy still works for this run
  }
}

/** Load tokens + device id from secure storage once (idempotent). */
export function loadSession(): Promise<void> {
  if (!loaded) {
    loaded = (async () => {
      const [a, r, d] = await Promise.all([safeGet(ACCESS_KEY), safeGet(REFRESH_KEY), safeGet(DEVICE_KEY)]);
      access = a;
      refresh = r;
      deviceId = d;
      if (!deviceId) {
        deviceId = uuidv4();
        await safeSet(DEVICE_KEY, deviceId);
      }
    })();
  }
  return loaded;
}

export const getAccessToken = () => access;
export const getRefreshToken = () => refresh;
export const hasSession = () => !!refresh;

/** Stable per-install id (`X-Device-Id`). */
export function getDeviceId(): string {
  if (!deviceId) deviceId = uuidv4();
  return deviceId;
}

export async function setTokens(tokens: Pick<AuthTokens, 'accessToken' | 'refreshToken'>): Promise<void> {
  access = tokens.accessToken;
  refresh = tokens.refreshToken;
  await Promise.all([safeSet(ACCESS_KEY, access), safeSet(REFRESH_KEY, refresh)]);
}

export async function clearTokens(): Promise<void> {
  access = null;
  refresh = null;
  await Promise.all([safeSet(ACCESS_KEY, null), safeSet(REFRESH_KEY, null)]);
}

/** Short random id for `X-Request-Id`. */
export const newRequestId = () => uuidv4();
