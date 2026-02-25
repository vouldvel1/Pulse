import { create } from 'zustand';
import { api } from '../utils/api';
import type { Notification } from '../types';

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  hasMore: boolean;

  fetchNotifications: (opts?: { unread?: boolean }) => Promise<void>;
  loadMore: () => Promise<void>;
  fetchUnreadCount: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;

  // WS event handler
  handleNotification: (notif: Notification) => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  loading: false,
  hasMore: false,

  fetchNotifications: async (opts?: { unread?: boolean }) => {
    set({ loading: true });
    try {
      const params = new URLSearchParams();
      params.set('limit', '50');
      if (opts?.unread) params.set('unread', 'true');
      const notifications = await api.get<Notification[]>(`/notifications?${params.toString()}`);
      set({
        notifications,
        hasMore: notifications.length === 50,
      });
    } finally {
      set({ loading: false });
    }
  },

  loadMore: async () => {
    const existing = get().notifications;
    if (existing.length === 0) return;
    const last = existing[existing.length - 1];
    if (!last) return;

    set({ loading: true });
    try {
      const more = await api.get<Notification[]>(`/notifications?limit=50&before=${last.id}`);
      set((state) => ({
        notifications: [...state.notifications, ...more],
        hasMore: more.length === 50,
      }));
    } finally {
      set({ loading: false });
    }
  },

  fetchUnreadCount: async () => {
    try {
      const result = await api.get<{ count: number }>('/notifications/unread-count');
      set({ unreadCount: result.count });
    } catch {
      // ignore
    }
  },

  markRead: async (id: string) => {
    await api.patch(`/notifications/${id}/read`);
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      ),
      unreadCount: Math.max(0, state.unreadCount - 1),
    }));
  },

  markAllRead: async () => {
    await api.post('/notifications/read-all');
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    }));
  },

  deleteNotification: async (id: string) => {
    await api.delete(`/notifications/${id}`);
    set((state) => {
      const notif = state.notifications.find((n) => n.id === id);
      const wasUnread = notif && !notif.read;
      return {
        notifications: state.notifications.filter((n) => n.id !== id),
        unreadCount: wasUnread ? Math.max(0, state.unreadCount - 1) : state.unreadCount,
      };
    });
  },

  handleNotification: (notif: Notification) => {
    set((state) => {
      // Avoid duplicates
      if (state.notifications.some((n) => n.id === notif.id)) return state;
      return {
        notifications: [notif, ...state.notifications],
        unreadCount: state.unreadCount + 1,
      };
    });
  },
}));
