import { useQuery } from '@tanstack/react-query';
import { get } from './client';
import { keys } from './keys';
import type { AppConfigDto } from './types';

/** Platform configuration (PUB-01): maintenance, OTP policy, learning defaults, support contacts… */
export const appSettingsApi = {
  config: () => get<AppConfigDto>('/public/app-config?platform=web', { skipAuth: true }),
};

/** Defaults used until /public/app-config answers (values documented in the contract). */
export const DEFAULT_LEARNING: AppConfigDto['learning'] = {
  quizQuestionCount: 5,
  quizPassMark: 60,
  examDefaultPassMark: 50,
  practiceSessionSizes: [10, 20, 50],
  practiceMaxSize: 100,
  dailyGoalMinutes: 120,
  watchHeartbeatSeconds: 10,
  examAutosaveSeconds: 15,
  gradeBands: [
    { key: 'excellent', min: 90 },
    { key: 'veryGood', min: 80 },
    { key: 'good', min: 70 },
    { key: 'pass', min: 50 },
    { key: 'needsWork', min: 0 },
  ],
};

export const useAppConfig = () =>
  useQuery({
    queryKey: keys.appConfig,
    queryFn: appSettingsApi.config,
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
    meta: { silent: true },
  });

/** Learning settings with documented fallbacks. */
export function useLearningSettings(): AppConfigDto['learning'] {
  const { data } = useAppConfig();
  return data?.learning ?? DEFAULT_LEARNING;
}
