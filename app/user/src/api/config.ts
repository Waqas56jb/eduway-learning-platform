import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Base URL of the EDUWAY API (`/api/v1`).
 * A physical phone cannot reach `localhost` on your computer: set `EXPO_PUBLIC_API_URL` in `app/user/.env`
 * to your computer's LAN IP (e.g. `http://192.168.1.20:4100/api/v1`) or a tunnel URL, then restart Expo.
 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4100/api/v1').replace(/\/+$/, '');

/** Semver of this build, sent as `X-App-Version` (force-update checks). */
export const APP_VERSION: string = Constants.expoConfig?.version ?? '1.0.0';

/** `X-Client-Platform` value. */
export const CLIENT_PLATFORM: 'ios' | 'android' = Platform.OS === 'android' ? 'android' : 'ios';

/** Human readable device name for the sessions list (verify-otp `deviceName`). */
export const DEVICE_NAME: string = Constants.deviceName ?? (Platform.OS === 'ios' ? 'iPhone' : 'Android');

/** True when running inside Expo Go (remote push tokens are limited there). */
export const IS_EXPO_GO = Constants.executionEnvironment === 'storeClient';

/** Default request timeout (ms). */
export const REQUEST_TIMEOUT_MS = 20_000;
