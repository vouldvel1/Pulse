import { create } from 'zustand';
import { dm as dmApi } from '@/utils/api';
import type { DMChannel, DMMessage } from '@/types';

interface DMState {
  channels: DMChannel[];
  activeChannelId: string | null;
  messages: Record<string, DMMessage[]>;
  hasMore: Record<string, boolean>;
  isLoading: boolean;

  fetchChannels: () => Promise<void>;
  setActiveChannel: (id: string | null) => void;
  fetchMessages: (channelId: string, before?: string) => Promise<void>;
  sendMessage: (channelId: string, content: string, replyToId?: string) => Promise<void>;
  editMessage: (channelId: string, messageId: string, content: string) => Promise<void>;
  deleteMessage: (channelId: string, messageId: string) => Promise<void>;
  addMessage: (message: DMMessage) => void;
  updateMessage: (message: DMMessage) => void;
  removeMessage: (channelId: string, messageId: string) => void;
  addChannel: (channel: DMChannel) => void;
  updateChannel: (channel: DMChannel) => void;
}

export const useDMStore = create<DMState>((set, get) => ({
  channels: [],
  activeChannelId: null,
  messages: {},
  hasMore: {},
  isLoading: false,

  fetchChannels: async () => {
    set({ isLoading: true });
    try {
      const list = await dmApi.listChannels();
      set({ channels: list, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  setActiveChannel: (id) => {
    set({ activeChannelId: id });
    if (id && !get().messages[id]) {
      void get().fetchMessages(id);
    }
  },

  fetchMessages: async (channelId, before) => {
    try {
      const list = await dmApi.listMessages(channelId, 50, before);
      set((s) => {
        const existing = s.messages[channelId] ?? [];
        const merged = before
          ? [...list.reverse(), ...existing]
          : [...(s.messages[channelId] ?? []), ...list.reverse()];
        const seen = new Set<string>();
        const deduped = merged.filter((m) => {
          if (seen.has(m.id)) return false;
          seen.add(m.id);
          return true;
        });
        return {
          messages: { ...s.messages, [channelId]: deduped },
          hasMore: { ...s.hasMore, [channelId]: list.length === 50 },
        };
      });
    } catch { /* ignore */ }
  },

  sendMessage: async (channelId, content, replyToId) => {
    const msg = await dmApi.sendMessage(channelId, content, replyToId);
    set((s) => {
      const existing = s.messages[channelId] ?? [];
      if (existing.some((m) => m.id === msg.id)) return s;
      return { messages: { ...s.messages, [channelId]: [...existing, msg] } };
    });
  },

  editMessage: async (channelId, messageId, content) => {
    const msg = await dmApi.editMessage(channelId, messageId, content);
    get().updateMessage(msg);
  },

  deleteMessage: async (channelId, messageId) => {
    await dmApi.deleteMessage(channelId, messageId);
    get().removeMessage(channelId, messageId);
  },

  addMessage: (message) =>
    set((s) => {
      const existing = s.messages[message.channel_id] ?? [];
      if (existing.some((m) => m.id === message.id)) return s;
      return { messages: { ...s.messages, [message.channel_id]: [...existing, message] } };
    }),

  updateMessage: (message) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [message.channel_id]: (s.messages[message.channel_id] ?? []).map((m) =>
          m.id === message.id ? message : m,
        ),
      },
    })),

  removeMessage: (channelId, messageId) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [channelId]: (s.messages[channelId] ?? []).filter((m) => m.id !== messageId),
      },
    })),

  addChannel: (channel) =>
    set((s) => {
      if (s.channels.some((c) => c.id === channel.id)) return s;
      return { channels: [channel, ...s.channels] };
    }),

  updateChannel: (channel) =>
    set((s) => ({
      channels: s.channels.map((c) => (c.id === channel.id ? channel : c)),
    })),
}));
