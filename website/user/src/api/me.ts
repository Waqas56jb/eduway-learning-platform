import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { del, get, patch } from './client';
import { keys } from './keys';
import type { Entitlement, MeStudentDto, NotificationPrefs, SessionDto, StudentUser, UpdateMeBody } from './types';

/** Student account (ME-01…11). */
export const meApi = {
  get: () => get<MeStudentDto>('/me'),
  update: (body: UpdateMeBody) => patch<StudentUser>('/me', body),
  sessions: () => get<SessionDto[]>('/me/sessions'),
  revokeSession: (id: string) => del<{ ok: true }>(`/me/sessions/${id}`),
  revokeOthers: () => del<{ revoked: number }>('/me/sessions?scope=others'),
  prefs: () => get<NotificationPrefs>('/me/notification-preferences'),
  updatePrefs: (body: Partial<NotificationPrefs>) => patch<NotificationPrefs>('/me/notification-preferences', body),
  entitlements: () => get<Entitlement[]>('/me/entitlements'),
};

export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: meApi.update,
    onSuccess: (user) => {
      qc.setQueryData<MeStudentDto | null>(keys.me, (me) => (me ? { ...me, user } : me));
    },
  });
}

export function useSessions() {
  const { isAuthenticated } = useAuth();
  return useQuery({ queryKey: keys.sessions, queryFn: meApi.sessions, enabled: isAuthenticated });
}

export function useRevokeSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: meApi.revokeSession,
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: keys.sessions });
      const prev = qc.getQueryData<SessionDto[]>(keys.sessions);
      qc.setQueryData<SessionDto[]>(keys.sessions, (xs) => xs?.filter((s) => s.id !== id));
      return { prev };
    },
    onError: (_e, _id, ctx) => ctx?.prev && qc.setQueryData(keys.sessions, ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.sessions }),
  });
}

export function useRevokeOtherSessions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: meApi.revokeOthers,
    onSuccess: () => qc.setQueryData<SessionDto[]>(keys.sessions, (xs) => xs?.filter((s) => s.current)),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.sessions }),
  });
}

export function useNotificationPrefs() {
  const { isAuthenticated } = useAuth();
  return useQuery({ queryKey: keys.notificationPrefs, queryFn: meApi.prefs, enabled: isAuthenticated });
}

export function useUpdateNotificationPrefs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: meApi.updatePrefs,
    onMutate: async (patchBody) => {
      await qc.cancelQueries({ queryKey: keys.notificationPrefs });
      const prev = qc.getQueryData<NotificationPrefs>(keys.notificationPrefs);
      if (prev) qc.setQueryData<NotificationPrefs>(keys.notificationPrefs, { ...prev, ...patchBody });
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(keys.notificationPrefs, ctx.prev),
    onSuccess: (prefs) => qc.setQueryData(keys.notificationPrefs, prefs),
  });
}
