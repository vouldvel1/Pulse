import { create } from 'zustand';
import { voice as voiceApi } from '@/utils/api';
import { wsClient } from '@/utils/wsClient';
import type { VoiceParticipant } from '@/types';

interface VoiceState {
  channelId: string | null;
  channelName: string | null;
  communityName: string | null;
  participants: VoiceParticipant[];
  selfMute: boolean;
  selfDeaf: boolean;
  livekitToken: string | null;
  livekitUrl: string | null;
  showOverlay: boolean;

  joinChannel: (channelId: string, channelName: string, communityName: string) => Promise<void>;
  leaveChannel: () => Promise<void>;
  toggleMute: () => void;
  toggleDeaf: () => void;
  setOverlay: (show: boolean) => void;
  addParticipant: (p: VoiceParticipant) => void;
  removeParticipant: (userId: string) => void;
  updateParticipant: (userId: string, updates: Partial<VoiceParticipant>) => void;
  setSpeaking: (userId: string, speaking: boolean) => void;
}

export const useVoiceStore = create<VoiceState>((set, get) => ({
  channelId: null,
  channelName: null,
  communityName: null,
  participants: [],
  selfMute: false,
  selfDeaf: false,
  livekitToken: null,
  livekitUrl: null,
  showOverlay: false,

  joinChannel: async (channelId, channelName, communityName) => {
    try {
      const data = await voiceApi.join(channelId);
      set({
        channelId,
        channelName,
        communityName,
        participants: data.participants,
        livekitToken: data.token,
        livekitUrl: data.livekit_url,
        selfMute: false,
        selfDeaf: false,
      });
      wsClient.send('voice_join', { channel_id: channelId });
    } catch (e) {
      throw e;
    }
  },

  leaveChannel: async () => {
    try {
      await voiceApi.leave();
    } catch { /* ignore */ }
    wsClient.send('voice_leave', {});
    set({
      channelId: null,
      channelName: null,
      communityName: null,
      participants: [],
      livekitToken: null,
      livekitUrl: null,
      showOverlay: false,
    });
  },

  toggleMute: () => {
    const { selfMute, selfDeaf } = get();
    const newMute = !selfMute;
    void voiceApi.updateState(newMute, selfDeaf);
    wsClient.send('voice_state', { self_mute: newMute, self_deaf: selfDeaf });
    set({ selfMute: newMute });
  },

  toggleDeaf: () => {
    const { selfMute, selfDeaf } = get();
    const newDeaf = !selfDeaf;
    void voiceApi.updateState(selfMute, newDeaf);
    wsClient.send('voice_state', { self_mute: selfMute, self_deaf: newDeaf });
    set({ selfDeaf: newDeaf });
  },

  setOverlay: (show) => set({ showOverlay: show }),

  addParticipant: (p) =>
    set((s) => {
      if (s.participants.some((x) => x.user_id === p.user_id)) return s;
      return { participants: [...s.participants, p] };
    }),

  removeParticipant: (userId) =>
    set((s) => ({ participants: s.participants.filter((p) => p.user_id !== userId) })),

  updateParticipant: (userId, updates) =>
    set((s) => ({
      participants: s.participants.map((p) =>
        p.user_id === userId ? { ...p, ...updates } : p,
      ),
    })),

  setSpeaking: (userId, speaking) =>
    set((s) => ({
      participants: s.participants.map((p) =>
        p.user_id === userId ? { ...p, is_speaking: speaking } : p,
      ),
    })),
}));
