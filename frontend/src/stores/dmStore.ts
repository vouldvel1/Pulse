import { create } from 'zustand';
import { api } from '../utils/api';
import type { DMChannel, DMMessage } from '../types';

interface DMState {
  channels: DMChannel[];
  activeChannelId: string | null;
  messages: Record<string, DMMessage[]>;
  loading: boolean;
  messagesLoading: boolean;
  hasMore: Record<string, boolean>;
  error: string | null;

  fetchChannels: () => Promise<void>;
  createDM: (recipient: string) => Promise<DMChannel>;
  createGroupDM: (name: string, memberIds: string[]) => Promise<DMChannel>;
  setActiveChannel: (id: string | null) => void;
  fetchMessages: (channelId: string) => Promise<void>;
  loadMoreMessages: (channelId: string) => Promise<void>;
  sendMessage: (channelId: string, content: string, replyToId?: string) => Promise<void>;
  editMessage: (channelId: string, messageId: string, content: string) => Promise<void>;
  deleteMessage: (channelId: string, messageId: string) => Promise<void>;
  clearError: () => void;

  // WS event handlers
  handleDMMessage: (msg: DMMessage) => void;
  handleDMMessageEdit: (msg: DMMessage) => void;
  handleDMMessageDelete: (payload: { id: string; channel_id: string }) => void;
  handleDMChannelCreate: (channel: DMChannel) => void;
}

export const useDMStore = create<DMState>((set, get) => ({
  channels: [],
  activeChannelId: null,
  messages: {},
  loading: false,
  messagesLoading: false,
  hasMore: {},
  error: null,

  fetchChannels: async () => {
    set({ loading: true, error: null });
    try {
      const channels = await api.get<DMChannel[]>('/dm/channels');
      set({ channels });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch DM channels';
      set({ error: message });
    } finally {
      set({ loading: false });
    }
  },

  createDM: async (recipient: string) => {
    // If it looks like a UUID, send as recipient_id; otherwise send as recipient_username
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(recipient);
    const body = isUUID
      ? { recipient_id: recipient }
      : { recipient_username: recipient };
    try {
      const channel = await api.post<DMChannel>('/dm/channels', body);
      const existing = get().channels.find((c) => c.id === channel.id);
      if (!existing) {
        set((state) => ({ channels: [channel, ...state.channels] }));
      }
      return channel;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create DM';
      set({ error: message });
      throw err;
    }
  },

  createGroupDM: async (name: string, memberIds: string[]) => {
    try {
      const channel = await api.post<DMChannel>('/dm/channels/group', {
        name,
        member_ids: memberIds,
      });
      set((state) => ({ channels: [channel, ...state.channels] }));
      return channel;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create group DM';
      set({ error: message });
      throw err;
    }
  },

  setActiveChannel: (id: string | null) => {
    set({ activeChannelId: id });
  },

  fetchMessages: async (channelId: string) => {
    set({ messagesLoading: true, error: null });
    try {
      const msgs = await api.get<DMMessage[]>(`/dm/channels/${channelId}/messages?limit=50`);
      set((state) => ({
        messages: { ...state.messages, [channelId]: msgs.reverse() },
        hasMore: { ...state.hasMore, [channelId]: msgs.length === 50 },
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch messages';
      set({ error: message });
    } finally {
      set({ messagesLoading: false });
    }
  },

  loadMoreMessages: async (channelId: string) => {
    const existing = get().messages[channelId];
    if (!existing || existing.length === 0) return;

    const oldest = existing[0];
    if (!oldest) return;

    set({ messagesLoading: true });
    try {
      const msgs = await api.get<DMMessage[]>(
        `/dm/channels/${channelId}/messages?limit=50&before=${oldest.id}`
      );
      set((state) => ({
        messages: {
          ...state.messages,
          [channelId]: [...msgs.reverse(), ...(state.messages[channelId] ?? [])],
        },
        hasMore: { ...state.hasMore, [channelId]: msgs.length === 50 },
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load more messages';
      set({ error: message });
    } finally {
      set({ messagesLoading: false });
    }
  },

  sendMessage: async (channelId: string, content: string, replyToId?: string) => {
    try {
      await api.post(`/dm/channels/${channelId}/messages`, {
        content,
        reply_to_id: replyToId ?? null,
      });
      // Message will arrive via WS
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send message';
      set({ error: message });
      throw err;
    }
  },

  editMessage: async (channelId: string, messageId: string, content: string) => {
    // Optimistic update
    set((state) => ({
      messages: {
        ...state.messages,
        [channelId]: (state.messages[channelId] ?? []).map((m) =>
          m.id === messageId ? { ...m, content, edited_at: new Date().toISOString() } : m
        ),
      },
    }));
    try {
      await api.patch(`/dm/channels/${channelId}/messages/${messageId}`, { content });
      // Authoritative update will arrive via WS
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to edit message';
      set({ error: message });
      throw err;
    }
  },

  deleteMessage: async (channelId: string, messageId: string) => {
    // Optimistic removal
    const prev = get().messages[channelId] ?? [];
    set((state) => ({
      messages: {
        ...state.messages,
        [channelId]: (state.messages[channelId] ?? []).filter((m) => m.id !== messageId),
      },
    }));
    try {
      await api.delete(`/dm/channels/${channelId}/messages/${messageId}`);
      // Deletion confirmed via WS
    } catch (err) {
      // Restore on failure
      set((state) => ({
        messages: { ...state.messages, [channelId]: prev },
        error: err instanceof Error ? err.message : 'Failed to delete message',
      }));
      throw err;
    }
  },

  clearError: () => set({ error: null }),

  handleDMMessage: (msg: DMMessage) => {
    set((state) => {
      const channelMsgs = state.messages[msg.channel_id] ?? [];
      // Avoid duplicates
      if (channelMsgs.some((m) => m.id === msg.id)) return state;
      return {
        messages: {
          ...state.messages,
          [msg.channel_id]: [...channelMsgs, msg],
        },
      };
    });

    // Move channel to top
    set((state) => {
      const idx = state.channels.findIndex((c) => c.id === msg.channel_id);
      if (idx <= 0) return state;
      const channel = state.channels[idx];
      if (!channel) return state;
      const rest = state.channels.filter((_, i) => i !== idx);
      return { channels: [channel, ...rest] };
    });
  },

  handleDMMessageEdit: (msg: DMMessage) => {
    set((state) => ({
      messages: {
        ...state.messages,
        [msg.channel_id]: (state.messages[msg.channel_id] ?? []).map((m) =>
          m.id === msg.id ? msg : m
        ),
      },
    }));
  },

  handleDMMessageDelete: (payload: { id: string; channel_id: string }) => {
    set((state) => ({
      messages: {
        ...state.messages,
        [payload.channel_id]: (state.messages[payload.channel_id] ?? []).filter(
          (m) => m.id !== payload.id
        ),
      },
    }));
  },

  handleDMChannelCreate: (channel: DMChannel) => {
    const existing = get().channels.find((c) => c.id === channel.id);
    if (!existing) {
      set((state) => ({ channels: [channel, ...state.channels] }));
    }
  },
}));
