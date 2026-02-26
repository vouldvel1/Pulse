import { create } from 'zustand';
import { auth, setTokens, clearTokens } from '@/utils/api';
import { wsClient } from '@/utils/wsClient';
import type { User } from '@/types';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  login: (email: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  fetchMe: () => Promise<void>;
  updateUser: (user: User) => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: !!localStorage.getItem('access_token'),
  isLoading: false,
  error: null,

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const data = await auth.login(email, password);
      setTokens(data);
      wsClient.connect();
      set({ user: data.user, isAuthenticated: true, isLoading: false });
    } catch (e) {
      set({ error: (e as Error).message, isLoading: false });
      throw e;
    }
  },

  register: async (username, email, password) => {
    set({ isLoading: true, error: null });
    try {
      const data = await auth.register(username, email, password);
      setTokens(data);
      wsClient.connect();
      set({ user: data.user, isAuthenticated: true, isLoading: false });
    } catch (e) {
      set({ error: (e as Error).message, isLoading: false });
      throw e;
    }
  },

  logout: async () => {
    try {
      await auth.logout();
    } catch { /* ignore */ }
    wsClient.disconnect();
    clearTokens();
    set({ user: null, isAuthenticated: false });
  },

  fetchMe: async () => {
    try {
      const user = await auth.me();
      set({ user, isAuthenticated: true });
    } catch {
      clearTokens();
      set({ user: null, isAuthenticated: false });
    }
  },

  updateUser: (user) => set({ user }),

  clearError: () => set({ error: null }),
}));
