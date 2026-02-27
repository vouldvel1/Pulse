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

  // Per-participant local volume (0–1)
  participantVolumes: Record<string, number>;
  // HTMLAudioElement map for volume/deaf control (keyed by userId)
  audioElements: Map<string, HTMLAudioElement>;

  // Screen sharing state
  isSharing: boolean;
  shareStream: MediaStream | null;

  joinChannel: (channelId: string, channelName: string, communityName: string) => Promise<void>;
  leaveChannel: () => Promise<void>;
  toggleMute: () => void;
  toggleDeaf: () => void;
  setOverlay: (show: boolean) => void;
  addParticipant: (p: VoiceParticipant) => void;
  removeParticipant: (userId: string) => void;
  updateParticipant: (userId: string, updates: Partial<VoiceParticipant>) => void;
  setSpeaking: (userId: string, speaking: boolean) => void;

  setParticipantVolume: (userId: string, volume: number) => void;
  setAudioElement: (userId: string, el: HTMLAudioElement) => void;
  removeAudioElement: (userId: string) => void;

  setIsSharing: (val: boolean) => void;
  setShareStream: (stream: MediaStream | null) => void;
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

  participantVolumes: {},
  audioElements: new Map(),

  isSharing: false,
  shareStream: null,

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
    // Stop any ongoing screen share
    const { shareStream, audioElements } = get();
    if (shareStream) {
      shareStream.getTracks().forEach((t) => t.stop());
    }
    audioElements.forEach((el) => {
      el.pause();
      el.srcObject = null;
    });
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
      isSharing: false,
      shareStream: null,
      audioElements: new Map(),
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
    const { selfMute, selfDeaf, audioElements } = get();
    const newDeaf = !selfDeaf;
    void voiceApi.updateState(selfMute, newDeaf);
    wsClient.send('voice_state', { self_mute: selfMute, self_deaf: newDeaf });
    // Apply immediately to all audio elements
    audioElements.forEach((el, userId) => {
      const vol = get().participantVolumes[userId] ?? 1;
      el.volume = newDeaf ? 0 : vol;
      el.muted = newDeaf;
    });
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

  setParticipantVolume: (userId, volume) => {
    const { audioElements, selfDeaf } = get();
    const el = audioElements.get(userId);
    if (el) {
      el.volume = selfDeaf ? 0 : volume;
    }
    set((s) => ({
      participantVolumes: { ...s.participantVolumes, [userId]: volume },
    }));
  },

  setAudioElement: (userId, el) => {
    const { participantVolumes, selfDeaf } = get();
    const vol = participantVolumes[userId] ?? 1;
    el.volume = selfDeaf ? 0 : vol;
    el.muted = selfDeaf;
    set((s) => {
      const newMap = new Map(s.audioElements);
      newMap.set(userId, el);
      return { audioElements: newMap };
    });
  },

  removeAudioElement: (userId) => {
    set((s) => {
      const newMap = new Map(s.audioElements);
      newMap.delete(userId);
      return { audioElements: newMap };
    });
  },

  setIsSharing: (val) => set({ isSharing: val }),
  setShareStream: (stream) => set({ shareStream: stream }),
}));
