import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { notifications as seed } from '@/data';
import type { AppNotification } from '@/types';
import { asyncJSONStorage } from './storage';

interface NotificationsState {
  items: AppNotification[];
  markRead: (id: string) => void;
  markAllRead: () => void;
  remove: (id: string) => void;
  add: (n: Omit<AppNotification, 'id' | 'date' | 'read'>) => void;
  unreadCount: () => number;
}

export const useNotificationsStore = create<NotificationsState>()(
  persist(
    (set, get) => ({
      items: seed,
      markRead: (id) => set((s) => ({ items: s.items.map((n) => (n.id === id ? { ...n, read: true } : n)) })),
      markAllRead: () => set((s) => ({ items: s.items.map((n) => ({ ...n, read: true })) })),
      remove: (id) => set((s) => ({ items: s.items.filter((n) => n.id !== id) })),
      add: (n) =>
        set((s) => ({
          items: [{ ...n, id: `n-${Date.now()}`, date: new Date().toISOString(), read: false }, ...s.items],
        })),
      unreadCount: () => get().items.filter((n) => !n.read).length,
    }),
    { name: 'eduway.notifications', storage: asyncJSONStorage },
  ),
);
