import { create } from 'zustand';
import { messages as messagesApi } from '@/utils/api';
import type { Message, Embed } from '@/types';

interface MessageState {
  // channelId → Message[]
  messages: Record<string, Message[]>;
  // channelId → has more older messages
  hasMore: Record<string, boolean>;
  loadingChannels: Set<string>;
  activeChannelId: string | null;

  setActiveChannel: (id: string | null) => void;
  fetchMessages: (channelId: string, before?: string) => Promise<void>;
  sendMessage: (channelId: string, content: string, replyToId?: string) => Promise<void>;
  editMessage: (channelId: string, messageId: string, content: string) => Promise<void>;
  deleteMessage: (channelId: string, messageId: string) => Promise<void>;
  addMessage: (message: Message) => void;
  updateMessage: (message: Message) => void;
  removeMessage: (channelId: string, messageId: string) => void;
  updateEmbeds: (channelId: string, messageId: string, embeds: Embed[]) => void;
  addReaction: (channelId: string, messageId: string, emoji: string, userId: string) => void;
  removeReaction: (channelId: string, messageId: string, emoji: string, userId: string) => void;
}

export const useMessageStore = create<MessageState>((set, get) => ({
  messages: {},
  hasMore: {},
  loadingChannels: new Set(),
  activeChannelId: null,

  setActiveChannel: (id) => set({ activeChannelId: id }),

  fetchMessages: async (channelId, before) => {
    const { loadingChannels } = get();
    if (loadingChannels.has(channelId)) return;

    set((s) => ({ loadingChannels: new Set([...s.loadingChannels, channelId]) }));
    try {
      const list = await messagesApi.list(channelId, 50, before);
      set((s) => {
        const existing = s.messages[channelId] ?? [];
        const merged = before
          ? [...list.reverse(), ...existing]
          : [...(s.messages[channelId] ?? []), ...list.reverse()];
        // Deduplicate
        const seen = new Set<string>();
        const deduped = merged.filter((m) => {
          if (seen.has(m.id)) return false;
          seen.add(m.id);
          return true;
        });
        return {
          messages: { ...s.messages, [channelId]: deduped },
          hasMore: { ...s.hasMore, [channelId]: list.length === 50 },
          loadingChannels: new Set([...s.loadingChannels].filter((id) => id !== channelId)),
        };
      });
    } catch {
      set((s) => ({
        loadingChannels: new Set([...s.loadingChannels].filter((id) => id !== channelId)),
      }));
    }
  },

  sendMessage: async (channelId, content, replyToId) => {
    const msg = await messagesApi.send(channelId, content, replyToId);
    // Optimistically appended via WS event; but add as fallback
    set((s) => {
      const existing = s.messages[channelId] ?? [];
      if (existing.some((m) => m.id === msg.id)) return s;
      return { messages: { ...s.messages, [channelId]: [...existing, msg] } };
    });
  },

  editMessage: async (channelId, messageId, content) => {
    const msg = await messagesApi.edit(channelId, messageId, content);
    get().updateMessage(msg);
  },

  deleteMessage: async (channelId, messageId) => {
    await messagesApi.delete(channelId, messageId);
    get().removeMessage(channelId, messageId);
  },

  addMessage: (message) =>
    set((s) => {
      const existing = s.messages[message.channel_id] ?? [];
      if (existing.some((m) => m.id === message.id)) return s;
      return {
        messages: {
          ...s.messages,
          [message.channel_id]: [...existing, message],
        },
      };
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

  updateEmbeds: (channelId, messageId, embeds) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [channelId]: (s.messages[channelId] ?? []).map((m) =>
          m.id === messageId ? { ...m, embeds } : m,
        ),
      },
    })),

  addReaction: (channelId, messageId, emoji, userId) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [channelId]: (s.messages[channelId] ?? []).map((m) => {
          if (m.id !== messageId) return m;
          const reactions = [...(m.reactions ?? [])];
          const idx = reactions.findIndex((r) => r.emoji === emoji);
          const currentUserId = localStorage.getItem('user_id');
          const isMe = userId === currentUserId;
          if (idx >= 0) {
            reactions[idx] = { ...reactions[idx], count: reactions[idx].count + 1, me: isMe || reactions[idx].me };
          } else {
            reactions.push({ emoji, count: 1, me: isMe });
          }
          return { ...m, reactions };
        }),
      },
    })),

  removeReaction: (channelId, messageId, emoji, userId) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [channelId]: (s.messages[channelId] ?? []).map((m) => {
          if (m.id !== messageId) return m;
          const reactions = (m.reactions ?? []).map((r) => {
            if (r.emoji !== emoji) return r;
            const currentUserId = localStorage.getItem('user_id');
            return { ...r, count: r.count - 1, me: userId === currentUserId ? false : r.me };
          }).filter((r) => r.count > 0);
          return { ...m, reactions };
        }),
      },
    })),
}));
