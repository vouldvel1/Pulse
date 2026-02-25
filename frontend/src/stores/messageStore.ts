import { create } from 'zustand';
import type { Message, MessageEmbedsPayload } from '../types';
import { api } from '../utils/api';

interface MessageState {
  messages: Message[];
  pinnedMessages: Message[];
  hasMore: boolean;
  isLoading: boolean;
  isSending: boolean;
  error: string | null;

  fetchMessages: (channelId: string, before?: string) => Promise<void>;
  sendMessage: (channelId: string, content: string, replyToId?: string) => Promise<void>;
  editMessage: (channelId: string, messageId: string, content: string) => Promise<void>;
  deleteMessage: (channelId: string, messageId: string) => Promise<void>;
  fetchPinned: (channelId: string) => Promise<void>;
  pinMessage: (channelId: string, messageId: string) => Promise<void>;
  unpinMessage: (channelId: string, messageId: string) => Promise<void>;
  addReaction: (channelId: string, messageId: string, emoji: string) => Promise<void>;
  removeReaction: (channelId: string, messageId: string, emoji: string) => Promise<void>;
  uploadFile: (channelId: string, file: File, content?: string) => Promise<void>;
  handleNewMessage: (message: Message) => void;
  handleMessageEdit: (message: Message) => void;
  handleMessageDelete: (data: { id: string; channel_id: string }) => void;
  handleMessageEmbeds: (data: MessageEmbedsPayload) => void;
  handleReaction: (data: { message_id: string; user_id: string; emoji: string }) => void;
  handleReactionRemove: (data: { message_id: string; user_id: string; emoji: string }) => void;
  clearMessages: () => void;
  clearError: () => void;
}

