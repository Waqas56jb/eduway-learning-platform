import { useCallback, useEffect } from 'react';
import { AppState } from 'react-native';
import { useAppStatus } from './appStatus';
import { CLIENT_PLATFORM } from './config';
import { flushExamQueue } from './examQueue';
import { qk } from './keys';
import { fetchAppConfig } from './public';
import { listenForPushTaps, registerPushToken } from './push';
import { queryClient } from './queryClient';
import type { AppConfigDto } from './types';

function applyConfig(cfg: AppConfigDto) {
  const status = useAppStatus.getState();
  status.setMaintenance(cfg.maintenance.enabled, cfg.maintenance.message);
  status.setUpdateRequired(cfg.update.required, cfg.update.storeUrls[CLIENT_PLATFORM]);
}

/** Fetch `/public/app-config` (cached in react-query) and update the blocking flags. */
export async function checkAppConfig(): Promise<AppConfigDto | null> {
  try {
    const cfg = await queryClient.fetchQuery({ queryKey: qk.public.appConfig, queryFn: fetchAppConfig, staleTime: 0 });
    applyConfig(cfg);
    return cfg;
  } catch {
    return null;
  }
}

/**
 * Root-level side effects: app-config on launch + every foreground (maintenance / force update),
 * push token registration once signed in, push tap routing and the exam autosave queue flush.
 */
export function useApiBoot(ready: boolean, signedIn: boolean) {
  useEffect(() => {
    if (!ready) return;
    void checkAppConfig();
    void flushExamQueue();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void checkAppConfig();
    });
    return () => sub.remove();
  }, [ready]);

  useEffect(() => {
    if (!ready || !signedIn) return;
    void registerPushToken();
    return listenForPushTaps();
  }, [ready, signedIn]);

  return useCallback(() => checkAppConfig(), []);
}
