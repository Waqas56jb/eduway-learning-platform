import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { del, get, getPaged, post, qs } from './client';
import { keys } from './keys';
import type { AppNotification, NotificationFilter, NotificationsMeta, Paged } from './types';

/** Notifications (NTF-01…05). */
export const notificationsApi = {
  list: (filter: NotificationFilter = 'all', limit = 30, cursor?: string) =>
    getPaged<AppNotification, NotificationsMeta>(`/notifications${qs({ filter, limit, cursor })}`),
  unreadCount: () => get<{ unreadCount: number }>('/notifications/unread-count'),
  read: (id: string) => post<{ id: string; read: true; unreadCount: number }>(`/notifications/${id}/read`),
  readAll: () => post<{ unreadCount: 0; updated: number }>('/notifications/read-all'),
  remove: (id: string) => del<{ unreadCount: number }>(`/notifications/${id}`),
};

export function useNotifications(filter: NotificationFilter = 'all', limit = 30) {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: keys.notificationList(filter, limit),
    queryFn: () => notificationsApi.list(filter, limit),
    enabled: isAuthenticated,
  });
}

/** Badge count — polled every 60 s and on focus. */
export function useUnreadCount() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: keys.unreadCount,
    queryFn: notificationsApi.unreadCount,
    enabled: isAuthenticated,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    meta: { silent: true },
  });
}

type ListData = Paged<AppNotification, NotificationsMeta>;

function snapshot(qc: QueryClient) {
  return {
    lists: qc.getQueriesData<ListData>({ queryKey: [...keys.notifications, 'list'] }),
    unread: qc.getQueryData<{ unreadCount: number }>(keys.unreadCount),
  };
}
function restore(qc: QueryClient, s: ReturnType<typeof snapshot>) {
  s.lists.forEach(([k, d]) => qc.setQueryData<ListData>(k, d));
  if (s.unread) qc.setQueryData(keys.unreadCount, s.unread);
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: notificationsApi.read,
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: keys.notifications });
      const snap = snapshot(qc);
      let wasUnread = false;
      qc.setQueriesData<ListData>({ queryKey: [...keys.notifications, 'list'] }, (old) => {
        if (!old) return old;
        const items = old.items.map((n) => {
          if (n.id === id && !n.read) wasUnread = true;
          return n.id === id ? { ...n, read: true } : n;
        });
        return { ...old, items, meta: { ...old.meta, unreadCount: Math.max(0, (old.meta.unreadCount ?? 0) - (wasUnread ? 1 : 0)) } };
      });
      if (wasUnread)
        qc.setQueryData<{ unreadCount: number }>(keys.unreadCount, (u) => ({ unreadCount: Math.max(0, (u?.unreadCount ?? 1) - 1) }));
      return snap;
    },
    onError: (_e, _id, snap) => snap && restore(qc, snap),
    onSuccess: (res) => qc.setQueryData(keys.unreadCount, { unreadCount: res.unreadCount }),
    onSettled: () => qc.invalidateQueries({ queryKey: [...keys.notifications, 'list'] }),
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: notificationsApi.readAll,
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: keys.notifications });
      const snap = snapshot(qc);
      qc.setQueriesData<ListData>({ queryKey: [...keys.notifications, 'list'] }, (old) =>
        old ? { ...old, items: old.items.map((n) => ({ ...n, read: true })), meta: { ...old.meta, unreadCount: 0 } } : old,
      );
      qc.setQueryData(keys.unreadCount, { unreadCount: 0 });
      return snap;
    },
    onError: (_e, _v, snap) => snap && restore(qc, snap),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.notifications }),
  });
}

export function useDeleteNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: notificationsApi.remove,
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: keys.notifications });
      const snap = snapshot(qc);
      qc.setQueriesData<ListData>({ queryKey: [...keys.notifications, 'list'] }, (old) =>
        old ? { ...old, items: old.items.filter((n) => n.id !== id) } : old,
      );
      return snap;
    },
    onError: (_e, _id, snap) => snap && restore(qc, snap),
    onSuccess: (res) => qc.setQueryData(keys.unreadCount, { unreadCount: res.unreadCount }),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.notifications }),
  });
}

/** Maps a notification's structured target to a website/user route (§1.8 — web maps target → /student/...). */
export function notificationHref(n: Pick<AppNotification, 'target' | 'link'>): string {
  const id = n.target?.id;
  switch (n.target?.kind) {
    case 'lesson':
      return id ? `/student/lesson/${id}` : '/student/subjects';
    case 'subject':
      return id ? `/student/subjects/${id}` : '/student/subjects';
    case 'exams':
      return '/student/exams';
    case 'exam_result':
      return id ? `/student/exams/result/${id}` : '/student/exams';
    case 'mistakes':
      return '/student/mistakes';
    case 'subscription':
      return '/student/subscription';
    case 'progress':
      return '/student/progress';
    case 'tutor':
      return '/student/ai-tutor';
    case 'notifications':
    case 'none':
    default:
      return '/student/notifications';
  }
}

/** Maps a canonical app route ('/lesson/{id}', '/exams/result/{id}', …) to the web route. */
export function appLinkToWeb(link: string | null | undefined): string | null {
  if (!link) return null;
  if (link.startsWith('/student/')) return link;
  const map: [RegExp, (m: RegExpMatchArray) => string][] = [
    [/^\/lesson\/([^/?#]+)/, (m) => `/student/lesson/${m[1]}`],
    [/^\/subject\/([^/?#]+)/, (m) => `/student/subjects/${m[1]}`],
    [/^\/exams\/result\/([^/?#]+)/, (m) => `/student/exams/result/${m[1]}`],
    [/^\/exams/, () => '/student/exams'],
    [/^\/mistakes/, () => '/student/mistakes'],
    [/^\/subscription/, () => '/student/subscription'],
    [/^\/notifications/, () => '/student/notifications'],
    [/^\/progress/, () => '/student/progress'],
    [/^\/tutor/, () => '/student/ai-tutor'],
    [/^\/question-bank/, () => '/student/question-bank'],
  ];
  for (const [re, fn] of map) {
    const m = link.match(re);
    if (m) return fn(m);
  }
  return null;
}