export const useMessageStore = create<MessageState>((set, get) => ({
  messages: [],
  pinnedMessages: [],
  hasMore: true,
  isLoading: false,
  isSending: false,
  error: null,

  fetchMessages: async (channelId, before) => {
    set({ isLoading: true, error: null });
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (before) params.set('before', before);
      const messages = await api.get<Message[]>(`/channels/${channelId}/messages?${params}`);
      set((state) => ({
        messages: before ? [...messages, ...state.messages] : messages,
        hasMore: messages.length === 50,
        isLoading: false,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch messages';
      set({ error: message, isLoading: false });
    }
  },

  sendMessage: async (channelId, content, replyToId) => {
    set({ isSending: true, error: null });
    try {
      const msg = await api.post<Message>(`/channels/${channelId}/messages`, {
        content,
        reply_to_id: replyToId ?? null,
      });
      // Optimistically add the message from the HTTP response so the sender
      // sees it immediately, even if the WS subscription is delayed.
      // The duplicate check in handleNewMessage prevents double-display.
      set((state) => {
        if (state.messages.some((m) => m.id === msg.id)) return { isSending: false };
        return { messages: [...state.messages, msg], isSending: false };
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send message';
      set({ error: message, isSending: false });
      throw err;
    }
  },

  editMessage: async (channelId, messageId, content) => {
    // Optimistic update
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === messageId ? { ...m, content, edited_at: new Date().toISOString() } : m
      ),
    }));
    try {
      await api.patch(`/channels/${channelId}/messages/${messageId}`, { content });
    } catch (err) {
      // Revert will happen when WS pushes the authoritative state,
      // or on next fetch. We still surface the error.
      const message = err instanceof Error ? err.message : 'Failed to edit message';
      set({ error: message });
      throw err;
    }
  },

  deleteMessage: async (channelId, messageId) => {
    // Optimistic removal
    const prev = get().messages;
    set((state) => ({
      messages: state.messages.filter((m) => m.id !== messageId),
    }));
    try {
      await api.delete(`/channels/${channelId}/messages/${messageId}`);
    } catch (err) {
      // Restore on failure
      set({ messages: prev });
      const message = err instanceof Error ? err.message : 'Failed to delete message';
      set({ error: message });
      throw err;
    }
  },

  fetchPinned: async (channelId) => {
    try {
      const pinnedMessages = await api.get<Message[]>(`/channels/${channelId}/pins`);
      set({ pinnedMessages });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch pinned messages';
      set({ error: message });
    }
  },

  pinMessage: async (channelId, messageId) => {
    try {
      await api.put(`/channels/${channelId}/messages/${messageId}/pin`);
      // Optimistic update: mark as pinned locally
      set((state) => ({
        messages: state.messages.map((m) =>
          m.id === messageId ? { ...m, pinned: true } : m
        ),
        pinnedMessages: [
          ...state.pinnedMessages,
          ...state.messages.filter((m) => m.id === messageId && !state.pinnedMessages.some((p) => p.id === m.id)),
        ],
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to pin message';
      set({ error: message });
      throw err;
    }
  },

  unpinMessage: async (channelId, messageId) => {
    try {
      await api.delete(`/channels/${channelId}/messages/${messageId}/pin`);
      set((state) => ({
        messages: state.messages.map((m) =>
          m.id === messageId ? { ...m, pinned: false } : m
        ),
        pinnedMessages: state.pinnedMessages.filter((m) => m.id !== messageId),
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to unpin message';
      set({ error: message });
      throw err;
    }
  },

  addReaction: async (channelId, messageId, emoji) => {
    try {
      await api.put(`/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add reaction';
      set({ error: message });
      throw err;
    }
  },

  removeReaction: async (channelId, messageId, emoji) => {
    try {
      await api.delete(`/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to remove reaction';
      set({ error: message });
      throw err;
    }
  },

  uploadFile: async (channelId, file, content) => {
    set({ isSending: true, error: null });
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (content) formData.append('content', content);
      const msg = await api.post<Message>(`/channels/${channelId}/upload`, formData);
      // Optimistically add the message so the sender sees it immediately
      set((state) => {
        if (state.messages.some((m) => m.id === msg.id)) return { isSending: false };
        return { messages: [...state.messages, msg], isSending: false };
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to upload file';
      set({ error: message, isSending: false });
      throw err;
    }
  },

  handleNewMessage: (message) => {
    set((state) => {
      // Avoid duplicates
      if (state.messages.some((m) => m.id === message.id)) return state;
      return { messages: [...state.messages, message] };
    });
  },

  handleMessageEdit: (message) => {
    set((state) => ({
      messages: state.messages.map((m) => (m.id === message.id ? message : m)),
    }));
  },

  handleMessageDelete: (data) => {
    set((state) => ({
      messages: state.messages.filter((m) => m.id !== data.id),
    }));
  },

  handleMessageEmbeds: (data) => {
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === data.message_id ? { ...m, embeds: data.embeds } : m
      ),
    }));
  },

  handleReaction: (data) => {
    set((state) => ({
      messages: state.messages.map((m) => {
        if (m.id !== data.message_id) return m;
        const reactions = [...(m.reactions ?? [])];
        const existing = reactions.find((r) => r.emoji === data.emoji);
        if (existing) {
          return {
            ...m,
            reactions: reactions.map((r) =>
              r.emoji === data.emoji ? { ...r, count: r.count + 1 } : r
            ),
          };
        }
        return {
          ...m,
          reactions: [...reactions, { emoji: data.emoji, count: 1, me: false }],
        };
      }),
    }));
  },

  handleReactionRemove: (data) => {
    set((state) => ({
      messages: state.messages.map((m) => {
        if (m.id !== data.message_id) return m;
        const reactions = (m.reactions ?? [])
          .map((r) =>
            r.emoji === data.emoji ? { ...r, count: r.count - 1 } : r
          )
          .filter((r) => r.count > 0);
        return { ...m, reactions };
      }),
    }));
  },

  clearMessages: () => set({ messages: [], pinnedMessages: [], hasMore: true }),

  clearError: () => set({ error: null }),
}));
