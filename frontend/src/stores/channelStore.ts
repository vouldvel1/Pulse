import { create } from 'zustand';
import type { Channel } from '../types';
import { api } from '../utils/api';
import { wsClient } from '../utils/websocket';

interface ChannelState {
  channels: Channel[];
  activeChannelId: string | null;
  isLoading: boolean;
  error: string | null;

  fetchChannels: (communityId: string) => Promise<void>;
  createChannel: (communityId: string, name: string, type: string, topic?: string, isPrivate?: boolean) => Promise<Channel>;
  updateChannel: (id: string, data: { name?: string; topic?: string; position?: number; is_private?: boolean }) => Promise<void>;
  deleteChannel: (id: string) => Promise<void>;
  setActiveChannel: (id: string | null) => void;
  handleChannelUpdate: (channel: Channel) => void;
  clearError: () => void;
}

export const useChannelStore = create<ChannelState>((set, get) => ({
  channels: [],
  activeChannelId: null,
  isLoading: false,
  error: null,

  fetchChannels: async (communityId) => {
    set({ isLoading: true, error: null });
    try {
      const channels = await api.get<Channel[]>(`/communities/${communityId}/channels`);
      set({ channels, isLoading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch channels';
      set({ error: message, isLoading: false });
    }
  },

  createChannel: async (communityId, name, type, topic, isPrivate) => {
    const channel = await api.post<Channel>(`/communities/${communityId}/channels`, {
      name,
      type,
      topic: topic ?? null,
      is_private: isPrivate ?? false,
    });
    set((state) => ({ channels: [...state.channels, channel] }));
    return channel;
  },

  updateChannel: async (id, data) => {
    const updated = await api.patch<Channel>(`/channels/${id}`, data);
    set((state) => ({
      channels: state.channels.map((ch) => (ch.id === id ? updated : ch)),
    }));
  },

  deleteChannel: async (id) => {
    await api.delete(`/channels/${id}`);
    set((state) => ({
      channels: state.channels.filter((ch) => ch.id !== id),
      activeChannelId: state.activeChannelId === id ? null : state.activeChannelId,
    }));
  },

  setActiveChannel: (id) => {
    const prevId = get().activeChannelId;
    if (prevId && prevId !== id) {
      wsClient.send('channel_leave', { channel_id: prevId });
    }
    if (id) {
      wsClient.send('channel_join', { channel_id: id });
    }
    set({ activeChannelId: id });
  },

  handleChannelUpdate: (channel) => {
    set((state) => {
      const exists = state.channels.some((ch) => ch.id === channel.id);
      if (exists) {
        return { channels: state.channels.map((ch) => (ch.id === channel.id ? channel : ch)) };
      }
      return { channels: [...state.channels, channel] };
    });
  },

  clearError: () => set({ error: null }),
}));
