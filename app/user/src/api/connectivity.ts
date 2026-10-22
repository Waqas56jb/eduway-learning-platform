import { AppState } from 'react-native';
import { create } from 'zustand';
import { API_URL } from './config';

/**
 * Connectivity without a native NetInfo module (not bundled in this Expo Go setup):
 * a request that fails with no response marks the app offline; while offline we probe `/health`
 * every few seconds and on foreground, and any successful response marks it online again.
 */
interface ConnectivityState {
  online: boolean;
}

export const useConnectivity = create<ConnectivityState>()(() => ({ online: true }));

type Listener = (online: boolean) => void;
const listeners = new Set<Listener>();
let probeTimer: ReturnType<typeof setInterval> | null = null;
const PROBE_MS = 5000;

function emit(online: boolean) {
  if (useConnectivity.getState().online === online) return;
  useConnectivity.setState({ online });
  listeners.forEach((l) => l(online));
  if (online) stopProbe();
  else startProbe();
}

export const markOnline = () => emit(true);
export const markOffline = () => emit(false);
export const isOnline = () => useConnectivity.getState().online;

/** Subscribe to online/offline transitions. Returns an unsubscribe function. */
export function onConnectivityChange(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** One reachability check against the API (no auth, tiny payload). */
export async function probe(): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const res = await fetch(`${API_URL}/health`, { signal: ctrl.signal });
    // Any HTTP answer means the server is reachable.
    emit(true);
    return res.status > 0;
  } catch {
    emit(false);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function startProbe() {
  if (probeTimer) return;
  probeTimer = setInterval(() => void probe(), PROBE_MS);
}

function stopProbe() {
  if (probeTimer) clearInterval(probeTimer);
  probeTimer = null;
}

AppState.addEventListener('change', (s) => {
  if (s === 'active' && !isOnline()) void probe();
});
