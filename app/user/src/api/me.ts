import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import { del, get, patch } from './client';
import { fetchMe } from './auth';
import { qk } from './keys';
import type { MeStudentDto, NotificationPrefs, OkDto, SessionDto, StudentUser, UpdateMeBody } from './types';

// ME-01 / AUTH-07 — keeps the auth store's `me` in sync.
export const useMeQuery = (enabled = true) =>
  useQuery({
    queryKey: qk.me.profile,
    queryFn: async () => {
      const me = await fetchMe();
      useAuthStore.getState().applyMe(me);
      return me;
    },
    enabled,
    meta: { silent: true },
  });

// ME-02
export const updateMe = (body: UpdateMeBody) => patch<StudentUser>('/me', body);
export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateMe,
    onSuccess: (user) => {
      useAuthStore.getState().applyUser(user);
      qc.setQueryData<MeStudentDto>(qk.me.profile, (old) => (old ? { ...old, user } : old));
    },
  });
}

// ME-03
export const useSessions = () =>
  useQuery({ queryKey: qk.me.sessions, queryFn: () => get<SessionDto[]>('/me/sessions') });

// ME-04
export function useRevokeSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => del<OkDto>(`/me/sessions/${id}`),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: qk.me.sessions });
      const prev = qc.getQueryData<SessionDto[]>(qk.me.sessions);
      qc.setQueryData<SessionDto[]>(qk.me.sessions, (old) => old?.filter((s) => s.id !== id));
      return { prev };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.me.sessions, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.me.sessions }),
  });
}

// ME-05
export function useRevokeOtherSessions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => del<{ revoked: number }>('/me/sessions?scope=others'),
    onSuccess: () => {
      qc.setQueryData<SessionDto[]>(qk.me.sessions, (old) => old?.filter((s) => s.current));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.me.sessions }),
  });
}

// ME-09
export const useNotificationPrefs = () =>
  useQuery({
    queryKey: qk.me.notificationPrefs,
    queryFn: () => get<NotificationPrefs>('/me/notification-preferences'),
    initialData: () => useAuthStore.getState().me?.notificationPrefs,
    initialDataUpdatedAt: 0,
  });

// ME-10 (optimistic)
export function useUpdateNotificationPrefs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: Partial<NotificationPrefs>) => patch<NotificationPrefs>('/me/notification-preferences', p),
    onMutate: async (p) => {
      await qc.cancelQueries({ queryKey: qk.me.notificationPrefs });
      const prev = qc.getQueryData<NotificationPrefs>(qk.me.notificationPrefs);
      if (prev) qc.setQueryData<NotificationPrefs>(qk.me.notificationPrefs, { ...prev, ...p });
      return { prev };
    },
    onError: (_e, _p, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.me.notificationPrefs, ctx.prev);
    },
    onSuccess: (prefs) => qc.setQueryData(qk.me.notificationPrefs, prefs),
  });
}
