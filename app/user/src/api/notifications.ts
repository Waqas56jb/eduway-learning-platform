import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import { del, get, getPaged, post } from './client';
import { qk } from './keys';
import type { AppNotificationDto, NotificationFilter, NotificationsMeta, Paged } from './types';

type Pages = InfiniteData<Paged<AppNotificationDto, NotificationsMeta>, string | undefined>;

// NTF-01 (cursor pages)
export const useNotificationsList = (filter: NotificationFilter = 'all') =>
  useInfiniteQuery({
    queryKey: qk.notifications.list(filter),
    queryFn: ({ pageParam }) =>
      getPaged<AppNotificationDto, NotificationsMeta>('/notifications', { filter, cursor: pageParam, limit: 30 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
  });

// NTF-02 — polled on focus/foreground (react-query focus manager) and every 60 s while mounted.
export const useUnreadCount = () => {
  const signedIn = useAuthStore((s) => s.isAuthenticated);
  return useQuery({
    queryKey: qk.notifications.unread,
    queryFn: async () => (await get<{ unreadCount: number }>('/notifications/unread-count')).unreadCount,
    enabled: signedIn,
    refetchInterval: 60_000,
    initialData: () => useAuthStore.getState().me?.unreadNotifications,
    initialDataUpdatedAt: 0,
    meta: { silent: true },
  });
};

function patchAll(qc: ReturnType<typeof useQueryClient>, fn: (n: AppNotificationDto) => AppNotificationDto | null) {
  const lists = qc.getQueriesData<Pages>({ queryKey: ['notifications', 'list'] });
  for (const [key, data] of lists) {
    if (!data) continue;
    qc.setQueryData<Pages>(key, {
      ...data,
      pages: data.pages.map((p) => ({
        ...p,
        items: p.items.map(fn).filter((n): n is AppNotificationDto => n !== null),
      })),
    });
  }
  return lists;
}

function useNotificationMutation<V>(
  fn: (v: V) => Promise<{ unreadCount: number }>,
  apply: (v: V) => (n: AppNotificationDto) => AppNotificationDto | null,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onMutate: async (v: V) => {
      await qc.cancelQueries({ queryKey: qk.notifications.all });
      const prevUnread = qc.getQueryData<number>(qk.notifications.unread);
      const lists = patchAll(qc, apply(v));
      return { lists, prevUnread };
    },
    onError: (_e, _v, ctx) => {
      ctx?.lists.forEach(([key, data]) => qc.setQueryData(key, data));
      if (ctx?.prevUnread !== undefined) qc.setQueryData(qk.notifications.unread, ctx.prevUnread);
    },
    onSuccess: (res) => qc.setQueryData(qk.notifications.unread, res.unreadCount),
    onSettled: () => qc.invalidateQueries({ queryKey: ['notifications', 'list'] }),
  });
}

// NTF-03
export const useMarkNotificationRead = () =>
  useNotificationMutation(
    (id: string) => post<{ id: string; read: true; unreadCount: number }>(`/notifications/${id}/read`),
    (id) => (n) => (n.id === id ? { ...n, read: true } : n),
  );

// NTF-04
export const useMarkAllNotificationsRead = () =>
  useNotificationMutation(
    (_v: void) => post<{ unreadCount: 0; updated: number }>('/notifications/read-all'),
    () => (n) => ({ ...n, read: true }),
  );

// NTF-05
export const useDeleteNotification = () =>
  useNotificationMutation(
    (id: string) => del<{ unreadCount: number }>(`/notifications/${id}`),
    (id) => (n) => (n.id === id ? null : n),
  );
