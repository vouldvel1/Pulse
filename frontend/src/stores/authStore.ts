import { create } from 'zustand';
import type { AuthResponse, User } from '../types';
import { api } from '../utils/api';
import { wsClient } from '../utils/websocket';

interface ProfileUpdate {
  display_name?: string;
  bio?: string;
  custom_status?: string;
  username?: string;
  email?: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  login: (email: string, password: string) => Promise<void>;
  register: (email: string, username: string, displayName: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  fetchMe: () => Promise<void>;
  clearError: () => void;
  updateProfile: (fields: ProfileUpdate) => Promise<void>;
  uploadAvatar: (file: File) => Promise<void>;
  uploadBanner: (file: File) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
}

/**
 * Async helper that refreshes the access token via the API client and returns
 * the new token string, or null if the refresh fails. This is passed to the
 * WebSocket client so it can obtain a fresh JWT when reconnecting.
 */
async function refreshAccessTokenForWS(): Promise<string | null> {
  try {
    // Trigger a lightweight authed request; the ApiClient will automatically
    // refresh the token if it gets a 401.
    await api.get<User>('/auth/me');
    return api.getAccessToken();
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: !!localStorage.getItem('access_token'),
  isLoading: false,
  error: null,

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const data = await api.post<AuthResponse>('/auth/login', { email, password });
      api.setTokens(data.access_token, data.refresh_token);
      wsClient.connect(() => api.getAccessToken(), refreshAccessTokenForWS);
      set({ user: data.user, isAuthenticated: true, isLoading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  register: async (email, username, displayName, password) => {
    set({ isLoading: true, error: null });
    try {
      const data = await api.post<AuthResponse>('/auth/register', {
        email,
        username,
        display_name: displayName,
        password,
      });
      api.setTokens(data.access_token, data.refresh_token);
      wsClient.connect(() => api.getAccessToken(), refreshAccessTokenForWS);
      set({ user: data.user, isAuthenticated: true, isLoading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Registration failed';
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  logout: async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Ignore logout errors
    }
    api.clearTokens();
    wsClient.disconnect();
    set({ user: null, isAuthenticated: false });
  },

  fetchMe: async () => {
    set({ isLoading: true });
    try {
      const user = await api.get<User>('/auth/me');
      wsClient.connect(() => api.getAccessToken(), refreshAccessTokenForWS);
      set({ user, isAuthenticated: true, isLoading: false });
    } catch {
      api.clearTokens();
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  clearError: () => set({ error: null }),

  updateProfile: async (fields: ProfileUpdate) => {
    const updatedUser = await api.patch<User>('/users/me', fields);
    set({ user: updatedUser });
  },

  uploadAvatar: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const updatedUser = await api.post<User>('/users/me/avatar', formData);
    set({ user: updatedUser });
  },

  uploadBanner: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const updatedUser = await api.post<User>('/users/me/banner', formData);
    set({ user: updatedUser });
  },

  changePassword: async (currentPassword: string, newPassword: string) => {
    await api.put<{ message: string }>('/users/me/password', {
      current_password: currentPassword,
      new_password: newPassword,
    });
  },

  deleteAccount: async (password: string) => {
    await api.delete<{ message: string }>('/users/me', { password });
    api.clearTokens();
    wsClient.disconnect();
    set({ user: null, isAuthenticated: false });
  },
}));
